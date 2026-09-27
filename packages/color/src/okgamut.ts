import {
  ColorError,
  createCalculationContext,
  type OKLCH,
  type RGB,
  type RGBSpace,
  type UIColor,
  type V2Color,
  type ColorOutput,
  type ColorProvenance,
  type PerceptualCoordinates,
  type StateTransform,
} from "@cus/core";
import {
  normalizeOklch,
  oklchToRgb,
  oklchToOklab,
  oklabToXyz,
  xyzToOklab,
  oklabToOklch,
  lchToOklch,
} from "./oklab";
import { rgbToXyz } from "./xyz";
import { xyzToLab } from "./lab";
import { labToLch } from "./lch";
import { toHex, parseHex } from "./hex";
import { assertFinite, clamp } from "./utils";
import { isInGamut } from "./gamut";
import { composite, relativeLuminance } from "./metrics";

export const OK_CHROMA_SEARCH_EPSILON = 1e-7;
/**
 * CUS-IMPLEMENTATION-02 §23：给定 OKLCH 明度 L 与色相 H，返回目标色域内最大可用色度。
 * 二分搜索复用 mapOklchToGamut 的 valid() 判定逻辑。
 */
export function maxChroma(l: number, h: number | null, gamut: RGBSpace = "srgb"): number {
  if (l <= 0 || l >= 1) return 0;
  const valid = (c: number) => {
    try {
      return isInGamut(renderRgb({ l, c, h }, gamut));
    } catch (error) {
      if (error instanceof ColorError && error.code === "NUMERICAL_ERROR")
        return false;
      throw error;
    }
  };
  // 上界探测
  let high = 0.4;
  while (valid(high) && high < 1) high *= 2;
  if (!valid(high)) {
    // 二分搜索
    let low = 0;
    for (let i = 0; i < 64 && high - low > OK_CHROMA_SEARCH_EPSILON; i++) {
      const mid = low + (high - low) / 2;
      if (valid(mid)) low = mid;
      else high = mid;
    }
    return low;
  }
  return high;
}
/** 白黑极限输出使用设备白黑；不同 D65 矩阵的微小白点差保留在回读坐标中。 */
function renderRgb(lch: OKLCH, space: RGBSpace): RGB {
  if (lch.c === 0 && (lch.l === 0 || lch.l === 1))
    return { r: lch.l, g: lch.l, b: lch.l };
  return oklchToRgb(lch, space);
}
export function mapOklchToGamut(input: OKLCH, space: RGBSpace = "srgb"): OKLCH {
  createCalculationContext({ sourceSpace: "oklch", targetSpace: space });
  const value = normalizeOklch(input);
  if (value.l === 0 || value.l === 1) return { ...value, c: 0, h: null };
  const valid = (c: number) => {
    try {
      return isInGamut(renderRgb({ ...value, c }, space));
    } catch (error) {
      if (error instanceof ColorError && error.code === "NUMERICAL_ERROR")
        return false;
      throw error;
    }
  };
  if (valid(value.c)) return value;
  if (!valid(0))
    throw new ColorError("OUT_OF_GAMUT", "保持 OKLCH 明度无法进入目标色域");
  let low = 0,
    high = value.c;
  // 有效 UI 色度的上界探测，避免任意大输入在有限二分次数内不收敛。
  if (high > 1) {
    high = 1;
    while (valid(high) && high < value.c) high = Math.min(value.c, high * 2);
  }
  for (let i = 0; i < 64 && high - low > OK_CHROMA_SEARCH_EPSILON; i++) {
    const mid = low + (high - low) / 2;
    if (mid === low || mid === high)
      throw new ColorError("NUMERICAL_ERROR", "OKLCH 色域搜索停滞");
    if (valid(mid)) low = mid;
    else high = mid;
  }
  if (high - low > OK_CHROMA_SEARCH_EPSILON)
    throw new ColorError("NUMERICAL_ERROR", "OKLCH 色域搜索未收敛");
  return normalizeOklch({ ...value, c: low });
}
// ─── CUS-UX-01 §12：Gamut 状态三态 ──────────────────────────────────────────
export type GamutStatus = "IN_GAMUT" | "NEAR_GAMUT_BOUNDARY" | "OUT_OF_GAMUT";
/** 接近边界的工程阈值：绝对 ΔC 与相对 2% 取大（UX-01 §12 未定义数值，此为工程近似）。 */
export const NEAR_GAMUT_ABSOLUTE = 0.02;
export const NEAR_GAMUT_RELATIVE = 0.02;
/**
 * UX-01 §12：颜色点实时色域状态。域内探测 +ε 是否越界；域外按映射损失量
 * 区分“勉强越界”（NEAR）与真正越界。黑白与无彩色直接视为域内。
 */
