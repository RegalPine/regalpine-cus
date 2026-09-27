import { ColorError, type Lab, type LCh } from "@cus/core";
import { assertFinite, assertNumerical, normalizeHue } from "./utils";

export const ACHROMATIC_EPSILON = 1e-7;

export function labToLch(lab: Lab): LCh {
  assertFinite(lab.l, lab.a, lab.b);
  const c = Math.hypot(lab.a, lab.b);
  assertNumerical(c);
  // 消除 D65 舍入矩阵产生的无彩色色相噪声。
  return {
    l: lab.l,
    c,
    h:
      c < ACHROMATIC_EPSILON
        ? null
        : normalizeHue((Math.atan2(lab.b, lab.a) * 180) / Math.PI),
  };
}

export function lchToLab(lch: LCh): Lab {
  if (!lch || typeof lch !== "object" || Array.isArray(lch))
    throw new ColorError("INVALID_INPUT", "LCh 必须是坐标对象");
  assertFinite(lch.l, lch.c);
  if (lch.h !== null) assertFinite(lch.h);
  if (lch.c < 0) throw new ColorError("INVALID_INPUT", "Chroma 不能为负");
  if (lch.h === null) {
    if (lch.c >= ACHROMATIC_EPSILON)
      throw new ColorError("INVALID_INPUT", "有彩色必须声明色相");
    return { l: lch.l, a: 0, b: 0 };
  }
  const h = (normalizeHue(lch.h) * Math.PI) / 180;
  return { l: lch.l, a: lch.c * Math.cos(h), b: lch.c * Math.sin(h) };
}
