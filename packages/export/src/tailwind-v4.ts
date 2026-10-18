/**
 * tailwind-v4.ts — Tailwind CSS v4 @theme 格式导出。
 * 生成可直接 @import 的 Tailwind v4 主题 CSS 文件。
 */
import { renderColor } from "@cus/color";
import type {
  GeneratedTheme,
  ThemeMode,
  ThemeTokens,
  RGBSpace,
} from "@cus/core";
import type { ExportOptions } from "./index";
import { cssVariable } from "./index";

function tokensToTailwindVars(
  tokens: ThemeTokens,
  space: RGBSpace = "srgb",
): string[] {
  const lines: string[] = [];
  for (const [key, color] of Object.entries(tokens.primitive)) {
    const varName = cssVariable(key, "primitive").replace(/^--/, "");
    lines.push(`    --color-${varName}: ${renderColor(color, space)};`);
  }
  for (const [key, token] of Object.entries(tokens.semantic)) {
    const varName = cssVariable(key).replace(/^--/, "");
    lines.push(`    --color-${varName}: var(--color-${cssVariable(token.ref, "primitive").replace(/^--/, "")});`);
  }
  for (const [key, token] of Object.entries(tokens.component)) {
    const varName = cssVariable(key, "component").replace(/^--/, "");
    lines.push(`    --color-${varName}: var(--color-${cssVariable(token.ref).replace(/^--/, "")});`);
  }
  return lines;
}

export function exportTailwindV4(
  result: GeneratedTheme,
  options: ExportOptions = {},
): string {
  const modes = (options.modes ?? (["light", "dark"] as const).filter((m) => result.theme[m])) as ThemeMode[];
  const lines: string[] = [
    `/* CUS 2.5 · Tailwind CSS v4 @theme 格式 */`,
    `/* 自动生成 — 将此文件放入项目 CSS 目录并 @import */`,
    ``,
    `@import "tailwindcss";`,
    ``,
    `@theme {`,
  ];

  if (modes.includes("light") && result.theme.light) {
    lines.push(`  /* ── Light Mode Tokens ── */`);
    lines.push(...tokensToTailwindVars(result.theme.light));
  }

  if (modes.includes("dark") && result.theme.dark) {
    lines.push(``);
    lines.push(`  /* ── Dark Mode Tokens ── */`);
    lines.push(`  @media (prefers-color-scheme: dark) {`);
    lines.push(`    @theme {`);
    lines.push(...tokensToTailwindVars(result.theme.dark).map((l) => `  ${l}`));
    lines.push(`    }`);
    lines.push(`  }`);
  }

  lines.push(`}`);
  lines.push(``);
  return lines.join("\n");
}
