import { useMemo, useRef } from "react";
import type { V2Color, ColorRole, OKLCH, ThemeMode } from "@cus/core";
import { qualityEnvelope } from "@cus/palette";
import { mapOklchToGamut, oklchToRgb } from "@cus/color";

// ─── CUS-UX-01 §9/§10：二维切片 ─────────────────────────────────────────────
// 切片平面为 SVG 网格，单元格以 CSS oklch() 填充（浏览器原生处理色域裁剪）；
// 色域边界折线由引擎 mapOklchToGamut 逐列采样（延续三维视图"采样近似"口径）；
// Dirty Zone 叠加层只消费引擎 qualityEnvelope（§14：不得自行创造）。
export type SliceAxis = "l" | "c" | "h";
export interface SliceState {
  axis: SliceAxis;
  value: number;
}
export interface SliceLayers {
  dirtyZone: boolean;
  contrast: boolean;
  palettePath: boolean;
}

const W = 720;
const H = 360;
const COLS = 72;
const ROWS = 36;
const C_MAX = 0.4;
export const SLICE_DEFAULTS: Record<SliceAxis, number> = {
  l: 0.64,
  c: 0.18,
  h: 260,
};
const AXIS_LABEL = { l: "L", c: "C", h: "H" } as const;
const HATCH = "M0 6 L6 0 M2 10 L10 2";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const css = (o: OKLCH) =>
  `oklch(${o.l.toFixed(4)} ${Math.max(0, o.c).toFixed(4)} ${(o.h ?? 0).toFixed(2)})`;

