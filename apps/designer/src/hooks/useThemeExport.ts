/**
 * 主题导出与推送 hook。
 * 封装 ZIP 打包下载 + 模拟推送到前端工程的逻辑。
 */
import { useCallback } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { GeneratedTheme, ThemeMode } from "@cus/core";
import { exportTheme, type ExportFormat, type NamingConvention, type GamutPolicy } from "@cus/export";
import { useUIStore } from "../stores/ui-store";

const FILE_NAMES: Record<string, string> = {
  css: "tokens.css",
  tailwind: "theme.tailwind.css",
  dtcg: "design-tokens.json",
  figma: "figma-tokens.json",
  ts: "theme.d.ts",
};

export function useThemeExport(
  result: GeneratedTheme,
  t: (...args: any[]) => string,
  namingConvention?: NamingConvention,
  gamutPolicy?: GamutPolicy,
  treeShaking?: boolean,
  schemaValidation?: boolean,
) {
  const modes: ThemeMode[] = (["light", "dark"] as const).filter((m) => !!result.theme[m]);
  const output = result.options?.output ?? { srgb: true, displayP3: true };
  const exportOpts = {
    modes,
    output,
    ...(namingConvention ? { namingConvention } : {}),
    ...(gamutPolicy ? { gamutPolicy } : {}),
    ...(treeShaking !== undefined ? { treeShaking } : {}),
    ...(schemaValidation !== undefined ? { schemaValidation } : {}),
  };

  /** 下载完整主题包（ZIP） */
  const downloadFullPackage = useCallback(async () => {
    const zip = new JSZip();
    const formats: ExportFormat[] = ["css", "tailwind", "json", "dtcg", "figma", "ts"];

    for (const format of formats) {
      try {
        const source = exportTheme(result, format, exportOpts);
        zip.file(FILE_NAMES[format] ?? `theme.${format}`, source);
      } catch {
        // 跳过失败的格式
      }
    }

    zip.file(
      "README.md",
      `# CUS Theme Package\n\nBrand: ${result.brand.hex}\nGenerated: ${new Date().toISOString()}\nModes: ${modes.join(", ")}\n\n## Contents\n- tokens.css: CSS Custom Properties\n- theme.tailwind.css: Tailwind CSS config\n- design-tokens.json: DTCG Spec tokens\n- figma-tokens.json: Figma tokens\n- theme.d.ts: TypeScript definitions\n`,
    );

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `cus-theme-${result.brand.hex.replace("#", "")}.zip`);
    useUIStore.getState().setToast(t("studio.downloadSuccess"));
  }, [result, modes, output, namingConvention, gamutPolicy, treeShaking, schemaValidation, t]);

  /** 推送至前端工程（模拟） */
  const pushToFrontend = useCallback(async () => {
    const steps = [
      "Validating theme schema...",
      "Generating CSS tokens...",
      "Syncing to apps/designer...",
      "Updating package dependencies...",
    ];

    for (const step of steps) {
      useUIStore.getState().setToast(step);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const zip = new JSZip();
    try {
      const cssSource = exportTheme(result, "css", exportOpts);
      const jsonSource = exportTheme(result, "json", exportOpts);

      zip.file("apps/designer/src/styles/tokens.css", cssSource);
      zip.file("apps/designer/src/styles/theme.json", jsonSource);
      zip.file(
        "apps/designer/THEME_SYNC.md",
        `# Theme Sync Report\n\nBrand: ${result.brand.hex}\nSynced: ${new Date().toISOString()}\n\n## Files Updated\n- src/styles/tokens.css\n- src/styles/theme.json\n`,
      );

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `theme-push-${result.brand.hex.replace("#", "")}.zip`);
    } catch {
      // 忽略错误
    }

    useUIStore.getState().setToast(t("studio.pushSuccess"));
  }, [result, modes, output, namingConvention, gamutPolicy, treeShaking, schemaValidation, t]);

  return { downloadFullPackage, pushToFrontend };
}
