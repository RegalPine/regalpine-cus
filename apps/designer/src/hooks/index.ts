/**
 * Hooks 统一导出。
 * Phase 1：从 App.tsx 提取的核心逻辑 hooks。
 */
export { useThemeEngine } from "./useThemeEngine";
export type { ThemeEngineResult } from "./useThemeEngine";
export { useBrandInput, fmtValue } from "./useBrandInput";
export type { BrandInputActions } from "./useBrandInput";
export { usePersistence } from "./usePersistence";
export { useGamutSupport } from "./useGamutSupport";
export type { GamutSupport } from "./useGamutSupport";
export { useSliderRAF } from "./useSliderRAF";
export type { SliderRAF } from "./useSliderRAF";
