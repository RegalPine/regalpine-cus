import type { RGB } from "./rgb";
import type { Lab } from "./lab";
import type { LCh } from "./lch";
import type { OKLCH, UIColor, ColorProvenance } from "./oklab";

export type RGBSpace = "srgb" | "display-p3";
export type V2ColorSpace =
  | RGBSpace
  | "xyz-d65"
  | "lab"
  | "lch"
  | "oklab"
  | "oklch";
export type ColorErrorCode =
  // V2.4 §62：规范错误码。
  | "INVALID_HEX"
  | "INVALID_RGB"
  | "INVALID_OKLCH"
  | "OUT_OF_GAMUT"
  | "INVALID_THEME"
  | "INVALID_TOKEN"
  | "CONTRAST_FAILURE"
  | "PERCEPTUAL_FAILURE"
  // V2.2 兼容码（已弃用，将在后续版本移除）。
  | "INVALID_INPUT"
  | "UNSUPPORTED_COLOR_SPACE"
  | "INVALID_WHITE_POINT"
  | "INVALID_OBSERVER"
  | "NUMERICAL_ERROR"
  | "CONVERSION_ERROR"
  | "VALIDATION_ERROR";

// ─── CUS-IMPLEMENTATION-02 §75：规范错误模型 ─────────────────────────────

/** §75 规范错误码常量（与 ColorErrorCode 并存）。 */
export const CUS_ERROR_CODES = {
  INVALID_COLOR: "INVALID_COLOR",
  INVALID_PROFILE: "INVALID_PROFILE",
  INVALID_GAMUT: "INVALID_GAMUT",
  PALETTE_CONSTRAINT_CONFLICT: "PALETTE_CONSTRAINT_CONFLICT",
  THEME_CONSTRAINT_CONFLICT: "THEME_CONSTRAINT_CONFLICT",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
} as const;

export type CusErrorCode = keyof typeof CUS_ERROR_CODES;

/** §75 CusError extends Error（规范形态）。 */
export class CusError extends Error {
  constructor(
    public readonly code: CusErrorCode | ColorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CusError";
  }
}

/** ColorError 作为 CusError 的兼容子类（向后兼容）。 */
export class ColorError extends CusError {
  declare readonly code: ColorErrorCode;
  constructor(code: ColorErrorCode, message: string) {
    super(code, message);
    this.name = "ColorError";
  }
}
export interface CalculationContext {
  readonly observer: "CIE1931_2";
  readonly whitePoint: "D65";
  readonly sourceSpace: V2ColorSpace;
  readonly targetSpace: RGBSpace;
  readonly precision: "FLOAT64";
  readonly gamutMapping: "CHROMA_REDUCTION";
}
export const DEFAULT_CONTEXT: CalculationContext = Object.freeze({
  observer: "CIE1931_2",
  whitePoint: "D65",
  sourceSpace: "lch",
  targetSpace: "srgb",
  precision: "FLOAT64",
  gamutMapping: "CHROMA_REDUCTION",
});
export function createCalculationContext(
  input: Partial<CalculationContext> = {},
): CalculationContext {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ColorError("INVALID_INPUT", "计算上下文必须是对象");
  const context = { ...DEFAULT_CONTEXT, ...input };
  if (context.observer !== "CIE1931_2")
    throw new ColorError("INVALID_OBSERVER", "仅支持 CIE1931_2 观察者");
  if (context.whitePoint !== "D65")
    throw new ColorError("INVALID_WHITE_POINT", "编译上下文仅支持 D65");
  if (
    ![
      "srgb",
      "display-p3",
      "xyz-d65",
      "lab",
      "lch",
      "oklab",
      "oklch",
    ].includes(context.sourceSpace) ||
    !["srgb", "display-p3"].includes(context.targetSpace)
  )
    throw new ColorError("UNSUPPORTED_COLOR_SPACE", "不支持的源或目标颜色空间");
  if (
    context.precision !== "FLOAT64" ||
    context.gamutMapping !== "CHROMA_REDUCTION"
  )
    throw new ColorError("INVALID_INPUT", "不支持的精度或色域映射策略");
  return Object.freeze(context);
}
export interface ColorCalcContext extends CalculationContext {
  space: V2ColorSpace;
}
export interface ColorCoordinates {
  rgb: RGB;
  lab: Lab;
  lch: LCh;
}
export interface GamutOptions {
  mapping?: "chroma-reduction" | "none";
  targetSpace?: RGBSpace;
}

export interface ColorValue {
  /** V2.4 §8：OKLCH 设计坐标（主设计空间）。 */
  oklch: import("./oklab").OKLCH;
  /** sRGB 渲染值。 */
  srgb: import("./rgb").RGB;
  /** HEX 表示。 */
  hex: string;
  /** Alpha 不透明度。 */
  alpha: number;
}
export interface V2Color {
  /** 旧 API 不填这些字段，V2 UIColor 保证它们存在。 */
  design?: OKLCH;
  outputs?: UIColor["outputs"];
  provenance?: ColorProvenance;
  context: CalculationContext;
  strategy: "CHROMA_REDUCTION";
  calculation: ColorCoordinates & { alpha: number };
  hex: string;
  rgb: RGB;
  lab: Lab;
  lch: LCh;
  target: LCh;
  mapped: LCh;
  chromaReduction: number;
  alpha: number;
}
// CUS-IMPLEMENTATION-01 §13：规范公开名称（与 V2ColorSpace 同构）。
export type ColorSpace = V2ColorSpace;
