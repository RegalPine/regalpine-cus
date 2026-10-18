/**
 * useThemeEngine — 核心主题计算引擎（渐进验证）。
 * 从 App.tsx L185-218 提取。
 *
 * §41 渐进验证：输入变化即时走 createTheme 快速路径（沿用最近一次
 * 验证报告），交互停止 150ms 后执行全量验证（generateValidatedTheme）。
 */
import { useEffect, useMemo, useState } from "react";
import type { BrandInput, GeneratedTheme, ThemeOptions } from "@cus/core";
import { createTheme } from "@cus/theme";
import { generateValidatedTheme } from "@cus/validation";

export interface ThemeEngineResult {
  /** 当前生效的生成主题（含快速路径 + 全量验证） */
  result: GeneratedTheme;
  /** 全量验证报告（与 result.validation 相同，方便外部直接引用） */
  validation: GeneratedTheme["validation"];
}

export function useThemeEngine(
  interactiveInput: BrandInput | string,
  designOptions: ThemeOptions,
): ThemeEngineResult {
  // 延迟验证的快照：记录上次执行全量验证时的输入 + 选项
  const [validated, setValidated] = useState({
    input: interactiveInput,
    options: designOptions,
  });

  // 全量验证结果（仅在 validated 变化时重算）
  const fullResult = useMemo(
    () => generateValidatedTheme(validated.input, validated.options),
    [validated],
  );

  // 输入/选项变化后 150ms 触发全量验证
  useEffect(() => {
    if (
      interactiveInput === validated.input &&
      designOptions === validated.options
    )
      return;
    const timer = window.setTimeout(
      () => setValidated({ input: interactiveInput, options: designOptions }),
      150,
    );
    return () => window.clearTimeout(timer);
  }, [interactiveInput, designOptions, validated]);

  // 合成结果：输入匹配时用全量验证，否则走快速路径 + 沿用上次验证报告
  const result = useMemo(
    () =>
      interactiveInput === validated.input &&
      designOptions === validated.options
        ? fullResult
        : {
            ...createTheme(interactiveInput, designOptions),
            validation: fullResult.validation,
          },
    [interactiveInput, designOptions, validated, fullResult],
  );

  return { result, validation: result.validation };
}
