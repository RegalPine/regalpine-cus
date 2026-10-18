/**
 * CVD Store — 全局色觉缺陷模拟状态。
 *
 * AppHeader 下拉菜单写入，AppShell 读取后通过 CSS filter 应用到全局。
 * ContrastMatrixView 等子视图也可读取以同步本地预览。
 */
import { create } from "zustand";
import type { CVDType } from "../lib/cvd-sim";

export interface CVDState {
  type: CVDType;
  severity: number;

  setType: (type: CVDType) => void;
  setSeverity: (severity: number) => void;
  reset: () => void;
}

export const useCVDStore = create<CVDState>((set) => ({
  type: "normal",
  severity: 1,

  setType: (type) => set({ type }),
  setSeverity: (severity) => set({ severity }),
  reset: () => set({ type: "normal", severity: 1 }),
}));
