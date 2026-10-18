/**
 * useT — I18N 翻译 hook。
 *
 * 用法：
 *   const t = useT();
 *   t("brand.title")  // → "品牌色彩与感知参数" 或 "Brand Color & Perception"
 *
 * 支持模板替换：
 *   t("export.downloaded", { format: "CSS" })
 */
import { useCallback } from "react";
import { useI18NStore, type Locale } from "./store";
import { translations, type TranslationKey } from "./translations";

export function useT() {
  const locale = useI18NStore((s) => s.locale);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      let text: string = translations[locale]?.[key] ?? translations["en-US"]?.[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale],
  );

  return t;
}

/** 获取当前 locale（非响应式，用于非组件代码） */
export function getLocale(): Locale {
  return useI18NStore.getState().locale;
}
