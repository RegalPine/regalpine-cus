// PALETTE-01 §6/§8–§9/§10–§11：Profile 引擎 —— Lightness / Chroma / Hue 曲线生成。
// 本模块将规范定义的 Lightness Curve、Chroma Modifier、Hue Compensation 实现为
// 可选模式的确定性函数；默认值与既有 OK_LIGHTNESS / CURVE 等价，保证向后兼容。
import {
  type V2LightnessProfile,
  type V2ChromaProfile,
  type V2HueProfile,
  type V2TrajectoryProfile,
  type V2SemanticProfile,
  type PaletteGenerationProfile,
  type OKLCH,
} from "@cus/core";
import { clamp, mapOklchToGamut, normalizeHue } from "@cus/color";

// ─── PALETTE-01 §6：Lightness Profile ────────────────────────────────────────
/**
 * §6 四种 Lightness 曲线。
 * count = 色阶数量（如 STEPS.length = 11）。
 * 返回长度为 count 的 L 值数组，从高到低（L[0] 最浅）。
 */
export function generateLightnessValues(
  profile: V2LightnessProfile,
  count: number,
): number[] {
  if (profile.curve === "piecewise") {
    if (profile.values && profile.values.length === count) return profile.values;
    if (profile.anchors) return interpolateAnchors(profile.anchors, count);
    // 缺省 fallback：线性。
    return linearValues(count, 0.98, 0.18);
  }
  const L0 = profile.curve === "ease-in" || profile.curve === "ease-out" ? 0.98 : 0.98;
  const Ln = 0.18;
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0;
    switch (profile.curve) {
      case "linear":
        return L0 + t * (Ln - L0);
      case "ease-in":
        // 二次缓入：浅色端变化慢，深色端变化快。
        return L0 + (Ln - L0) * t * t;
      case "ease-out":
        // 二次缓出：深色端变化慢，浅色端变化快。
        return L0 + (Ln - L0) * (1 - (1 - t) * (1 - t));
      default:
        return L0 + t * (Ln - L0);
    }
  });
}

function linearValues(count: number, L0: number, Ln: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0;
    return L0 + t * (Ln - L0);
  });
}

/** 从锚点 {step → L} 线性插值到全部 count 个色阶。 */
function interpolateAnchors(
  anchors: Record<number, number>,
  count: number,
): number[] {
  const entries = Object.entries(anchors)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return linearValues(count, 0.98, 0.18);
  const result: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const step = i;
    // 找到 step 所在的锚点区间。
    let lo = entries[0],
      hi = entries[entries.length - 1];
    for (let j = 0; j < entries.length - 1; j++) {
      if (entries[j][0] <= step && entries[j + 1][0] >= step) {
        lo = entries[j];
        hi = entries[j + 1];
        break;
      }
    }
    const range = hi[0] - lo[0];
    const frac = range > 0 ? (step - lo[0]) / range : 0;
    result[i] = lo[1] + frac * (hi[1] - lo[1]);
  }
  return result;
}

// ─── PALETTE-01 §8–§9：Chroma Profile ────────────────────────────────────────
// Bootstrap-inspired 饱和度纪律：与 okpalette CURVE / CHROMA_CURVE 保持一致。
export const DEFAULT_CHROMA_CURVE = [
  0.08, 0.18, 0.36, 0.58, 0.82, 1, 0.92, 0.78, 0.58, 0.38, 0.22,
] as const;

/**
 * §8–§9 三种 Chroma Modifier。
 * curveIndex = 当前色阶在 CURVE 中的索引（lightness-adaptive 使用）。
 */
export function calculateChroma(
  profile: V2ChromaProfile,
  anchor: OKLCH,
  l: number,
  h: number | null,
  curveIndex?: number,
  targetGamut?: "srgb" | "display-p3",
): number {
  switch (profile.mode) {
    case "constant":
    case "CONSTANT":
      // §9.1: M(t) = 1，C(t) = anchor.c * modifier。
      return anchor.c * (profile.modifier ?? 1);
    case "lightness-adaptive": {
      // §9.2: C(t) = f(L(t))，使用 CURVE 曲线。
      const idx = curveIndex ?? Math.round(l * (DEFAULT_CHROMA_CURVE.length - 1));
      const ci = clamp(idx, 0, DEFAULT_CHROMA_CURVE.length - 1);
      return anchor.c * DEFAULT_CHROMA_CURVE[ci] * (profile.modifier ?? 1);
    }
    case "gamut-adaptive":
    case "ADAPTIVE": {
      // §9.3: C(t) = min(C_requested, Cmax(L, H, Gamut))。
      // ADAPTIVE 统一走 gamut-adaptive 路径（最严格）。
      const idx2 = curveIndex ?? Math.round(l * (DEFAULT_CHROMA_CURVE.length - 1));
      const ci2 = clamp(idx2, 0, DEFAULT_CHROMA_CURVE.length - 1);
      const requested = anchor.c * DEFAULT_CHROMA_CURVE[ci2] * (profile.modifier ?? 1);
      if (targetGamut && h !== null) {
        const maxC = mapOklchToGamut({ l, c: requested, h }, targetGamut).c;
        return Math.min(requested, maxC);
      }
      return requested;
    }
    default:
      return anchor.c;
  }
}

