import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type {
  V2Color,
  V2ColorSpace,
  GeneratedTheme,
  OKLCH,
  Oklab,
  PalettePreview,
  ProjectionMode,
  RGBSpace,
  SliceDefinition,
  ThemeMode,
  ViewMode,
} from "@cus/core";
import type { ColorAnchor } from "@cus/core";
import {
  createColorExplorer,
  createColorAnchor,
  sampleColorVolume,
  volumePointAt,
  volumePointCount,
  VolumeCache,
  STEPS,
  type VolumeSamplerDeps,
} from "@cus/core";
import {
  colorDesign,
  colorOutput,
  evaluateDirtyZone,
  gamutStatus,
  isInGamut,
  labToLch,
  labToXyz,
  lchToLab,
  mapOklchToGamut,
  oklabToOklch,
  oklabToXyz,
  oklchToOklab,
  oklchToRgb,
  renderColor,
  xyzToLab,
  xyzToOklab,
} from "@cus/color";
import { dirtyZoneStatus, generateOklchPalette, qualityEnvelope } from "@cus/palette";
import {
  SLICE_DEFAULTS,
  SliceView,
  colorRgb,
  luminanceOf,
  type SliceState,
} from "./SliceView";
import { OklabSliceView } from "./OklabSliceView";
import { usePreviewSpace } from "./PreviewSpace";
import { ColorSpace3D } from "./ColorSpace3D";
import {
  CusCheckbox,
  CusSelect,
  CusSelectTrigger,
  CusSelectContent,
  CusSelectItem,
  CusSwitch,
} from "@cus/ui";

type Point = [number, number, number];
type Triangle = [Point, Point, Point];
// UX-01 §8：Designer 提供的四个工作空间（复用 core ColorSpace 成员）。
type WorkSpace = Extract<V2ColorSpace, "oklab" | "oklch" | "lab" | "lch">;

// §8：切换空间仅改变投影方式，不改变颜色本身（OKLCH 设计坐标恒为基准）。
function position(color: OKLCH, viewSpace: WorkSpace): Point {
  if (viewSpace === "lab") {
    const lab = xyzToLab(oklabToXyz(oklchToOklab(color)));
    return [lab.a / 125, lab.b / 125, lab.l / 100 - 0.5];
  }
  if (viewSpace === "lch") {
    const lch = labToLch(xyzToLab(oklabToXyz(oklchToOklab(color))));
    const rad = ((lch.h ?? 0) * Math.PI) / 180;
    return [
      (lch.c * Math.cos(rad)) / 125,
      (lch.c * Math.sin(rad)) / 125,
      lch.l / 100 - 0.5,
    ];
  }
  const p = oklchToOklab(color);
  return [p.a * 2, p.b * 2, p.l - 0.5];
}

const boundaryCache = new Map<string, Triangle[]>();
// 21 档明度、36 个色相；边界为引擎采样近似，不用于精确色域判断。
// 缓存键含视图空间（投影切换不重建颜色，但投影点随空间变化）。
function boundary(viewSpace: WorkSpace, space: RGBSpace): Triangle[] {
  const key = `${viewSpace}|${space}`;
  const cached = boundaryCache.get(key);
  if (cached) return cached;
  const rows = Array.from({ length: 21 }, (_, i) =>
    Array.from({ length: 36 }, (_, j) =>
      position(mapOklchToGamut({ l: i / 20, c: 1, h: j * 10 }, space), viewSpace),
    ),
  );
  const triangles: Triangle[] = [];
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < 36; j++) {
      const k = (j + 1) % 36;
      triangles.push(
        [rows[i][j], rows[i + 1][j], rows[i][k]],
        [rows[i][k], rows[i + 1][j], rows[i + 1][k]],
      );
    }
  boundaryCache.set(key, triangles);
  return triangles;
}

const GAMUT_LABEL: Record<string, string> = {
  IN_GAMUT: "域内",
  NEAR_GAMUT_BOUNDARY: "接近边界",
  OUT_OF_GAMUT: "域外",
};
const badgeClass = (status: string) =>
  status === "IN_GAMUT"
    ? "badge badge-ok"
    : status === "NEAR_GAMUT_BOUNDARY"
      ? "badge badge-warn"
      : "badge badge-fail";
const cssOk = (o: OKLCH) =>
  `oklch(${o.l.toFixed(4)} ${Math.max(0, o.c).toFixed(4)} ${(o.h ?? 0).toFixed(2)})`;

