import { useMemo, useRef } from "react";
import type { ColorRole, OKLCH, SliceDefinition, ThemeMode, V2Color } from "@cus/core";
import { oklabToOklch, oklchToOklab } from "@cus/core";
import { gamutStatus, maxChroma, oklchToRgb } from "@cus/color";
import { qualityEnvelope } from "@cus/palette";
import { colorRgb, luminanceOf } from "./SliceView";

// ─── CUS-UX-02 §20–§22：OKLab L/a/b 正交切片 ────────────────────────────────
// V1 内置三种正交切片（§20）：
//   L = constant → a×b 平面（§21，最重要的切片之一）
//   a = constant → L×b 平面
//   b = constant → L×a 平面
// 切片单元格以 CSS oklch() 填充（浏览器原生处理色域裁剪，§48/§50）；
// 色域边界由引擎 maxChroma(L,H,gamut) 采样（§33）；Dirty Zone 叠加层只消费
// 引擎 qualityEnvelope（§12：分析结果，非 Renderer 判断）。
// Renderer 不自行计算颜色（§40）：坐标→像素为本组件职责，颜色→颜色走引擎。

const W = 720;
const H = 360;
const COLS = 72;
const ROWS = 36;
/** OKLab a/b 轴范围（与 core OKLAB_BOUNDS 一致）。 */
const AB_MAX = 0.4;
const HATCH = "M0 6 L6 0 M2 10 L10 2";

const css = (o: OKLCH) =>
  `oklch(${o.l.toFixed(4)} ${Math.max(0, o.c).toFixed(4)} ${(o.h ?? 0).toFixed(2)})`;

/** 切片平面的水平/垂直轴语义（§20）。 */
export interface OklabPlaneAxes {
  horizontal: "a" | "b" | "L";
  vertical: "a" | "b" | "L";
}

export function planeAxes(slice: SliceDefinition): OklabPlaneAxes {
  if (slice.axis === "L") return { horizontal: "a", vertical: "b" };
  if (slice.axis === "a") return { horizontal: "b", vertical: "L" };
  return { horizontal: "a", vertical: "L" };
}

