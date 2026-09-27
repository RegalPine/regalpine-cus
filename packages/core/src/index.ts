import {
  ColorError,
  type CalculationContext,
  type V2Color,
  type ColorErrorCode,
  type ColorSpace,
  type RGBSpace,
} from "./color";
import type { RGB } from "./rgb";
import type { XYZ } from "./xyz";
import type { Lab } from "./lab";
import type { LCh } from "./lch";
import type { OKLCH, Oklab, OutputOptions } from "./oklab";
export * from "./oklab";

export * from "./color";
export * from "./rgb";
export * from "./xyz";
export * from "./lab";
export * from "./lch";
// CUS-UX-01 §32–§39：Color Explorer 域模型与事件契约。
export * from "./explorer";
// CUS-UX-02 §5–§8/§14/§18–§19/§45：Color Volume 采样、射线拾取与缓存。
export * from "./volume";
// CUS-IMPLEMENTATION-04 §44/§66：Renderer / Picker / Camera 公开 API。
export * from "./renderer";
export * from "./picker";
export * from "./camera";
// CUS-IMPLEMENTATION-01 §9：规范适配层。
export * from "./spec-adapters";

export const STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;
export type ScaleStep = (typeof STEPS)[number];
// V1.3 §16：Neutral 层级覆盖 neutral.0..neutral.1000，形成统一中性家族。
export const NEUTRAL_STEPS = [
  0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950, 1000,
] as const;
export type NeutralStep = (typeof NEUTRAL_STEPS)[number];
// V1.3 §12：品牌无彩色为感知判定。HEX→Lab→LCh 往返在纯灰上残留约 1e-5 的
// D65 噪声，数学层 ACHROMATIC_EPSILON（1e-7）仅适用于构造坐标，
// 生成（palette）与验证（validation）共用此阈值。
export const ACHROMATIC_BRAND_EPSILON = 1e-4;
export const SEMANTIC_ROLES = ["success", "warning", "danger", "info"] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];
// V1.3 §18：语义默认 Hue 区间（中心色 ±10° 候选）。
export const SEMANTIC_HUES: Record<SemanticRole, readonly number[]> = {
  success: [145, 135, 155],
  warning: [80, 70, 90],
  danger: [30, 20, 40],
  info: [255, 240, 270],
};
export type ThemeMode = "light" | "dark";
// V1.3 §46：Design Preferences，属于设计偏好而非色彩数学参数。
export type ChromaPreference = "muted" | "balanced" | "vivid";
export type ContrastPreference = "normal" | "high";
export type NeutralPreference = "brand-tinted" | "pure";
export type SemanticPreference = "harmonious" | "distinct";
export interface ThemeOptions {
  chroma?: ChromaPreference;
  contrast?: ContrastPreference;
  neutral?: NeutralPreference;
  semantic?: SemanticPreference;
  darkMode?: boolean;
  lightMode?: boolean;
  output?: OutputOptions;
}
export type BrandInput =
  | string
  | { lch: LCh; alpha?: number }
  | { oklch: OKLCH; alpha?: number };
// V2.4 §7：ColorSource —— 颜色输入源的联合类型。
export type ColorSource =
  | string
  | { oklch: OKLCH; alpha?: number }
  | { lch: LCh; alpha?: number };
