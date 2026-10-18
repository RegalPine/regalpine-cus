/**
 * dtcg-json.ts — Design Token Community Group (DTCG) JSON 格式导出。
 * 遵循 W3C Design Tokens spec 输出标准 JSON 结构。
 */
import { renderColor, colorDesign } from "@cus/color";
import type {
  GeneratedTheme,
  ThemeMode,
  ThemeTokens,
  V2Color,
  RGBSpace,
} from "@cus/core";
import type { ExportOptions } from "./index";

interface DTCGToken {
  $value: string;
  $type: "color";
  $description?: string;
}

interface DTCGGroup {
  [key: string]: DTCGToken | DTCGGroup;
}

function colorToOklchString(color: V2Color): string {
  const d = colorDesign(color);
  return `oklch(${(d.l * 100).toFixed(1)}% ${d.c.toFixed(3)} ${d.h != null ? d.h.toFixed(1) : "none"})`;
}

function primitiveToDTCG(
  tokens: ThemeTokens,
  space: RGBSpace = "srgb",
): DTCGGroup {
  const group: DTCGGroup = {};
  for (const [key, color] of Object.entries(tokens.primitive)) {
    const parts = key.split(".");
    let target: DTCGGroup = group;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof (target[parts[i]] as DTCGToken).$value === "string") {
        target[parts[i]] = {};
      }
      target = target[parts[i]] as DTCGGroup;
    }
    const leaf = parts[parts.length - 1];
    target[leaf] = {
      $value: renderColor(color, space),
      $type: "color",
      $description: `OKLCH ${colorToOklchString(color)}`,
    };
  }
  return group;
}

function semanticToDTCG(tokens: ThemeTokens): DTCGGroup {
  const group: DTCGGroup = {};
  for (const [key, token] of Object.entries(tokens.semantic)) {
    const parts = key.split(".");
    let target: DTCGGroup = group;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof (target[parts[i]] as DTCGToken).$value === "string") {
        target[parts[i]] = {};
      }
      target = target[parts[i]] as DTCGGroup;
    }
    const leaf = parts[parts.length - 1];
    target[leaf] = {
      $value: `{${token.ref.replace(/\./g, ".")}}`,
      $type: "color",
      $description: `ref → primitive.${token.ref}`,
    };
  }
  return group;
}

function componentToDTCG(tokens: ThemeTokens): DTCGGroup {
  const group: DTCGGroup = {};
  for (const [key, token] of Object.entries(tokens.component)) {
    const parts = key.split(".");
    let target: DTCGGroup = group;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof (target[parts[i]] as DTCGToken).$value === "string") {
        target[parts[i]] = {};
      }
      target = target[parts[i]] as DTCGGroup;
    }
    const leaf = parts[parts.length - 1];
    target[leaf] = {
      $value: `{${token.ref}}`,
      $type: "color",
      $description: `ref → semantic.${token.ref}`,
    };
  }
  return group;
}

export function exportDTCGJson(
  result: GeneratedTheme,
  options: ExportOptions = {},
): string {
  const modes = (options.modes ?? (["light", "dark"] as const).filter((m) => result.theme[m])) as ThemeMode[];
  const space: RGBSpace = "srgb";

  const dtcgDoc: Record<string, unknown> = {
    $schema: "https://design-tokens.github.io/community-group/format/",
    $description: "CUS 2.5 — Design Token Community Group JSON 格式",
    brand: {
      hex: result.brand.hex,
      oklch: result.brand.lch
        ? { l: result.brand.lch.l, c: result.brand.lch.c, h: result.brand.lch.h }
        : null,
    },
    metadata: {
      system: "CUS",
      version: "2.5",
      colorSpace: "oklch",
      whitePoint: "D65",
      observer: "CIE_1931_2",
      outputs: ["srgb"],
    },
  };

  for (const mode of modes) {
    const tokens = result.theme[mode];
    if (!tokens) continue;
    dtcgDoc[mode] = {
      primitive: primitiveToDTCG(tokens, space),
      semantic: semanticToDTCG(tokens),
      component: componentToDTCG(tokens),
    };
  }

  return JSON.stringify(dtcgDoc, null, 2) + "\n";
}
