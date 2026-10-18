/**
 * I18N Store — 全局语言状态管理。
 * 使用 Zustand 管理当前 locale，支持 zh-CN / en-US 切换。
 */
import { create } from "zustand";

export type Locale = "zh-CN" | "en-US";

export interface I18NState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export const useI18NStore = create<I18NState>((set, get) => ({
  locale: (typeof navigator !== "undefined" && navigator.language?.startsWith("zh")) ? "zh-CN" : "en-US",
  setLocale: (locale) => set({ locale }),
  toggleLocale: () => set({ locale: get().locale === "zh-CN" ? "en-US" : "zh-CN" }),
}));
