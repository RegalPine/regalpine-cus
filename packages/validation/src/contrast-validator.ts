/**
 * 对比度验证工具 —— WCAG 2.1 AA/AAA 标准检查。
 * 
 * 设计原则（参见 PHASE4_THEME_TOKEN_SPEC.md §3）：
 * - 正文文本（<18pt）：AA ≥4.5:1，AAA ≥7:1
 * - 大字文本（≥18pt）：AA ≥3:1，AAA ≥4.5:1
 * - UI 组件边框：AA ≥3:1
 * - 支持批量验证所有前景/背景组合
 */

import { contrastRatio, lchToRgb } from "@cus/color";
import type { RGBA } from "@cus/core";

// ─── 类型定义 ───────────────────────────────────────────────────────────────

/**
 * WCAG 2.1 合规级别。
 */
export type WCAGLevel = "AA" | "AAA" | "FAIL";

/**
 * 对比度验证结果。
 */
export interface ContrastValidationResult {
  /** 前景色标识 */
  foreground: string;
  /** 背景色标识 */
  background: string;
  /** 实际对比度值 */
  ratio: number;
  /** 要求的最低对比度 */
  required: number;
  /** 合规级别 */
  level: WCAGLevel;
  /** 是否通过 */
  pass: boolean;
  /** 场景类型 */
  scenario: ContrastScenario;
}

/**
 * 对比度检查场景。
 */
export type ContrastScenario =
  | "body-text"        // 正文文本（<18pt）
  | "large-text"       // 大字文本（≥18pt 或 ≥14pt 加粗）
  | "ui-component"     // UI 组件边框
  | "icon";            // 图标

/**
 * 对比度要求配置。
 */
export interface ContrastRequirement {
  scenario: ContrastScenario;
  minAA: number;
  minAAA: number;
}

/**
 * 批量验证输入。
 */
export interface ContrastCheckInput {
  foreground: string | RGBA;
  background: string | RGBA;
  scenario: ContrastScenario;
  fgName?: string;
  bgName?: string;
}

// ─── WCAG 2.1 标准要求 ──────────────────────────────────────────────────────

/**
 * WCAG 2.1 对比度要求（基于场景）。
 */
export const WCAG_REQUIREMENTS: Record<ContrastScenario, ContrastRequirement> = {
  "body-text": {
    scenario: "body-text",
    minAA: 4.5,
    minAAA: 7,
  },
  "large-text": {
    scenario: "large-text",
    minAA: 3,
    minAAA: 4.5,
  },
  "ui-component": {
    scenario: "ui-component",
    minAA: 3,
    minAAA: 4.5,
  },
  "icon": {
    scenario: "icon",
    minAA: 3,
    minAAA: 4.5,
  },
};

// ─── 核心验证函数 ────────────────────────────────────────────────────────────

/**
 * 验证单个前景/背景组合的对比度。
 * 
 * @example
 * ```typescript
 * const result = validateContrast(
 *   { l: 0.15, c: 0, h: 0 },  // 深色文字
 *   { l: 0.98, c: 0, h: 0 },  // 浅色背景
 *   "body-text"
 * );
 * 
 * console.log(result.ratio);   // 约 17.4:1
 * console.log(result.level);   // "AAA"
 * console.log(result.pass);    // true
 * ```
 */
export function validateContrast(
  foreground: string | RGBA,
  background: string | RGBA,
  scenario: ContrastScenario = "body-text",
  fgName = "foreground",
  bgName = "background",
): ContrastValidationResult {
  const requirement = WCAG_REQUIREMENTS[scenario];
  const ratio = contrastRatio(foreground, background);
  
  let level: WCAGLevel;
  let pass: boolean;
  
  if (ratio >= requirement.minAAA) {
    level = "AAA";
    pass = true;
  } else if (ratio >= requirement.minAA) {
    level = "AA";
    pass = true;
  } else {
    level = "FAIL";
    pass = false;
  }
  
  return {
    foreground: fgName,
    background: bgName,
    ratio: Math.round(ratio * 100) / 100,
    required: requirement.minAA,
    level,
    pass,
    scenario,
  };
}

/**
 * 批量验证多个前景/背景组合。
 * 
 * @example
 * ```typescript
 * const results = batchValidateContrast([
 *   { foreground: textPrimary, background: surfaceDefault, scenario: "body-text" },
 *   { foreground: textSecondary, background: surfaceRaised, scenario: "body-text" },
 *   { foreground: borderFocus, background: surfaceDefault, scenario: "ui-component" },
 * ]);
 * 
 * const failed = results.filter(r => !r.pass);
 * ```
 */
export function batchValidateContrast(
  inputs: ContrastCheckInput[],
): ContrastValidationResult[] {
  return inputs.map((input) =>
    validateContrast(
      input.foreground,
      input.background,
      input.scenario,
      input.fgName ?? "foreground",
      input.bgName ?? "background",
    ),
  );
}

