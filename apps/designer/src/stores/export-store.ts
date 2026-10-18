/**
 * Export Store — 导出格式 + 命名规范 + Tree-shaking + Schema 校验配置。
 */
import { create } from "zustand";

export type ExportFormat = "css" | "tailwind" | "dtcg" | "figma" | "monorepo";
export type NamingConvention = "kebab" | "camel" | "snake";

export interface ExportState {
  format: ExportFormat;
  namingConvention: NamingConvention;
  treeShaking: boolean;
  schemaValidation: boolean;

  setFormat: (format: ExportFormat) => void;
  setNamingConvention: (naming: NamingConvention) => void;
  setTreeShaking: (enabled: boolean) => void;
  setSchemaValidation: (enabled: boolean) => void;
}

export const useExportStore = create<ExportState>((set) => ({
  format: "css",
  namingConvention: "kebab",
  treeShaking: true,
  schemaValidation: true,

  setFormat: (format) => set({ format }),
  setNamingConvention: (namingConvention) => set({ namingConvention }),
  setTreeShaking: (treeShaking) => set({ treeShaking }),
  setSchemaValidation: (schemaValidation) => set({ schemaValidation }),
}));