// V2.2 §5：Brand DNA —— 对品牌颜色色度特征的工程化摘要，不是新的颜色模型。
export type BrandTemperature = "warm" | "neutral" | "cool";
export type BrandLightnessCharacter = "light" | "medium" | "dark";
export type BrandChromaStrength = "low" | "medium" | "high";
export type BrandGamutPressure = "low" | "medium" | "high";
/** @deprecated V2.2 起由 lightnessCharacter 取代，保留兼容。 */
export type BrandContrastCharacter = "low" | "medium" | "high";
export interface BrandDNA {
  model?: "oklch";
  hue: number | null;
  chroma: number;
  lightness: number;
  neutralChroma: number;
  temperature: BrandTemperature;
  lightnessCharacter: BrandLightnessCharacter;
  chromaStrength: BrandChromaStrength;
  gamutPressure: BrandGamutPressure;
  /** @deprecated V2.2 起由 lightnessCharacter 取代。 */
  contrastCharacter?: BrandContrastCharacter;
}
export interface BrandProfile {
  oklab: Oklab;
  oklch: OKLCH;
  context: CalculationContext;
  input: BrandInput;
  source: string;
  hex: string;
  rgb: RGB;
  xyz: XYZ;
  lab: Lab;
  lch: LCh;
  alpha: number;
}
export type ColorScale = Record<ScaleStep, V2Color>;
export type NeutralScale = Record<NeutralStep, V2Color>;
// V2.4 §10：PaletteColor —— 色板中的单个颜色条目。
export interface V2PaletteColor {
  /** OKLCH 设计坐标。 */
  design: OKLCH;
  /** sRGB CSS 渲染色。 */
  srgb: string;
  /** Display-P3 CSS 渲染色。 */
  displayP3: string;
  /** 色域压缩率。 */
  chromaReduction: number;
}
export interface V2SemanticColor {
  base: V2Color;
  soft: V2Color;
  foreground: V2Color;
  border: V2Color;
}
export type SemanticPalette = Record<SemanticRole, V2SemanticColor>;
export interface V2Palette {
  primary: ColorScale;
  secondary: ColorScale;
  accent: ColorScale;
  neutral: NeutralScale;
  semantic: SemanticPalette;
  /** V1.3 §20：每个语义角色生成 50..950 完整色阶。 */
  feedback: Record<SemanticRole, ColorScale>;
  /** V2.4 §18：品牌锚点，Palette 的参考原点。 */
  brandAnchor?: OKLCH;
  /** V2.2 §46：Palette 来源追溯。 */
  paletteProvenance?: PaletteProvenance;
  /** V2.2 §35–§36：人工覆盖记录。 */
  overrides?: PaletteOverrides;
  /** V2.5 §75：约束冲突记录（保留 Original Brand，不静默修改）。 */
  constraintConflicts?: QualityConflict[];
  /** PALETTE-01 §43：逐色约束决策记录。 */
  decisionRecords?: Record<string, ConstraintDecisionRecord>;
}
export interface V2PaletteRequest {
  brand: string;
}
export interface PaletteOptions {
  neutralChroma?: number;
  chroma?: ChromaPreference;
  neutral?: NeutralPreference;
  semantic?: SemanticPreference;
  /** V1.3 §13：secondary.hue = h + Δh，默认 analogous ±30°。 */
  secondaryHueShift?: number;
}
// PALETTE-01 §35–§37：PaletteProfile —— 规范定义的调色板配置 API。
// S6: Lightness Profile。
export type LightnessCurveType = "linear" | "ease-in" | "ease-out" | "piecewise";
export interface V2LightnessProfile {
  curve: LightnessCurveType;
  /** piecewise 时直接指定色阶值。 */
  values?: number[];
  /** piecewise 锚点（step → L 值）。 */
  anchors?: Record<number, number>;
}
// S8–S9: Chroma Profile。
// IMPLEMENTATION-01 §19 规范值：'CONSTANT' | 'ADAPTIVE'；旧值保持兼容。
export type ChromaMode = "CONSTANT" | "ADAPTIVE" | "constant" | "lightness-adaptive" | "gamut-adaptive";
export interface V2ChromaProfile {
  mode: ChromaMode;
  /** constant 模式的比例因子，默认 1。 */
  modifier?: number;
}
// S10–S11: Hue Profile。
// IMPLEMENTATION-01 §19 规范值：'ANCHOR' | 'ADAPTIVE'；旧值保持兼容。
export interface V2HueProfile {
  mode: "ANCHOR" | "ADAPTIVE" | "anchor" | "compensation";
  /** H_max_shift，默认 5°。 */
  maxShift?: number;
  /** 每步 ΔH 补偿值（可选，缺省自动计算）。 */
  compensationCurve?: number[];
}
// S4: Trajectory Profile。
export interface V2TrajectoryProfile {
  parameterization: "uniform" | "anchored";
  /** 品牌色对应的 t 值（anchored 模式）。 */
  anchorStep?: number;
  /** CUS-IMPLEMENTATION-01 §C4：启用 Dirty Zone 路由。 */
  dirtyZoneRouting?: boolean;
  /** CUS-IMPLEMENTATION-01 §C4：启用色域路由。 */
  gamutRouting?: boolean;
}
// S26: Semantic Profile。
export interface V2SemanticProfile {
  strategy: "harmonious" | "distinct";
}
// CUS-THEME-01 §53：Component Profile —— 控制组件 Token 装配范围。
export interface ComponentProfile {
  /** 限定装配的组件前缀列表（如 ["button", "input"]）；缺省装配全部。 */
  components?: string[];
}
// S36: PaletteGenerationProfile 聚合（规范 §36 PaletteProfile，避免与 Explorer 预览用 PaletteProfile 同名冲突）。
export interface PaletteGenerationProfile {
  lightness: V2LightnessProfile;
  chroma: V2ChromaProfile;
  hue: V2HueProfile;
  trajectory: V2TrajectoryProfile;
  semantic: V2SemanticProfile;
}
// PALETTE-01 §42–§43：Constraint Decision Record 与放松优先级。
export type AdjustmentType =
  | "CHROMA_REDUCTION"
  | "HUE_COMPENSATION"
  | "LIGHTNESS_ADJUSTMENT"
  | "DIRTY_ZONE_REROUTE";
