/**
 * Brand Store — 品牌色 + OKLCH + 设计偏好 + 色域空间。
 * 从 App.tsx useState 提取，Phase 2 正式接入。
 */
import { create } from "zustand";
import type { BrandInput, OKLCH, RGBSpace, ThemeOptions } from "@cus/core";

export interface BrandState {
  brand: string;
  draft: string;
  canonicalInput: BrandInput | undefined;
  lch: OKLCH;
  space: RGBSpace;
  designOptions: ThemeOptions;
  error: string;

  setBrand: (brand: string) => void;
  setDraft: (draft: string) => void;
  setCanonicalInput: (input: BrandInput | undefined) => void;
  setLch: (lch: OKLCH) => void;
  setSpace: (space: RGBSpace) => void;
  setDesignOptions: (options: ThemeOptions) => void;
  setError: (error: string) => void;
}

export const useBrandStore = create<BrandState>((set) => ({
  brand: "#2457C5",
  draft: "#2457C5",
  canonicalInput: undefined,
  lch: { l: 0.486, c: 0.15, h: 264 },
  space: "srgb",
  designOptions: {},
  error: "",

  setBrand: (brand) => set({ brand }),
  setDraft: (draft) => set({ draft }),
  setCanonicalInput: (canonicalInput) => set({ canonicalInput }),
  setLch: (lch) => set({ lch }),
  setSpace: (space) => set({ space }),
  setDesignOptions: (designOptions) => set({ designOptions }),
  setError: (error) => set({ error }),
}));