export function gamutStatus(
  design: OKLCH,
  space: RGBSpace = "srgb",
): GamutStatus {
  const value = normalizeOklch(design);
  if (value.l === 0 || value.l === 1 || value.c === 0) return "IN_GAMUT";
  const epsilon = Math.max(NEAR_GAMUT_ABSOLUTE, value.c * NEAR_GAMUT_RELATIVE);
  if (isInGamut(renderRgb(value, space))) {
    try {
      const probe = { ...value, c: value.c + epsilon };
      return isInGamut(renderRgb(probe, space))
        ? "IN_GAMUT"
        : "NEAR_GAMUT_BOUNDARY";
    } catch (error) {
      if (error instanceof ColorError && error.code === "NUMERICAL_ERROR")
        return "NEAR_GAMUT_BOUNDARY";
      throw error;
    }
  }
  const mapped = mapOklchToGamut(value, space);
  return value.c - mapped.c <= epsilon ? "NEAR_GAMUT_BOUNDARY" : "OUT_OF_GAMUT";
}
export function coordinates(
  rgb: RGB,
  space: RGBSpace,
  alpha = 1,
): PerceptualCoordinates {
  const xyz = rgbToXyz(rgb, space),
    lab = xyzToLab(xyz),
    oklab = xyzToOklab(xyz);
  return {
    rgb: { ...rgb },
    xyz,
    lab,
    lch: labToLch(lab),
    oklab,
    oklch: oklabToOklch(oklab),
    alpha,
  };
}
function output(design: OKLCH, space: RGBSpace, alpha: number): ColorOutput {
  const mapped = mapOklchToGamut(design, space);
  const raw = renderRgb(mapped, space);
  if (!isInGamut(raw))
    throw new ColorError("OUT_OF_GAMUT", "映射结果不在目标色域");
  const rgb = {
    r: clamp(raw.r, 0, 1),
    g: clamp(raw.g, 0, 1),
    b: clamp(raw.b, 0, 1),
  };
  const calculation = coordinates(rgb, space, alpha);
  let css: string, rendered: PerceptualCoordinates;
  if (space === "srgb") {
    css = toHex({ ...rgb, ...(alpha < 1 ? { alpha } : {}) });
    const parsed = parseHex(css);
    rendered = coordinates(parsed, space, parsed.alpha ?? 1);
  } else {
    const serialized = {
      r: +rgb.r.toFixed(9),
      g: +rgb.g.toFixed(9),
      b: +rgb.b.toFixed(9),
    };
    const a = +alpha.toFixed(9);
    css = `color(display-p3 ${serialized.r} ${serialized.g} ${serialized.b} / ${a})`;
    rendered = coordinates(serialized, space, a);
  }
  return {
    space,
    mapped,
    calculation,
    rendered,
    css,
    inGamut: isInGamut(renderRgb(design, space)),
    chromaReduction: design.c ? Math.max(0, 1 - mapped.c / design.c) : 0,
  };
}
export function createOklchColor(
  input: OKLCH,
  alpha = 1,
  provenance?: Partial<ColorProvenance>,
): UIColor {
  const design = normalizeOklch(input);
  assertFinite(alpha);
  if (alpha < 0 || alpha > 1)
    throw new ColorError("INVALID_INPUT", "Alpha 必须为 0–1");
  const srgb = output(design, "srgb", alpha),
    displayP3 = output(design, "display-p3", alpha);
  const target = labToLch(xyzToLab(oklabToXyz(oklchToOklab(design))));
  const id =
    provenance?.id ?? `oklch:${design.l}:${design.c}:${design.h}:${alpha}`;
  return {
    design,
    outputs: { srgb, displayP3 },
    // V1.1 §30：显式色域合规摘要。
    gamut: {
      srgb: { inGamut: srgb.inGamut, chromaReduction: srgb.chromaReduction },
      displayP3: {
        inGamut: displayP3.inGamut,
        chromaReduction: displayP3.chromaReduction,
      },
    },
    provenance: {
      id,
      model: "oklch",
      source: provenance?.source ?? id,
      parameters: { ...design, ...provenance?.parameters },
      ...provenance,
    },
    context: createCalculationContext({ sourceSpace: "oklch" }),
    strategy: "CHROMA_REDUCTION",
    calculation: srgb.calculation,
    hex: srgb.css,
    rgb: srgb.rendered.rgb,
    lab: srgb.rendered.lab,
    lch: srgb.rendered.lch,
    target,
    mapped: srgb.calculation.lch,
    alpha: srgb.rendered.alpha,
    chromaReduction: srgb.chromaReduction,
  };
}
export function asUIColor(color: V2Color): UIColor {
  if (!color.design || !color.outputs || !color.provenance)
    throw new ColorError("INVALID_INPUT", "此颜色不是 V2 设计颜色");
  return color as UIColor;
}
export const colorDesign = (color: V2Color): OKLCH =>
  color.design ?? lchToOklch(color.target);
