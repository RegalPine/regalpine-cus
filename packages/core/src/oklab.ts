import type { V2Color, RGBSpace } from "./color";
import type { RGB } from "./rgb";
import type { XYZ } from "./xyz";
import type { Lab } from "./lab";
import type { LCh } from "./lch";

export interface Oklab {
  l: number;
  a: number;
  b: number;
}
export interface OKLCH {
  l: number;
  c: number;
  h: number | null;
}
export const OK_ACHROMATIC_EPSILON = 1e-7;
export const OK_BRAND_EPSILON = 1e-4;
export interface PerceptualCoordinates {
  rgb: RGB;
  xyz: XYZ;
  lab: Lab;
  lch: LCh;
  oklab: Oklab;
  oklch: OKLCH;
  alpha: number;
}
export interface ColorOutput {
  space: RGBSpace;
  mapped: OKLCH;
  calculation: PerceptualCoordinates;
  rendered: PerceptualCoordinates;
  css: string;
  inGamut: boolean;
  chromaReduction: number;
}
export interface ColorProvenance {
  id: string;
  model: "oklch";
  source: string;
  mode?: "light" | "dark";
  family?: string;
  step?: number | string;
  parent?: string;
  parameters: Record<string, number | string | null>;
  // PALETTE-01 §33–§34：轨迹参数与来源锚点。
  /** 该颜色在 Palette Trajectory 中的参数 t ∈ [0,1]。 */
  trajectoryT?: number;
  /** 来源锚点标识（如 "primary-anchor"、"secondary-shift"）。 */
  sourceAnchor?: string;
  /** §33 来源标签。 */
  colorSource?: "PRIMARY_ANCHOR" | "DERIVED" | "MANUAL";
}
// V1.1 §30：V2Color 内部模型的显式色域合规摘要（与 outputs.{srgb,displayP3}.inGamut 一致）。
export interface ColorGamutStatus {
  srgb: { inGamut: boolean; chromaReduction: number };
  displayP3: { inGamut: boolean; chromaReduction: number };
}
/** PALETTE-01 §33：调色板颜色的色域状态标签。 */
export type PaletteGamutStatus = "IN_GAMUT" | "OUT_OF_GAMUT";
export interface PaletteGamutLabel {
  srgb: PaletteGamutStatus;
  p3: PaletteGamutStatus;
}
/** V2 设计与渲染分离；继承字段仅为 sRGB/CIELAB 参考兼容值。 */
export interface UIColor extends V2Color {
  design: OKLCH;
  outputs: { srgb: ColorOutput; displayP3: ColorOutput };
  /** V1.1 §30：显式色域合规摘要。 */
  gamut?: ColorGamutStatus;
  /** PALETTE-01 §33：调色板级色域标签（简化三态）。 */
  paletteGamut?: PaletteGamutLabel;
  provenance: ColorProvenance;
}
export interface OutputOptions {
  srgb: boolean;
  displayP3: boolean;
}
/** 以下为 CUS 参考实现策略，不是 WCAG 或 V2 规范固定阈值。 */
export const OK_VALIDATION_DEFAULTS = Object.freeze({
  adjacent: 0.02,
  state: 0.02,
  semanticFail: 0.06,
  semanticWarn: 0.1,
  hueFail: 30,
  hueWarn: 45,
});
