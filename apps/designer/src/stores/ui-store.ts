/**
 * UI Store — Toast + Modal Inspector + 导出状态 + 候选色。
 */
import { create } from "zustand";
import type { V2Color, ColorAnchor } from "@cus/core";

export interface UIState {
  toast: string;
  inspected: { name: string; color: V2Color } | null;
  exporting: boolean;
  candidate: ColorAnchor | null;

  setToast: (toast: string) => void;
  setInspected: (inspected: { name: string; color: V2Color } | null) => void;
  setExporting: (exporting: boolean) => void;
  setCandidate: (candidate: ColorAnchor | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  toast: "",
  inspected: null,
  exporting: false,
  candidate: null,

  setToast: (toast) => set({ toast }),
  setInspected: (inspected) => set({ inspected }),
  setExporting: (exporting) => set({ exporting }),
  setCandidate: (candidate) => set({ candidate }),
}));
