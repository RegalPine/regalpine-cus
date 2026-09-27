import {
  OK_BRAND_EPSILON,
  SEMANTIC_ROLES,
  type ColorContext,
  type ColorQualityResult,
  type ColorRole,
  type ColorRoleConstraint,
  type HueStabilityResult,
  type Metric,
  type OKLCH,
  type Oklab,
  type QualityErrorCode,
} from "@cus/core";
import {
  deltaEOK,
  hueDistance,
  mapOklchToGamut,
  normalizeOklch,
  oklchToOklab,
} from "@cus/color";
import {
  gamutEfficiency,
  gamutLoss,
  gamutLossLevel,
  qualityEnvelope,
} from "@cus/palette";
import { OK_SEMANTIC_HUES } from "@cus/palette";

// V2.5 §16：Light 主题 washed-out 防护阈值（工程初始值，可调参）。
export const WASHED_LIGHT_L = 0.92;
export const WASHED_LIGHT_C = 0.01;
// V2.5 §14–§15：muddy dark 报告阈值。
const MUDDY_DARK_L = 0.15;
const MUDDY_DARK_C = 0.03;
// V2.5 §29–§30：感知分离阈值（工程初始值）。
const SEPARATION_FAIL = 0.015;
const SEPARATION_WARN = 0.03;
// 语义/主色角色：Chroma Adequacy 与 Perceptual Separation 的强制对象。
const EXPRESSIVE_ROLES: readonly ColorRole[] = [
  "primary",
  "secondary",
  "accent",
  "action",
  ...SEMANTIC_ROLES,
];
const NEUTRALISH_ROLES: readonly ColorRole[] = [
  "neutral",
  "background",
  "surface",
];

const metric = (value: number, status: Metric["status"], reason?: string): Metric => ({
  value,
  status,
  ...(reason ? { reason } : {}),
});

// ─── V2.5 §17–§19：Hue Stability ────────────────────────────────────────────
/**
 * Palette 级 Hue Stability：HueDrift(i) = CircularDistance(Hi, Href)，
 * 取最大漂移给出三态（§18 Preferred/Warning/Error 的工程映射）。
 * 参照可以是品牌色相（primary/neutral）或语义家族候选数组（feedback）。
 */
export function paletteHueStability(
  hues: (number | null)[],
  reference: number | readonly number[] | null,
): HueStabilityResult {
  if (reference === null) return { deviation: 0, status: "pass" };
  const refs = Array.isArray(reference) ? reference : [reference];
  let deviation = 0;
  for (const h of hues) {
    if (h === null || !Number.isFinite(h)) continue;
    deviation = Math.max(
      deviation,
      Math.min(...refs.map((v) => hueDistance(h, v) ?? Infinity)),
    );
  }
  const status =
    deviation < 4 ? "pass" : deviation < 8 ? "warning" : "fail";
  return { deviation, status };
}

// ─── V2.5 §44–§45：Palette Smoothness / Discontinuity ───────────────────────
export interface PaletteDiscontinuity {
  /** 第 i 段（steps[i] → steps[i+1]）。 */
  index: number;
  delta: number;
  median: number;
  threshold: number;
  /** §45：Gamut Mapping / Hue Shift / Chroma Collapse / Manual Override。 */
  cause:
    | "Gamut Mapping"
    | "Hue Shift"
    | "Chroma Collapse"
    | "Chroma Spike"
    | "Manual Override";
}

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * V2.5 §44–§45：ΔPi >> median(ΔP) 判定 Palette 不连续，并指出具体原因
 * 而非简单报告 invalid。
 */
