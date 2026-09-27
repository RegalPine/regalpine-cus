import {
  STEPS,
  NEUTRAL_STEPS,
  SEMANTIC_ROLES,
  OK_BRAND_EPSILON,
  DEFAULT_CONTEXT,
  type BrandProfile,
  type BrandDNA,
  type OKLCH,
  type V2Palette,
  type PaletteOptions,
  type ColorScale,
  type NeutralScale,
  type SemanticRole,
  type SemanticPalette,
  type ThemeMode,
  type UIColor,
  type PaletteProvenance,
  type PaletteOverrides,
  type PaletteColorOverride,
  type ConstraintDecisionRecord,
  type PaletteGenerationProfile,
  type ColorAnchor,
} from "@cus/core";
import {
  createOklchColor,
  clamp,
  normalizeHue,
  deltaEOK,
  minimumContrast,
  colorOutput,
  mapOklchToGamut,
  oklchToOklab,
} from "@cus/color";
// V2.5 §7/§50–§51/§75：Quality Envelope、Quality-Aware Chroma 与约束冲突。
import {
  brandConstraintConflicts,
  resolveChromaDetailed,
  buildDecisionRecord,
} from "./okquality";
import type { ColorRole } from "@cus/core";

export const OK_LIGHTNESS = {
  light: [0.98, 0.95, 0.9, 0.83, 0.74, 0.64, 0.54, 0.44, 0.35, 0.26, 0.18],
  dark: [0.97, 0.93, 0.87, 0.79, 0.7, 0.6, 0.5, 0.4, 0.31, 0.23, 0.16],
} as const;
export const OK_NEUTRAL_LIGHTNESS = {
  light: [
    1, 0.96, 0.91, 0.84, 0.75, 0.65, 0.55, 0.44, 0.35, 0.26, 0.18, 0.12, 0.06,
  ],
  dark: [
    1, 0.96, 0.91, 0.84, 0.76, 0.68, 0.57, 0.47, 0.37, 0.28, 0.2, 0.14, 0.08,
  ],
} as const;
const CURVE = [0.1, 0.2, 0.36, 0.56, 0.8, 1, 0.95, 0.85, 0.7, 0.52, 0.36];
export const OK_SEMANTIC_HUES: Record<SemanticRole, readonly number[]> = {
  success: [145, 135, 155],
  warning: [85, 75, 95],
  danger: [25, 15, 35],
  info: [250, 235, 265],
};
const factor = { muted: 0.8, balanced: 1, vivid: 1.15 };
export function generateOklchPalette(
  brand: BrandProfile,
  mode: ThemeMode = "light",
  options: PaletteOptions = {},
): V2Palette {
  const raw = brand.oklch;
  const anchor: OKLCH =
    raw.c < OK_BRAND_EPSILON ? { l: raw.l, c: 0, h: null } : raw;
  const source = JSON.stringify(brand.input);
  // PALETTE-01 §33–§34：元数据富化辅助函数。
  const make = (
    family: string,
    step: number | string,
    value: OKLCH,
    meta?: {
      trajectoryT?: number;
      sourceAnchor?: string;
      colorSource?: "PRIMARY_ANCHOR" | "DERIVED" | "MANUAL";
    },
  ): UIColor => {
    const color = createOklchColor(value, 1, {
      id: `${mode}.${family}.${step}`,
      source,
      mode,
      family,
      step,
      parameters: {
        ...value,
        chromaPreference: options.chroma ?? "balanced",
        neutralPreference: options.neutral ?? "brand-tinted",
        semanticPreference: options.semantic ?? "harmonious",
      },
    });
    // PALETTE-01 §33–§34：填充轨迹参数与来源标签。
    if (meta) {
      if (meta.trajectoryT !== undefined) color.provenance.trajectoryT = meta.trajectoryT;
      if (meta.sourceAnchor) color.provenance.sourceAnchor = meta.sourceAnchor;
      if (meta.colorSource) color.provenance.colorSource = meta.colorSource;
    }
    // PALETTE-01 §33：填充色域状态标签。
    const srgbIn = value.h !== null
      ? mapOklchToGamut(value, "srgb").c >= value.c - 1e-9
      : true;
    const p3In = value.h !== null
      ? mapOklchToGamut(value, "display-p3").c >= value.c - 1e-9
      : true;
    color.paletteGamut = {
      srgb: srgbIn ? "IN_GAMUT" : "OUT_OF_GAMUT",
      p3: p3In ? "IN_GAMUT" : "OUT_OF_GAMUT",
    };
    return color;
  };
  // PALETTE-01 §43：逐色约束决策记录收集器。
  const decisionRecords: Record<string, ConstraintDecisionRecord> = {};
  const scale = (
    family: string,
    h: number | null,
    c: number,
    shift = true,
  ): ColorScale =>
    Object.fromEntries(
      STEPS.map((step, i) => {
        const offset = shift
          ? clamp((anchor.l - 0.6) * 0.08, -0.025, 0.025) *
            Math.sin((Math.PI * i) / 10)
          : 0;
        const l = OK_LIGHTNESS[mode][i] + offset;
        const requested = c * CURVE[i];
        // V2.5 §48–§51：Initial Estimate → Quality Envelope → Gamut Envelope →
        // Select C；保留 P3 色度，sRGB 编译时独立压缩。
        const resolution = resolveChromaDetailed(requested, l, h, {
          role: family as ColorRole,
          theme: mode,
          brandChroma: anchor.c,
        });
        const resolvedColor: OKLCH = { l, c: resolution.chroma, h };
        const color = make(family, step, resolvedColor, {
          trajectoryT: STEPS.length > 1 ? i / (STEPS.length - 1) : 0.5,
          sourceAnchor: family === "primary" ? "primary-anchor" : `${family}-derived`,
          colorSource: "DERIVED",
        });
        // V2.5 §76：Requested / Actual / Reason 全程保留。
        color.provenance.parameters.requestedChroma = resolution.requested;
        color.provenance.parameters.srgbCapacity = resolution.srgbCapacity;
        color.provenance.parameters.p3Capacity = resolution.p3Capacity;
        color.provenance.parameters.resolvedChroma = resolution.chroma;
        color.provenance.parameters.chromaReason = resolution.reason;
        color.provenance.parameters.qualityIterations = resolution.iterations;
        // PALETTE-01 §43：记录约束决策。
        const requestedOKLCH: OKLCH = { l, c: requested, h };
        const record = buildDecisionRecord(requestedOKLCH, resolvedColor);
        if (record) decisionRecords[`${family}.${step}`] = record;
        return [step, color];
      }),
    ) as ColorScale;
  const primary = scale(
    "primary",
    anchor.h,
    anchor.c * factor[options.chroma ?? "balanced"],
  );
  const neutral = Object.fromEntries(
    NEUTRAL_STEPS.map((step, i) => {
      const c =
        step === 0 || options.neutral === "pure"
          ? 0
          : Math.min(0.02, anchor.c * 0.08) *
            (step === 1000
              ? 0.2
              : 0.4 + 0.6 * CURVE[Math.min(10, Math.max(0, i - 1))]);
      return [
        step,
        make("neutral", step, {
          l: OK_NEUTRAL_LIGHTNESS[mode][i],
          c,
          h: anchor.h,
        }),
      ];
    }),
  ) as NeutralScale;
  const semantic = {} as SemanticPalette;
  const feedback = {} as Record<SemanticRole, ColorScale>;
  const surface = neutral[mode === "dark" ? 900 : 100];
  for (const role of SEMANTIC_ROLES) {
    const c =
      clamp(anchor.c * 0.75, 0.12, 0.2) * factor[options.chroma ?? "balanced"];
    const candidates = OK_SEMANTIC_HUES[role].map((h) => {
      const dark = mode === "dark";
      const base = make(`feedback.${role}`, "base", {
        l: dark ? 0.76 : 0.48,
        c,
        h,
      });
      const soft = make(`feedback.${role}`, "soft", {
        l: dark ? 0.24 : 0.96,
        c: dark ? 0.025 : 0.012,
        h,
      });
      const foreground = make(`feedback.${role}`, "foreground", {
        l: dark ? 0.9 : 0.34,
        c: c * 0.6,
        h,
      });
      const border = make(`feedback.${role}`, "border", {
        l: dark ? 0.55 : 0.66,
        c: c * 0.5,
        h,
      });
      const prior = Object.values(semantic);
      const separation = Math.min(
        0.5,
        ...prior.flatMap((v) =>
          (["srgb", "display-p3"] as const).map((s) =>
            deltaEOK(
              colorOutput(base, s).rendered.oklab,
              colorOutput(v.base, s).rendered.oklab,
            ),
          ),
        ),
      );
      const score =
        separation * (options.semantic === "distinct" ? 1.5 : 1) +
        0.05 * deltaEOK(colorOutput(base).rendered.oklab, brand.oklab);
      return {
        h,
        value: { base, soft, foreground, border },
        score,
        valid:
          minimumContrast(base, surface) >= 3 &&
          minimumContrast(base, soft) >= 3 &&
          minimumContrast(foreground, soft) >= 4.5,
      };
    });
    const valid = candidates.filter((v) => v.valid);
    const chosen = (valid.length ? valid : candidates).sort(
      (a, b) => b.score - a.score,
    )[0];
    semantic[role] = chosen.value;
    feedback[role] = scale(role, chosen.h, c, false);
  }
  const selectHue = (shifts: number[]) => {
    if (anchor.h === null) return null;
    return shifts
      .map((shift) => {
        const h = normalizeHue(anchor.h! + shift),
          probe = make("candidate", shift, { l: 0.55, c: anchor.c, h });
        const separation = Math.min(
          ...Object.values(semantic).map((v) =>
            deltaEOK(
              colorOutput(probe).rendered.oklab,
              colorOutput(v.base).rendered.oklab,
            ),
          ),
        );
        return {
          h,
          score:
            separation -
            0.1 * deltaEOK(colorOutput(probe).rendered.oklab, brand.oklab),
        };
      })
      .sort((a, b) => b.score - a.score)[0].h;
  };
  const shift = clamp(options.secondaryHueShift ?? 30, 15, 60);
  // V2.2 §46：Palette 来源追溯。
  const paletteProvenance: PaletteProvenance = {
    source: "generated",
    algorithm: "CUS-PAL",
    version: "2.5",
  };
  // V2.5 §75：品牌色度超出目标空间能力时报告冲突并保留 Original Brand。
  const conflicts = brandConstraintConflicts(anchor);
  // PALETTE-01 §22/§55：Lightness Ordering 验证。
  const orderingWarnings = validateLightnessOrdering(
    { primary, secondary: scale("secondary", selectHue([shift, -shift]), anchor.c * factor[options.chroma ?? "balanced"]), accent: scale("accent", selectHue([150, -150, 120, -120, 180]), anchor.c * factor[options.chroma ?? "balanced"]) },
    mode,
  );
  for (const w of orderingWarnings) {
    // 记录到 decisionRecords 但不阻断生成。
    const key = `ordering.${w.family}`;
    decisionRecords[key] = {
      requested: { l: 0, c: 0, h: null },
      resolved: { l: 0, c: 0, h: null },
      adjustments: ["LIGHTNESS_ADJUSTMENT"],
      reason: ["LIGHTNESS_ORDERING"],
    };
  }
  const secondary = scale(
    "secondary",
    selectHue([shift, -shift]),
    anchor.c * factor[options.chroma ?? "balanced"],
  );
  const accent = scale(
    "accent",
    selectHue([150, -150, 120, -120, 180]),
    anchor.c * factor[options.chroma ?? "balanced"],
  );
  return {
    primary,
    neutral,
    semantic,
    feedback,
    secondary,
    accent,
    // V2.4 §18：品牌锚点。
    brandAnchor: { l: anchor.l, c: anchor.c, h: anchor.h },
    paletteProvenance,
    ...(conflicts.length ? { constraintConflicts: conflicts } : {}),
    // PALETTE-01 §43：逐色约束决策记录。
    ...(Object.keys(decisionRecords).length > 0 ? { decisionRecords } : {}),
  };
}
// V2.2 §35–§36：Human Override —— 人工覆盖指定色阶，覆盖后直接进入验证→导出。
export function applyOverrides(
  palette: V2Palette,
  overrides: PaletteOverrides,
  mode: ThemeMode = "light",
): V2Palette {
  const overridden: PaletteOverrides = { ...palette.overrides };
  const applyToScale = (
    scale: ColorScale,
    family: string,
  ): ColorScale => {
    const result = { ...scale };
    for (const [key, ov] of Object.entries(overrides) as [
      string,
      PaletteColorOverride,
    ][]) {
      const [fam, stepStr] = key.split(".");
      if (fam !== family) continue;
      const step = Number(stepStr) as (typeof STEPS)[number];
      if (!(step in result)) continue;
      const original = result[step] as UIColor;
      const oklch: OKLCH = {
        l: ov.l,
        c: ov.c,
        h: ov.h,
      };
      const origDesign = original.design ?? oklch;
      result[step] = createOklchColor(oklch, 1, {
        id: `${mode}.${family}.${step}`,
        source: JSON.stringify({ manual: true, reason: ov.reason }),
        mode,
        family,
        step,
        parameters: {
          ...oklch,
          override: "manual",
          originalL: origDesign.l,
          originalC: origDesign.c,
          originalH: origDesign.h,
        },
      });
      overridden[key] = ov;
    }
    return result;
  };
  return {
    ...palette,
    primary: applyToScale(palette.primary, "primary"),
    secondary: applyToScale(palette.secondary, "secondary"),
    accent: applyToScale(palette.accent, "accent"),
    paletteProvenance: palette.paletteProvenance
      ? {
          ...palette.paletteProvenance,
          source: Object.keys(overridden).length > 0 ? "manual" : "generated",
        }
      : palette.paletteProvenance,
    overrides: overridden,
  };
}
// V2.2 §5：Brand DNA 扩展——lightnessCharacter/chromaStrength/gamutPressure。
export function deriveOklchBrandDNA(brand: OKLCH): BrandDNA {
  const hue = brand.c < OK_BRAND_EPSILON ? null : brand.h;
  // V2.2 §16：lightnessCharacter 基于 OKLCH L 值分段。
  const lightnessCharacter: BrandDNA["lightnessCharacter"] =
    brand.l > 0.7 ? "light" : brand.l < 0.4 ? "dark" : "medium";
  // V2.2 §7：chromaStrength 基于 OKLCH C 值分段。
  const chromaStrength: BrandDNA["chromaStrength"] =
    brand.c > 0.15 ? "high" : brand.c < 0.05 ? "low" : "medium";
  // V2.2 §20：gamutPressure 基于品牌色在 sRGB 色域内的色度余量。
  const srgbMapped = mapOklchToGamut(brand, "srgb");
  const retention = brand.c > 0 ? srgbMapped.c / brand.c : 1;
  const gamutPressure: BrandDNA["gamutPressure"] =
    retention > 0.8 ? "low" : retention > 0.5 ? "medium" : "high";
  // 兼容旧字段：contrastCharacter 映射自 lightnessCharacter。
  const contrastLegacy: BrandDNA["contrastCharacter"] =
    brand.l < 0.5 && brand.c > 0.15
      ? "high"
      : brand.l > 0.7 && brand.c < 0.1
        ? "low"
        : "medium";
  return {
    model: "oklch",
    hue,
    chroma: brand.c,
    lightness: brand.l,
    neutralChroma: Math.min(0.02, brand.c * 0.08),
    temperature:
      hue === null
        ? "warm"
        : hue >= 150 && hue < 250
          ? "neutral"
          : hue < 100 || hue >= 330
            ? "warm"
            : "cool",
    lightnessCharacter,
    chromaStrength,
    gamutPressure,
    contrastCharacter: contrastLegacy,
  };
}

