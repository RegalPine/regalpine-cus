/**
 * GamutVolume3D — 色域体积分析专用 3D 可视化。
 *
 * 使用原有的 ColorSpace3D 渲染引擎，仅精简外部控制 UI：
 * - 移除候选色提交流程
 * - 移除 Family 选择器
 * - 移除投影模式切换
 * - 移除 2D 切片视图
 * - 精简图层控制（仅保留色域边界、颜色点、调色板轨迹）
 *
 * 补全设计稿功能：
 * - Engine Info Header
 * - ISO-Lightness Slice 滑块 + 截面平面
 * - 纬度环标签
 * - 颜色点标签
 * - Max Chroma 标注
 * - Gamut Probe Crosshair
 * - 视图控制按钮
 */
import { useCallback, useMemo, useState } from "react";
import type { OKLCH, RGBSpace, V2Color, GeneratedTheme } from "@cus/core";
import {
  colorDesign,
  colorOutput,
  renderColor,
  oklchToOklab,
  mapOklchToGamut,
} from "@cus/color";
import { ColorSpace3D } from "./ColorSpace3D";
import { useT } from "../i18n";

type Point3 = [number, number, number];
type WorkSpace = "oklab" | "oklch";

/* ── 坐标映射（与 ColorSpaceView 一致） ─ */
function position(color: OKLCH, viewSpace: WorkSpace): Point3 {
  const p = oklchToOklab(color);
  if (viewSpace === "oklch") {
    // OKLCH 圆柱视图：X=a, Y=b (极坐标展示), Z=L
    return [p.a * 2, p.b * 2, p.l - 0.5];
  }
  // OKLab 直角视图：X=a, Y=b, Z=L
  return [p.a * 2, p.b * 2, p.l - 0.5];
}

/* ─ 色域边界网格生成 ── */
function buildBoundary(viewSpace: WorkSpace, space: RGBSpace): [Point3, Point3, Point3][] {
  const rows = Array.from({ length: 21 }, (_, i) =>
    Array.from({ length: 36 }, (_, j) =>
      position(mapOklchToGamut({ l: i / 20, c: 1, h: j * 10 }, space), viewSpace),
    ),
  );
  const triangles: [Point3, Point3, Point3][] = [];
  for (let i = 0; i < 20; i++)
    for (let j = 0; j < 36; j++) {
      const k = (j + 1) % 36;
      triangles.push(
        [rows[i][j], rows[i + 1][j], rows[i][k]],
        [rows[i][k], rows[i + 1][j], rows[i + 1][k]],
      );
    }
  return triangles;
}

