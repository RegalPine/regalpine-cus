/**
 * CUS-IMPLEMENTATION-01 §40–§41：Dirty Zone 独立评估模块。
 *
 * 提供规范定义的 `evaluateDirtyZone`：接收 OklchColor，返回三态结果。
 * 本模块不依赖 @cus/palette 的 qualityEnvelope（避免循环依赖），
 * 而是基于 OKLCH 空间位置进行上下文无关的脏区风险评估。
 * 判定阈值与 okquality.ts 的 chromaMin / MUDDY_DARK_L 等保持一致。
 */
import type { OklchColor, DirtyZoneResult, DirtyZoneStatus, DirtyZoneReason, OKLCH, DirtyZoneEngine } from "@cus/core";
import { isInGamut } from "./gamut";
import { oklchToRgb } from "./oklab";

// ─── 常量（与 okquality.ts 对齐） ────────────────────────────────────────────
const LOW_CHROMA_THRESHOLD = 0.04;
const MID_CHROMA_THRESHOLD = 0.08;
const LOW_LIGHTNESS_THRESHOLD = 0.15;
const MID_LIGHTNESS_LOW = 0.25;
const MID_LIGHTNESS_HIGH = 0.75;
const HIGH_LIGHTNESS_THRESHOLD = 0.90;
const GAMUT_C_MAX = 0.35;

/**
 * 规范 §40–§41：评估一个 OKLCH 坐标的 Dirty Zone 状态。
 *
 * 三态模型：
 * - CLEAR  ：坐标位于安全区域，渲染稳定。
 * - WARNING：坐标接近风险区域，跨主题/角色时可能不稳定。
 * - DIRTY  ：坐标位于已知问题区域（低色度低明度浑浊区 / 色域边界）。
 *
 * risk 值域 [0, 1]：0 = 完全安全，1 = 极高风险。
 */
export function evaluateDirtyZone(color: OklchColor): DirtyZoneResult {
  const { l, c, h } = color;
  const reasons: DirtyZoneReason[] = [];

  // ─── 1. 低色度 + 低明度：黑灰浑浊区 ─────────────────────────────────
  const isLowChroma = c < LOW_CHROMA_THRESHOLD;
  const isLowLightness = l < LOW_LIGHTNESS_THRESHOLD;
  const isHighLightness = l > HIGH_LIGHTNESS_THRESHOLD;
  const isMidLightness = l >= MID_LIGHTNESS_LOW && l <= MID_LIGHTNESS_HIGH;

  if (isLowChroma && isLowLightness) {
    reasons.push("LOW_CHROMA_LOW_LIGHTNESS");
  }

  // ─── 2. 低色度 + 中间明度：缺乏色彩感的区域 ──────────────────────────
  if (isLowChroma && isMidLightness && c < MID_CHROMA_THRESHOLD) {
    reasons.push("LOW_CHROMA_MID_LIGHTNESS");
  }

  // ─── 3. 色域边界：色度接近或超出 sRGB 容量 ──────────────────────────
  const oklch: OKLCH = { l: l, c, h: h ?? null };
  const rgb = oklchToRgb(oklch);
  const nearGamutBoundary =
    rgb.r < -0.002 || rgb.r > 1.002 ||
    rgb.g < -0.002 || rgb.g > 1.002 ||
    rgb.b < -0.002 || rgb.b > 1.002;
  const outOfGamut = !isInGamut(rgb, 0);

  if (outOfGamut || nearGamutBoundary) {
    reasons.push("GAMUT_BOUNDARY");
  }

  // ─── 4. 上下文依赖：极高色度在低/高明度区可能需要色度缩减 ────────────
  if (c > GAMUT_C_MAX && (isLowLightness || isHighLightness)) {
    reasons.push("CONTEXT_DEPENDENT");
  }

  // ─── 5. 综合状态判定 ────────────────────────────────────────────────
  let status: DirtyZoneStatus;
  if (reasons.includes("LOW_CHROMA_LOW_LIGHTNESS") || outOfGamut) {
    status = "DIRTY";
  } else if (reasons.length > 0) {
    status = "WARNING";
  } else {
    status = "CLEAR";
  }

  // ─── 6. 风险值计算 ──────────────────────────────────────────────────
  const risk = computeRisk(l, c, reasons, outOfGamut);

  return { status, risk, reasons };
}

function computeRisk(
  l: number,
  c: number,
  reasons: DirtyZoneReason[],
  outOfGamut: boolean,
): number {
  let risk = 0;

  // 低色度低明度贡献最大风险
  if (reasons.includes("LOW_CHROMA_LOW_LIGHTNESS")) {
    risk += 0.5 + (1 - l / LOW_LIGHTNESS_THRESHOLD) * 0.3;
  }

  // 低色度中间明度贡献中等风险
  if (reasons.includes("LOW_CHROMA_MID_LIGHTNESS")) {
    risk += 0.2;
  }

  // 色域边界贡献高风险
  if (outOfGamut) {
    risk += 0.4;
  } else if (reasons.includes("GAMUT_BOUNDARY")) {
    risk += 0.15 + Math.min(c / GAMUT_C_MAX, 1) * 0.1;
  }

  // 上下文依赖贡献低-中风险
  if (reasons.includes("CONTEXT_DEPENDENT")) {
    risk += 0.15;
  }

  return Math.min(1, Math.max(0, risk));
}

/**
 * CUS-IMPLEMENTATION-02 §39：DirtyZoneEngine 规范接口实现。
 */
export const dirtyZoneEngine: DirtyZoneEngine = {
  evaluate: evaluateDirtyZone,
};