// ─── PALETTE-01 §22/§55：Lightness Ordering 验证 ──────────────────────────
interface OrderingWarning { family: string; message: string }

/**
 * §22/§55：检查色阶 L 值是否单调递减（light 模式）或符合 dark 模式规则。
 * 不阻断生成，仅报告 warning。
 */
export function validateLightnessOrdering(
  scales: { primary: ColorScale; secondary: ColorScale; accent: ColorScale },
  _mode: ThemeMode,
): OrderingWarning[] {
  const warnings: OrderingWarning[] = [];
  for (const [family, scale] of Object.entries(scales)) {
    const steps = STEPS;
    const lValues = steps.map((s) => (scale[s] as UIColor).design.l);
    for (let i = 1; i < lValues.length; i++) {
      // Light 模式：L 应单调递减（L[0] > L[1] > ... > L[n]）。
      // Dark 模式：同样要求单调递减（从浅到深）。
      if (lValues[i] >= lValues[i - 1] + 1e-9) {
        warnings.push({
          family,
          message: `${family}[${steps[i]}] L=${lValues[i].toFixed(4)} >= ${family}[${steps[i - 1]}] L=${lValues[i - 1].toFixed(4)}，违反 Lightness Ordering（§22/§55）`,
        });
        break; // 每个家族只报告第一个违规。
      }
    }
  }
  return warnings;
}