export type RelaxationReason =
  | "SRGB_GAMUT"
  | "P3_GAMUT"
  | "DIRTY_ZONE"
  | "CONTRAST_REQUIREMENT"
  | "LIGHTNESS_ORDERING";
export interface ConstraintDecisionRecord {
  requested: { l: number; c: number; h: number | null };
  resolved: { l: number; c: number; h: number | null };
  adjustments: AdjustmentType[];
  reason: RelaxationReason[];
}
// S42: 约束放松优先级（默认顺序）。
export type ConstraintPriority =
  | "semantic-role"
  | "lightness-structure"
  | "gamut-validity"
  | "contrast"
  | "hue-stability"
  | "chroma-preservation";
// PALETTE-01 §40：Dirty-Zone Routing 结果。
export type DirtyZoneRoute = "A" | "B" | "C" | "D";
export interface DirtyZoneRouteResult {
  color: OKLCH;
  route: DirtyZoneRoute;
  adjustments: AdjustmentType[];
}
// V2.2 §43：Palette 生成配置（规范接口定义，向后兼容）。
export interface PaletteConfig {
  scales: number[];
  lightnessCurve?: { anchors?: Record<number, number> };
  chromaCurve?: { profile?: "default" | "flat" | "bell" };
  hueStrategy?: { drift?: number; stability?: "strict" | "relaxed" };
  gamut?: { space: "srgb" | "display-p3"; enforce?: boolean };
  // V1.1 §33：Palette Profile validation 开关（Quality Envelope / Dirty Zone）。
  validation?: {
    perceptual?: { enabled?: boolean };
    contrast?: { enabled?: boolean };
    dirtyZone?: { enabled?: boolean };
  };
  /** 实现扩展字段。 */
  chroma?: ChromaPreference;
  neutral?: NeutralPreference;
  semantic?: SemanticPreference;
  secondaryHueShift?: number;
}
// V2.2 §44：Palette 生成器接口（向后兼容签名）。
export interface PaletteGenerator {
  generate(brand: BrandProfile, config?: PaletteConfig): V2Palette;
}
// PALETTE-01 §35：规范正式 API 签名。
export interface PaletteProfileGenerator {
  generate(
    anchor: import("./explorer").ColorAnchor,
    profile?: PaletteGenerationProfile,
    gamut?: "srgb" | "display-p3",
  ): V2Palette;
}
// V2.2 §46：Palette 来源追溯。
export interface PaletteProvenance {
  source: "generated" | "manual";
  algorithm: string;
  version: string;
  configuration?: unknown;
}
// V2.2 §35：单色阶人工覆盖。
export interface PaletteColorOverride {
  space: "oklch";
  l: number;
  c: number;
  h: number | null;
  reason?: string;
}
// V2.2 §35–§36：人工覆盖集合，键为 "family.step"。
export type PaletteOverrides = Record<string, PaletteColorOverride>;
export interface ColorToken {
  ref: string;
}
export interface ColorRelationship {
  token: string;
  usage: "text" | "non-text" | "decorative" | "disabled";
  textSize?: number;
  fontWeight?: number;
  minContrast?: number;
  minDeltaL?: number;
  minDeltaE?: number;
  minDeltaEOK?: number;
  canvas?: string;
}
export interface SemanticToken extends ColorToken {
  role: "foreground" | "background" | "border" | "overlay";
  state:
    | "default"
    | "hover"
    | "active"
    | "disabled"
    | "loading"
    | "selected"
    | "focus";
  theme: ThemeMode;
  relationships: ColorRelationship[];
  transition?: { from: string; minDeltaE: number; minDeltaEOK?: number };
  /** CUS-THEME-01 §11：语义意图描述（如 "negative-action-or-risk"）。 */
  intent?: string;
}
export type Token = ColorToken;
export interface ThemeTokens {
  mode: ThemeMode;
  primitive: Record<string, V2Color>;
  semantic: Record<string, SemanticToken>;
  component: Record<string, ColorToken>;
}
export interface V2Theme {
  light: ThemeTokens | null;
  /** V1.3 §46 darkMode 选项关闭时为 null。 */
  dark: ThemeTokens | null;
}
export interface StateTransform {
  deltaL?: number;
  deltaC?: number;
  deltaH?: number;
  chromaScale?: number;
}
export type ValidationStatus = "PASS" | "WARN" | "FAIL";
export type ValidationCategory =
  | "Color"
  | "Gamut"
  | "Palette"
  | "Semantic"
  | "Contrast"
  | "Theme"
  | "Component"
  | "Hue"
  | "Quality";
