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
import { resolvedTokens, resolveToken } from "@cus/theme";

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

export type ExportFormat = "css" | "json" | "ts";
export interface ExportOptions {
  modes?: ThemeMode[];
  output?: OutputOptions;
}
export function cssVariable(
  key: string,
  layer: "primitive" | "semantic" | "component" = "semantic",
): string {
  const prefix =
    layer === "component"
      ? "--cus-component-"
      : layer === "primitive" &&
          !/^(primary|secondary|accent|neutral|success|warning|danger|info)\./.test(
            key,
          )
        ? "--cus-primitive-"
        : "--cus-color-";
  return prefix + key.replaceAll(".", "-");
}
export function themeVariables(
  tokens: ThemeTokens,
  space: RGBSpace = "srgb",
): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [key, color] of Object.entries(tokens.primitive))
    variables[cssVariable(key, "primitive")] = renderColor(color, space);
  for (const [key, token] of Object.entries(tokens.semantic))
    variables[cssVariable(key)] = `var(${cssVariable(token.ref, "primitive")})`;
  for (const [key, token] of Object.entries(tokens.component))
    variables[cssVariable(key, "component")] = `var(${cssVariable(token.ref)})`;
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
  const body = modes
    .map((mode, i) => {
      const selectors = `${i === 0 ? ":root,\n" : ""}[data-theme="${mode}"]`;
      const vars = Object.entries(themeVariables(result.theme[mode]!))
        .map(([k, v]) => `  ${k}: ${v};`)
        .join("\n");
      return `${selectors} {\n  color-scheme: ${mode};\n${vars}\n}`;
    })
    .join("\n\n");
  const output = selectedOutput(result, options);
  const p3 = output.displayP3
    ? modes
        .map((mode, i) => {
          const vars = Object.entries(result.theme[mode]!.primitive)
            .map(
              ([key, color]) =>
                `    ${cssVariable(key, "primitive")}: ${renderColor(color, "display-p3")};`,
            )
            .join("\n");
          return `${i === 0 ? ":root,\n" : ""}[data-theme="${mode}"] {\n${vars}\n}`;
        })
        .join("\n")
    : "";
  return `/* CUS 2.5 · OKLCH / D65 · sRGB 回退始终保留 */\n${body}\n${p3 ? `\n@supports (color: color(display-p3 1 0 0)) {\n  @media (color-gamut: p3) {\n${p3}\n  }\n}\n` : ""}`;
}
function selectedOutput(
  result: GeneratedTheme,
  options: ExportOptions,
): OutputOptions {
  return parseThemeOptions({
    output: options.output ??
      result.options?.output ?? { srgb: true, displayP3: true },
  }).output!;
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
  return {
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
      outputs: output.displayP3 ? ["srgb", "display-p3"] : ["srgb"],
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
    tokens: selectOutputs(
      Object.fromEntries(modes.map((mode) => [mode, result.theme[mode]!])),
      output.displayP3,
    ),
    // CUS-IMPLEMENTATION-01 §67：规范 themes 字段（与 tokens 并存）。
    themes: selectOutputs(
      Object.fromEntries(modes.map((mode) => [mode, result.theme[mode]!])),
      output.displayP3,
    ),
    // CUS-IMPLEMENTATION-01 §67：品牌锚点 OKLCH。
    anchor: result.palette?.brandAnchor
      ? { l: result.palette.brandAnchor.l, c: result.palette.brandAnchor.c, h: result.palette.brandAnchor.h ?? 0 }
      : result.brand.lch
        ? { l: result.brand.lch.l, c: result.brand.lch.c, h: result.brand.lch.h ?? 0 }
        : undefined,
    resolvedOutputs: Object.fromEntries(
      modes.map((mode) => [
        mode,
        Object.fromEntries(
          (output.displayP3 ? ["srgb", "display-p3"] : ["srgb"]).map(
            (space) => [
              space,
              Object.fromEntries(
                (["semantic", "component"] as const).map((layer) => [
                  layer,
                  Object.fromEntries(
                    Object.keys(result.theme[mode]![layer]).map((key) => [
                      key,
                      renderColor(
                        resolveToken(result.theme[mode]!, key, layer),
                        space as RGBSpace,
                      ),
                    ]),
                  ),
                ]),
              ),
            ],
          ),
        ),
      ]),
    ),
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
}
export const exportJSON = (
  result: GeneratedTheme,
  options: ExportOptions = {},
): string => JSON.stringify(exportObject(result, options), null, 2) + "\n";
export function exportTypeScript(
  result: GeneratedTheme,
  options: ExportOptions = {},
): string {
  return `// CUS 2.5 自动生成；修改品牌配置后重新生成。\nexport const colors = ${JSON.stringify(exportObject(result, options), null, 2)} as const;\n\nexport type CusTheme = typeof colors;\n`;
}
export function exportTheme(
  result: GeneratedTheme,
  format: ExportFormat,
  options: ExportOptions = {},
): string {
  return format === "css"
    ? exportCSS(result, options)
    : format === "json"
      ? exportJSON(result, options)
      : exportTypeScript(result, options);
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