export const colorOutput = (
  color: V2Color,
  space: RGBSpace = "srgb",
): ColorOutput =>
  asUIColor(color).outputs[space === "srgb" ? "srgb" : "displayP3"];
export const renderColor = (color: V2Color, space: RGBSpace = "srgb"): string =>
  color.outputs ? colorOutput(color, space).css : color.hex;
export function transformOklchState(
  base: OKLCH,
  transform: StateTransform,
  alpha = 1,
  provenance?: Partial<ColorProvenance>,
): UIColor {
  const { deltaL = 0, deltaC = 0, deltaH = 0, chromaScale = 1 } = transform;
  assertFinite(deltaL, deltaC, deltaH, chromaScale);
  if (chromaScale < 0)
    throw new ColorError("INVALID_INPUT", "色度倍率必须非负");
  base = normalizeOklch(base);
  return createOklchColor(
    {
      l: clamp(base.l + deltaL, 0, 1),
      c: Math.max(0, base.c * chromaScale + deltaC),
      h: base.h === null ? null : base.h + deltaH,
    },
    alpha,
    provenance,
  );
}
/** 合成遵循当前输出的编码 RGB 通道；P3 的亮度使用其 XYZ Y。 */
export function outputPair(
  fg: V2Color,
  bg: V2Color,
  space: RGBSpace,
  canvas?: V2Color,
) {
  const f = colorOutput(fg, space).rendered,
    b = colorOutput(bg, space).rendered;
  for (const v of [
    f,
    b,
    ...(canvas ? [colorOutput(canvas, space).rendered] : []),
  ]) {
    if (
      !isInGamut(v.rgb) ||
      !Number.isFinite(v.alpha) ||
      v.alpha < 0 ||
      v.alpha > 1
    )
      throw new ColorError("INVALID_INPUT", "渲染坐标或 Alpha 无效");
  }
  if (b.alpha < 1 && !canvas)
    throw new ColorError("INVALID_INPUT", "透明背景必须指定画布");
  const backdrop = canvas ? colorOutput(canvas, space).rendered : undefined;
  if (backdrop && backdrop.alpha !== 1)
    throw new ColorError("INVALID_INPUT", "画布必须不透明");
  const background =
    b.alpha < 1
      ? composite({ ...b.rgb, alpha: b.alpha }, backdrop!.rgb)
      : b.rgb;
  const foreground = composite({ ...f.rgb, alpha: f.alpha }, background);
  const a = coordinates(foreground, space),
    z = coordinates(background, space);
  const y1 = space === "srgb" ? relativeLuminance(foreground) : a.xyz.y;
  const y2 = space === "srgb" ? relativeLuminance(background) : z.xyz.y;
  return {
    foreground: a,
    background: z,
    contrast: (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05),
  };
}
export function minimumContrast(fg: V2Color, bg: V2Color, canvas?: V2Color): number {
  return Math.min(
    ...(["srgb", "display-p3"] as const).map(
      (s) => outputPair(fg, bg, s, canvas).contrast,
    ),
  );
}
