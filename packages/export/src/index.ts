import {
  ColorError,
  createCalculationContext,
  parseThemeOptions,
  type BrandInput,
} from "@cus/core";
import { createBrandProfile, renderColor } from "@cus/color";
import type {
  CusDesignerState,
  GeneratedTheme,
  ThemeMode,
  ThemeTokens,
  RGBSpace,
  OutputOptions,
} from "@cus/core";
import { resolvedTokens } from "@cus/theme";
import { exportTailwindV4 } from "./tailwind-v4";
import { exportDTCGJson } from "./dtcg-json";

export const CONFIG_MAX_BYTES = 10_000_000;
function selectOutputs(value: unknown, p3: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => selectOutputs(v, p3));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => p3 || key !== "displayP3")
        .map(([key, v]) => [key, selectOutputs(v, p3)]),
    );
  return value;
}

/**
 * 清理 V2Color 内部计算字段，仅保留用户面向的色彩数据。
 * 导出 JSON/TS 不需要暴露引擎内部的坐标变换、色域映射策略等元数据。
 */
function cleanColorForExport(c: Record<string, unknown>): Record<string, unknown> {
  const {
    context: _ctx,
    strategy: _st,
    calculation: _calc,
    provenance: _prov,
    design: _des,
    outputs: _out,
    target: _tgt,
    mapped: _map,
    chromaReduction: _cr,
    ...keep
  } = c;
  return keep;
}

/** 清理 ThemeTokens：仅清洗 primitive 层的 V2Color，semantic/component 为引用不变 */
function cleanTokensForExport(tokens: ThemeTokens): ThemeTokens {
  const cleanedPrimitive = {} as ThemeTokens["primitive"];
  for (const [k, v] of Object.entries(tokens.primitive)) {
    (cleanedPrimitive as Record<string, unknown>)[k] = cleanColorForExport(
      v as unknown as Record<string, unknown>,
    );
  }
  return { ...tokens, primitive: cleanedPrimitive };
}