export function OklabSliceView({
  anchor,
  slice,
  mode,
  background,
  layers,
  onPick,
  onDrag,
  onSlice,
  onHover,
}: {
  /** 当前锚点（OKLCH 设计坐标），用于切片内标记（§16/§41）。 */
  anchor: OKLCH;
  slice: SliceDefinition;
  mode: ThemeMode;
  background?: V2Color;
  layers: { dirtyZone: boolean; contrast: boolean };
  /** 拾取/拖动产生连续 OKLab 坐标（§19），由父级转换为候选锚点。 */
  onPick: (lab: { l: number; a: number; b: number }) => void;
  onDrag: (lab: { l: number; a: number; b: number }) => void;
  onSlice: (slice: SliceDefinition) => void;
  onHover?: (lab: { l: number; a: number; b: number } | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const axes = planeAxes(slice);

  // 平面坐标范围：a/b ∈ [-0.4,0.4]，L ∈ [0,1]。
  const hRange = axes.horizontal === "L" ? [0, 1] : [-AB_MAX, AB_MAX];
  const vRange = axes.vertical === "L" ? [0, 1] : [-AB_MAX, AB_MAX];

  /** 单元格 (col,row) → OKLab。 */
  const cellOklab = (col: number, row: number) => {
    const u = hRange[0] + ((col + 0.5) / COLS) * (hRange[1] - hRange[0]);
    const v = vRange[1] - ((row + 0.5) / ROWS) * (vRange[1] - vRange[0]);
    return planeToOklab(slice, axes, u, v);
  };
  /** OKLab → 平面像素坐标（用于锚点标记与 palette 轨迹）。 */
  const project = (lab: { l: number; a: number; b: number }) => {
    const hu = oklabToHorizontal(slice, axes, lab);
    const vv = oklabToVertical(slice, axes, lab);
    const x = ((hu - hRange[0]) / (hRange[1] - hRange[0])) * W;
    const y = ((vRange[1] - vv) / (vRange[1] - vRange[0])) * H;
    const onPlane =
      Math.abs(oklabToFixed(slice, lab) - slice.value) <=
      (slice.axis === "L" ? 0.02 : 0.02);
    return { x, y, inside: onPlane };
  };

  // 色域边界（§33）：仅 L 切片（a×b 平面）有闭合边界曲线（Cmax(L,H)）。
  const boundaries = useMemo(() => {
    if (slice.axis !== "L") return null;
    return (["srgb", "display-p3"] as const).map((target) => {
      const pts: string[] = [];
      const N = 72;
      for (let i = 0; i <= N; i++) {
        const hDeg = (i / N) * 360;
        try {
          const cmax = maxChroma(slice.value, hDeg, target);
          const rad = (hDeg * Math.PI) / 180;
          const a = cmax * Math.cos(rad);
          const b = cmax * Math.sin(rad);
          const x = ((a - hRange[0]) / (hRange[1] - hRange[0])) * W;
          const y = ((vRange[1] - b) / (vRange[1] - vRange[0])) * H;
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        } catch {
          /* 采样失败跳过该列 */
        }
      }
      return pts.length > 1 ? pts.join(" ") : null;
    });
    // hRange/vRange 在 L 切片下恒定（a×b）。
  }, [slice.axis, slice.value]);

  // 非 L 切片：以粗网格暗化越界区域（§51 gamut visualization style）。
  const gamutDim = useMemo(() => {
    if (slice.axis === "L") return null;
    const rects: string[] = [];
    const gj = 36;
    const gi = 18;
    for (let j = 0; j < gj; j++)
      for (let i = 0; i < gi; i++) {
        const lab = cellOklab(
          Math.floor(((j + 0.5) / gj) * COLS),
          Math.floor(((i + 0.5) / gi) * ROWS),
        );
        const oklch = oklabToOklch(lab);
        try {
          if (gamutStatus(oklch, "srgb") === "OUT_OF_GAMUT")
            rects.push(`${(j * W) / gj},${(i * H) / gi}`);
        } catch {
          rects.push(`${(j * W) / gj},${(i * H) / gi}`);
        }
      }
    return rects;
    // cellOklab 随 slice 变化。
  }, [slice.axis, slice.value]);

  // Dirty Zone 叠加层（§12/§13）：包络只随 L（与角色/主题）变化。
  const dirty = useMemo(() => {
    if (!layers.dirtyZone) return null;
    const env = (l: number) =>
      qualityEnvelope(l, 250, "primary" as ColorRole, mode);
    if (slice.axis === "L") {
      // a×b 平面：固定 L，包络给出 Cmin/Cmax 环带。
      const e = env(slice.value);
      const rMin = (Math.min(e.min, AB_MAX) / AB_MAX) * (W / 2);
      const rMax = (Math.min(e.max, AB_MAX) / AB_MAX) * (W / 2);
      // 以中心环带近似：内圈（c<min）与外圈（c>max）为 dirty。
      return { kind: "ring" as const, rMin, rMax, cx: W / 2, cy: H / 2 };
    }
    // L×b / L×a 平面：垂直轴为 L，逐行判断固定坐标的色度是否越包络。
    const bands: [number, number][] = [];
    for (let i = 0; i < ROWS; i++) {
      const l = vRange[1] - ((i + 0.5) / ROWS) * (vRange[1] - vRange[0]);
      const e = env(l);
      // 该行的固定轴坐标（a 或 b）即切片值；色度 c=|value|（近似）。
      const c = Math.abs(slice.value);
      if (c < e.min - 1e-9 || c > e.max + 1e-9)
        bands.push([(i / ROWS) * H, ((i + 1) / ROWS) * H]);
    }
    return { kind: "bands" as const, bands };
    // 包络随主题联动。
  }, [layers.dirtyZone, slice.axis, slice.value, mode]);

  // 对比参考：粗网格以 sRGB 相对亮度估算与背景的 WCAG 对比度。
  const contrastOverlay = useMemo(() => {
    if (!layers.contrast || !background) return null;
    let bgY: number;
    try {
      bgY = luminanceOf(colorRgb(background));
    } catch {
      return null;
    }
    const rects: string[] = [];
    for (let j = 0; j < 24; j++)
      for (let i = 0; i < 12; i++) {
        const lab = cellOklab(
          Math.floor(((j + 0.5) / 24) * COLS),
          Math.floor(((i + 0.5) / 12) * ROWS),
        );
        try {
          const y = luminanceOf(oklchToRgb(oklabToOklch(lab), "srgb"));
          const ratio =
            (Math.max(y, bgY) + 0.05) / (Math.min(y, bgY) + 0.05);
          if (ratio < 4.5) rects.push(`${(j * W) / 24},${(i * H) / 12}`);
        } catch {
          /* 采样失败跳过 */
        }
      }
    return rects;
    // background 以 hex 参与依赖。
  }, [layers.contrast, background?.hex, slice.axis, slice.value, mode]);

  const cells = useMemo(() => {
    const list: { key: string; x: number; y: number; fill: string }[] = [];
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++) {
        const lab = cellOklab(col, row);
        list.push({
          key: `${row}-${col}`,
          x: (col * W) / COLS,
          y: (row * H) / ROWS,
          fill: css(oklabToOklch(lab)),
        });
      }
    return list;
    // cellOklab 随 slice 变化。
  }, [slice.axis, slice.value]);

  const toPlane = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (x < 0 || x > W || y < 0 || y > H) return null;
    const u = hRange[0] + (x / W) * (hRange[1] - hRange[0]);
    const v = vRange[1] - (y / H) * (vRange[1] - vRange[0]);
    return planeToOklab(slice, axes, u, v);
  };

  const anchorLab = oklchToOklab(anchor);
  const a = project(anchorLab);
  const axisLabel = (ax: "a" | "b" | "L") => ax;
  const fixedLabel = slice.axis;

  return (
    <div className="slice-panel" data-testid="oklab-slice-panel">
      <div className="space-controls">
        <label>
          固定轴{" "}
          <select
            aria-label="OKLab 切片固定轴"
            value={slice.axis}
            onChange={(e) => {
              const axis = e.target.value as SliceDefinition["axis"];
              const value =
                axis === "L" ? 0.62 : axis === "a" ? 0.04 : -0.17;
              onSlice({ axis, value });
            }}
          >
            <option value="L">L 明度（a×b 平面）</option>
            <option value="a">a 绿红（L×b 平面）</option>
            <option value="b">b 蓝黄（L×a 平面）</option>
          </select>
        </label>
        <label>
          {fixedLabel} 固定值{" "}
          <input
            type="range"
            aria-label="OKLab 切片固定值"
            min={slice.axis === "L" ? 0 : -AB_MAX}
            max={slice.axis === "L" ? 1 : AB_MAX}
            step={0.001}
            value={slice.value}
            onChange={(e) =>
              onSlice({ ...slice, value: Number(e.target.value) })
            }
          />
          <input
            className="coordinate-input"
            type="number"
            aria-label="OKLab 切片固定数值"
            min={slice.axis === "L" ? 0 : -AB_MAX}
            max={slice.axis === "L" ? 1 : AB_MAX}
            step={0.001}
            value={slice.value}
            onChange={(e) => {
              if (e.target.value !== "")
                onSlice({ ...slice, value: Number(e.target.value) });
            }}
          />
        </label>
        <span className="slice-meta" data-testid="oklab-slice-meta">
          切片 {fixedLabel} = {slice.value.toFixed(3)} · 水平{" "}
          {axisLabel(axes.horizontal)} · 垂直 {axisLabel(axes.vertical)} ·{" "}
          <span ref={hoverRef}>悬停读取坐标</span>
        </span>
      </div>
      <svg
        ref={svgRef}
        className="slice-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`OKLab 二维切片：固定 ${fixedLabel}=${slice.value.toFixed(3)}，水平 ${axes.horizontal}，垂直 ${axes.vertical}；点击或拖动选择颜色`}
        tabIndex={0}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          const lab = toPlane(e);
          if (!lab) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onPick(lab);
        }}
        onPointerMove={(e) => {
          const lab = toPlane(e);
          if (!lab) return;
          onHover?.(lab);
          if (hoverRef.current) {
            const ok = oklabToOklch(lab);
            hoverRef.current.textContent = `L ${lab.l.toFixed(3)} · a ${lab.a.toFixed(3)} · b ${lab.b.toFixed(3)} · C ${ok.c.toFixed(3)} · H ${(ok.h ?? 0).toFixed(0)}°`;
          }
          if (dragging.current) onDrag(lab);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onPointerLeave={() => {
          dragging.current = false;
          onHover?.(null);
          if (hoverRef.current) hoverRef.current.textContent = "悬停读取坐标";
        }}
      >
        <title>
          OKLab 切片：固定 {fixedLabel}={slice.value.toFixed(3)}；点击或拖动以选择候选颜色
        </title>
        <defs>
          <pattern id="oklab-dirty-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d={HATCH} stroke="#8a5a12" strokeWidth="1" fill="none" />
          </pattern>
          <pattern id="oklab-contrast-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d={HATCH} stroke="#4a5b78" strokeWidth="1" fill="none" />
          </pattern>
        </defs>
        {cells.map((cell) => (
          <rect
            key={cell.key}
            x={cell.x}
            y={cell.y}
            width={W / COLS + 0.5}
            height={H / ROWS + 0.5}
            fill={cell.fill}
          />
        ))}
        {gamutDim?.map((p) => (
          <rect
            key={p}
            x={Number(p.split(",")[0])}
            y={Number(p.split(",")[1])}
            width={W / 36}
            height={H / 18}
            fill="#f3f4f6"
            fillOpacity=".72"
          />
        ))}
        {boundaries?.map((pts, i) =>
          pts ? (
            <polyline
              key={i}
              data-slice-boundary={i === 0 ? "srgb" : "display-p3"}
              points={pts}
              fill="none"
              stroke="#202631"
              strokeOpacity={i === 0 ? 0.8 : 0.55}
              strokeWidth={i === 0 ? 1.6 : 1.2}
              strokeDasharray={i === 0 ? undefined : "4 3"}
            />
          ) : null,
        )}
        {dirty && dirty.kind === "ring" ? (
          <>
            <circle
              data-dirty-overlay=""
              cx={dirty.cx}
              cy={dirty.cy}
              r={dirty.rMin}
              fill="url(#oklab-dirty-hatch)"
              fillOpacity=".5"
            />
            <circle
              cx={dirty.cx}
              cy={dirty.cy}
              r={dirty.rMax}
              fill="none"
              stroke="#8a5a12"
              strokeOpacity=".4"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          </>
        ) : null}
        {dirty && dirty.kind === "bands"
          ? dirty.bands.map((band, i) => (
              <rect
                key={i}
                data-dirty-overlay=""
                x={0}
                y={band[0]}
                width={W}
                height={band[1] - band[0]}
                fill="url(#oklab-dirty-hatch)"
                fillOpacity=".5"
              />
            ))
          : null}
        {contrastOverlay?.map((p) => (
          <rect
            key={p}
            data-contrast-overlay=""
            x={Number(p.split(",")[0])}
            y={Number(p.split(",")[1])}
            width={W / 24}
            height={H / 12}
            fill="url(#oklab-contrast-hatch)"
            fillOpacity=".45"
          />
        ))}
        <g
          data-anchor-marker=""
          transform={`translate(${a.x} ${a.y})`}
          opacity={a.inside ? 1 : 0.55}
        >
          <circle
            r="8"
            fill="#fff"
            stroke="#202631"
            strokeWidth="1.6"
            strokeDasharray={a.inside ? undefined : "3 2"}
          />
          <circle r="4.4" fill={css(anchor)} />
        </g>
      </svg>
      <p className="muted">
        OKLab 正交切片（§20）：固定 {fixedLabel}，水平 {axes.horizontal} × 垂直{" "}
        {axes.vertical} · 点击或拖动产生连续坐标候选（§19）· 虚线锚点表示当前锚点不在切片平面内 ·
        sRGB 实线 / P3 虚线色域边界（maxChroma 采样，§33）· 斜线阴影为 Dirty Zone 与对比度不足区域
      </p>
    </div>
  );
}