export interface ValidationResult {
  id: string;
  category: ValidationCategory;
  status: ValidationStatus;
  message: string;
  value?: number;
  threshold?: number;
  code?:
    | ColorErrorCode
    | QualityErrorCode
    | "SEMANTIC_COLLISION"
    | "MISSING_REFERENCE"
    | "METRIC_THRESHOLD_NOT_MET";
  targetSpace?: "srgb" | "display-p3";
  colorIds?: string[];
  metrics?: {
    contrast: number;
    deltaL: number;
    deltaE: number;
    deltaEOK?: number;
    deltaE00?: number;
    deltaLOK?: number;
    hueDistance?: number | null;
  };
  /** CUS-THEME-01 §50：对比约束失败时的必需约束（如 "≥4.5:1"）。 */
  requiredConstraint?: string;
  /** CUS-THEME-01 §50：对比约束失败时的候选解决方案。 */
  candidateResolution?: string;
}
export interface ValidationOptions {
  adjacentOKMin?: number;
  stateOKMin?: number;
  semanticOKFail?: number;
  semanticOKWarn?: number;
  semanticHueFail?: number;
  semanticHueWarn?: number;
  semanticCollisionThreshold?: number;
  semanticWarningThreshold?: number;
}
export interface ValidationReport {
  status: ValidationStatus;
  results: ValidationResult[];
  counts: Record<ValidationStatus, number>;
  /** V2.4 §35：色域合规摘要。 */
  gamut?: { srgb: boolean; displayP3: boolean };
}
export interface ThemeResult {
  designSpace?: "oklch";
  palettes?: { light: V2Palette | null; dark: V2Palette | null };
  context: CalculationContext;
  brand: BrandProfile;
  /** V1.4 §5：品牌色度特征摘要。 */
  brandDNA?: BrandDNA;
  palette: V2Palette;
  theme: V2Theme;
  options?: ThemeOptions;
}
export interface GeneratedTheme extends ThemeResult {
  validation: ValidationReport;
}
export interface CusDesignerState {
  brand: string;
  brandInput?: BrandInput;
  colorSpace: "srgb";
  designSpace?: "oklch";
  output?: OutputOptions;
  generateLight: boolean;
  generateDark: boolean;
  options?: ThemeOptions;
}
/** 校验外部输入的 Design Preferences（V1.3 §46），未知值拒绝。 */
export function parseThemeOptions(value: unknown): ThemeOptions {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ColorError("INVALID_INPUT", "options 必须为对象");
  const obj = value as Record<string, unknown>;
  const choices = {
    chroma: ["muted", "balanced", "vivid"],
    contrast: ["normal", "high"],
    neutral: ["brand-tinted", "pure"],
    semantic: ["harmonious", "distinct"],
  } as const;
  const result: ThemeOptions = {};
  for (const [key, allowed] of Object.entries(choices)) {
    const raw = obj[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || !allowed.includes(raw as never))
      throw new ColorError("INVALID_INPUT", `options.${key} 取值无效`);
    result[key as keyof typeof choices] = raw as never;
  }
  if (obj.darkMode !== undefined) {
    if (typeof obj.darkMode !== "boolean")
      throw new ColorError("INVALID_INPUT", "options.darkMode 必须为布尔值");
    result.darkMode = obj.darkMode;
  }
  if (obj.lightMode !== undefined) {
    if (typeof obj.lightMode !== "boolean")
      throw new ColorError("INVALID_INPUT", "options.lightMode 必须为布尔值");
    result.lightMode = obj.lightMode;
  }
  if (result.lightMode === false && result.darkMode === false)
    throw new ColorError("INVALID_INPUT", "至少生成一种主题");
  if (obj.output !== undefined) {
    const output = obj.output as OutputOptions;
    if (
      !output ||
      typeof output.srgb !== "boolean" ||
      typeof output.displayP3 !== "boolean" ||
      (!output.srgb && !output.displayP3)
    )
      throw new ColorError("INVALID_INPUT", "至少选择一种输出色域");
    result.output = { srgb: output.srgb, displayP3: output.displayP3 };
  }
  return result;
}