export type ExportFormat = "css" | "json" | "ts" | "tailwind" | "dtcg" | "figma";
export type NamingConvention = "kebab-case" | "camelCase" | "dtcg-dot" | "scss-variable";
export type GamutPolicy = "dual-p3-srgb" | "srgb-strict" | "display-p3-only";
export interface ExportOptions {
  modes?: ThemeMode[];
  output?: OutputOptions;
  namingConvention?: NamingConvention;
  gamutPolicy?: GamutPolicy;
  treeShaking?: boolean;
  schemaValidation?: boolean;
}
export function cssVariable(
  key: string,
  layer: "primitive" | "semantic" | "component" = "semantic",
  naming: NamingConvention = "kebab-case",
): string {
  const base = key.replaceAll(".", "-");
  const prefix =
    layer === "component"
      ? "cus-component-"
      : layer === "primitive" &&
          !/^(primary|secondary|accent|neutral|success|warning|danger|info)-/.test(
            base,
          )
        ? "cus-primitive-"
        : "cus-color-";
  const kebab = prefix + base;
  switch (naming) {
    case "camelCase": {
      const parts = kebab.split("-");
      return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
    }
    case "dtcg-dot":
      return kebab.replaceAll("-", ".");
    case "scss-variable":
      return "$" + kebab;
    default:
      return "--" + kebab;
  }
}
export function themeVariables(
  tokens: ThemeTokens,
  space: RGBSpace = "srgb",
  naming: NamingConvention = "kebab-case",
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [key, color] of Object.entries(tokens.primitive))
    variables[cssVariable(key, "primitive", naming)] = renderColor(color, space);
  for (const [key, token] of Object.entries(tokens.semantic))
    variables[cssVariable(key, "semantic", naming)] = `var(${cssVariable(token.ref, "primitive", naming)})`;
  for (const [key, token] of Object.entries(tokens.component))
    variables[cssVariable(key, "component", naming)] = `var(${cssVariable(token.ref, "semantic", naming)})`;
  return variables;
}
function selectedModes(
  result: GeneratedTheme,
  options: ExportOptions,
): ThemeMode[] {
  const fallback = (["light", "dark"] as const).filter((m) => result.theme[m]);
  const modes = [...new Set<ThemeMode>(options.modes ?? fallback)];
  if (!modes.length || modes.some((m) => m !== "light" && m !== "dark"))
    throw new ColorError("INVALID_INPUT", "至少选择一种有效主题");
  const missing = modes.filter((m) => !result.theme[m]);
  if (missing.length)
    throw new ColorError(
      "INVALID_INPUT",
      `主题未生成，无法导出：${missing.join("、")}`,
    );
  return modes;
}
export function exportCSS(
  result: GeneratedTheme,
  options: ExportOptions = {},
): string {
  const modes = selectedModes(result, options);
  const naming = options.namingConvention ?? "kebab-case";
  const output = selectedOutput(result, options);

  // sRGB body: 仅在 output.srgb 为 true 时生成
  const body = output.srgb
    ? modes
        .map((mode, i) => {
          const selectors = `${i === 0 ? ":root,\n" : ""}[data-theme="${mode}"]`;
          const vars = Object.entries(themeVariables(result.theme[mode]!, "srgb", naming))
            .map(([k, v]) => `  ${k}: ${v};`)
            .join("\n");
          return `${selectors} {\n  color-scheme: ${mode};\n${vars}\n}`;
        })
        .join("\n\n")
    : "";

  // P3 block: 仅在 output.displayP3 为 true 时生成
  // dual-p3-srgb: P3 放入 @supports 渐进增强
  // display-p3-only: P3 作为基础输出，无需 @supports 包裹
  const p3 = output.displayP3
    ? modes
        .map((mode, i) => {
          const selectors = `${i === 0 ? ":root,\n" : ""}[data-theme="${mode}"]`;
          const vars = Object.entries(result.theme[mode]!.primitive)
            .map(
              ([key, color]) =>
                `    ${cssVariable(key, "primitive", naming)}: ${renderColor(color, "display-p3")};`,
            )
            .join("\n");
          return `${selectors} {\n${vars}\n}`;
        })
        .join("\n")
    : "";

  const comment = output.srgb && output.displayP3
    ? "/* CUS 2.5 · OKLCH / D65 · sRGB + Display P3 双输出 */"
    : output.srgb
      ? "/* CUS 2.5 · OKLCH / D65 · sRGB Only */"
      : "/* CUS 2.5 · OKLCH / D65 · Display P3 Only */";

  if (output.srgb && output.displayP3) {
    // 双输出: sRGB 为基础，P3 渐进增强
    return `${comment}\n${body}\n\n@supports (color: color(display-p3 1 0 0)) {\n  @media (color-gamut: p3) {\n${p3}\n  }\n}\n`;
  }
  if (output.displayP3 && !output.srgb) {
    // P3 唯一输出: 直接作为基础，无需 @supports
    return `${comment}\n${p3}\n`;
  }
  // sRGB 唯一输出
  return `${comment}\n${body}\n`;
}
export function selectedOutput(
  result: GeneratedTheme,
  options: ExportOptions,
): OutputOptions {
  const base = parseThemeOptions({
    output: options.output ??
      result.options?.output ?? { srgb: true, displayP3: true },
  }).output!;
  // gamutPolicy 覆盖 output 配置
  if (options.gamutPolicy === "srgb-strict") {
    return { ...base, srgb: true, displayP3: false };
  }
  if (options.gamutPolicy === "display-p3-only") {
    return { ...base, srgb: false, displayP3: true };
  }
  return base;
}
function exportObject(result: GeneratedTheme, options: ExportOptions) {
  const modes = selectedModes(result, options);
  const output = selectedOutput(result, options);
  const reportResults = result.validation.results.filter(
    (r) =>
      (!r.targetSpace || r.targetSpace === "srgb" || output.displayP3) &&
      (!/^(light|dark)\./.test(r.id) ||
        modes.some((m) => r.id.startsWith(`${m}.`))),
  );
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  reportResults.forEach((r) => counts[r.status]++);
  const validation = {
    status: counts.FAIL ? "FAIL" : counts.WARN ? "WARN" : "PASS",
    counts,
    results: reportResults,
    ...(result.validation.gamut ? { gamut: result.validation.gamut } : {}),
  };
  // 计算清理后的 tokens 一次，tokens/themes 共享引用避免 JSON 序列化重复
  let cleanedTokens: Record<string, ThemeTokens> = selectOutputs(
    Object.fromEntries(modes.map((mode) => [mode, cleanTokensForExport(result.theme[mode]!)])),
    output.displayP3,
  ) as Record<string, ThemeTokens>;
  // Tree-shaking: 移除未被 semantic/component 引用的 primitive tokens
  if (options.treeShaking) {
    const referencedPrimitives = new Set<string>();
    for (const mode of modes) {
      const theme = result.theme[mode]!;
      for (const token of Object.values(theme.semantic)) {
        referencedPrimitives.add(token.ref);
      }
      for (const token of Object.values(theme.component)) {
        // component 引用 semantic，需要递归查找
        const semanticToken = theme.semantic[token.ref];
        if (semanticToken) referencedPrimitives.add(semanticToken.ref);
      }
    }
    cleanedTokens = Object.fromEntries(
      modes.map((mode) => {
        const theme = cleanedTokens[mode]!;
        const shakenPrimitive = Object.fromEntries(
          Object.entries(theme.primitive).filter(([k]) => referencedPrimitives.has(k)),
        );
        return [mode, { ...theme, primitive: shakenPrimitive }];
      }),
    );
  }
  const obj = {
    schema: "cus-theme-1.0",
    version: "2.5",
    algorithm: "CUS-PAL",
    mathematicsVersion: "2.5",
    designSpace: "oklch",
    output,
    fallback: "sRGB 回退始终保留，包括 P3-only 导出",
    theme: { light: modes.includes("light"), dark: modes.includes("dark") },
    palettes: selectOutputs(
      Object.fromEntries(modes.map((mode) => [mode, result.palettes?.[mode]])),
      output.displayP3,
    ),
    // V1.4 §35：工程化元数据；顶层 version 保持为配置格式版本（导入兼容）。
    metadata: {
      system: "CUS",
      version: "2.5",
      colorSpace: "oklch",
      outputs: [
        ...(output.srgb ? ["srgb"] : []),
        ...(output.displayP3 ? ["display-p3"] : []),
      ],
      whitePoint: "D65",
    },
    context: result.context,
    colorSpace: { observer: "CIE_1931_2", whitePoint: "D65" },
    whitePoint: "D65",
    brand: {
      primary: result.brand.source,
      input: result.brand.input,
      profile: result.brand,
    },
    // V1.4 §5：品牌色度特征的工程化摘要。
    ...(result.brandDNA ? { brandDNA: result.brandDNA } : {}),
    modes,
    options: result.options ?? {},
    palette: selectOutputs(
      result.palettes?.[modes[0]] ?? result.palette,
      output.displayP3,
    ),
    tokens: cleanedTokens,
    // CUS-IMPLEMENTATION-01 §67：themes 与 tokens 共享同一引用，JSON 序列化不重复。
    themes: cleanedTokens,
    // CUS-IMPLEMENTATION-01 §67：品牌锚点 OKLCH。
    anchor: result.palette?.brandAnchor
      ? { l: result.palette.brandAnchor.l, c: result.palette.brandAnchor.c, h: result.palette.brandAnchor.h ?? 0 }
      : result.brand.lch
        ? { l: result.brand.lch.l, c: result.brand.lch.c, h: result.brand.lch.h ?? 0 }
        : undefined,
    resolved: Object.fromEntries(
      modes.map((mode) => [
        mode,
        {
          semantic: resolvedTokens(result.theme[mode]!),
          component: resolvedTokens(result.theme[mode]!, "component"),
        },
      ]),
    ),
    validation,
  };
  // Schema validation: 检查必要字段是否存在
  if (options.schemaValidation !== false) {
    const requiredFields = ["schema", "version", "tokens", "validation"];
    const missing = requiredFields.filter((f) => !(f in obj));
    if (missing.length > 0) {
      throw new ColorError("VALIDATION_ERROR", `导出缺少必要字段: ${missing.join(", ")}`);
    }
  }
  return obj;
}

