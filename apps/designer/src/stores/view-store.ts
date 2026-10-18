/**
 * View Store — 预览模式 + 密度 + 最近主题 + 存储状态。
 */
import { create } from "zustand";

export type PreviewMode = "light" | "dark" | "split";
export type Density = "comfortable" | "compact" | "dense";

export interface ViewState {
  mode: PreviewMode;
  density: Density;
  recent: string[];
  storageOk: boolean;

  setMode: (mode: PreviewMode) => void;
  setDensity: (density: Density) => void;
  setRecent: (recent: string[]) => void;
  setStorageOk: (ok: boolean) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  mode: "split",
  density: "comfortable",
  recent: [],
  storageOk: true,

  setMode: (mode) => set({ mode }),
  setDensity: (density) => set({ density }),
  setRecent: (recent) => set({ recent }),
  setStorageOk: (storageOk) => set({ storageOk }),
}));