// ─── V2.5 Color Quality & Cleanliness ───────────────────────────────────────
// V2.5 §54：Quality Error Codes（码表与 CUS 数学层错误码相互独立）。
export type QualityErrorCode =
  | "LOW_CHROMA_AMBIGUITY"
  | "CHROMA_COLLAPSE"
  | "EXCESSIVE_GAMUT_LOSS"
  | "HUE_DRIFT"
  | "LIGHTNESS_COLLAPSE"
  | "LOW_PERCEPTUAL_SEPARATION"
  | "PALETTE_DISCONTINUITY"
  | "BRAND_ANCHOR_DISCONTINUITY"
  | "NEUTRAL_CONTAMINATION"
  | "SEMANTIC_COLOR_COLLISION"
  | "CONTEXT_CONFLICT"
  | "THEME_CONSTRAINT_CONFLICT";
// V2.5 §38：ColorRole —— 颜色在 UI 语境中的语义角色。
export type ColorRole =
  | "primary"
  | "secondary"
  | "accent"
  | "action"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "background"
  | "surface"
  | "border"
  | "text";
// V2.5 §36：Surface Area Awareness（UI 工程约束，非视觉心理物理模型）。
export type SurfaceRole =
  | "canvas"
  | "surface"
  | "raised"
  | "overlay"
  | "border";
export type SurfaceArea = "large" | "medium" | "small";
export interface SurfaceContext {
  role: SurfaceRole;
  area: SurfaceArea;
}
/**
 * V2.5 §38：ColorContext —— Cleanliness 语义的颜色上下文。
 * 注意：color.ts 中另有计算上下文名 ColorContext（CalculationContext 扩展），
 * 该内部接口无外部使用点；本接口按规范语义导出。
 */
export interface ColorContext {
  color: OKLCH;
  role: ColorRole;
  theme: ThemeMode;
  background?: OKLCH;
  area?: SurfaceArea;
}
// V2.5 §40：Metric —— 独立指标，不合并为单一审美分数（§6）。
export interface Metric {
  value: number;
  status: "pass" | "warning" | "fail";
  reason?: string;
}
// V2.5 §39：Cleanliness Validation 输出。
export interface ColorQualityResult {
  valid: boolean;
  hueStability: Metric;
  chromaAdequacy: Metric;
  lightnessAdequacy: Metric;
  gamutEfficiency: Metric;
  perceptualSeparation: Metric;
  contextCompatibility: Metric;
}
// V2.5 §19：Hue Stability 三态结果。
export interface HueStabilityResult {
  deviation: number;
  status: "pass" | "warning" | "fail";
}
// V2.5 §32：Role Pair Matrix 的单条约束。
export interface ColorRoleConstraint {
  foreground: string;
  background: string;
  minContrast?: number;
  minDeltaEOK?: number;
  maxDeltaEOK?: number;
}
// V2.5 §7：Quality Envelope —— 给定 L/H/Role/Theme 的合理 Chroma 区间。
export interface ChromaEnvelope {
  min: number;
  max: number;
}
// V2.5 §22：Gamut Loss 五档分类（工程初始阈值，可经真实 UI 数据校准）。
export type GamutLossLevel =
  | "excellent"
  | "acceptable"
  | "warning"
  | "significant"
  | "severe";
