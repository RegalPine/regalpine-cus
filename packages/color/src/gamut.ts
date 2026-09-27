import {
  ColorError,
  createCalculationContext,
  type RGBSpace,
  type V2Color,
  type GamutOptions,
  type Lab,
  type LCh,
  type RGB,
  type StateTransform,
} from "@cus/core";
import {
  assertFinite,
  ACHROMATIC_EPSILON,
  lchToLab,
  clamp,
  hexToLab,
  labToLch,
  lchToRgb,
  normalizeHue,
  parseHex,
  toHex,
} from "./conversion";

// 规范中的七位矩阵在 sRGB 边界存在约 10⁻⁶ 的往返误差。
export const GAMUT_EPSILON = 1e-7;
export const CHROMA_SEARCH_EPSILON = 1e-4;
export function isInGamut(rgb: RGB, epsilon = GAMUT_EPSILON): boolean {
  return (
    Number.isFinite(epsilon) &&
    epsilon >= 0 &&
    [rgb.r, rgb.g, rgb.b].every(
      (v) => Number.isFinite(v) && v >= -epsilon && v <= 1 + epsilon,
    )
  );
}
export function normalizeLch(lch: LCh): LCh {
  lchToLab(lch);
  if (lch.l < -1e-5 || lch.l > 100 + 1e-5)
    throw new ColorError("INVALID_INPUT", "L* 必须在 0–100，C* 必须非负");
  return {
    l: clamp(lch.l, 0, 100),
    c: lch.c,
    h: lch.c < ACHROMATIC_EPSILON ? null : normalizeHue(lch.h!),
  };
}
export function mapToGamut(input: LCh, targetSpace: RGBSpace = "srgb"): LCh {
  createCalculationContext({ targetSpace });
  const lch = normalizeLch(input);
  const inGamut = (c: number): boolean => {
    try {
      return isInGamut(lchToRgb({ ...lch, c }, targetSpace));
    } catch (error) {
      if (error instanceof ColorError && error.code === "NUMERICAL_ERROR")
        return false;
      throw error;
    }
  };
  if (inGamut(lch.c)) return { ...lch };
  // LCh 射线与 RGB 色域可能有多个交点；先保留距输入小于收敛精度的域内解。
  const near = Math.max(0, lch.c - CHROMA_SEARCH_EPSILON / 2);
  if (near < lch.c && inGamut(near)) return { ...lch, c: near };
  if (!inGamut(0))
    throw new ColorError("OUT_OF_GAMUT", "保持当前明度无法映射到目标色域");
  let low = 0,
    high = lch.c;
  while (high - low >= CHROMA_SEARCH_EPSILON) {
    const c = low + (high - low) / 2;
    if (c === low || c === high)
      throw new ColorError("NUMERICAL_ERROR", "色域搜索发生浮点停滞");
    if (inGamut(c)) low = c;
    else high = c;
  }
  return { ...lch, c: low };
}
export const mapLchToSrgb = (input: LCh): LCh => mapToGamut(input, "srgb");
export const mapLchToDisplayP3 = (input: LCh): LCh =>
  mapToGamut(input, "display-p3");
export function lchToHex(lch: LCh, options: GamutOptions = {}): string {
  if (options.targetSpace !== undefined && options.targetSpace !== "srgb")
    throw new ColorError(
      "UNSUPPORTED_COLOR_SPACE",
      "HEX 只能表示 sRGB，请使用目标空间的浮点 RGB",
    );
  if (
    options.mapping !== undefined &&
    !["none", "chroma-reduction"].includes(options.mapping)
  )
    throw new ColorError("INVALID_INPUT", "不支持的色域映射策略");
  const mapped =
    options.mapping === "none" ? normalizeLch(lch) : mapLchToSrgb(lch);
  const rgb = lchToRgb(mapped);
  if (!isInGamut(rgb))
    throw new ColorError(
      "OUT_OF_GAMUT",
      "颜色超出 sRGB 色域，请启用 Chroma Reduction",
    );
  return toHex(rgb);
}
export const lchToHexSafe = lchToHex;
export const labToHex = (lab: Lab, options?: GamutOptions): string =>
  lchToHex(labToLch(lab), options);
export function compileColor(
  input: LCh,
  targetSpace: RGBSpace = "srgb",
  alpha = 1,
) {
  assertFinite(alpha);
  if (alpha < 0 || alpha > 1)
    throw new ColorError("INVALID_INPUT", "Alpha 必须在 0–1");
  const context = createCalculationContext({ targetSpace });
  const original = normalizeLch(input),
    mapped = mapToGamut(original, targetSpace);
  return {
    context,
    original,
    mapped,
    strategy: "CHROMA_REDUCTION" as const,
    rgb: lchToRgb(mapped, targetSpace),
    lab: lchToLab(mapped),
    lch: { ...mapped },
    alpha,
  };
}
export function createColor(input: LCh, alpha = 1): V2Color {
  const compiled = compileColor(input, "srgb", alpha);
  const { original: target, mapped } = compiled;
  const hex = toHex({ ...lchToRgb(mapped), ...(alpha < 1 ? { alpha } : {}) });
  const parsed = parseHex(hex);
  const rgb = { r: parsed.r, g: parsed.g, b: parsed.b };
  const lab = hexToLab(hex);
  return {
    context: compiled.context,
    strategy: compiled.strategy,
    calculation: {
      rgb: compiled.rgb,
      lab: compiled.lab,
      lch: compiled.lch,
      alpha,
    },
    hex,
    rgb,
    lab,
    lch: labToLch(lab),
    target,
    mapped,
    alpha: parsed.alpha ?? 1,
    chromaReduction:
      target.c >= ACHROMATIC_EPSILON ? Math.max(0, 1 - mapped.c / target.c) : 0,
  };
}
export function transformState(base: LCh, transform: StateTransform): V2Color {
  const { deltaL = 0, deltaC = 0, deltaH = 0, chromaScale = 1 } = transform;
  assertFinite(deltaL, deltaC, deltaH, chromaScale);
  return createColor({
    l: clamp(base.l + deltaL, 0, 100),
    c: Math.max(0, base.c * chromaScale + deltaC),
    h: base.h === null ? null : base.h + deltaH,
  });
}
