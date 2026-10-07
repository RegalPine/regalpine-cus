import {
  ACHROMATIC_BRAND_EPSILON,
  NEUTRAL_STEPS,
  SEMANTIC_HUES,
  SEMANTIC_ROLES,
  STEPS,
  type BrandContrastCharacter,
  type BrandDNA,
  type BrandTemperature,
  type BrandLightnessCharacter,
  type BrandChromaStrength,
  type BrandGamutPressure,
  type ColorScale,
  type LCh,
  type Lab,
  type NeutralScale,
  type V2Palette,
  type PaletteOptions,
  type SemanticPalette,
  type SemanticRole,
  type ThemeMode,
} from "@cus/core";
import {
  assertFinite,
  clamp,
  contrastRatio,
  createColor,
  deltaE2000,
  lchToLab,
  normalizeLch,
} from "@cus/color";

export * from "./okpalette";
// V2.5：Quality Envelope / resolveChroma / Gamut Loss 分类 / 约束冲突。
export * from "./okquality";
// PALETTE-01 §6/§8–§9/§10–§11：Profile 引擎。
export * from "./profiles";

export const PRIMARY_LIGHTNESS = [
  96, 92, 86, 78, 68, 56, 47, 38, 30, 22, 15,
] as const;
// V1.3 §16：13 级 Neutral 覆盖 0..1000，两端拉开避免与相邻层级混淆。
export const NEUTRAL_LIGHTNESS = [
  100, 95, 90, 83, 74, 62, 51, 41, 32, 23, 15, 9, 5,
] as const;
// Bootstrap-inspired 饱和度纪律：中段峰值，向两端平滑收敛。
export const CHROMA_CURVE = [
  0.08, 0.18, 0.36, 0.58, 0.82, 1, 0.92, 0.78, 0.58, 0.38, 0.22,
] as const;
// V1.3 §46：chroma 偏好以确定性缩放作用于家族色度。
export const CHROMA_SCALES = { muted: 0.8, balanced: 1, vivid: 1.15 } as const;
const chromaScale = (options: PaletteOptions): number =>
  CHROMA_SCALES[options.chroma ?? "balanced"];
// 品牌无彩色为感知判定（阈值定义见 core），避免 HEX 往返噪声被当作色相。
const brandChroma = (brand: LCh, scale: number): number =>
  brand.c < ACHROMATIC_BRAND_EPSILON ? 0 : brand.c * scale;
const brandHue = (brand: LCh): number | null =>
  brand.c < ACHROMATIC_BRAND_EPSILON ? null : brand.h;