export function paletteDiscontinuity(
  designs: OKLCH[],
  distances: number[],
  overridden: boolean[] = [],
): PaletteDiscontinuity[] {
  if (distances.length < 2) return [];
  const median = medianOf(distances);
  // 工程初始阈值：绝对下限防小中位数误报，2.5× 中位数定位异常跳变。
  const threshold = Math.max(0.06, median * 2.5);
  const result: PaletteDiscontinuity[] = [];
  distances.forEach((delta, i) => {
    if (delta <= threshold) return;
    const a = designs[i],
      b = designs[i + 1];
    let cause: PaletteDiscontinuity["cause"] = "Gamut Mapping";
    if (overridden[i] || overridden[i + 1]) cause = "Manual Override";
    else if (a.c - b.c > 0.04) cause = "Chroma Collapse";
    else if (b.c - a.c > 0.04) cause = "Chroma Spike";
    else if (
      a.h !== null &&
      b.h !== null &&
      (hueDistance(a.h, b.h) ?? 0) > 5
    )
      cause = "Hue Shift";
    result.push({ index: i, delta, median, threshold, cause });
  });
  return result;
}

// ─── V2.5 §46–§47：Brand Anchor Quality ─────────────────────────────────────
export interface BrandAnchorQuality {
  /** AnchorDistance = min ΔEOK(Brand, Paletteᵢ)。 */
  anchorDistance: number;
  status: "pass" | "warning" | "fail";
  code?: QualityErrorCode;
}

/**
 * V2.5 §47：Brand Color 不应成为 Palette 中孤立的异常点。
 * 相对判据：锚点距离明显大于色阶内部步距即报告断裂。
 */
export function brandAnchorQuality(
  brand: Oklab,
  paletteOklabs: Oklab[],
  adjacentMean: number,
): BrandAnchorQuality {
  let anchorDistance = Infinity;
  for (const p of paletteOklabs)
    anchorDistance = Math.min(anchorDistance, deltaEOK(brand, p));
  if (!Number.isFinite(anchorDistance)) anchorDistance = 0;
  const warnAt = Math.max(0.2, adjacentMean * 2);
  const failAt = Math.max(0.35, adjacentMean * 3);
  if (anchorDistance > failAt)
    return {
      anchorDistance,
      status: "fail",
      code: "BRAND_ANCHOR_DISCONTINUITY",
    };
  if (anchorDistance > warnAt)
    return {
      anchorDistance,
      status: "warning",
      code: "BRAND_ANCHOR_DISCONTINUITY",
    };
  return { anchorDistance, status: "pass" };
}

// ─── V2.5 §32：Role Pair Matrix ─────────────────────────────────────────────
/**
 * 默认 Role Pair 约束（§32）：text×surface 关注 Contrast，
 * action 之间关注 Perceptual Separation，Border 对 Background
 * 无需保持大 ΔEOK（§31）。
 */
export const ROLE_PAIR_CONSTRAINTS: ColorRoleConstraint[] = [
  { foreground: "text.primary", background: "surface.default", minContrast: 4.5 },
  {
    foreground: "action.primary",
    background: "surface.default",
    minContrast: 3,
    minDeltaEOK: 0.04,
  },
  {
    foreground: "action.primary",
    background: "action.secondary",
    minDeltaEOK: 0.05,
  },
  {
    foreground: "border.default",
    background: "surface.default",
    minDeltaEOK: 0.015,
    maxDeltaEOK: 0.35,
  },
  {
    foreground: "feedback.danger.base",
    background: "feedback.warning.base",
    minDeltaEOK: 0.05,
  },
];

/** V2.5 §32：单条 Role Pair 约束的执行结果。 */
export function validateRolePair(
  constraint: ColorRoleConstraint,
  contrast: number,
  deltaEOKValue: number,
): { status: "pass" | "warning" | "fail"; code?: QualityErrorCode } {
  if (
    constraint.minContrast !== undefined &&
    contrast < constraint.minContrast
  )
    return { status: "fail", code: "CONTEXT_CONFLICT" };
  if (
    constraint.minDeltaEOK !== undefined &&
    deltaEOKValue < constraint.minDeltaEOK
  )
    return { status: "fail", code: "LOW_PERCEPTUAL_SEPARATION" };
  if (
    constraint.maxDeltaEOK !== undefined &&
    deltaEOKValue > constraint.maxDeltaEOK
  )
    return { status: "warning", code: "CONTEXT_CONFLICT" };
  return { status: "pass" };
}