// ─── PALETTE-01 §10–§11：Hue Profile ─────────────────────────────────────────
/**
 * §10–§11：H(t) = H_anchor + ΔH(t)，|ΔH(t)| ≤ H_max_shift。
 * stepIndex / totalSteps 用于自动计算补偿曲线。
 */
export function calculateHue(
  profile: V2HueProfile,
  anchorHue: number | null,
  _l: number,
  stepIndex: number,
  totalSteps: number,
): number | null {
  if (anchorHue === null) return null;
  if (profile.mode === "anchor" || profile.mode === "ANCHOR") {
    // §10 默认：H(t) = H_anchor。
    return anchorHue;
  }
  // compensation / ADAPTIVE 模式。
  const maxShift = profile.maxShift ?? 5;
  let dh: number;
  if (profile.compensationCurve && profile.compensationCurve[stepIndex] !== undefined) {
    dh = profile.compensationCurve[stepIndex];
  } else {
    // 自动补偿：两端微量偏移，中段保持。
    // ΔH(t) = maxShift * sin(π * t) * sign，其中 sign 取决于偏离方向。
    const t = totalSteps > 1 ? stepIndex / (totalSteps - 1) : 0;
    // 使用正弦曲线：两端最大，中段为零。
    dh = maxShift * Math.sin(Math.PI * (2 * t - 1));
  }
  // §10：|ΔH(t)| ≤ H_max_shift。
  dh = clamp(dh, -maxShift, maxShift);
  return normalizeHue(anchorHue + dh);
}

// ─── PALETTE-01 §4：Trajectory 参数 ──────────────────────────────────────────
/**
 * 计算色阶索引对应的轨迹参数 t ∈ [0,1]。
 */
export function trajectoryParameter(
  profile: V2TrajectoryProfile,
  stepIndex: number,
  totalSteps: number,
): number {
  if (totalSteps <= 1) return 0.5;
  const t = stepIndex / (totalSteps - 1);
  if (profile.parameterization === "anchored" && profile.anchorStep !== undefined) {
    // anchored 模式：anchorStep 对应 t=0.5，其余按比例映射。
    const anchor = profile.anchorStep / (totalSteps - 1);
    if (t <= anchor) return 0.5 * (t / anchor);
    return 0.5 + 0.5 * ((t - anchor) / (1 - anchor));
  }
  return t;
}

// ─── 默认 PaletteGenerationProfile ────────────────────────────────────────────
// 默认值与既有 OK_LIGHTNESS + CURVE + anchor hue 等价。
import { OK_LIGHTNESS } from "./okpalette";

export function defaultLightnessProfile(mode: "light" | "dark"): V2LightnessProfile {
  return {
    curve: "piecewise",
    values: [...OK_LIGHTNESS[mode]],
  };
}

export function defaultChromaProfile(): V2ChromaProfile {
  return { mode: "ADAPTIVE" };
}

export function defaultHueProfile(): V2HueProfile {
  return { mode: "ANCHOR" };
}

export function defaultTrajectoryProfile(): V2TrajectoryProfile {
  return { parameterization: "uniform", dirtyZoneRouting: true, gamutRouting: true };
}

export function defaultSemanticProfile(): V2SemanticProfile {
  return { strategy: "harmonious" };
}

export function defaultPaletteGenerationProfile(
  mode: "light" | "dark" = "light",
): PaletteGenerationProfile {
  return {
    lightness: defaultLightnessProfile(mode),
    chroma: defaultChromaProfile(),
    hue: defaultHueProfile(),
    trajectory: defaultTrajectoryProfile(),
    semantic: defaultSemanticProfile(),
  };
}
