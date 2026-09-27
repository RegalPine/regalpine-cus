import {
  ColorError,
  OK_ACHROMATIC_EPSILON,
  type Oklab,
  type OKLCH,
  type XYZ,
  type RGB,
  type RGBSpace,
  type LCh,
} from "@cus/core";
import { assertFinite, assertNumerical, normalizeHue } from "./utils";
import { rgbToXyz } from "./xyz";
import { linearToSrgb } from "./srgb";
import { labToXyz } from "./lab";
import { lchToLab } from "./lch";
import { parseHex } from "./hex";

// CSS Color 4 的 XYZ D65 → LMS 与 LMS → Oklab 矩阵。
// https://www.w3.org/TR/css-color-4/#color-conversion-code
const M1 = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const M2 = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
function inverse(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d],
  ].map((row) => row.map((v) => v / det));
}
const I1 = inverse(M1),
  I2 = inverse(M2);
const multiply = (m: number[][], v: number[]) =>
  m.map((row) => row.reduce((sum, x, i) => sum + x * v[i], 0));
export function xyzToOklab(xyz: XYZ): Oklab {
  assertFinite(xyz.x, xyz.y, xyz.z);
  const [l, a, b] = multiply(
    M2,
    multiply(M1, [xyz.x, xyz.y, xyz.z]).map(Math.cbrt),
  );
  assertNumerical(l, a, b);
  return { l, a, b };
}
export function oklabToXyz(lab: Oklab): XYZ {
  assertFinite(lab.l, lab.a, lab.b);
  const [x, y, z] = multiply(
    I1,
    multiply(I2, [lab.l, lab.a, lab.b]).map((v) => v * v * v),
  );
  assertNumerical(x, y, z);
  return { x, y, z };
}
export function normalizeOklch(input: OKLCH): OKLCH {
  if (!input || typeof input !== "object")
    throw new ColorError("INVALID_INPUT", "需要 OKLCH 对象");
  assertFinite(input.l, input.c);
  if (input.l < 0 || input.l > 1 || input.c < 0)
    throw new ColorError("INVALID_INPUT", "OKLCH L 必须为 0–1，C 必须非负");
  if (input.h !== null) assertFinite(input.h);
  if (input.c >= OK_ACHROMATIC_EPSILON && input.h === null)
    throw new ColorError("INVALID_INPUT", "有彩色必须指定色相");
  return {
    l: input.l,
    c: input.c < OK_ACHROMATIC_EPSILON ? 0 : input.c,
    h: input.c < OK_ACHROMATIC_EPSILON ? null : normalizeHue(input.h!),
  };
}
export function oklabToOklch(lab: Oklab): OKLCH {
  assertFinite(lab.l, lab.a, lab.b);
  const c = Math.hypot(lab.a, lab.b);
  return {
    l: lab.l,
    c: c < OK_ACHROMATIC_EPSILON ? 0 : c,
    h:
      c < OK_ACHROMATIC_EPSILON
        ? null
        : normalizeHue((Math.atan2(lab.b, lab.a) * 180) / Math.PI),
  };
}
export function oklchToOklab(lch: OKLCH): Oklab {
  // 坐标转换允许未映射的明度，authoring 范围由 normalizeOklch 检查。
  assertFinite(lch.l, lch.c);
  if (lch.c < 0 || (lch.c >= OK_ACHROMATIC_EPSILON && lch.h === null))
    throw new ColorError("INVALID_INPUT", "OKLCH 色度或色相无效");
  if (lch.h !== null) assertFinite(lch.h);
  const h = ((lch.h ?? 0) * Math.PI) / 180;
  return { l: lch.l, a: lch.c * Math.cos(h), b: lch.c * Math.sin(h) };
}
export const rgbToOklch = (rgb: RGB, space: RGBSpace = "srgb") =>
  oklabToOklch(xyzToOklab(rgbToXyz(rgb, space)));
// V2 使用现有正向矩阵的数值逆，避免舍入后的反矩阵把原色推到色域外。
const RGB_INVERSE = {
  srgb: inverse([
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.072175],
    [0.0193339, 0.119192, 0.9503041],
  ]),
  "display-p3": inverse([
    [0.4865709, 0.2656677, 0.1982173],
    [0.2289746, 0.6917385, 0.0792869],
    [0, 0.0451134, 1.0439444],
  ]),
};
export const oklchToRgb = (lch: OKLCH, space: RGBSpace = "srgb"): RGB => {
  if (!(space in RGB_INVERSE))
    throw new ColorError("UNSUPPORTED_COLOR_SPACE", "不支持的 RGB 空间");
  const xyz = oklabToXyz(oklchToOklab(lch));
  const [r, g, b] = multiply(RGB_INVERSE[space], [xyz.x, xyz.y, xyz.z]).map(
    linearToSrgb,
  );
  return { r, g, b, space };
};
export const hexToOklch = (hex: string): OKLCH => rgbToOklch(parseHex(hex));
export const lchToOklch = (lch: LCh): OKLCH =>
  oklabToOklch(xyzToOklab(labToXyz(lchToLab(lch))));
export function deltaEOK(a: Oklab, b: Oklab): number {
  assertFinite(a.l, a.a, a.b, b.l, b.a, b.b);
  const result = Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
  assertNumerical(result);
  return result;
}
export function interpolateOklab(a: Oklab, b: Oklab, t: number): Oklab;
export function interpolateOklab(
  a: Oklab,
  b: Oklab,
  t: number,
  alphaA: number,
  alphaB: number,
): Oklab & { alpha: number };
export function interpolateOklab(
  a: Oklab,
  b: Oklab,
  t: number,
  alphaA?: number,
  alphaB?: number,
): Oklab & { alpha?: number } {
  assertFinite(t, a.l, a.a, a.b, b.l, b.a, b.b);
  if (t < 0 || t > 1)
    throw new ColorError("INVALID_INPUT", "插值比例必须为 0–1");
  const result = {
    l: a.l + (b.l - a.l) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  };
  assertNumerical(result.l, result.a, result.b);
  if (alphaA === undefined && alphaB === undefined) return result;
  assertFinite(alphaA!, alphaB!);
  if (alphaA! < 0 || alphaA! > 1 || alphaB! < 0 || alphaB! > 1)
    throw new ColorError("INVALID_INPUT", "Alpha 必须为 0–1");
  return { ...result, alpha: alphaA! + (alphaB! - alphaA!) * t };
}
export function interpolateOklch(
  a: OKLCH,
  b: OKLCH,
  t: number,
  alphaA = 1,
  alphaB = 1,
): OKLCH & { alpha: number } {
  a = normalizeOklch(a);
  b = normalizeOklch(b);
  assertFinite(t, alphaA, alphaB);
  if (t < 0 || t > 1 || alphaA < 0 || alphaA > 1 || alphaB < 0 || alphaB > 1)
    throw new ColorError("INVALID_INPUT", "插值与 Alpha 必须为 0–1");
  const start = a.h ?? b.h,
    end = b.h ?? a.h;
  const delta =
    start === null || end === null ? 0 : ((end - start + 540) % 360) - 180;
  return {
    ...normalizeOklch({
      l: a.l + (b.l - a.l) * t,
      c: a.c + (b.c - a.c) * t,
      h: start === null ? null : start + delta * t,
    }),
    alpha: alphaA + (alphaB - alphaA) * t,
  };
}