export function ColorSpaceView({
  result,
  mode,
  onSelect,
  candidate,
  onCandidate,
  onCommit,
  background,
}: {
  result: GeneratedTheme;
  mode: ThemeMode;
  onSelect: (name: string, color: V2Color) => void;
  /** 空间选色产生的候选锚点（可越界探索；§20 提交约束由 App 执行）。 */
  candidate: ColorAnchor | null;
  onCandidate: (anchor: ColorAnchor | null) => void;
  /** §20：提交候选主色（mapFirst = 先映射到色域再提交）。 */
  onCommit: (mapFirst: boolean) => void;
  /** 对比参考的背景 token（surface.default 等），缺省隐藏对比参考。 */
  background?: V2Color;
}) {
  const space = usePreviewSpace();
  const [viewMode, setViewMode] = useState<ViewMode>("space");
  const [model, setModel] = useState<WorkSpace>("oklab");
  const [rotation, setRotation] = useState({ yaw: 0.6, pitch: 0.35 });
  const [zoom, setZoom] = useState(1.2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [family, setFamily] = useState("primary");
  const [surfaces, setSurfaces] = useState({ srgb: true, "display-p3": true });
  // §44：六个图层开关。
  const [layers, setLayers] = useState({
    hueRing: true,
    lightnessGrid: true,
    gamutBoundary: true,
    dirtyZone: false,
    paletteTrail: true,
    contrastRef: false,
  });
  const [slice, setSlice] = useState<SliceState>({
    axis: "l",
    value: SLICE_DEFAULTS.l,
  });
  // §7：3D 截面（当前切片值 ±0.05 带外点降透明度 + 截面导向线）。
  const [crossSection, setCrossSection] = useState(false);
  // ── CUS-UX-02 状态（§25/§29/§31/§37）──────────────────────────────────────
  // §25：投影模式默认 Orthographic（色彩空间分析需要几何稳定性）。
  const [projection, setProjection] = useState<ProjectionMode>("ORTHOGRAPHIC");
  // §31：OKLab 正交切片（L/a/b），默认 L=0.62（§21）。
  const [oklabSlice, setOklabSlice] = useState<SliceDefinition>({
    axis: "L",
    value: 0.62,
  });
  // §5–§8：Volume 点云层（默认关闭以避免遮挡既有 palette 轨迹与视觉基线）。
  const [showVolume, setShowVolume] = useState(false);
  // 2D 视图切片种类：OKLCH（L/C/H，UX-01 默认）或 OKLab（L/a/b，UX-02 §20）。
  const [sliceKind, setSliceKind] = useState<"oklch" | "oklab">("oklch");
  // §43：选色来源追踪（3D_PICK / SLICE_PICK / PARAMETER）。
  const [selectionSource, setSelectionSource] = useState<
    "3D_PICK" | "SLICE_PICK" | "PARAMETER" | null
  >(null);
  const hoverLabelRef = useRef<HTMLSpanElement>(null);
  const commitMapRef = useRef(false);
  // §45：Volume 数据缓存（space:gamut:resolution[:slice]）。
  const volumeCacheRef = useRef(new VolumeCache(8));
  // ── 全屏模式 ──────────────────────────────────────────────────────────
  const panelRef = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── §32：Color Explorer（依赖注入引擎函数；事件驱动组件状态）──────────────
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const brandRef = useRef(result.brand);
  brandRef.current = result.brand;
  const onCandidateRef = useRef(onCandidate);
  onCandidateRef.current = onCandidate;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const explorer = useMemo(
    () =>
      createColorExplorer({
        // §16：Lab/LCH 等非 OKLCH 空间坐标经逆变换回到感知锚点。
        coordinateToAnchor: (coordinate) => {
          if (coordinate.space === "lab") {
            const ok = oklabToOklch(
              xyzToOklab(
                labToXyz({
                  l: coordinate.x * 100,
                  a: coordinate.y * 125,
                  b: coordinate.z * 125,
                }),
              ),
            );
            return createColorAnchor({ l: ok.l, c: ok.c, h: ok.h });
          }
          if (coordinate.space === "lch") {
            const ok = oklabToOklch(
              xyzToOklab(
                labToXyz(
                  lchToLab({
                    l: coordinate.x * 100,
                    c: coordinate.y * 125,
                    h: coordinate.z,
                  }),
                ),
              ),
            );
            return createColorAnchor({ l: ok.l, c: ok.c, h: ok.h });
          }
          const ok = oklabToOklch({
            l: coordinate.x + 0.5,
            a: coordinate.y / 2,
            b: coordinate.z / 2,
          });
          return createColorAnchor({ l: ok.l, c: ok.c, h: ok.h });
        },
        gamutStatusOf: (anchor, target) =>
          gamutStatus({ l: anchor.l, c: anchor.c, h: anchor.h }, target),
        dirtyZoneOf: (anchor) =>
          dirtyZoneStatus(
            { l: anchor.l, c: anchor.c, h: anchor.h },
            { role: "primary", theme: modeRef.current },
          ) === "DIRTY",
        // §22–§24：候选锚点的 Palette 轨迹（generateOklchPalette 实时预览）。
        paletteOf: (anchor) => {
          const oklch: OKLCH = { l: anchor.l, c: anchor.c, h: anchor.h };
          const brand = brandRef.current;
          if (!brand) return { anchor, steps: [] };
          const palette = generateOklchPalette(
            { ...brand, oklch, oklab: oklchToOklab(oklch), input: { lch: oklch } },
            modeRef.current,
          );
          return {
            anchor,
            steps: STEPS.map((step) => {
              const design = colorDesign(palette.primary[step]);
              return {
                step,
                anchor: createColorAnchor({
                  l: design.l,
                  c: design.c,
                  h: design.h,
                }),
              };
            }),
          };
        },
      }),
    [],
  );
  // 小型发射器：UI 交互派发标准事件，状态由订阅端驱动（§37–§39）。
  useEffect(
    () =>
      explorer.events.subscribe((event) => {
        switch (event.type) {
          case "SPACE_CHANGE":
            setModel(event.payload.to as WorkSpace);
            break;
          case "SLICE_CHANGE":
            setSlice({ axis: event.payload.fixed, value: event.payload.value });
            break;
          case "GAMUT_CHANGE":
            setSurfaces((s) => ({
              ...s,
              [event.payload.target]: event.payload.visible,
            }));
            break;
          case "DIRTY_ZONE_TOGGLE":
            setLayers((l) => ({ ...l, dirtyZone: event.payload.visible }));
            break;
          case "CONTEXT_CHANGE": {
            const context = event.payload.context;
            if (context.startsWith("family:")) setFamily(context.slice(7));
            // mode 由父组件控制，不再本地切换
            break;
          }
          case "COLOR_SELECT":
          case "COLOR_DRAG":
            onCandidateRef.current(createColorAnchor({
              l: event.payload.coordinate.l,
              c: event.payload.coordinate.c,
              h: event.payload.coordinate.h,
            }));
            break;
          case "COLOR_COMMIT":
            onCommitRef.current(commitMapRef.current);
            break;
          case "COLOR_HOVER":
            if (hoverLabelRef.current)
              hoverLabelRef.current.textContent = event.payload
                ? `L ${event.payload.coordinate.l.toFixed(3)} · C ${event.payload.coordinate.c.toFixed(3)} · H ${(event.payload.coordinate.h ?? 0).toFixed(0)}°`
                : "悬停读取坐标";
            break;
          case "PALETTE_UPDATE":
            // Palette 预览由 candidate 派生；事件面供契约与外部监听。
            break;
        }
      }),
    [explorer],
  );
  const changeSpace = (to: WorkSpace) =>
    explorer.events.dispatch({ type: "SPACE_CHANGE", payload: { from: model, to } });
  const changeSlice = (next: SliceState) =>
    explorer.events.dispatch({
      type: "SLICE_CHANGE",
      payload: {
        fixed: next.axis,
        value: next.value,
        horizontal: next.axis === "h" ? "C" : "H",
        vertical: next.axis === "l" ? "C" : "L",
      },
    });
  const toggleSurface = (target: "srgb" | "display-p3", visible: boolean) =>
    explorer.events.dispatch({
      type: "GAMUT_CHANGE",
      payload: { target, visible },
    });
  const toggleDirtyZone = (visible: boolean) =>
    explorer.events.dispatch({
      type: "DIRTY_ZONE_TOGGLE",
      payload: { visible },
    });
  // UX-02 §42：Color Selection Pipeline——统一 3D/切片/参数三来源为候选锚点。
  const pickFromOklch = (
    color: OKLCH,
    isDrag: boolean,
    source: "3D_PICK" | "SLICE_PICK" | "PARAMETER" = "SLICE_PICK",
  ) => {
    const anchor = explorer.select({
      space: "oklch",
      x: color.l,
      y: color.c,
      z: color.h ?? 0,
    });
    setSelectionSource(source);
    explorer.events.dispatch({
      type: isDrag ? "COLOR_DRAG" : "COLOR_SELECT",
      payload: { space: "oklch", coordinate: { l: anchor.l, c: anchor.c, h: anchor.h } },
    });
    explorer.events.dispatch({ type: "PALETTE_UPDATE", payload: { anchor } });
  };
  // UX-02 §19/§20：OKLab 切片拾取——连续 OKLab 坐标 → OKLCH 候选。
  const pickFromOklab = (
    lab: { l: number; a: number; b: number },
    isDrag: boolean,
  ) => {
    const ok = oklabToOklch(lab);
    pickFromOklch({ l: ok.l, c: ok.c, h: ok.h }, isDrag, "SLICE_PICK");
  };
  const pick = (color: OKLCH, isDrag: boolean) =>
    pickFromOklch(color, isDrag, "SLICE_PICK");
  const commit = (mapFirst: boolean) => {
    if (!candidate) return;
    commitMapRef.current = mapFirst;
    const validation = explorer.validate(candidate);
    explorer.events.dispatch({
      type: "COLOR_COMMIT",
      payload: {
        anchor: candidate,
        validation: {
          gamut: validation.gamut,
          contrast: validation.contrast,
          dirtyZone: validation.dirtyZone,
          palette: validation.palette,
        },
      },
    });
  };

  const tokens = result.theme[mode] ?? result.theme.light ?? result.theme.dark!;
  const families = [
    "primary",
    "secondary",
    "accent",
    "neutral",
    "success",
    "warning",
    "danger",
    "info",
    "feedback",
  ];
  const colors = Object.entries(tokens.primitive).filter(([key]) =>
    family === "all"
      ? families.some((f) => key.startsWith(`${f}.`))
      : key.startsWith(`${family}.`),
  );
  const meshes = useMemo(
    () => ({
      srgb: boundary(model, "srgb"),
      "display-p3": boundary(model, "display-p3"),
    }),
    [model],
  );
  const surfaceTriangles = (["srgb", "display-p3"] as const).map(
    (target) => ({ target, triangles: meshes[target] }),
  );
  // §7：截面带外判定（L/C 轴 ±0.05，H 轴 ±18°）。
  const sectionDistant = (oklch: OKLCH) => {
    if (!crossSection) return false;
    if (slice.axis === "h")
      return Math.abs((oklch.h ?? 0) - slice.value) > 18;
    return Math.abs(oklch[slice.axis] - slice.value) > 0.05;
  };
  // §7：截面导向线 3D 点数组（WebGL 渲染器使用）。
  const sectionGuide3D = useMemo<Point[]>(() => {
    if (!crossSection) return [];
    if (slice.axis === "l")
      return Array.from({ length: 73 }, (_, i) =>
        position({ l: slice.value, c: 0.3, h: i * 5 }, model),
      );
    if (slice.axis === "h")
      return Array.from({ length: 21 }, (_, i) => {
        const l = 1 - i / 20;
        return position({ l, c: 0.3 * l, h: slice.value }, model);
      });
    return Array.from({ length: 73 }, (_, i) =>
      position({ l: 0.55, c: slice.value, h: i * 5 }, model),
    );
  }, [crossSection, slice.axis, slice.value, model]);
  // §44：3D 内的 Dirty Zone 元素——引擎包络与 sRGB 容量之间的脏带点阵。
  const dirtyDots = useMemo(() => {
    if (!layers.dirtyZone) return [];
    const dots: { key: string; point: Point }[] = [];
    for (let i = 1; i < 20; i++)
      for (let j = 0; j < 36; j++) {
        const l = i / 20,
          h = j * 10;
        try {
          const env = qualityEnvelope(l, h, "primary", mode);
          const cap = mapOklchToGamut({ l, c: 2, h }, "srgb").c;
          if (env.max < cap - 1e-6)
            dots.push({
              key: `${i}-${j}`,
              point: position(
                { l, c: Math.min((env.max + cap) / 2, cap), h },
                model,
              ),
            });
        } catch {
          /* 采样失败跳过 */
        }
      }
    return dots;
  }, [layers.dirtyZone, mode, model]);
  // §44：3D 内的对比参考元素——与背景对比不足 4.5:1 的设计点加光环。
  const haloKeys = useMemo(() => {
    if (!layers.contrastRef || !background) return new Set<string>();
    let bgY: number;
    try {
      bgY = luminanceOf(colorRgb(background));
    } catch {
      return new Set<string>();
    }
    const set = new Set<string>();
    for (const [key, color] of colors) {
      try {
        const y = luminanceOf(oklchToRgb(colorDesign(color), "srgb"));
        const ratio = (Math.max(y, bgY) + 0.05) / (Math.min(y, bgY) + 0.05);
        if (ratio < 4.5) set.add(key);
      } catch {
        /* 采样失败跳过 */
      }
    }
    return set;
    // colors 派生自 result 与 mode。
  }, [layers.contrastRef, background, result, mode]);

  // ── 候选条（§20/§21）：徽标 + Palette 预览 + 提交 ─────────────────────────
  const candidateInfo = useMemo(() => {
    if (!candidate) return null;
    const oklch: OKLCH = { l: candidate.l, c: candidate.c, h: candidate.h };
    let mapped: OKLCH | null = null;
    try {
      mapped = mapOklchToGamut(oklch, "srgb");
    } catch {
      mapped = null;
    }
    return {
      oklch,
      srgb: gamutStatus(oklch, "srgb"),
      p3: gamutStatus(oklch, "display-p3"),
      dirty: dirtyZoneStatus(oklch, { role: "primary", theme: mode }),
      mapped,
    };
  }, [candidate, mode]);
  const preview: PalettePreview | null = useMemo(
    () => (candidate ? explorer.preview(candidate) : null),
    // explorer.preview 经 refs 读取 brand/mode；显式依赖触发重算。
    [candidate, explorer, mode, result],
  );
  const slicePaletteSteps = useMemo<OKLCH[]>(() => {
    if (candidate && preview)
      return preview.steps.map((s) => ({
        l: s.anchor.l,
        c: s.anchor.c,
        h: s.anchor.h,
      }));
    try {
      const palette = generateOklchPalette(result.brand, mode);
      return STEPS.map((step) => colorDesign(palette.primary[step]));
    } catch {
      return [];
    }
  }, [candidate, preview, result.brand, mode]);
  // ── CUS-UX-02 §5–§8：Volume 采样（懒加载 + 缓存，Renderer 不自行计算颜色）──
  // 采样密度由性能配置决定（§7）；Designer 默认 12³ + 自适应边界细化（§8），
  // 仅在 Volume 图层开启时计算，结果按 space:gamut:resolution 缓存（§45）。
  const volumeSamplerDeps = useMemo<VolumeSamplerDeps>(
    () => ({
      toOklch: (lab: Oklab) => oklabToOklch(lab),
      gamutOf: (lab: Oklab, target) => {
        // 廉价三态判定：直接 isInGamut + 一次色度探针，避免 gamutStatus
        // 对域外点的二分搜索（Volume 采样需对数千点调用，性能敏感）。
        const ok = oklabToOklch(lab);
        if (ok.l <= 0 || ok.l >= 1 || ok.c < 1e-7) return "IN_GAMUT";
        if (!isInGamut(oklchToRgb(ok, target))) return "OUT_OF_GAMUT";
        const probe = oklchToRgb(
          { l: ok.l, c: ok.c + Math.max(0.005, ok.c * 0.02), h: ok.h },
          target,
        );
        return isInGamut(probe) ? "IN_GAMUT" : "NEAR_BOUNDARY";
      },
      dirtyOf: (lab: Oklab) => {
        try {
          const ok = oklabToOklch(lab);
          return evaluateDirtyZone({ l: ok.l, c: ok.c, h: ok.h ?? 0 }).status;
        } catch {
          return "CLEAR";
        }
      },
      displayOf: (lab: Oklab) => {
        try {
          const ok = oklabToOklch(lab);
          const mapped = mapOklchToGamut(
            { l: ok.l, c: ok.c, h: ok.h },
            "srgb",
          );
          return oklchToRgb(mapped, "srgb");
        } catch {
          return { r: 0.5, g: 0.5, b: 0.5 };
        }
      },
    }),
    [],
  );
  const volumePointsData = useMemo(() => {
    if (!showVolume) return undefined;
    // CUS-IMPLEMENTATION-04 §11：分辨率对齐——默认 32（开发环境），可配置 32/48/64/96。
    const resolution: 32 | 48 | 64 | 96 = 32;
    const key = {
      space: "OKLAB" as const,
      gamut: ["srgb", "display-p3"] as ("srgb" | "display-p3")[],
      resolution,
    };
    const cache = volumeCacheRef.current;
    let points = cache.get(key);
    if (!points) {
      points = sampleColorVolume(volumeSamplerDeps, {
        resolution,
        adaptive: true,
        refinementLevels: 1,
      });
      cache.set(key, points);
    }
    // CUS-IMPLEMENTATION-04 §9：从 ColorVolumeData TypedArray 转为渲染数据。
    const renderData: {
      pos: Point;
      lab: Oklab;
      displayColor: string;
      gamut: "IN_GAMUT" | "NEAR_BOUNDARY" | "OUT_OF_GAMUT";
      dirty: "CLEAR" | "WARNING" | "DIRTY";
    }[] = [];
    const count = volumePointCount(points);
    for (let i = 0; i < count; i++) {
      const p = volumePointAt(points, i);
      const oklch = p.oklch;
      const rgb = p.displayColor;
      const displayColor = `rgb(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)})`;
      renderData.push({
        pos: position(oklch, model) as Point,
        lab: p.lab,
        displayColor,
        gamut: p.gamut.srgb,
        dirty: p.dirtyZone,
      });
    }
    return renderData;
    // volumeCacheKey 仅用于调试可见性；实际缓存由 VolumeCache 管理。
  }, [showVolume, volumeSamplerDeps, model]);
  // ── §5：WebGL 3D 渲染数据 ────────────────────────────────────────────────
  const webglData = useMemo(
    () => ({
      gamutMeshes: surfaceTriangles.map((s) => ({
        triangles: s.triangles,
        target: s.target,
      })),
      colorPoints: colors.map(([key, color]) => {
        const design = colorDesign(color);
        const mappedOklch = colorOutput(color, space).mapped;
        return {
          key,
          color,
          designPos: position(design, model) as Point,
          mappedPos: position(mappedOklch, model) as Point,
          designColor: renderColor(color),
          mappedColor: renderColor(color, space),
          sectionDistant: sectionDistant(design),
        };
      }),
      dirtyDots: dirtyDots.map((d) => ({ key: d.key, pos: d.point as Point })),
      paletteTrails: families.map((f) => {
        const familyColors = colors.filter(([key]) =>
          new RegExp(`^${f}\\.\\d+$`).test(key),
        );
        return {
          family: f,
          points: familyColors.map(([, c]) =>
            position(colorDesign(c), model),
          ) as Point[],
        };
      }),
      sectionGuide: sectionGuide3D as Point[],
      candidatePos:
        candidateInfo && viewMode === "space"
          ? (position(candidateInfo.oklch, model) as Point)
          : null,
      candidateColor: candidateInfo
        ? cssOk(candidateInfo.oklch)
        : "transparent",
    }),
    [
      surfaceTriangles,
      colors,
      dirtyDots,
      families,
      sectionGuide3D,
      candidateInfo,
      viewMode,
      model,
      space,
    ],
  );
  return (
    <section ref={panelRef} className={`space-panel${fullscreen ? " space-panel-fullscreen" : ""}`}>
      <div className="space-controls" role="group" aria-label="空间视图模式">
        <button
          type="button"
          className="outline-button"
          aria-pressed={viewMode === "space"}
          onClick={() => setViewMode("space")}
        >
          3D 空间
        </button>
        <button
          type="button"
          className="outline-button"
          aria-pressed={viewMode === "slice"}
          onClick={() => setViewMode("slice")}
        >
          2D 切片
        </button>
        <button
          type="button"
          className="outline-button fullscreen-button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "退出全屏" : "全屏模式"}
          title={fullscreen ? "退出全屏" : "全屏模式"}
        >
          {fullscreen ? "✕ 退出全屏" : "⛶ 全屏"}
        </button>
        <span>空间{" "}</span>
        <CusSelect
          value={model}
          disabled={viewMode === "slice"}
          onValueChange={(v) => changeSpace(v as WorkSpace)}
        >
          <CusSelectTrigger aria-label="三维坐标空间" title={viewMode === "slice" ? "切片仅在 OKLCH 平面交互" : undefined}>
            {{ oklab: "Oklab", oklch: "OKLCH", lab: "CIELab (D65)", lch: "CIELCh (D65)" }[model] ?? model}
          </CusSelectTrigger>
          <CusSelectContent>
            <CusSelectItem value="oklab">Oklab</CusSelectItem>
            <CusSelectItem value="oklch">OKLCH</CusSelectItem>
            <CusSelectItem value="lab">CIELab (D65)</CusSelectItem>
            <CusSelectItem value="lch">CIELCh (D65)</CusSelectItem>
          </CusSelectContent>
        </CusSelect>
        <span>家族{" "}</span>
        <CusSelect
          value={family}
          onValueChange={(v) =>
            explorer.events.dispatch({
              type: "CONTEXT_CHANGE",
              payload: { context: `family:${v}` },
            })
          }
        >
          <CusSelectTrigger aria-label="三维家族筛选">
            {family}
          </CusSelectTrigger>
          <CusSelectContent>
            {["all", ...families].map((f) => (
              <CusSelectItem key={f} value={f}>{f}</CusSelectItem>
            ))}
          </CusSelectContent>
        </CusSelect>
        {/* UX-02 §25/§38：投影模式 ToggleGroup（默认 Orthographic）。 */}
        {viewMode === "space" && (
          <>
            <span>投影{" "}</span>
            <ToggleGroup.Root
              type="single"
              className="segmented"
              aria-label="投影模式"
              value={projection}
              onValueChange={(v) => {
                if (v === "ORTHOGRAPHIC" || v === "PERSPECTIVE")
                  setProjection(v);
              }}
            >
              <ToggleGroup.Item value="ORTHOGRAPHIC">正交</ToggleGroup.Item>
              <ToggleGroup.Item value="PERSPECTIVE">透视</ToggleGroup.Item>
            </ToggleGroup.Root>
          </>
        )}
        {/* UX-02 §20/§38：2D 切片种类（OKLab L/a/b 或 OKLCH L/C/H）。 */}
        {viewMode === "slice" && (
          <>
            <span>切片{" "}</span>
            <ToggleGroup.Root
              type="single"
              className="segmented"
              aria-label="切片种类"
              value={sliceKind}
              onValueChange={(v) => {
                if (v === "oklab" || v === "oklch") setSliceKind(v);
              }}
            >
              <ToggleGroup.Item value="oklab">OKLab L/a/b</ToggleGroup.Item>
              <ToggleGroup.Item value="oklch">OKLCH L/C/H</ToggleGroup.Item>
            </ToggleGroup.Root>
          </>
        )}
      </div>
      <div className="space-controls" data-testid="layer-toggles">
        <label>
          <CusCheckbox
            checked={layers.hueRing}
            onCheckedChange={(v) =>
              setLayers({ ...layers, hueRing: !!v })
            }
          />
          色相环
        </label>
        <label>
          <CusCheckbox
            checked={layers.lightnessGrid}
            onCheckedChange={(v) =>
              setLayers({ ...layers, lightnessGrid: !!v })
            }
          />
          明度网格
        </label>
        <label>
          <CusCheckbox
            checked={layers.gamutBoundary}
            onCheckedChange={(v) =>
              setLayers({ ...layers, gamutBoundary: !!v })
            }
          />
          色域边界
        </label>
        {/* UX-02 §38：Dirty Zone → Switch（不自行实现基础交互）。 */}
        <label className="switch-label">
          <CusSwitch
            checked={layers.dirtyZone}
            onCheckedChange={(v) => toggleDirtyZone(!!v)}
            aria-label="Dirty Zone 叠加层"
          />
          Dirty Zone
        </label>
        {/* UX-02 §5–§8：Volume 点云层（仅 3D + OKLab 空间可用）。 */}
        {viewMode === "space" && model === "oklab" && (
          <label className="switch-label">
            <CusSwitch
              checked={showVolume}
              onCheckedChange={(v) => setShowVolume(!!v)}
              aria-label="Color Volume 点云"
            />
            Volume 点云
          </label>
        )}
        <label>
          <CusCheckbox
            checked={layers.paletteTrail}
            onCheckedChange={(v) =>
              setLayers({ ...layers, paletteTrail: !!v })
            }
          />
          Palette 轨迹
        </label>
        <label>
          <CusCheckbox
            checked={layers.contrastRef}
            onCheckedChange={(v) =>
              setLayers({ ...layers, contrastRef: !!v })
            }
          />
          对比参考
        </label>
        {(["srgb", "display-p3"] as const).map((target) => (
          <label key={target}>
            <CusCheckbox
              checked={surfaces[target]}
              onCheckedChange={(v) => toggleSurface(target, !!v)}
            />
            {target} 边界
          </label>
        ))}
        {viewMode === "space" && (
          <label>
            <CusCheckbox
              aria-label="三维截面"
              checked={crossSection}
              onCheckedChange={(v) => setCrossSection(!!v)}
            />
            截面
          </label>
        )}
      </div>
      <p className="muted">
        {viewMode === "space"
          ? "拖动旋转 · Shift+拖动平移 · 圆点为设计源，方点为映射值，虚线连接压缩轨迹 · sRGB 实线 / P3 虚线边界（采样近似）"
          : "点击或拖动切片平面产生候选主色 · 徽标显示实时色域与 Dirty 状态 · 提交后应用为主色"}
      </p>
      {viewMode === "space" ? (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            // CUS-IMPLEMENTATION-04 §59：键盘交互——Arrow 微调锚点，Enter 提交，Escape 取消。
            const step = e.shiftKey ? 5 : 1;
            const chromaStep = e.shiftKey ? 0.02 : 0.005;
            if (e.key === "Enter") {
              e.preventDefault();
              onCommitRef.current(false);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCandidateRef.current(null);
              return;
            }
            if (e.key.startsWith("Arrow") && candidate) {
              e.preventDefault();
              const oklch = { l: candidate.l, c: candidate.c, h: candidate.h ?? 0 };
              if (e.key === "ArrowLeft") oklch.h = (oklch.h - step + 360) % 360;
              if (e.key === "ArrowRight") oklch.h = (oklch.h + step) % 360;
              if (e.key === "ArrowUp") oklch.c = Math.max(0, oklch.c + chromaStep);
              if (e.key === "ArrowDown") oklch.c = Math.max(0, oklch.c - chromaStep);
              pickFromOklch(oklch, false, "PARAMETER");
            }
          }}
        >
          <ColorSpace3D
            {...webglData}
            model={model}
            layers={layers}
            surfaces={surfaces}
            crossSection={crossSection}
            rotation={rotation}
            zoom={zoom}
            pan={pan}
            haloKeys={haloKeys}
            projection={projection}
            volumePoints={volumePointsData}
            slice={model === "oklab" ? oklabSlice : null}
            onVolumePick={(_lab, oklch) => {
              // UX-02 §18–§19/§43：3D 拾取产生连续坐标候选（source=3D_PICK）。
              pickFromOklch(
                { l: oklch.l, c: oklch.c, h: oklch.h },
                false,
                "3D_PICK",
              );
            }}
            onSelect={(name, color) =>
              onSelect(`${tokens.mode}.${name}`, color)
            }
          />
        </div>
      ) : sliceKind === "oklab" ? (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            // CUS-IMPLEMENTATION-04 §59：切片视图键盘交互。
            const step = e.shiftKey ? 5 : 1;
            const chromaStep = e.shiftKey ? 0.02 : 0.005;
            if (e.key === "Enter") { e.preventDefault(); onCommitRef.current(false); return; }
            if (e.key === "Escape") { e.preventDefault(); onCandidateRef.current(null); return; }
            if (e.key.startsWith("Arrow") && candidate) {
              e.preventDefault();
              const oklch = { l: candidate.l, c: candidate.c, h: candidate.h ?? 0 };
              if (e.key === "ArrowLeft") oklch.h = (oklch.h - step + 360) % 360;
              if (e.key === "ArrowRight") oklch.h = (oklch.h + step) % 360;
              if (e.key === "ArrowUp") oklch.c = Math.max(0, oklch.c + chromaStep);
              if (e.key === "ArrowDown") oklch.c = Math.max(0, oklch.c - chromaStep);
              pickFromOklch(oklch, false, "PARAMETER");
            }
          }}
        >
        <OklabSliceView
          anchor={result.brand.oklch}
          slice={oklabSlice}
          mode={tokens.mode}
          background={background}
          layers={{
            dirtyZone: layers.dirtyZone,
            contrast: layers.contrastRef,
          }}
          onPick={(lab) => {
            setSelectionSource("SLICE_PICK");
            pickFromOklab(lab, false);
          }}
          onDrag={(lab) => {
            setSelectionSource("SLICE_PICK");
            pickFromOklab(lab, true);
          }}
          onSlice={setOklabSlice}
          onHover={(lab) => {
            if (hoverLabelRef.current)
              hoverLabelRef.current.textContent = lab
                ? `L ${lab.l.toFixed(3)} · a ${lab.a.toFixed(3)} · b ${lab.b.toFixed(3)}`
                : "悬停读取坐标";
          }}
        />
        </div>
      ) : (
        <div
          tabIndex={0}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 5 : 1;
            const chromaStep = e.shiftKey ? 0.02 : 0.005;
            if (e.key === "Enter") { e.preventDefault(); onCommitRef.current(false); return; }
            if (e.key === "Escape") { e.preventDefault(); onCandidateRef.current(null); return; }
            if (e.key.startsWith("Arrow") && candidate) {
              e.preventDefault();
              const oklch = { l: candidate.l, c: candidate.c, h: candidate.h ?? 0 };
              if (e.key === "ArrowLeft") oklch.h = (oklch.h - step + 360) % 360;
              if (e.key === "ArrowRight") oklch.h = (oklch.h + step) % 360;
              if (e.key === "ArrowUp") oklch.c = Math.max(0, oklch.c + chromaStep);
              if (e.key === "ArrowDown") oklch.c = Math.max(0, oklch.c - chromaStep);
              pickFromOklch(oklch, false, "PARAMETER");
            }
          }}
        >
        <SliceView
          anchor={result.brand.oklch}
          slice={slice}
          mode={tokens.mode}
          background={background}
          paletteSteps={slicePaletteSteps}
          layers={{
            dirtyZone: layers.dirtyZone,
            contrast: layers.contrastRef,
            palettePath: layers.paletteTrail,
          }}
          onPick={(color) => pick(color, false)}
          onDrag={(color) => pick(color, true)}
          onSlice={changeSlice}
          onHover={(color) =>
            explorer.events.dispatch({
              type: "COLOR_HOVER",
              payload: color
                ? {
                    space: "oklch",
                    coordinate: { l: color.l, c: color.c, h: color.h ?? 0 },
                  }
                : null,
            })
          }
        />
        </div>
      )}
      {candidate && candidateInfo && (
        <div className="candidate-bar" data-testid="candidate-bar">
          <span
            className="candidate-swatch"
            style={{ background: cssOk(candidateInfo.oklch) }}
            aria-hidden="true"
          />
          <div className="candidate-info">
            <div className="candidate-badges">
              <span
                className={badgeClass(candidateInfo.srgb)}
                data-gamut-status={candidateInfo.srgb}
              >
                sRGB {GAMUT_LABEL[candidateInfo.srgb]}
              </span>
              <span
                className={badgeClass(candidateInfo.p3)}
                data-gamut-status={candidateInfo.p3}
              >
                P3 {GAMUT_LABEL[candidateInfo.p3]}
              </span>
              <span
                className={
                  candidateInfo.dirty === "DIRTY"
                    ? "badge badge-warn"
                    : "badge badge-ok"
                }
                data-dirty-status={candidateInfo.dirty}
              >
                {candidateInfo.dirty === "DIRTY"
                  ? "Dirty Zone"
                  : "Clean Zone"}
              </span>
              {/* UX-02 §43：选色来源标记（3D_PICK / SLICE_PICK / PARAMETER）。 */}
              {selectionSource && (
                <span
                  className="badge badge-source"
                  data-selection-source={selectionSource}
                >
                  来源：
                  {selectionSource === "3D_PICK"
                    ? "3D 拾取"
                    : selectionSource === "SLICE_PICK"
                      ? "切片拾取"
                      : "参数输入"}
                </span>
              )}
              <span className="muted" ref={hoverLabelRef}>
                悬停读取坐标
              </span>
            </div>
            {preview && preview.steps.length > 0 && (
              <div
                className="candidate-preview"
                data-testid="candidate-palette"
                aria-label="候选主色 Palette 实时预览"
              >
                {preview.steps.map(({ step, anchor }) => (
                  <span
                    key={step}
                    className="candidate-step"
                    style={{
                      background: cssOk({
                        l: anchor.l,
                        c: anchor.c,
                        h: anchor.h,
                      }),
                    }}
                    title={`primary.${step}`}
                  >
                    {step}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="candidate-actions">
            <button
              type="button"
              className="primary-button"
              disabled={candidateInfo.srgb === "OUT_OF_GAMUT"}
              onClick={() => commit(false)}
            >
              提交主色
            </button>
            {candidateInfo.srgb === "OUT_OF_GAMUT" && (
              <button
                type="button"
                className="outline-button"
                onClick={() => commit(true)}
              >
                映射到色域后提交
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => onCandidate(null)}
            >
              放弃
            </button>
          </div>
        </div>
      )}
      {viewMode === "space" && (
        <div className="space-controls">
          <button
            onClick={() => setRotation((r) => ({ ...r, yaw: r.yaw - 0.2 }))}
          >
            向左旋转
          </button>
          <button
            onClick={() => setRotation((r) => ({ ...r, yaw: r.yaw + 0.2 }))}
          >
            向右旋转
          </button>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            放大
          </button>
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            缩小
          </button>
          <button onClick={() => setPan((p) => ({ x: p.x - 20, y: 0 }))}>
            左移视图
          </button>
          <button onClick={() => setPan((p) => ({ x: p.x + 20, y: 0 }))}>
            右移视图
          </button>
          <button
            onClick={() => {
              setRotation({ yaw: 0.6, pitch: 0.35 });
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            重置视角
          </button>
        </div>
      )}
      <details>
        <summary>可访问的色彩数据表（{colors.length} 色）</summary>
        <div className="token-table">
          <table>
            <thead>
              <tr>
                <th>颜色</th>
                <th>设计 OKLCH</th>
                <th>{space} 映射 OKLCH</th>
              </tr>
            </thead>
            <tbody>
              {colors.map(([key, c]) => (
                <tr key={key}>
                  <td>
                    <button
                      onClick={() => onSelect(`${tokens.mode}.${key}`, c)}
                    >
                      {key}
                    </button>
                  </td>
                  <td>
                    {Object.values(colorDesign(c))
                      .map((v) => v?.toFixed(5) ?? "不适用")
                      .join(" / ")}
                  </td>
                  <td>
                    {Object.values(colorOutput(c, space).mapped)
                      .map((v) => v?.toFixed(5) ?? "不适用")
                      .join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