function generateHueFamily(
  brand: LCh,
  hue: number | null,
  scale: number,
): ColorScale {
  return Object.fromEntries(
    STEPS.map((step, i) => [
      step,
      createColor({
        l: PRIMARY_LIGHTNESS[i],
        c: brandChroma(brand, scale) * CHROMA_CURVE[i],
        h: hue,
      }),
    ]),
  ) as ColorScale;
}
export function generatePrimary(
  input: LCh,
  options: PaletteOptions = {},
): ColorScale {
  const brand = normalizeLch(input);
  return generateHueFamily(brand, brandHue(brand), chromaScale(options));
}
/** V1.3 §13：secondary.hue = h + Δh；默认策略保持品牌色相一致性（analogous）。 */
export const SECONDARY_HUE_SHIFT = 30;
/** V1.3 §12：accent 从受控色相变换候选中选择，split-complementary 优先。 */
export const ACCENT_HUE_SHIFTS = [150, -150, 120, -120, 180] as const;
function shiftedCandidates(brand: LCh, shifts: readonly number[]): number[] {
  return shifts.map((s) => {
    const h = (((brand.h! + s) % 360) + 360) % 360;
    return h;
  });
}
// 实际选择逻辑：返回得分最高的候选色相；语义区分优先，轻微惩罚偏离品牌。
function chooseHue(
  brand: LCh,
  candidates: number[],
  semanticBases: Lab[],
  brandWeight: number,
): number {
  if (candidates.length === 1) return candidates[0];
  const brandLab = lchToLab(brand);
  let best = candidates[0],
    bestScore = -Infinity;
  for (const h of candidates) {
    const probe = createColor({ l: 47, c: brand.c, h }).calculation.lab;
    const separation = semanticBases.length
      ? Math.min(...semanticBases.map((lab) => deltaE2000(probe, lab)))
      : 100;
    const score =
      Math.min(40, separation) - brandWeight * deltaE2000(probe, brandLab);
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}
export function generateSecondary(
  input: LCh,
  options: PaletteOptions = {},
): ColorScale {
  const brand = normalizeLch(input);
  const hue = brandHue(brand);
  if (hue === null) return generateHueFamily(brand, null, chromaScale(options));
  const shift = clamp(options.secondaryHueShift ?? SECONDARY_HUE_SHIFT, 15, 60);
  const semanticBases = Object.values(
    selectSemantic(brand, "light", options),
  ).map((s) => s.color.base.calculation.lab);
  const secondaryHue = chooseHue(
    brand,
    shiftedCandidates(brand, [shift, -shift]),
    semanticBases,
    0.15,
  );
  return generateHueFamily(brand, secondaryHue, chromaScale(options));
}
export function generateAccent(
  input: LCh,
  options: PaletteOptions = {},
): ColorScale {
  const brand = normalizeLch(input);
  const hue = brandHue(brand);
  if (hue === null) return generateHueFamily(brand, null, chromaScale(options));
  const semanticBases = Object.values(
    selectSemantic(brand, "light", options),
  ).map((s) => s.color.base.calculation.lab);
  const accentHue = chooseHue(
    brand,
    shiftedCandidates(brand, ACCENT_HUE_SHIFTS),
    semanticBases,
    0.1,
  );
  return generateHueFamily(brand, accentHue, chromaScale(options));
}
export function generateNeutral(
  input: LCh,
  options: PaletteOptions = {},
): NeutralScale {
  const brand = normalizeLch(input);
  const requested =
    options.neutralChroma ?? (options.neutral === "pure" ? 0 : 4);
  assertFinite(requested);
  const c = Math.min(
    clamp(requested, 0, 4),
    brand.c < ACHROMATIC_BRAND_EPSILON ? 0 : brand.c * 0.06,
  );
  return Object.fromEntries(
    NEUTRAL_STEPS.map((step, i) => [
      step,
      createColor({
        l: NEUTRAL_LIGHTNESS[i],
        // neutral.0 为纯白（L*=100 时 C* 必须为 0）；neutral.1000 保持品牌倾向的极暗色。
        c:
          step === 0
            ? 0
            : step === 1000
              ? Math.min(brand.c * 0.02, 1)
              : c * (0.4 + 0.6 * CHROMA_CURVE[i - 1]),
        h: brand.h,
      }),
    ]),
  ) as NeutralScale;
}
interface SemanticSelection {
  hue: number;
  color: SemanticPalette[SemanticRole];
}
function selectSemantic(
  input: LCh,
  mode: ThemeMode = "light",
  options: PaletteOptions = {},
): Record<SemanticRole, SemanticSelection> {
  const brand = normalizeLch(input),
    dark = mode === "dark";
  const result = {} as Record<SemanticRole, SemanticSelection>;
  const brandLab = lchToLab(brand);
  const separationWeight = options.semantic === "distinct" ? 1.5 : 1;
  for (const role of SEMANTIC_ROLES) {
    const c = clamp(brand.c * 0.65, 38, 58);
    const candidates = SEMANTIC_HUES[role].map((h) => {
      const base = createColor({ l: dark ? 72 : 44, c, h });
      const soft = createColor({ l: dark ? 19 : 96, c: dark ? 13 : 7, h });
      const foreground = createColor({ l: dark ? 84 : 32, c: c * 0.65, h });
      const border = createColor({ l: dark ? 50 : 66, c: c * 0.45, h });
      const distances = Object.values(result).map((v) =>
        deltaE2000(base.calculation.lab, v.color.base.calculation.lab),
      );
      const separation = Math.min(100, ...distances);
      const score =
        Math.min(30, deltaE2000(base.calculation.lab, brandLab)) * 0.2 +
        separation * separationWeight;
      return {
        hue: h,
        color: { base, soft, foreground, border } as SemanticSelection["color"],
        score,
        valid:
          contrastRatio(foreground.calculation.rgb, soft.calculation.rgb) >=
            4.5 &&
          contrastRatio(base.calculation.rgb, dark ? "#171717" : "#FFFFFF") >=
            3,
      };
    });
    const valid = candidates.filter((v) => v.valid);
    const chosen = (valid.length ? valid : candidates).sort(
      (a, b) => b.score - a.score,
    )[0];
    result[role] = { hue: chosen.hue, color: chosen.color };
  }
  return result;
}
export function generateSemantic(
  input: LCh,
  mode: ThemeMode = "light",
  options: PaletteOptions = {},
): SemanticPalette {
  const selected = selectSemantic(input, mode, options);
  return Object.fromEntries(
    SEMANTIC_ROLES.map((role) => [role, selected[role].color]),
  ) as SemanticPalette;
}
/** 语义角色选定的代表色相，用于 Feedback 色阶与 Hue 稳定性验证。 */
export function semanticBaseHues(
  input: LCh,
  mode: ThemeMode = "light",
  options: PaletteOptions = {},
): Record<SemanticRole, number> {
  const selected = selectSemantic(input, mode, options);
  return Object.fromEntries(
    SEMANTIC_ROLES.map((role) => [role, selected[role].hue]),
  ) as Record<SemanticRole, number>;
}
/** V1.3 §20：每个语义颜色生成 50..950 色阶，复用 Primary 感知曲线。 */
export function generateFeedback(
  input: LCh,
  mode: ThemeMode = "light",
): Record<SemanticRole, ColorScale> {
  const brand = normalizeLch(input);
  const selected = selectSemantic(brand, mode);
  return Object.fromEntries(
    SEMANTIC_ROLES.map((role) => {
      const { hue, color } = selected[role];
      const baseC = color.base.calculation.lch.c;
      return [
        role,
        Object.fromEntries(
          STEPS.map((step, i) => [
            step,
            createColor({
              l: PRIMARY_LIGHTNESS[i],
              c: baseC * CHROMA_CURVE[i],
              h: hue,
            }),
          ]),
        ),
      ];
    }),
  ) as Record<SemanticRole, ColorScale>;
}
export function generatePalette(
  brand: LCh,
  options: PaletteOptions = {},
): V2Palette {
  return {
    primary: generatePrimary(brand, options),
    secondary: generateSecondary(brand, options),
    accent: generateAccent(brand, options),
    neutral: generateNeutral(brand, options),
    semantic: generateSemantic(brand, "light", options),
    feedback: generateFeedback(brand),
  };
}
/** V1.4 §5：Brand DNA —— 对品牌颜色色度特征的工程化摘要（非新颜色模型）。 */
export function deriveBrandDNA(brand: LCh): BrandDNA {
  const hue = brand.c < ACHROMATIC_BRAND_EPSILON ? null : brand.h;
  // 暖色：红-橙-黄（<90°）与品红-洋红（≥300°），中间色相为中性过渡区。
  const temperature: BrandTemperature =
    hue === null
      ? "warm"
      : hue >= 140 && hue < 250
        ? "neutral"
        : hue < 90 || hue >= 300
          ? "warm"
          : "cool";
  // 深且饱和的锚点给出强对比性格，浅且低彩度则为柔和性格。
  const contrastCharacter: BrandContrastCharacter =
    brand.l < 45 && brand.c > 50
      ? "high"
      : brand.l > 65 && brand.c < 30
        ? "low"
        : "medium";
  // V2.2 §5：兼容字段——CIELCh L*/100 近似 OKLCH L 分段。
  const lightnessCharacter: BrandLightnessCharacter =
    brand.l > 70 ? "light" : brand.l < 40 ? "dark" : "medium";
  const chromaStrength: BrandChromaStrength =
    brand.c > 50 ? "high" : brand.c < 15 ? "low" : "medium";
  const gamutPressure: BrandGamutPressure =
    brand.c > 60 ? "high" : brand.c > 30 ? "medium" : "low";
  return {
    hue,
    chroma: brand.c,
    lightness: brand.l,
    neutralChroma: Math.min(4, brand.c * 0.08),
    temperature,
    lightnessCharacter,
    chromaStrength,
    gamutPressure,
    contrastCharacter,
  };
}
