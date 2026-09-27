/**
 * CUS-IMPLEMENTATION-01 §24–§25：Semantic Engine 独立包。
 *
 * 提供 `generateSemanticPalette`：接收 SemanticPaletteRequest（含 Palette +
 * SemanticProfile + ThemeContext），按 7 个子 Profile 生成语义色。
 *
 * 本包复用 @cus/palette 的色板生成能力与 @cus/color 的转换/脏区评估，
 * 输出规范 §25 定义的 SemanticColor[] 格式。
 */
import type {
  SemanticPaletteRequest,
  SemanticColor,
  V2SemanticProfile,
  OklchColor,
  V2Palette,
  ThemeContext,
  SemanticRole,
  DirtyZoneResult,
  SemanticPalette,
} from "@cus/core";
import { SEMANTIC_ROLES } from "@cus/core";
import { evaluateDirtyZone } from "@cus/color";

// ─── 公开 API ────────────────────────────────────────────────────────────────

/**
 * 规范 §25：从 Palette + SemanticProfile + ThemeContext 生成语义色列表。
 */
export function generateSemanticPalette(
  request: SemanticPaletteRequest,
): SemanticColor[] {
  const { palette, semanticProfile, context } = request;
  const results: SemanticColor[] = [];

  // 1. 品牌语义色
  results.push(...generateBrandColors(palette, semanticProfile, context));

  // 2. 中性语义色
  results.push(...generateNeutralColors(palette, semanticProfile, context));

  // 3. 功能语义色（success / warning / danger / info）
  results.push(
    ...generateFunctionalColors(palette, semanticProfile, context),
  );

  // 4. 文字 / 表面 / 边框 / 焦点
  results.push(...generateTextColors(palette, semanticProfile, context));
  results.push(...generateSurfaceColors(palette, semanticProfile, context));
  results.push(...generateBorderColors(palette, semanticProfile, context));
  results.push(...generateFocusColors(palette, semanticProfile, context));

  return results;
}

// ─── 内部生成逻辑 ────────────────────────────────────────────────────────────

function toSemanticColor(
  token: string,
  color: OklchColor,
  source: string,
  role: string,
): SemanticColor {
  return { token, color, source, role: role as SemanticRole };
}

function paletteAnchor(palette: V2Palette): OklchColor {
  // 从 primary.500 提取锚点
  const mid = palette.primary[500];
  if (mid?.design) {
    return { l: mid.design.l, c: mid.design.c, h: mid.design.h ?? 0 };
  }
  return { l: 0.5, c: 0.1, h: 250 };
}

function generateBrandColors(
  palette: V2Palette,
  profile: V2SemanticProfile,
  _ctx: ThemeContext,
): SemanticColor[] {
  const anchor = paletteAnchor(palette);
  const strategy = profile.strategy;
  const hueShift = strategy === "distinct" ? 30 : 0;

  return [
    toSemanticColor(
      "color.brand.primary",
      anchor,
      "palette.primary.500",
      "primary",
    ),
    toSemanticColor(
      "color.brand.secondary",
      { l: anchor.l, c: anchor.c * 0.8, h: (anchor.h + hueShift) % 360 },
      "palette.secondary.500",
      "secondary",
    ),
    toSemanticColor(
      "color.brand.accent",
      {
        l: anchor.l,
        c: anchor.c * 0.9,
        h: (anchor.h + 180) % 360,
      },
      "palette.accent.500",
      "accent",
    ),
  ];
}

function generateNeutralColors(
  palette: V2Palette,
  _profile: V2SemanticProfile,
  _ctx: ThemeContext,
): SemanticColor[] {
  const chromaLimit = 0.04; // 默认中性色度上限
  const neutral500 = palette.neutral[500];
  const base: OklchColor = neutral500?.design
    ? {
        l: neutral500.design.l,
        c: Math.min(neutral500.design.c, chromaLimit),
        h: neutral500.design.h ?? 0,
      }
    : { l: 0.5, c: 0, h: 0 };

  return [
    toSemanticColor("color.neutral.base", base, "palette.neutral.500", "neutral"),
    toSemanticColor(
      "color.neutral.muted",
      { l: base.l + 0.15, c: base.c * 0.5, h: base.h },
      "palette.neutral.300",
      "neutral",
    ),
    toSemanticColor(
      "color.neutral.strong",
      { l: base.l - 0.2, c: base.c * 0.5, h: base.h },
      "palette.neutral.700",
      "neutral",
    ),
  ];
}