/**
 * TypeScript 定义专用精简导出：去掉 palettes / resolved / validation / brand.profile
 * 等重型字段，仅保留类型定义所需的色彩数据结构。
 */
function exportObjectLite(result: GeneratedTheme, options: ExportOptions) {
  const modes = selectedModes(result, options);
  const output = selectedOutput(result, options);
  const cleanedTokens = selectOutputs(
    Object.fromEntries(modes.map((mode) => [mode, cleanTokensForExport(result.theme[mode]!)])),
    output.displayP3,
  );
  return {
    schema: "cus-theme-1.0",
    version: "2.5",
    algorithm: "CUS-PAL",
    mathematicsVersion: "2.5",
    designSpace: "oklch",
    output,
    theme: { light: modes.includes("light"), dark: modes.includes("dark") },
    metadata: {
      system: "CUS",
      version: "2.5",
      colorSpace: "oklch",
      outputs: [
        ...(output.srgb ? ["srgb"] : []),
        ...(output.displayP3 ? ["display-p3"] : []),
      ],
      whitePoint: "D65",
    },
    context: result.context,
    brand: {
      primary: result.brand.source,
      input: result.brand.input,
    },
    modes,
    options: result.options ?? {},
    tokens: cleanedTokens,
    themes: cleanedTokens,
    anchor: result.palette?.brandAnchor
      ? { l: result.palette.brandAnchor.l, c: result.palette.brandAnchor.c, h: result.palette.brandAnchor.h ?? 0 }
      : result.brand.lch
        ? { l: result.brand.lch.l, c: result.brand.lch.c, h: result.brand.lch.h ?? 0 }
        : undefined,
  };
}