// V2.5 §75：约束冲突记录 —— Requested / Actual / Reason 必须保留（§76）。
export interface QualityConflict {
  code: QualityErrorCode;
  message: string;
  requested: OKLCH;
  actual: OKLCH;
  reason: string;
}
// V2.5 §50–§51：resolveChroma 的解析明细（Initial Estimate → 最终 C）。
export type ChromaReason =
  | "within-envelope"
  | "quality-envelope-clamp"
  | "gamut-clamp"
  | "quality-and-gamut-clamp"
  | "generation-failure";
export interface ChromaResolution {
  chroma: number;
  requested: number;
  iterations: number;
  status: "converged" | "generation-failure";
  reason: ChromaReason;
  envelope: ChromaEnvelope;
  srgbCapacity: number;
  p3Capacity: number;
}
// PALETTE-01 §42：默认约束放松优先级（顺序即优先级从高到低）。
export const DEFAULT_CONSTRAINT_PRIORITY: readonly ConstraintPriority[] = [
  "semantic-role",
  "lightness-structure",
  "gamut-validity",
  "contrast",
  "hue-stability",
  "chroma-preservation",
];

// ═══════════════════════════════════════════════════════════════════════════════
// CUS-IMPLEMENTATION-01 规范定义类型（非冲突新增）
// ═══════════════════════════════════════════════════════════════════════════════

// §12 推荐内部结构
export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

// §17 辅助
export interface GamutProfile {
  space: "srgb" | "display-p3";
}

// §18 PaletteProfile（与 V2Palette 不同名，不冲突）
export interface PaletteProfile {
  lightness: V2LightnessProfile;
  chroma: V2ChromaProfile;
  hue: V2HueProfile;
  trajectory: V2TrajectoryProfile;
}

// §20 辅助
export interface PaletteTrajectory {
  points: OklchColor[];
  parameter: number[];
}
export interface PaletteValidation {
  valid: boolean;
  errors: string[];
}

// §21 辅助
export interface ColorAdjustment {
  type: string;
  delta: number;
  reason: string;
}

// §23 辅助
export interface ThemeContext {
  mode: ThemeMode;
}
export interface SemanticTokenMap {
  [key: string]: string | OklchColor;
}
export interface ComponentTokenMap {
  [key: string]: string;
}
export interface ThemeValidation {
  valid: boolean;
  errors: string[];
}

// §24 七子 Profile（全部新增）
export interface BrandSemanticProfile {
  strategy: "harmonious" | "distinct";
}
export interface NeutralSemanticProfile {
  chromaLimit: number;
}
export interface FunctionalSemanticProfile {
  hueMapping: Record<string, number>;
}
export interface TextSemanticProfile {
  minContrast: number;
}
export interface SurfaceSemanticProfile {
  lightnessOffset: number;
}
export interface BorderSemanticProfile {
  chromaScale: number;
}
export interface FocusSemanticProfile {
  ringWidth: number;
  contrast: number;
}

// §40-§41 Dirty Zone（全新类型，规范三态）
export type DirtyZoneStatus = "CLEAR" | "WARNING" | "DIRTY";
export type DirtyZoneReason =
  | "LOW_CHROMA_LOW_LIGHTNESS"
  | "LOW_CHROMA_MID_LIGHTNESS"
  | "GAMUT_BOUNDARY"
  | "CONTEXT_DEPENDENT";
export interface DirtyZoneResult {
  status: DirtyZoneStatus;
  risk: number;
  reasons: DirtyZoneReason[];
}