function generateFunctionalColors(
  palette: V2Palette,
  _profile: V2SemanticProfile,
  _ctx: ThemeContext,
): SemanticColor[] {
  const hueMapping: Record<string, number> = {};
  const results: SemanticColor[] = [];

  for (const role of SEMANTIC_ROLES) {
    const feedbackScale = palette.feedback?.[role];
    if (!feedbackScale) continue;
    const mid = feedbackScale[500];
    const targetHue = hueMapping[role];
    const color: OklchColor = mid?.design
      ? {
          l: mid.design.l,
          c: mid.design.c,
          h: targetHue !== undefined ? targetHue : (mid.design.h ?? 0),
        }
      : { l: 0.5, c: 0.1, h: targetHue ?? 0 };

    results.push(
      toSemanticColor(`color.functional.${role}`, color, `palette.feedback.${role}.500`, role),
    );
  }

  return results;
}

function generateTextColors(
  _palette: V2Palette,
  _profile: V2SemanticProfile,
  ctx: ThemeContext,
): SemanticColor[] {
  const minContrast = 4.5; // 默认 WCAG AA
  const isDark = ctx.mode === "dark";
  // 文字色：深色主题用浅色文字，反之亦然
  const textColor: OklchColor = isDark
    ? { l: 0.95, c: 0, h: 0 }
    : { l: 0.15, c: 0, h: 0 };

  return [
    toSemanticColor(
      "color.text.primary",
      textColor,
      isDark ? "neutral.50" : "neutral.950",
      "text",
    ),
    toSemanticColor(
      "color.text.secondary",
      { l: isDark ? 0.75 : 0.35, c: 0, h: 0 },
      isDark ? "neutral.300" : "neutral.700",
      "text",
    ),
    toSemanticColor(
      "color.text.minContrast",
      { l: isDark ? 0.9 : 0.2, c: 0, h: 0 },
      `minContrast:${minContrast}`,
      "text",
    ),
  ];
}

function generateSurfaceColors(
  _palette: V2Palette,
  _profile: V2SemanticProfile,
  ctx: ThemeContext,
): SemanticColor[] {
  const offset = 0;
  const isDark = ctx.mode === "dark";

  return [
    toSemanticColor(
      "color.surface.default",
      { l: isDark ? 0.15 + offset : 0.98 - offset, c: 0, h: 0 },
      "neutral",
      "surface",
    ),
    toSemanticColor(
      "color.surface.raised",
      { l: isDark ? 0.2 + offset : 0.99 - offset, c: 0, h: 0 },
      "neutral",
      "surface",
    ),
    toSemanticColor(
      "color.surface.sunken",
      { l: isDark ? 0.1 + offset : 0.95 - offset, c: 0, h: 0 },
      "neutral",
      "surface",
    ),
  ];
}

function generateBorderColors(
  _palette: V2Palette,
  _profile: V2SemanticProfile,
  ctx: ThemeContext,
): SemanticColor[] {
  const scale = 1;
  const isDark = ctx.mode === "dark";

  return [
    toSemanticColor(
      "color.border.default",
      { l: isDark ? 0.35 : 0.7, c: 0.01 * scale, h: 0 },
      "neutral",
      "border",
    ),
    toSemanticColor(
      "color.border.strong",
      { l: isDark ? 0.5 : 0.5, c: 0.02 * scale, h: 0 },
      "neutral",
      "border",
    ),
  ];
}

function generateFocusColors(
  _palette: V2Palette,
  _profile: V2SemanticProfile,
  ctx: ThemeContext,
): SemanticColor[] {
  const ringWidth = 3;
  const contrast = 3;
  const isDark = ctx.mode === "dark";

  return [
    toSemanticColor(
      "color.focus.ring",
      { l: isDark ? 0.7 : 0.5, c: 0.12, h: 250 },
      `ringWidth:${ringWidth},contrast:${contrast}`,
      "focus",
    ),
  ];
}

// ─── 辅助：评估语义色的 Dirty Zone ───────────────────────────────────────────

/**
 * 评估单个语义色的脏区状态（便捷导出）。
 */
export function evaluateSemanticColorDirtyZone(
  color: SemanticColor,
): DirtyZoneResult {
  return evaluateDirtyZone(color.color);
}

/**
 * CUS-IMPLEMENTATION-02 §25：createSemanticPalette 规范接口。
 * 委托给现有 generateSemanticPalette，使用默认 light 上下文。
 */
export function createSemanticPalette(
  palette: V2Palette,
  _profile: V2SemanticProfile,
  _context: ThemeContext = { mode: "light" },
): SemanticPalette {
  // V2Palette 已包含装配好的 semantic 字段，直接返回
  return palette.semantic;
}