export const exportJSON = (
  result: GeneratedTheme,
  options: ExportOptions = {},
): string => JSON.stringify(exportObject(result, options), null, 2) + "\n";
export function exportTypeScript(
  result: GeneratedTheme,
  options: ExportOptions = {},
): string {
  return `// CUS 2.5 自动生成；修改品牌配置后重新生成。\nexport const colors = ${JSON.stringify(exportObjectLite(result, options), null, 2)} as const;\n\nexport type CusTheme = typeof colors;\n`;
}
export function exportFigma(
  result: GeneratedTheme,
  options: ExportOptions = {},
): string {
  const modes = selectedModes(result, options);
  const output = selectedOutput(result, options);
  const figmaTokens: Record<string, unknown> = {};
  for (const mode of modes) {
    const theme = result.theme[mode]!;
    const modeTokens: Record<string, unknown> = {};
    for (const [key, color] of Object.entries(theme.primitive)) {
      modeTokens[key] = {
        value: renderColor(color, output.displayP3 ? "display-p3" : "srgb"),
        type: "color",
        description: `Primitive ${key} (${mode})`,
      };
    }
    for (const [key, token] of Object.entries(theme.semantic)) {
      modeTokens[key] = {
        value: `{${token.ref}}`,
        type: "color",
        description: `Semantic ${key} → ${token.ref} (${mode})`,
      };
    }
    figmaTokens[mode] = modeTokens;
  }
  return JSON.stringify(figmaTokens, null, 2) + "\n";
}