// ─── PALETTE-01 §35：规范正式 API 入口 ──────────────────────────────────────
/**
 * §35：generate(anchor, profile, gamut) —— 使用 PaletteGenerationProfile
 * 驱动调色板生成。内部委托既有 generateOklchPalette 链路，
 * 将 PaletteGenerationProfile 映射为 PaletteOptions。
 */
export function generateFromProfile(
  anchor: ColorAnchor,
  profile?: PaletteGenerationProfile,
  _gamut: "srgb" | "display-p3" = "srgb",
  mode: ThemeMode = "light",
): V2Palette {
  const oklch: OKLCH = { l: anchor.l, c: anchor.c, h: anchor.h };
  // 将 PaletteGenerationProfile 映射为 BrandProfile + PaletteOptions。
  // 这里使用最小化 BrandProfile 构造，因为 generateOklchPalette 需要它。
  const brandProfile: BrandProfile = {
    oklch,
    oklab: oklchToOklab(oklch),
    context: DEFAULT_CONTEXT,
    input: { oklch },
    source: "palette-profile",
    hex: "#000000",
    rgb: { r: 0, g: 0, b: 0 },
    xyz: { x: 0, y: 0, z: 0 },
    lab: { l: 0, a: 0, b: 0 },
    lch: { l: 0, c: 0, h: 0 },
    alpha: 1,
  };
  const options: PaletteOptions = {};
  if (profile) {
    // ChromaProfile.mode 映射为 ChromaPreference。
    if (profile.chroma.mode === "constant" || profile.chroma.mode === "CONSTANT") options.chroma = "muted";
    else if (profile.chroma.mode === "gamut-adaptive" || profile.chroma.mode === "ADAPTIVE") options.chroma = "muted";
    // SemanticProfile.strategy 直接映射。
    if (profile.semantic.strategy === "distinct") options.semantic = "distinct";
  }
  return generateOklchPalette(brandProfile, mode, options);
}