// ─── 平面坐标 ↔ OKLab 互转（§20–§22）────────────────────────────────────────

function planeToOklab(
  slice: SliceDefinition,
  axes: OklabPlaneAxes,
  u: number,
  v: number,
): { l: number; a: number; b: number } {
  const lab = { l: 0, a: 0, b: 0 };
  // 固定轴
  if (slice.axis === "L") lab.l = slice.value;
  else if (slice.axis === "a") lab.a = slice.value;
  else lab.b = slice.value;
  // 水平轴
  if (axes.horizontal === "a") lab.a = u;
  else if (axes.horizontal === "b") lab.b = u;
  else lab.l = u;
  // 垂直轴
  if (axes.vertical === "a") lab.a = v;
  else if (axes.vertical === "b") lab.b = v;
  else lab.l = v;
  return lab;
}

function oklabToHorizontal(
  _slice: SliceDefinition,
  axes: OklabPlaneAxes,
  lab: { l: number; a: number; b: number },
): number {
  if (axes.horizontal === "a") return lab.a;
  if (axes.horizontal === "b") return lab.b;
  return lab.l;
}
function oklabToVertical(
  _slice: SliceDefinition,
  axes: OklabPlaneAxes,
  lab: { l: number; a: number; b: number },
): number {
  if (axes.vertical === "a") return lab.a;
  if (axes.vertical === "b") return lab.b;
  return lab.l;
}
function oklabToFixed(
  slice: SliceDefinition,
  lab: { l: number; a: number; b: number },
): number {
  if (slice.axis === "L") return lab.l;
  if (slice.axis === "a") return lab.a;
  return lab.b;
}
