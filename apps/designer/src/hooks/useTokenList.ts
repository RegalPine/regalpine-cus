/**
 * Token 列表构建 hook。
 * 从 GeneratedTheme 提取扁平化的色板 Token 列表。
 */
import { useMemo } from "react";
import type { V2Color, GeneratedTheme } from "@cus/core";
import { colorDesign } from "@cus/color";

export interface TokenEntry {
  name: string;
  color: V2Color;
  oklch: ReturnType<typeof colorDesign>;
  label?: string;
}

/** 从调色板提取 Token 列表 */
export function useTokenList(
  result: GeneratedTheme,
  mode: "primary-neutral" | "primary-semantic" | "all" = "primary-neutral",
): TokenEntry[] {
  return useMemo(() => {
    const entries: TokenEntry[] = [];
    for (const [step, color] of Object.entries(result.palette.primary)) {
      entries.push({ name: `primary.${step}`, color, oklch: colorDesign(color) });
    }
    if (mode === "primary-neutral" || mode === "all") {
      for (const [step, color] of Object.entries(result.palette.neutral)) {
        entries.push({ name: `neutral.${step}`, color, oklch: colorDesign(color) });
      }
    }
    if (mode === "primary-semantic" || mode === "all") {
      for (const [role, entry] of Object.entries(result.palette.semantic)) {
        entries.push({ name: `semantic.${role}`, color: entry.base, oklch: colorDesign(entry.base) });
      }
    }
    return entries;
  }, [result, mode]);
}
