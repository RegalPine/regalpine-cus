/**
 * Gamut Store — 色域可视化状态（projection, slice, camera 等）。
 * 从 explorer-store.ts 的 Volume Explorer 字段迁移。
 */
import { create } from "zustand";
import type { SliceDefinition, InteractionMode } from "@cus/core";

export interface GamutState {
  projection: "3D" | "SLICE";
  slice: SliceDefinition;
  showGamut: boolean;
  showDirtyZone: boolean;
  interaction: InteractionMode;

  setProjection: (projection: "3D" | "SLICE") => void;
  setSlice: (slice: SliceDefinition) => void;
  setShowGamut: (show: boolean) => void;
  setShowDirtyZone: (show: boolean) => void;
  setInteraction: (interaction: InteractionMode) => void;
}

export const useGamutStore = create<GamutState>((set) => ({
  projection: "3D",
  slice: { axis: "L", value: 0.62 },
  showGamut: true,
  showDirtyZone: true,
  interaction: "IDLE",

  setProjection: (projection) => set({ projection }),
  setSlice: (slice) => set({ slice }),
  setShowGamut: (showGamut) => set({ showGamut }),
  setShowDirtyZone: (showDirtyZone) => set({ showDirtyZone }),
  setInteraction: (interaction) => set({ interaction }),
}));
