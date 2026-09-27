/**
 * CUS-IMPLEMENTATION-01 §9：规范适配层。
 *
 * 提供 V2 引擎类型 → 规范类型的转换函数：
 * - toSpecPalette(V2Palette): Palette
 * - toSpecTheme(V2Theme): Theme
 * - toSpecSemanticColors(SemanticPalette): SemanticColor[]
 */
import type {
  V2Palette,
  V2Theme,
  V2Color,
  SemanticPalette,
  Palette,
  PaletteColor,
  Theme,
  SemanticColor,
  OklchColor,
  PaletteTrajectory,
  PaletteValidation,
  ThemeValidation,
  DirtyZoneStatus,
  SemanticRole,
} from "./index";

// ─── V2Color → OklchColor ────────────────────────────────────────────────────

function v2ColorToOklch(v2: V2Color): OklchColor {
  if (v2.design) {
    return { l: v2.design.l, c: v2.design.c, h: v2.design.h ?? 0 };
  }
  return { l: v2.lch.l, c: v2.lch.c, h: v2.lch.h ?? 0 };
}

// ─── V2Palette → Palette ─────────────────────────────────────────────────────

function toSpecPaletteColor(v2: V2Color, step: number, family: string): PaletteColor {
  return {
    id: `${family}.${step}`,
    color: v2ColorToOklch(v2),
    t: step / 950,
    gamut: v2.chromaReduction > 0.1 ? "NEAR_BOUNDARY" : "IN_GAMUT",
    dirtyZone: "CLEAR" as DirtyZoneStatus,
    adjustments: v2.chromaReduction > 0
      ? [{ type: "CHROMA_REDUCTION", delta: v2.chromaReduction, reason: "gamut-clamp" }]
      : [],
  };
}

/**
 * 将引擎 V2Palette 转换为规范 Palette。
 */
export function toSpecPalette(v2: V2Palette): Palette {
  const specColors: PaletteColor[] = [];

  for (const family of ["primary", "secondary", "accent"] as const) {
    for (const [step, color] of Object.entries(v2[family])) {
      specColors.push(toSpecPaletteColor(color, Number(step), family));
    }
  }

  const trajectory: PaletteTrajectory = {
    points: specColors.map((c) => c.color),
    parameter: specColors.map((c) => c.t),
  };

  const validation: PaletteValidation = {
    valid: true,
    errors: [],
  };

  const anchor: OklchColor = v2.brandAnchor
    ? { l: v2.brandAnchor.l, c: v2.brandAnchor.c, h: v2.brandAnchor.h ?? 0 }
    : v2.primary[500]
      ? v2ColorToOklch(v2.primary[500])
      : { l: 0.5, c: 0.1, h: 250 };

  return { anchor, colors: specColors, trajectory, validation };
}

// ─── V2Theme → Theme ─────────────────────────────────────────────────────────

/**
 * 将引擎 V2Theme 转换为规范 Theme（取 light 模式，缺省取 dark）。
 */
export function toSpecTheme(v2: V2Theme): Theme {
  const tokens = v2.light ?? v2.dark;
  if (!tokens) {
    return {
      id: "empty",
      mode: "light",
      semantic: {},
      components: {},
      validation: { valid: false, errors: ["No theme tokens available"] },
    };
  }

  const mode = v2.light ? "light" : "dark";
  const semantic: Record<string, string> = {};
  for (const [key, token] of Object.entries(tokens.semantic)) {
    semantic[key] = token.ref ?? key;
  }

  const components: Record<string, string> = {};
  for (const [key, token] of Object.entries(tokens.component)) {
    components[key] = token.ref ?? key;
  }

  const validation: ThemeValidation = { valid: true, errors: [] };

  return { id: `theme-${mode}`, mode, semantic, components, validation };
}

// ─── SemanticPalette → SemanticColor[] ───────────────────────────────────────

/**
 * 将引擎 SemanticPalette (Record<SemanticRole, V2SemanticColor>) 转换为规范 SemanticColor[]。
 */
export function toSpecSemanticColors(palette: SemanticPalette): SemanticColor[] {
  const results: SemanticColor[] = [];
  for (const [role, v2sc] of Object.entries(palette) as [SemanticRole, SemanticPalette[SemanticRole]][]) {
    for (const variant of ["base", "soft", "foreground", "border"] as const) {
      const color = v2sc[variant];
      if (color) {
        results.push({
          token: `color.semantic.${role}.${variant}`,
          color: v2ColorToOklch(color),
          source: `palette.semantic.${role}.${variant}`,
          role,
        });
      }
    }
  }
  return results;
}
