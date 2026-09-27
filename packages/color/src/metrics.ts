import { ColorError, type Lab, type RGB, type RGBA } from "@cus/core";
import {
  assertFinite,
  assertNumerical,
  normalizeHue,
  parseHex,
  srgbToLinear,
} from "./conversion";

/** 环绕色相轴的最短角度距离（0–180]，任一色相为 null 时返回 null。 */
export function hueDistance(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  const d = Math.abs(normalizeHue(a) - normalizeHue(b)) % 360;
  return d > 180 ? 360 - d : d;
}
export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}
// 合成与浏览器默认 sRGB 通道混合一致，Alpha 不参与 Lab 或 ΔE。
export function composite(foreground: RGBA, background: RGB): RGB {
  const a = foreground.alpha ?? 1;
  assertFinite(
    a,
    foreground.r,
    foreground.g,
    foreground.b,
    background.r,
    background.g,
    background.b,
  );
  if (a < 0 || a > 1) throw new ColorError("INVALID_INPUT", "Alpha 必须在 0–1");
  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
  };
}
export function contrastRatio(
  foreground: string | RGBA,
  background: string | RGBA,
  canvas?: string | RGB,
): number {
  const fg = typeof foreground === "string" ? parseHex(foreground) : foreground;
  const bg = typeof background === "string" ? parseHex(background) : background;
  const backdrop = typeof canvas === "string" ? parseHex(canvas) : canvas;
  for (const color of [fg, bg, ...(backdrop ? [backdrop] : [])]) {
    const alpha = (color as RGBA).alpha ?? 1;
    if (
      !Number.isFinite(alpha) ||
      alpha < 0 ||
      alpha > 1 ||
      ![color.r, color.g, color.b].every(
        (v) => Number.isFinite(v) && v >= -1e-7 && v <= 1 + 1e-7,
      )
    ) {
      throw new ColorError(
        "INVALID_INPUT",
        "对比度计算需要有效的 sRGB / Alpha 通道",
      );
    }
  }
  if (backdrop && ((backdrop as RGBA).alpha ?? 1) !== 1)
    throw new ColorError("INVALID_INPUT", "画布必须不透明");
  if ((bg.alpha ?? 1) < 1 && !backdrop)
    throw new ColorError("INVALID_INPUT", "透明背景需要指定不透明画布");
  const surface = (bg.alpha ?? 1) < 1 ? composite(bg, backdrop!) : bg;
  const a = relativeLuminance(composite(fg, surface)),
    b = relativeLuminance(surface);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function checkLab(a: Lab, b: Lab): void {
  assertFinite(a.l, a.a, a.b, b.l, b.a, b.b);
}
export function deltaE76(a: Lab, b: Lab): number {
  checkLab(a, b);
  const distance = Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
  assertNumerical(distance);
  return distance;
}
// CIE94 图形艺术参数；第一个参数为参考色，该度量不对称。
export type DeltaE94Application = "graphic-arts" | "textiles";
export function deltaE94(
  a: Lab,
  b: Lab,
  application: DeltaE94Application,
): number {
  checkLab(a, b);
  if (application !== "graphic-arts" && application !== "textiles")
    throw new ColorError(
      "INVALID_INPUT",
      "ΔE94 必须显式指定 graphic-arts 或 textiles",
    );
  const [kl, k1, k2] =
    application === "textiles" ? [2, 0.048, 0.014] : [1, 0.045, 0.015];
  const c1 = Math.hypot(a.a, a.b),
    c2 = Math.hypot(b.a, b.b);
  const dc = c1 - c2,
    dl = a.l - b.l;
  const dh2 = Math.max(0, (a.a - b.a) ** 2 + (a.b - b.b) ** 2 - dc ** 2);
  const distance = Math.sqrt(
    (dl / kl) ** 2 + (dc / (1 + k1 * c1)) ** 2 + dh2 / (1 + k2 * c1) ** 2,
  );
  assertNumerical(distance);
  return distance;
}
const rad = (d: number) => (d * Math.PI) / 180;
const cos = (d: number) => Math.cos(rad(d));
const sin = (d: number) => Math.sin(rad(d));
export function deltaE2000(a: Lab, b: Lab): number {
  checkLab(a, b);
  const c1 = Math.hypot(a.a, a.b),
    c2 = Math.hypot(b.a, b.b),
    cbar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cbar ** 7 / (cbar ** 7 + 25 ** 7)));
  assertNumerical(g);
  const ap1 = (1 + g) * a.a,
    ap2 = (1 + g) * b.a;
  const cp1 = Math.hypot(ap1, a.b),
    cp2 = Math.hypot(ap2, b.b);
  const hp1 =
    cp1 === 0 ? 0 : normalizeHue((Math.atan2(a.b, ap1) * 180) / Math.PI);
  const hp2 =
    cp2 === 0 ? 0 : normalizeHue((Math.atan2(b.b, ap2) * 180) / Math.PI);
  const dl = b.l - a.l,
    dc = cp2 - cp1;
  let dh = hp2 - hp1;
  if (cp1 * cp2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * sin(dh / 2);
  const lp = (a.l + b.l) / 2,
    cp = (cp1 + cp2) / 2;
  let hp = (hp1 + hp2) / 2;
  if (cp1 * cp2 === 0) hp = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) > 180) hp += hp1 + hp2 < 360 ? 180 : -180;
  const t =
    1 -
    0.17 * cos(hp - 30) +
    0.24 * cos(2 * hp) +
    0.32 * cos(3 * hp + 6) -
    0.2 * cos(4 * hp - 63);
  const sl = 1 + (0.015 * (lp - 50) ** 2) / Math.sqrt(20 + (lp - 50) ** 2);
  const sc = 1 + 0.045 * cp,
    sh = 1 + 0.015 * cp * t;
  const rt =
    -2 *
    Math.sqrt(cp ** 7 / (cp ** 7 + 25 ** 7)) *
    sin(60 * Math.exp(-(((hp - 275) / 25) ** 2)));
  const x = dl / sl,
    y = dc / sc,
    z = dH / sh;
  const distance = Math.sqrt(Math.max(0, x * x + y * y + z * z + rt * y * z));
  assertNumerical(distance);
  return distance;
}
export const deltaE00 = deltaE2000;