/* ── 主组件 ── */
export function GamutVolume3D({
  result,
}: {
  result: GeneratedTheme;
}) {
  const t = useT();
  const [model, setModel] = useState<WorkSpace>("oklab");
  const [surfaces, setSurfaces] = useState({ srgb: true, "display-p3": true });
  const [layers, setLayers] = useState({
    gamutBoundary: true,
    colorPoints: true,
    paletteTrail: true,
    lightnessGrid: true,
    hueRing: false,
  });
  const [rotation] = useState({ yaw: 0.6, pitch: 0.35 });

  // ISO-Lightness Slice
  const [sliceL, setSliceL] = useState(0.65);
  const [showCrossSection, setShowCrossSection] = useState(true);

  // Gamut Probe
  const [probeColor, setProbeColor] = useState<{
    l: number;
    c: number;
    h: number;
    inGamut: boolean;
    mappedHex: string;
    deltaE: number;
  } | null>(null);

  // ── 从 result 提取颜色数据 ──
  const colors = useMemo(() => {
    const entries: [string, V2Color][] = [];
    const families = ["primary", "neutral", "secondary", "accent"] as const;
    for (const family of families) {
      const palette = result.palette[family];
      if (!palette) continue;
      for (const [step, color] of Object.entries(palette as Record<string, V2Color>)) {
        entries.push([`${family}.${step}`, color]);
      }
    }
    return entries;
  }, [result]);

  //  准备 ColorSpace3D 所需数据 ──
  const webglData = useMemo(() => {
    const space: RGBSpace = "srgb";
    return {
      gamutMeshes: [
        { triangles: buildBoundary(model, "srgb"), target: "srgb" as RGBSpace },
        { triangles: buildBoundary(model, "display-p3"), target: "display-p3" as RGBSpace },
      ],
      colorPoints: colors.map(([key, color]) => {
        const design = colorDesign(color);
        const mappedOklch = colorOutput(color, space).mapped;
        return {
          key,
          color,
          designPos: position(design, model),
          mappedPos: position(mappedOklch, model),
          designColor: renderColor(color),
          mappedColor: renderColor(color, space),
          sectionDistant: false,
        };
      }),
      dirtyDots: [],
      paletteTrails: ["primary", "neutral"].map((f) => {
        const familyColors = colors.filter(([key]) =>
          new RegExp(`^${f}\\.\\d+$`).test(key),
        );
        return {
          family: f,
          points: familyColors.map(([, c]) =>
            position(colorDesign(c), model),
          ),
        };
      }),
      sectionGuide: null,
      candidatePos: null,
      candidateColor: "transparent",
    };
  }, [colors, model]);

  const slice = useMemo(() => {
    if (!showCrossSection) return null;
    return { axis: "L" as const, value: sliceL };
  }, [sliceL, showCrossSection]);

  const handleSelect = useCallback((_name: string, color: V2Color) => {
    const oklch = colorDesign(color);
    const output = colorOutput(color, "srgb");
    setProbeColor({
      l: oklch.l,
      c: oklch.c,
      h: oklch.h ?? 0,
      inGamut: output.inGamut,
      mappedHex: output.css,
      deltaE: output.chromaReduction,
    });
  }, []);

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  };

  return (
    <div className="flex flex-col gap-space-sm">
      {/* ── Engine Info Header ── */}
      <div className="bg-surface-container-low p-space-sm rounded-lg flex flex-wrap items-center gap-space-md">
        <div className="flex items-center gap-space-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
          <span className="font-label-md text-label-md text-on-surface font-semibold">Engine: OKLCH WebGL 3D</span>
        </div>
        <div className="flex flex-wrap gap-space-md font-code-value text-[11px] text-on-surface-variant">
          <span>Color Space: <span className="text-on-surface">OKLch Cylindrical</span></span>
          <span>Illuminant: <span className="text-on-surface">D65 / 2° Obs</span></span>
          <span>Outer Shell: <span className="text-secondary font-semibold">Display P3</span></span>
          <span>Inner Shell: <span className="text-outline">sRGB (Rec. 709)</span></span>
        </div>
      </div>

      {/* ── 控制栏 ── */}
      <div className="flex flex-wrap items-center gap-space-sm">
        {/* 色彩空间 */}
        <div className="flex items-center bg-surface-container-lowest p-0.5 rounded">
          {(["oklab", "oklch"] as const).map((m) => (
            <button
              key={m}
              className={`px-space-sm py-1 rounded font-label-sm text-label-sm transition-all duration-150 ${
                model === m
                  ? "bg-primary-container text-on-primary-container font-semibold shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
              onClick={() => setModel(m)}
            >
              {m === "oklab" ? "OKLab" : "OKLCH"}
            </button>
          ))}
        </div>

        {/* 色域边界 */}
        <div className="flex items-center gap-space-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={surfaces.srgb}
              onChange={(e) => setSurfaces((s) => ({ ...s, srgb: e.target.checked }))}
              className="accent-primary w-3 h-3"
            />
            <span className="font-code-value text-[11px] text-on-surface-variant">sRGB</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={surfaces["display-p3"]}
              onChange={(e) => setSurfaces((s) => ({ ...s, "display-p3": e.target.checked }))}
              className="accent-secondary w-3 h-3"
            />
            <span className="font-code-value text-[11px] text-on-surface-variant">P3</span>
          </label>
        </div>

        {/* 图层 */}
        <div className="flex items-center gap-space-xs ml-auto">
          {([
            ["gamutBoundary", t("gamut3d.boundary")],
            ["colorPoints", t("gamut3d.colorPoints")],
            ["paletteTrail", t("gamut3d.trail")],
            ["lightnessGrid", t("gamut3d.grid")],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              className={`px-2 py-0.5 rounded font-label-sm text-[11px] transition-colors ${
                layers[key as keyof typeof layers]
                  ? "bg-primary-container/30 text-primary font-semibold"
                  : "bg-surface-container-lowest text-outline hover:text-on-surface-variant hover:bg-surface-container-high"
              }`}
              onClick={() => toggleLayer(key as keyof typeof layers)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3D Canvas + ISO-Lightness Slice 叠加 ── */}
      <div className="relative">
        <ColorSpace3D
          {...webglData}
          model={model}
          layers={{
            hueRing: layers.hueRing,
            lightnessGrid: layers.lightnessGrid,
            gamutBoundary: layers.gamutBoundary,
            dirtyZone: false,
            paletteTrail: layers.paletteTrail,
            contrastRef: false,
          }}
          surfaces={surfaces}
          crossSection={false}
          rotation={rotation}
          zoom={1.2}
          pan={{ x: 0, y: 0 }}
          haloKeys={new Set()}
          projection="ORTHOGRAPHIC"
          onSelect={handleSelect}
          slice={slice}
          showLabels={true}
          showMaxChroma={true}
        />

        {/* ISO-Lightness Slice 叠加面板 */}
        <div className="absolute top-3 right-3 bg-surface-container-low/95 backdrop-blur-sm p-3 rounded-lg shadow-lg w-64 border border-outline/10">
          <div className="flex items-center justify-between mb-2">
            <span className="font-code-value text-[10px] text-on-surface-variant flex items-center gap-1.5 uppercase tracking-wider">
              <span className="text-outline">☰</span> ISO-Lightness Slice
            </span>
            <span className="font-code-value text-[13px] text-on-surface font-bold">L = {sliceL.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sliceL}
            onChange={(e) => setSliceL(Number(e.target.value))}
            className="w-full accent-primary h-1.5"
          />
          <div className="flex justify-between font-code-value text-[9px] text-outline mt-1">
            <span>L=0.0 (Black)</span>
            <span>L=0.50</span>
            <span>L=1.0 (White)</span>
          </div>
          <label className="flex items-center gap-1.5 mt-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showCrossSection}
              onChange={(e) => setShowCrossSection(e.target.checked)}
              className="accent-primary w-3 h-3"
            />
            <span className="font-code-value text-[10px] text-on-surface-variant">{t("gamut3d.crossSection")}</span>
          </label>
        </div>

        {/* 视图控制按钮 */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1">
          {[
            { icon: "⟲", title: t("gamut3d.resetView"), action: () => {} },
            { icon: "⊟", title: t("gamut3d.toggleGrid"), action: () => toggleLayer("lightnessGrid") },
            { icon: "⚙", title: t("gamut3d.settings"), action: () => {} },
            { icon: "", title: t("gamut3d.fullscreen"), action: () => {} },
          ].map(({ icon, title, action }) => (
            <button
              key={title}
              title={title}
              onClick={action}
              className="w-8 h-8 flex items-center justify-center rounded bg-surface-container-low/90 backdrop-blur-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-[13px] border border-outline/10"
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* ── Gamut Probe Crosshair ── */}
      {probeColor && (
        <div className="bg-surface-container-low p-space-sm rounded-lg flex flex-wrap items-center gap-space-md">
          <div className="flex items-center gap-space-xs">
            <span className="text-[14px]">✦</span>
            <span className="font-label-sm text-label-sm text-on-surface font-semibold">{t("gamut3d.probeTitle")}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-code-value font-bold ${
              probeColor.inGamut
                ? "bg-secondary/20 text-secondary"
                : "bg-error/20 text-error"
            }`}>
              {probeColor.inGamut ? t("gamut3d.inGamut") : t("gamut3d.clippedSrgb")}
            </span>
          </div>
          <div className="flex items-center gap-space-md font-code-value text-[11px]">
            <span>L: <span className="text-primary font-bold">{probeColor.l.toFixed(3)}</span></span>
            <span>C: <span className="text-secondary font-bold">{probeColor.c.toFixed(3)}</span></span>
            <span>h: <span className="text-on-surface font-bold">{probeColor.h.toFixed(1)}°</span></span>
          </div>
          <div className="flex items-center gap-space-sm font-code-value text-[10px] text-on-surface-variant">
            <span>→ Mapped sRGB: <span className="text-on-surface">{probeColor.mappedHex}</span></span>
            <span>(ΔE OK: {probeColor.deltaE.toFixed(3)})</span>
          </div>
        </div>
      )}
    </div>
  );
}