export function exportTheme(
  result: GeneratedTheme,
  format: ExportFormat,
  options: ExportOptions = {},
): string {
  switch (format) {
    case "css": return exportCSS(result, options);
    case "json": return exportJSON(result, options);
    case "ts": return exportTypeScript(result, options);
    case "tailwind": return exportTailwindV4(result, options);
    case "dtcg": return exportDTCGJson(result, options);
    case "figma": return exportFigma(result, options);
    default: return exportCSS(result, options);
  }
}
// 只读取输入配置并重新计算，不信任导入文件里的 Token 或验证结果。
export function parseThemeConfig(text: string): CusDesignerState {
  if (new TextEncoder().encode(text).length > CONFIG_MAX_BYTES)
    throw new ColorError("INVALID_INPUT", "配置文件不能超过 10 MB");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ColorError("INVALID_INPUT", "配置不是有效 JSON");
  }
  if (!value || typeof value !== "object")
    throw new ColorError("INVALID_INPUT", "配置必须为 JSON 对象");
  const obj = value as Record<string, unknown>;
  if (
    obj.version !== undefined &&
    obj.version !== "1.0" &&
    obj.version !== "2.0" &&
    obj.version !== "2.2" &&
    obj.version !== "2.4" &&
    obj.version !== "2.5"
  )
    throw new ColorError("INVALID_INPUT", "不支持此配置版本");
  if (obj.designSpace !== undefined && obj.designSpace !== "oklch")
    throw new ColorError("UNSUPPORTED_COLOR_SPACE", "设计空间必须为 OKLCH");
  if (obj.colorSpace !== undefined && obj.colorSpace !== "srgb") {
    const space = obj.colorSpace as Record<string, unknown>;
    if (
      !space ||
      typeof space !== "object" ||
      space.whitePoint !== "D65" ||
      !["CIE_1931_2", "CIE1931_2"].includes(String(space.observer))
    )
      throw new ColorError(
        "UNSUPPORTED_COLOR_SPACE",
        "需要 D65 / CIE 1931 2° 颜色上下文",
      );
  }
  const brand =
    typeof obj.brand === "string"
      ? obj.brand
      : obj.brand && typeof obj.brand === "object"
        ? (obj.brand as Record<string, unknown>).primary
        : undefined;
  const primaryInput = brand as BrandInput;
  if (
    (typeof brand !== "string" ||
      !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(brand)) &&
    !(brand && typeof brand === "object" && "oklch" in brand)
  )
    throw new ColorError("INVALID_INPUT", "配置缺少有效品牌 HEX");
  if (obj.context !== undefined) {
    const context = createCalculationContext(
      obj.context as Parameters<typeof createCalculationContext>[0],
    );
    if (obj.version === "1.0" && context.sourceSpace === "oklch")
      throw new ColorError("INVALID_INPUT", "V1 配置不能声明 V2 设计空间");
  }
  const rawInput =
    obj.brand && typeof obj.brand === "object"
      ? (obj.brand as Record<string, unknown>).input
      : undefined;
  const profile = createBrandProfile((rawInput ?? primaryInput) as BrandInput);
  const brandInput =
    rawInput === undefined && typeof primaryInput === "string"
      ? undefined
      : profile.input;
  const theme = obj.theme as Record<string, unknown> | undefined;
  if (
    theme !== undefined &&
    (!theme ||
      typeof theme !== "object" ||
      typeof theme.light !== "boolean" ||
      typeof theme.dark !== "boolean")
  )
    throw new ColorError("INVALID_INPUT", "主题开关无效");
  const parsedOptions = parseThemeOptions(obj.options);
  const modes =
    obj.modes ??
    (theme
      ? ["light", "dark"].filter((m) => theme[m])
      : ["light", "dark"].filter((m) =>
          m === "light"
            ? parsedOptions.lightMode !== false
            : parsedOptions.darkMode !== false,
        ));
  if (
    !Array.isArray(modes) ||
    !modes.length ||
    modes.some((m) => m !== "light" && m !== "dark")
  )
    throw new ColorError("INVALID_INPUT", "主题模式无效");
  const themeOptions = parsedOptions;
  const output = parseThemeOptions({
    output: obj.output ??
      themeOptions.output ?? { srgb: true, displayP3: true },
  }).output!;
  themeOptions.output = output;
  themeOptions.darkMode = modes.includes("dark");
  themeOptions.lightMode = modes.includes("light");
  return {
    brand: profile.source,
    designSpace: "oklch",
    output,
    ...(brandInput === undefined ? {} : { brandInput }),
    colorSpace: "srgb",
    generateLight: modes.includes("light"),
    generateDark: modes.includes("dark"),
    ...(Object.keys(themeOptions).length ? { options: themeOptions } : {}),
  };
}

/**
 * CUS-IMPLEMENTATION-02 §50：toCssVariables 规范接口。
 * 包装现有 exportCSS，提供简化签名。
 */
export function toCssVariables(theme: GeneratedTheme): string {
  return exportCSS(theme, { output: { srgb: true, displayP3: false } });
}

// 重新导出新格式函数供直接引用。
export { exportTailwindV4 } from "./tailwind-v4";
export { exportDTCGJson } from "./dtcg-json";
