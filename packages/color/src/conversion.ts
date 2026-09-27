import {
  createCalculationContext,
  ColorError,
  type BrandInput,
  type BrandProfile,
  type Lab,
  type LCh,
  type RGB,
  type RGBSpace,
} from "@cus/core";
import { createColor } from "./gamut";
import { createOklchColor } from "./okgamut";
import {
  xyzToOklab,
  oklabToOklch,
  oklchToOklab,
  oklabToXyz,
  normalizeOklch,
} from "./oklab";
import { parseHex, toHex } from "./hex";
import { rgbToXyz, xyzToRgb } from "./xyz";
import { labToXyz, xyzToLab } from "./lab";
import { labToLch, lchToLab } from "./lch";

// 保留原有转换入口，底层实现按规范拆分为独立模块。
export * from "./utils";
export * from "./hex";
export * from "./srgb";
export * from "./xyz";
export * from "./lab";
export * from "./lch";

export const lchToRgb = (lch: LCh, space: RGBSpace = "srgb"): RGB =>
  xyzToRgb(labToXyz(lchToLab(lch)), space);
export const rgbToLch = (rgb: RGB, space: RGBSpace = "srgb"): LCh =>
  labToLch(xyzToLab(rgbToXyz(rgb, space)));
export const hexToLab = (hex: string): Lab => xyzToLab(rgbToXyz(parseHex(hex)));
export const hexToLch = (hex: string): LCh => labToLch(hexToLab(hex));
export function createBrandProfile(source: BrandInput): BrandProfile {
  if (source && typeof source === "object" && "oklch" in source) {
    const oklch = normalizeOklch(source.oklch),
      oklab = oklchToOklab(oklch);
    const xyz = oklabToXyz(oklab),
      lab = xyzToLab(xyz),
      lch = labToLch(lab);
    const color = createOklchColor(oklch, source.alpha ?? 1);
    return {
      context: createCalculationContext({ sourceSpace: "oklch" }),
      input: { oklch, alpha: source.alpha ?? 1 },
      source: color.hex,
      hex: color.hex,
      rgb: color.rgb,
      xyz,
      lab,
      lch,
      oklab,
      oklch,
      alpha: source.alpha ?? 1,
    };
  }
  if (typeof source !== "string") {
    if (
      !source ||
      typeof source !== "object" ||
      Array.isArray(source) ||
      !source.lch
    )
      throw new ColorError("INVALID_INPUT", "品牌输入必须是 HEX 或 LCh 对象");
    const color = createColor(source.lch, source.alpha ?? 1);
    const lch = { ...color.target },
      lab = lchToLab(lch),
      xyz = labToXyz(lab);
    const oklab = xyzToOklab(xyz),
      rawOK = oklabToOklch(oklab);
    const oklch = { ...rawOK, l: Math.max(0, Math.min(1, rawOK.l)) };
    return {
      oklab,
      oklch,
      context: createCalculationContext(),
      input: { lch, alpha: source.alpha ?? 1 },
      source: color.hex,
      hex: toHex(color.rgb),
      rgb: lchToRgb(lch),
      xyz,
      lab,
      lch,
      alpha: source.alpha ?? 1,
    };
  }
  const parsed = parseHex(source);
  const rgb = { r: parsed.r, g: parsed.g, b: parsed.b };
  const xyz = rgbToXyz(rgb),
    lab = xyzToLab(xyz),
    lch = labToLch(lab);
  const oklab = xyzToOklab(xyz),
    rawOK = oklabToOklch(oklab);
  const oklch = { ...rawOK, l: Math.max(0, Math.min(1, rawOK.l)) };
  return {
    oklab,
    oklch,
    context: createCalculationContext({ sourceSpace: "srgb" }),
    input: toHex(parsed),
    source: toHex(parsed),
    hex: toHex(rgb),
    rgb,
    xyz,
    lab,
    lch,
    alpha: parsed.alpha ?? 1,
  };
}