// §23 SemanticPaletteRequest
export interface SemanticPaletteRequest {
  palette: V2Palette;
  semanticProfile: V2SemanticProfile;
  context: ThemeContext;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUS-IMPLEMENTATION-01 规范定义类型（Phase 5：使用 Phase 4 腾出的名称）
// ═══════════════════════════════════════════════════════════════════════════════

// §12 Color（规范接口，与 V2Color 不同构）
export interface Color {
  space: ColorSpace;
  coordinates: readonly number[];
}

// §17 辅助
export type GamutStatus = "IN_GAMUT" | "OUT_OF_GAMUT" | "NEAR_BOUNDARY";

// §20 Palette（规范接口，与 V2Palette 不同构）
export interface Palette {
  anchor: OklchColor;
  colors: PaletteColor[];
  trajectory: PaletteTrajectory;
  validation: PaletteValidation;
}

// §21 PaletteColor（规范接口，与 V2PaletteColor 不同构）
export interface PaletteColor {
  id: string;
  color: OklchColor;
  t: number;
  gamut: GamutStatus;
  dirtyZone: DirtyZoneStatus;
  adjustments: ColorAdjustment[];
}

// §25 SemanticColor（规范接口，与 V2SemanticColor 不同构）
export interface SemanticColor {
  token: string;
  color: OklchColor;
  source: string;
  role: SemanticRole;
}

// §17 PaletteRequest（规范接口，与 V2PaletteRequest 不同构）
export interface PaletteRequest {
  anchor: OklchColor;
  profile: PaletteProfile;
  gamut: GamutProfile;
}

// §19 Profiles（规范接口，与 V2*Profile 不同构）
export interface LightnessProfile {
  stops: number[];
}
export interface ChromaProfile {
  mode: "CONSTANT" | "ADAPTIVE";
}
export interface HueProfile {
  mode: "ANCHOR" | "ADAPTIVE";
}
export interface TrajectoryProfile {
  dirtyZoneRouting: boolean;
  gamutRouting: boolean;
}

// §24 SemanticProfile（规范接口，与 V2SemanticProfile 不同构）
export interface SemanticProfile {
  brand: BrandSemanticProfile;
  neutral: NeutralSemanticProfile;
  functional: FunctionalSemanticProfile;
  text: TextSemanticProfile;
  surface: SurfaceSemanticProfile;
  border: BorderSemanticProfile;
  focus: FocusSemanticProfile;
}

// §28 Theme（规范接口，与 V2Theme 不同构）
export interface Theme {
  id: string;
  mode: ThemeMode;
  semantic: SemanticTokenMap;
  components: ComponentTokenMap;
  validation: ThemeValidation;
}

// ============================================================================
// CUS-IMPLEMENTATION-02 规范兼容层（与 V2 引擎类型并存）
// ============================================================================

// §8 RGB 带 space（规范形态，与现有 RGB 并存）
export type TaggedRGB = RGB & { space: RGBSpace };

// §24 Gamut 别名
export type Gamut = RGBSpace;

// §23 GamutEngine 接口
export interface GamutEngine {
  isInGamut(color: OKLCH, gamut: Gamut): boolean;
  maxChroma(l: number, h: number, gamut: Gamut): number;
  mapToGamut(color: OKLCH, gamut: Gamut): OKLCH;
}

// §31 ColorAnchor（规范形态，与 explorer.ts 的 UX 版本并存）
export interface SpecColorAnchor {
  id: string;
  color: OklchColor;
  source: 'USER' | 'IMPORTED';
  committed: boolean;
}

// §36 PalettePoint
export interface PalettePoint {
  id: string;
  t: number;
  color: OklchColor;
  requested: OklchColor;
  gamut: GamutStatus;
  dirtyZone: DirtyZoneResult;
  adjustments: SpecAdjustment[];
}

// §37 Adjustment（规范命名，与引擎 AdjustmentType 并存）
export type SpecAdjustment =
  | { type: 'CHROMA_REDUCTION'; amount: number }
  | { type: 'HUE_SHIFT'; amount: number }
  | { type: 'LIGHTNESS_SHIFT'; amount: number };

// §39 DirtyZoneEngine 接口
export interface DirtyZoneEngine {
  evaluate(color: OklchColor): DirtyZoneResult;
}

// §37 AdjustmentType → SpecAdjustment 映射
export function toSpecAdjustment(type: AdjustmentType, amount: number): SpecAdjustment | null {
  switch (type) {
    case 'CHROMA_REDUCTION': return { type: 'CHROMA_REDUCTION', amount };
    case 'HUE_COMPENSATION': return { type: 'HUE_SHIFT', amount };
    case 'LIGHTNESS_ADJUSTMENT': return { type: 'LIGHTNESS_SHIFT', amount };
    case 'DIRTY_ZONE_REROUTE': return null; // 无规范对应
  }
}
