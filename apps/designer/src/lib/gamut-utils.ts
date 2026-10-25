/**
 * 色域边界近似计算工具。
 * 在固定色相 h 下，根据明度 L 计算最大色度 C。
 */

/** 近似色域边界：在固定 h 下，L 对应的 max C */
export function gamutMaxC(l: number, h: number, gamut: "srgb" | "display-p3" | "rec2020"): number {
  const limits: Record<string, number> = { rec2020: 0.42, "display-p3": 0.37, srgb: 0.27 };
  const maxLimit = limits[gamut] ?? 0.27;
  const lFactor = Math.max(0, 1 - Math.pow((l - 0.5) * 2.2, 2));
  const hFactor = 1 + 0.15 * Math.sin(((h - 120) * Math.PI) / 180);
  return maxLimit * lFactor * hFactor;
}
