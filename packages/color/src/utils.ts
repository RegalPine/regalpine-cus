import { ColorError } from "@cus/core";

export const clamp = (v: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, v));

export const normalizeHue = (h: number): number => {
  assertFinite(h);
  const remainder = h % 360;
  return remainder < 0 ? remainder + 360 : remainder === 0 ? 0 : remainder;
};

export function assertNumerical(...values: number[]): void {
  if (!values.every(Number.isFinite))
    throw new ColorError("NUMERICAL_ERROR", "颜色计算发生浮点溢出");
}

export function assertFinite(...values: number[]): void {
  if (!values.every(Number.isFinite))
    throw new ColorError("INVALID_INPUT", "颜色通道必须是有限数值");
}
