import { assertFinite, assertNumerical } from "./utils";

/** 保留域外浮点通道，色域映射由后续阶段处理。 */
export function srgbToLinear(v: number): number {
  assertFinite(v);
  const result = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  assertNumerical(result);
  return result;
}

export function linearToSrgb(v: number): number {
  assertFinite(v);
  const result = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  assertNumerical(result);
  return result;
}