export function SliceView({
  anchor,
  slice,
  mode,
  background,
  paletteSteps,
  layers,
  onPick,
  onDrag,
  onSlice,
  onHover,
}: {
  anchor: OKLCH;
  slice: SliceState;
  mode: ThemeMode;
  /** 对比参考的背景 token（surface.default 等），缺省隐藏对比参考。 */
  background?: V2Color;
  paletteSteps: OKLCH[];
  layers: SliceLayers;
  onPick: (color: OKLCH) => void;
  onDrag: (color: OKLCH) => void;
  onSlice: (slice: SliceState) => void;
  /** UX-01 §37：悬停坐标经 COLOR_HOVER 事件上报（null = 离开平面）。 */
  onHover?: (color: OKLCH | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  // 平面几何：fixed l → 水平 H × 垂直 C；fixed c → H × L；fixed h → C × L。
  const plane = useMemo(() => {
    if (slice.axis === "l")
      return { hAxis: "H", hMax: 360, vAxis: "C", vMax: C_MAX };
    if (slice.axis === "c")
      return { hAxis: "H", hMax: 360, vAxis: "L", vMax: 1 };
    return { hAxis: "C", hMax: C_MAX, vAxis: "L", vMax: 1 };
  }, [slice.axis]);
  const cellColor = (col: number, row: number): OKLCH => {
    const u = ((col + 0.5) / COLS) * plane.hMax;
    const v = 1 - (row + 0.5) / ROWS;
    if (slice.axis === "l") return { l: slice.value, c: v * plane.vMax, h: u };
    if (slice.axis === "c") return { l: v, c: slice.value, h: u };
    return { l: v, c: u, h: slice.value };
  };
  const project = (o: OKLCH) => {
    if (slice.axis === "l")
      return {
        x: ((o.h ?? 0) / 360) * W,
        y: (1 - Math.min(o.c, C_MAX) / C_MAX) * H,
        inside: Math.abs(o.l - slice.value) <= 0.02,
      };
    if (slice.axis === "c")
      return {
        x: ((o.h ?? 0) / 360) * W,
        y: (1 - o.l) * H,
        inside: Math.abs(o.c - slice.value) <= 0.02,
      };
    return {
      x: (Math.min(o.c, C_MAX) / C_MAX) * W,
      y: (1 - o.l) * H,
      inside: Math.abs((o.h ?? 0) - slice.value) <= 5,
    };
  };
  const envelopeAt = (l: number) =>
    qualityEnvelope(l, 250, "primary" as ColorRole, mode);
  // 色域边界折线：fixed l / fixed h 逐列采样；fixed c 用粗网格暗化越界区域。
  const boundaries = useMemo(
    () =>
      (["srgb", "display-p3"] as const).map((target) => {
        if (slice.axis === "c") return null;
        const pts: string[] = [];
        const n = slice.axis === "l" ? COLS : ROWS;
        for (let j = 0; j <= n; j++) {
          const l =
            slice.axis === "l" ? slice.value : 1 - j / ROWS;
          const h = slice.axis === "l" ? (j / COLS) * 360 : slice.value;
          try {
            const mapped = mapMaxChroma(l, h, target);
            pts.push(
              `${((j / n) * W).toFixed(1)},${(
                (1 - Math.min(mapped, C_MAX) / C_MAX) *
                H
              ).toFixed(1)}`,
            );
          } catch {
            /* 采样失败跳过该列 */
          }
        }
        return pts.length > 1 ? pts.join(" ") : null;
      }),
    [slice.axis, slice.value],
  );
  const gamutDim = useMemo(() => {
    if (slice.axis !== "c") return null;
    const rects: string[] = [];
    for (let j = 0; j < 36; j++)
      for (let i = 0; i < 18; i++) {
        const l = 1 - (i + 0.5) / 18;
        const h = (j + 0.5) * 10;
        try {
          if (mapMaxChroma(l, h, "srgb") < slice.value - 1e-6)
            rects.push(`${j * 20},${i * 20}`);
        } catch {
          rects.push(`${j * 20},${i * 20}`);
        }
      }
    return rects;
  }, [slice.axis, slice.value]);
  // Dirty Zone 叠加层：包络只随 l（与角色/主题）变化。
  const dirty = useMemo<
    | { kind: "bands"; bands: [number, number][] }
    | { kind: "curves"; left: string; right: string }
    | null
  >(() => {
    if (!layers.dirtyZone) return null;
    if (slice.axis === "l") {
      const env = envelopeAt(slice.value);
      const top = (1 - Math.min(env.max, C_MAX) / C_MAX) * H;
      const bottom = (1 - env.min / C_MAX) * H;
      const bands: [number, number][] = [];
      if (top > 0.5) bands.push([0, top]);
      if (bottom < H - 0.5) bands.push([bottom, H]);
      return { kind: "bands", bands };
    }
    if (slice.axis === "c") {
      const bands: [number, number][] = [];
      for (let i = 0; i < ROWS; i++) {
        const l = 1 - (i + 0.5) / ROWS;
        const env = envelopeAt(l);
        if (slice.value < env.min - 1e-9 || slice.value > env.max + 1e-9)
          bands.push([(i / ROWS) * H, ((i + 1) / ROWS) * H]);
      }
      return { kind: "bands", bands };
    }
    const left: string[] = ["0,0"];
    const right: string[] = [];
    for (let i = 0; i <= ROWS; i++) {
      const l = 1 - i / ROWS;
      const env = envelopeAt(l);
      const y = (i / ROWS) * H;
      left.push(
        `${((Math.min(env.min, C_MAX) / C_MAX) * W).toFixed(1)},${y.toFixed(1)}`,
      );
      right.push(
        `${((Math.min(env.max, C_MAX) / C_MAX) * W).toFixed(1)},${y.toFixed(1)}`,
      );
    }
    left.push(`0,${H}`);
    right.push(`${W},0`, `${W},${H}`);
    return { kind: "curves", left: left.join(" "), right: right.join(" ") };
    // 包络随主题联动。
  }, [layers.dirtyZone, slice.axis, slice.value, mode]);
  // 对比参考：粗网格 (24×12) 以 sRGB 相对亮度估算与背景的 WCAG 对比度。
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
        const color = cellColor(
          Math.floor(((j + 0.5) / 24) * COLS),
          Math.floor(((i + 0.5) / 12) * ROWS),
        );
        try {
          const y = luminanceOf(oklchToRgb(color, "srgb"));
          const ratio =
            (Math.max(y, bgY) + 0.05) / (Math.min(y, bgY) + 0.05);
          if (ratio < 4.5)
            rects.push(`${(j * W) / 24},${(i * H) / 12}`);
        } catch {
          /* 采样失败跳过 */
        }
      }
    return rects;
    // background 以 hex 参与依赖（Color 对象引用每次渲染变化）。
  }, [layers.contrast, background?.hex, slice.axis, slice.value, mode]);
  const toPlane = (e: React.PointerEvent): OKLCH | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (x < 0 || x > W || y < 0 || y > H) return null;
    const u = (x / W) * plane.hMax;
    const v = (1 - y / H) * plane.vMax;
    if (slice.axis === "l") return { l: slice.value, c: v, h: u };
    if (slice.axis === "c") return { l: v, c: slice.value, h: u };
    return { l: v, c: u, h: slice.value };
  };
  const a = project(anchor);
  const cells = useMemo(() => {
    const list: { key: string; x: number; y: number; fill: string }[] = [];
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++)
        list.push({
          key: `${row}-${col}`,
          x: (col * W) / COLS,
          y: (row * H) / ROWS,
          fill: css(cellColor(col, row)),
        });
    return list;
    // cellColor 每次渲染随 slice 值变化，依赖其全部输入。
  }, [slice.axis, slice.value]);
  return (
    <div className="slice-panel">
      <div className="space-controls">
        <label>
          固定轴{" "}
          <select
            aria-label="切片固定轴"
            value={slice.axis}
            onChange={(e) => {
              const axis = e.target.value as SliceAxis;
              onSlice({ axis, value: SLICE_DEFAULTS[axis] });
            }}
          >
            <option value="l">L 明度</option>
            <option value="c">C 色度</option>
            <option value="h">H 色相</option>
          </select>
        </label>
        <label>
          {AXIS_LABEL[slice.axis]} 固定值{" "}
          <input
            type="range"
            aria-label="切片固定值"
            min={0}
            max={slice.axis === "l" ? 1 : slice.axis === "c" ? C_MAX : 360}
            step={slice.axis === "h" ? 1 : 0.001}
            value={slice.value}
            onChange={(e) =>
              onSlice({ ...slice, value: Number(e.target.value) })
            }
          />
          <input
            className="coordinate-input"
            type="number"
            aria-label="切片固定数值"
            min={0}
            max={slice.axis === "l" ? 1 : slice.axis === "c" ? undefined : 360}
            step={slice.axis === "h" ? 1 : 0.001}
            value={slice.value}
            onChange={(e) => {
              if (e.target.value !== "")
                onSlice({ ...slice, value: Number(e.target.value) });
            }}
          />
        </label>
        <span className="slice-meta" data-testid="slice-meta">
          切片 fixed: {AXIS_LABEL[slice.axis]} = {slice.value.toFixed(3)} ·
          horizontal: {plane.hAxis} · vertical: {plane.vAxis} ·{" "}
          <span ref={hoverRef}>悬停读取坐标</span>
        </span>
      </div>
      <svg
        ref={svgRef}
        className="slice-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`二维颜色切片：固定 ${AXIS_LABEL[slice.axis]}=${slice.value.toFixed(3)}，水平 ${plane.hAxis}，垂直 ${plane.vAxis}；点击或拖动选择颜色`}
        tabIndex={0}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          const color = toPlane(e);
          if (!color) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onPick(color);
        }}
        onPointerMove={(e) => {
          const color = toPlane(e);
          if (!color) return;
          onHover?.(color);
          if (hoverRef.current)
            hoverRef.current.textContent = `L ${color.l.toFixed(3)} · C ${color.c.toFixed(3)} · H ${(color.h ?? 0).toFixed(0)}°`;
          if (dragging.current) onDrag(color);
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
          if (hoverRef.current)
            hoverRef.current.textContent = "悬停读取坐标";
        }}
      >
        <title>
          二维切片：固定 {AXIS_LABEL[slice.axis]}={slice.value.toFixed(3)}；
          点击或拖动以选择候选颜色
        </title>
        <defs>
          <pattern id="dirty-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d={HATCH} stroke="#8a5a12" strokeWidth="1" fill="none" />
          </pattern>
          <pattern id="contrast-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
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
            width={20}
            height={20}
            fill="#f3f4f6"
            fillOpacity=".72"
          />
        ))}
        {boundaries.map((pts, i) =>
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
        {dirty && dirty.kind === "bands"
          ? dirty.bands.map((band, i) => (
              <rect
                key={i}
                data-dirty-overlay=""
                x={0}
                y={band[0]}
                width={W}
                height={band[1] - band[0]}
                fill="url(#dirty-hatch)"
                fillOpacity=".5"
              />
            ))
          : null}
        {dirty && dirty.kind === "curves" ? (
          <>
            <polygon
              data-dirty-overlay=""
              points={dirty.left}
              fill="url(#dirty-hatch)"
              fillOpacity=".5"
            />
            <polygon
              data-dirty-overlay=""
              points={dirty.right}
              fill="url(#dirty-hatch)"
              fillOpacity=".5"
            />
          </>
        ) : null}
        {contrastOverlay?.map((p) => (
          <rect
            key={p}
            data-contrast-overlay=""
            x={Number(p.split(",")[0])}
            y={Number(p.split(",")[1])}
            width={W / 24}
            height={H / 12}
            fill="url(#contrast-hatch)"
            fillOpacity=".45"
          />
        ))}
        {layers.palettePath && paletteSteps.length > 1 && (
          <polyline
            data-palette-path=""
            points={paletteSteps
              .map((o) => {
                const p = project(o);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              })
              .join(" ")}
            fill="none"
            stroke="#202631"
            strokeOpacity=".55"
            strokeWidth="1.2"
          />
        )}
        {layers.palettePath &&
          paletteSteps.map((o, i) => {
            const p = project(o);
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="3.4"
                fill={css(o)}
                stroke="#202631"
                strokeWidth="1"
              />
            );
          })}
        <g
          data-anchor-marker=""
          transform={`translate(${a.x} ${a.y})`}
          opacity={a.inside ? 1 : 0.55}
        >
          <circle r="8" fill="#fff" stroke="#202631" strokeWidth="1.6" strokeDasharray={a.inside ? undefined : "3 2"} />
          <circle r="4.4" fill={css(anchor)} />
        </g>
      </svg>
      <p className="muted">
        点击或拖动选择候选主色 · 虚线锚点表示当前锚点不在切片平面内 · sRGB
        实线 / P3 虚线色域边界（采样近似）；边界外按浏览器原生裁剪显示 ·
        斜线阴影为 Dirty Zone（Dirty 时）与对比度不足区域（开启对比参考时）
      </p>
    </div>
  );
}

/** 最大色度采样：以超界输入映射到目标色域，返回该 (l,h) 的最大有效色度。 */
function mapMaxChroma(l: number, h: number, target: "srgb" | "display-p3") {
  return mapOklchToGamut({ l, c: 2, h }, target).c;
}

export function luminanceOf(rgb: { r: number; g: number; b: number }) {
  const f = (v: number) => {
    const c = clamp01(v);
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

export function colorRgb(color: V2Color) {
  // 直接读取 sRGB 渲染 RGB；透明背景由调用方 try/catch 兜底。
  const outputs = (color as { outputs?: { srgb: { rendered: { rgb: { r: number; g: number; b: number } } } } }).outputs;
  if (outputs) return outputs.srgb.rendered.rgb;
  return (color as unknown as { rgb: { r: number; g: number; b: number } }).rgb;
}
