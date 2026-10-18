/**
 * usePersistence — localStorage 加载/保存。
 *
 * 模块加载时从 localStorage 读取并同步到各 Store（仅一次）；
 * 运行时监听关键状态变化自动保存。
 */
import { useEffect } from "react";
import type { ThemeOptions, RGBSpace, BrandInput } from "@cus/core";
import { parseThemeOptions } from "@cus/core";
import { parseHex, createBrandProfile } from "@cus/color";
import { useBrandStore } from "../stores/brand-store";
import { useViewStore, type PreviewMode, type Density } from "../stores/view-store";

const STORAGE_KEY = "cus-designer-v2";
const DEFAULT_BRAND = "#2457C5";

interface SavedSettings {
  brand: string;
  input?: BrandInput;
  mode: PreviewMode;
  recent: string[];
  options: ThemeOptions;
  space: RGBSpace;
  density: Density;
}

/** 从 localStorage 读取并校验保存的设置 */
function loadSettings(): SavedSettings {
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem("cus-designer-v1") ??
        "{}",
    );
    parseHex(stored.brand);
    return {
      brand: stored.brand,
      space: stored.space === "display-p3" ? "display-p3" : "srgb",
      density: (["comfortable", "compact", "dense"] as const).includes(
        stored.density,
      )
        ? stored.density
        : "comfortable",
      ...(stored.input
        ? { input: createBrandProfile(stored.input).input }
        : {}),
      mode: ["light", "dark", "split"].includes(stored.mode)
        ? stored.mode
        : "split",
      recent: Array.isArray(stored.recent)
        ? stored.recent
            .filter(
              (c: unknown) =>
                typeof c === "string" &&
                /^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(c),
            )
            .slice(0, 5)
        : [],
      options: parseThemeOptions(stored.options),
    };
  } catch {
    return {
      brand: DEFAULT_BRAND,
      mode: "split",
      recent: [],
      options: {},
      space: "srgb",
      density: "comfortable",
    };
  }
}

// ── 模块加载时立即初始化 stores（在 React 渲染之前） ──
const _settings = loadSettings();
useBrandStore.setState({
  brand: _settings.brand,
  draft: _settings.brand,
  canonicalInput: _settings.input,
  lch: createBrandProfile(_settings.input ?? _settings.brand).oklch,
  space: _settings.space,
  designOptions: _settings.options,
});
useViewStore.setState({
  mode: _settings.mode,
  density: _settings.density,
  recent: _settings.recent,
});

/** 自动保存 hook — 监听状态变化写入 localStorage */
export function usePersistence() {
  const brand = useBrandStore((s) => s.brand);
  const canonicalInput = useBrandStore((s) => s.canonicalInput);
  const space = useBrandStore((s) => s.space);
  const designOptions = useBrandStore((s) => s.designOptions);
  const mode = useViewStore((s) => s.mode);
  const recent = useViewStore((s) => s.recent);
  const density = useViewStore((s) => s.density);
  const setStorageOk = useViewStore((s) => s.setStorageOk);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          brand,
          input: canonicalInput,
          version: "2.2",
          designSpace: "oklch",
          space,
          mode,
          recent,
          options: designOptions,
          density,
        }),
      );
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, [brand, canonicalInput, mode, recent, designOptions, space, density, setStorageOk]);
}