// ─── V2.5 §39–§41：Cleanliness Validation ───────────────────────────────────
/**
 * V2.5 §39：validateColorQuality —— Context-Aware 的单色质量验证。
 * 输入合法性（Color Validity）由数学层保证，非法输入抛错（§2–§3）；
 * 本 API 回答的是 Quality：颜色是否适合作为 UI 颜色。
 */
export function validateColorQuality(context: ColorContext): ColorQualityResult {
  const { color, role, theme, area } = context;
  const design = normalizeOklch({
    ...color,
    h: color.c < OK_BRAND_EPSILON ? null : color.h,
  });
  const expressive = EXPRESSIVE_ROLES.includes(role);
  const neutralish = NEUTRALISH_ROLES.includes(role);
  const envelope = qualityEnvelope(design.l, design.h, role, theme, area);
  const oklab = oklchToOklab(design);

  // §17/§41 Hue Check：语义角色对照色相家族，其余角色由 Palette 级验证覆盖。
  let hueStability: Metric;
  const isSemantic = (SEMANTIC_ROLES as readonly string[]).includes(role);
  if (isSemantic) {
    if (design.h === null)
      hueStability = metric(0, "warning", "语义角色缺少有效色相");
    else {
      const deviation = Math.min(
        ...(OK_SEMANTIC_HUES[role as (typeof SEMANTIC_ROLES)[number]].map(
          (v) => hueDistance(design.h, v) ?? Infinity,
        )),
      );
      hueStability =
        deviation < 5
          ? metric(deviation, "pass")
          : deviation < 10
            ? metric(deviation, "warning", "色相偏离语义家族中心")
            : metric(deviation, "fail", "HUE_DRIFT：色相漂移出语义家族");
    }
  } else
    hueStability = metric(
      0,
      "pass",
      "该角色无固定目标色相，Hue Stability 由 Palette 级验证评估",
    );

  // §12–§13 Chroma Check：Chroma Adequacy 只判定“是否足够”（下限），
  // 上限污染归 Context Compatibility。
  let chromaAdequacy: Metric;
  if (envelope.min === 0)
    chromaAdequacy = metric(
      design.c,
      "pass",
      "中性角色允许低色度（§12 低 Chroma 不一定是问题）",
    );
  else if (design.c + 1e-9 < envelope.min)
    chromaAdequacy = metric(
      design.c,
      "fail",
      `LOW_CHROMA_AMBIGUITY：C ${design.c.toFixed(4)} 低于该角色在 L ${design.l.toFixed(2)} 的下限 ${envelope.min.toFixed(4)}`,
    );
  else if (design.c < envelope.min + 0.005)
    chromaAdequacy = metric(
      design.c,
      "warning",
      "Chroma 接近角色下限，视觉色彩特征可能偏弱",
    );
  else chromaAdequacy = metric(design.c, "pass");

  // §14–§16 Lightness Check：Dark 防 muddy、Light 防 washed-out。
  let lightnessAdequacy: Metric;
  if (theme === "dark" && design.l < MUDDY_DARK_L && design.c < MUDDY_DARK_C)
    lightnessAdequacy = metric(
      design.l,
      "fail",
      "LIGHTNESS_COLLAPSE：低明度叠加低色度容易产生黑灰浑浊（muddy dark）",
    );
  else if (
    theme === "light" &&
    expressive &&
    design.l > WASHED_LIGHT_L &&
    design.c < WASHED_LIGHT_C
  )
    lightnessAdequacy = metric(
      design.l,
      "warning",
      "washed-out：高明度低色度缺乏颜色识别",
    );
  else lightnessAdequacy = metric(design.l, "pass");

  // §20–§23 Gamut Check：Efficiency = Cactual / Cdesired，五档分类。
  const mapped = mapOklchToGamut(design, "srgb");
  const efficiency = gamutEfficiency(design.c, mapped.c);
  const loss = gamutLoss(design.c, mapped.c);
  const level = gamutLossLevel(loss);
  const gamutEfficiencyMetric: Metric =
    level === "severe"
      ? metric(
          efficiency,
          "fail",
          `CHROMA_COLLAPSE：sRGB 映射色度损失 ${(loss * 100).toFixed(1)}%（${level}）`,
        )
      : level === "significant" || level === "warning"
        ? metric(
            efficiency,
            "warning",
            `EXCESSIVE_GAMUT_LOSS：sRGB 映射色度损失 ${(loss * 100).toFixed(1)}%（${level}）`,
          )
        : metric(efficiency, "pass", `Gamut Loss ${(loss * 100).toFixed(1)}%（${level}）`);

  // §29–§31 ΔEOK Check：语义/主色对背景需要感知分离；中性角色豁免（§31）。
  const reference = context.background ?? { l: design.l, c: 0, h: null };
  const separation = deltaEOK(oklab, oklchToOklab(reference));
  let perceptualSeparation: Metric;
  if (!expressive)
    perceptualSeparation = metric(
      separation,
      "pass",
      "中性角色无需与背景保持强分离（§31 Role Pair）",
    );
  else if (separation < SEPARATION_FAIL)
    perceptualSeparation = metric(
      separation,
      "fail",
      "LOW_PERCEPTUAL_SEPARATION：与背景的 ΔEOK 过小，角色难以辨识",
    );
  else if (separation < SEPARATION_WARN)
    perceptualSeparation = metric(
      separation,
      "warning",
      "与背景的 ΔEOK 偏小，建议结合图标或文案区分",
    );
  else perceptualSeparation = metric(separation, "pass");

  // §33–§35 Context Check：Neutral 污染、包络上限与文字层级。
  let contextCompatibility: Metric;
  const overflow = Math.max(0, design.c - envelope.max);
  if (neutralish && overflow > 1e-9)
    contextCompatibility = metric(
      overflow,
      "fail",
      `NEUTRAL_CONTAMINATION：中性色度超出预算上限 ${envelope.max.toFixed(4)}，大面积使用会产生品牌色污染`,
    );
  else if (overflow > 1e-9)
    contextCompatibility = metric(
      overflow,
      "warning",
      `CONTEXT_CONFLICT：色度超出该角色/主题的包络上限 ${envelope.max.toFixed(4)}`,
    );
  else if (
    role === "text" &&
    context.background &&
    Math.abs(oklab.l - oklchToOklab(context.background).l) < 0.2
  )
    contextCompatibility = metric(
      0,
      "warning",
      "CONTEXT_CONFLICT：文字与背景的 OKLCH L 差过小",
    );
  else contextCompatibility = metric(0, "pass");

  const metrics = {
    hueStability,
    chromaAdequacy,
    lightnessAdequacy,
    gamutEfficiency: gamutEfficiencyMetric,
    perceptualSeparation,
    contextCompatibility,
  };
  return { valid: !Object.values(metrics).some((m) => m.status === "fail"), ...metrics };
}

// ─── V2.5 §52：Theme Context 佐证 ───────────────────────────────────────────
/** 同一颜色在不同主题下的包络不同（Dark 表面更收敛，§52）。 */
export function envelopeDiffersByTheme(
  role: ColorRole,
  l: number,
  h: number | null,
): boolean {
  const light = qualityEnvelope(l, h, role, "light");
  const dark = qualityEnvelope(l, h, role, "dark");
  return (
    Math.abs(light.min - dark.min) > 1e-9 ||
    Math.abs(light.max - dark.max) > 1e-9
  );
}
