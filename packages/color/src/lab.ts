import {
  ColorError,
  D65,
  type Lab,
  type WhitePoint,
  type XYZ,
} from "@cus/core";
import { assertFinite, assertNumerical } from "./utils";

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const finv = (t: number) =>
  t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA;

function checkWhite(w: WhitePoint): void {
  if (![w.x, w.y, w.z].every((v) => Number.isFinite(v) && v > 0) || w.y !== 1)
    throw new ColorError(
      "INVALID_WHITE_POINT",
      "白点分量必须为正有限数，且 Yn = 1",
    );
}

export function xyzToLab(xyz: XYZ, whitePoint: WhitePoint = D65): Lab {
  assertFinite(xyz.x, xyz.y, xyz.z);
  checkWhite(whitePoint);
  const x = f(xyz.x / whitePoint.x),
    y = f(xyz.y / whitePoint.y),
    z = f(xyz.z / whitePoint.z);
  const lab = { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
  assertNumerical(lab.l, lab.a, lab.b);
  return lab;
}

export function labToXyz(lab: Lab, whitePoint: WhitePoint = D65): XYZ {
  assertFinite(lab.l, lab.a, lab.b);
  checkWhite(whitePoint);
  const y = (lab.l + 16) / 116;
  const xyz = {
    x: whitePoint.x * finv(y + lab.a / 500),
    y: whitePoint.y * finv(y),
    z: whitePoint.z * finv(y - lab.b / 200),
  };
  assertNumerical(xyz.x, xyz.y, xyz.z);
  return xyz;
}