/**
 * 验证语义色阶的所有对比度组合。
 * 
 * 检查矩阵（参见 PHASE4_THEME_TOKEN_SPEC.md §3.2）：
 * - functional.*.foreground × functional.*.soft
 * - functional.*.base × surface.default (Light/Dark)
 * - functional.*.500 × surface.default
 * - functional.*.500 × surface.raised
 */
export function validateSemanticContrast(
  semanticColors: {
    [role: string]: {
      base: RGBA;
      soft: RGBA;
      foreground: RGBA;
      scale: Record<number, RGBA>;
    };
  },
  surfaces: {
    default: RGBA;
    raised: RGBA;
    sunken: RGBA;
  },
  mode: "light" | "dark" = "light",
): ContrastValidationResult[] {
  const results: ContrastValidationResult[] = [];
  const surfaceName = mode === "dark" ? "surface.dark" : "surface.light";
  
  for (const [role, colors] of Object.entries(semanticColors)) {
    // 1. foreground × soft（用于 soft 变体上的文字）
    results.push(
      validateContrast(
        colors.foreground,
        colors.soft,
        "body-text",
        `${role}.foreground`,
        `${role}.soft`,
      ),
    );
    
    // 2. base × surface（用于实心按钮背景上的文字）
    const textLch = mode === "dark" ? { l: 0.95, c: 0, h: 0 } : { l: 0.15, c: 0, h: 0 };
    const textRgb = lchToRgb(textLch);
    results.push(
      validateContrast(
        textRgb,
        colors.base,
        "body-text",
        mode === "dark" ? "text.light" : "text.dark",
        `${role}.base`,
      ),
    );
    
    // 3. 500 阶 × surface.default
    if (colors.scale[500]) {
      results.push(
        validateContrast(
          colors.scale[500],
          surfaces.default,
          "ui-component",
          `${role}.500`,
          `${surfaceName}.default`,
        ),
      );
    }
    
    // 4. 500 阶 × surface.raised
    if (colors.scale[500]) {
      results.push(
        validateContrast(
          colors.scale[500],
          surfaces.raised,
          "ui-component",
          `${role}.500`,
          `${surfaceName}.raised`,
        ),
      );
    }
  }
  
  return results;
}

/**
 * 验证主题的所有文本对比度组合。
 * 
 * 检查矩阵（参见 PHASE4_THEME_TOKEN_SPEC.md §3.2）：
 * - text.primary × surface.default
 * - text.primary × surface.raised
 * - text.secondary × surface.default
 * - text.secondary × surface.raised
 * - text.muted × surface.default
 * - text.link × surface.default
 * - text.link × surface.raised
 */
export function validateThemeTextContrast(
  textColors: {
    primary: RGBA;
    secondary: RGBA;
    muted: RGBA;
    link: RGBA;
    disabled: RGBA;
  },
  surfaces: {
    default: RGBA;
    raised: RGBA;
    sunken: RGBA;
  },
): ContrastValidationResult[] {
  const results: ContrastValidationResult[] = [];
  
  // text.primary × surfaces
  results.push(
    validateContrast(textColors.primary, surfaces.default, "body-text", "text.primary", "surface.default"),
  );
  results.push(
    validateContrast(textColors.primary, surfaces.raised, "body-text", "text.primary", "surface.raised"),
  );
  
  // text.secondary × surfaces
  results.push(
    validateContrast(textColors.secondary, surfaces.default, "body-text", "text.secondary", "surface.default"),
  );
  results.push(
    validateContrast(textColors.secondary, surfaces.raised, "body-text", "text.secondary", "surface.raised"),
  );
  
  // text.muted × surface.default（允许大字场景，要求较低）
  results.push(
    validateContrast(textColors.muted, surfaces.default, "large-text", "text.muted", "surface.default"),
  );
  
  // text.link × surfaces
  results.push(
    validateContrast(textColors.link, surfaces.default, "body-text", "text.link", "surface.default"),
  );
  results.push(
    validateContrast(textColors.link, surfaces.raised, "body-text", "text.link", "surface.raised"),
  );
  
  return results;
}

/**
 * 生成对比度验证报告。
 */
export function generateContrastReport(
  results: ContrastValidationResult[],
): {
  total: number;
  passed: number;
  failed: number;
  aaCompliant: number;
  aaaCompliant: number;
  failures: ContrastValidationResult[];
} {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;
  const aaCompliant = results.filter((r) => r.level === "AA" || r.level === "AAA").length;
  const aaaCompliant = results.filter((r) => r.level === "AAA").length;
  const failures = results.filter((r) => !r.pass);
  
  return {
    total,
    passed,
    failed,
    aaCompliant,
    aaaCompliant,
    failures,
  };
}
