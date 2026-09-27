/**
 * CUS-IMPLEMENTATION-03 §27：Zustand Store — Explorer 状态管理。
 * Store 只保存 UI 状态，不保存算法缓存（符合 §28）。
 */
import { create } from "zustand";
import type {
  BrandInput,
  V2Color,
  ColorAnchor,
  OKLCH,
  RGBSpace,
  ThemeOptions,
  InteractionMode,
  SliceDefinition,
} from "@cus/core";

type PreviewMode = "light" | "dark" | "split";
type Density = "comfortable" | "compact" | "dense";

export interface ExplorerState {
  // §27 UI 状态
  brand: string;
  draft: string;
  canonicalInput: BrandInput | undefined;
  lch: OKLCH;
  space: RGBSpace;
  mode: PreviewMode;
  recent: string[];
  designOptions: ThemeOptions;
  tab: string;
  candidate: ColorAnchor | null;
  density: Density;
  error: string;
  toast: string;
  inspected: { name: string; color: V2Color } | null;
  exporting: boolean;
  storageOk: boolean;

  // CUS-IMPLEMENTATION-04 §50：Volume Explorer 视图状态（从 ColorSpaceView useState 迁移）。
  projection: "3D" | "SLICE";
  slice: SliceDefinition;
  showGamut: boolean;
  showDirtyZone: boolean;
  interaction: InteractionMode;

  // Actions
  setBrand: (brand: string) => void;
  setDraft: (draft: string) => void;
  setCanonicalInput: (input: BrandInput | undefined) => void;
  setLch: (lch: OKLCH) => void;
  setSpace: (space: RGBSpace) => void;
  setMode: (mode: PreviewMode) => void;
  setRecent: (recent: string[]) => void;
  setDesignOptions: (options: ThemeOptions) => void;
  setTab: (tab: string) => void;
  setCandidate: (candidate: ColorAnchor | null) => void;
  setDensity: (density: Density) => void;
  setError: (error: string) => void;
  setToast: (toast: string) => void;
  setInspected: (inspected: { name: string; color: V2Color } | null) => void;
  setExporting: (exporting: boolean) => void;
  setStorageOk: (storageOk: boolean) => void;
  setProjection: (projection: "3D" | "SLICE") => void;
  setSlice: (slice: SliceDefinition) => void;
  setShowGamut: (showGamut: boolean) => void;
  setShowDirtyZone: (showDirtyZone: boolean) => void;
  setInteraction: (interaction: InteractionMode) => void;
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  // Initial state
  brand: "#2457C5",
  draft: "#2457C5",
  canonicalInput: undefined,
  lch: { l: 0.486, c: 0.15, h: 264 },
  space: "srgb",
  mode: "split",
  recent: [],
  designOptions: {},
  tab: "preview",
  candidate: null,
  density: "comfortable",
  error: "",
  toast: "",
  inspected: null,
  exporting: false,
  storageOk: true,

  // CUS-IMPLEMENTATION-04 §50：初始视图状态。
  projection: "3D",
  slice: { axis: "L", value: 0.62 },
  showGamut: true,
  showDirtyZone: true,
  interaction: "IDLE",

  // Actions
  setBrand: (brand) => set({ brand }),
  setDraft: (draft) => set({ draft }),
  setCanonicalInput: (canonicalInput) => set({ canonicalInput }),
  setLch: (lch) => set({ lch }),
  setSpace: (space) => set({ space }),
  setMode: (mode) => set({ mode }),
  setRecent: (recent) => set({ recent }),
  setDesignOptions: (designOptions) => set({ designOptions }),
  setTab: (tab) => set({ tab }),
  setCandidate: (candidate) => set({ candidate }),
  setDensity: (density) => set({ density }),
  setError: (error) => set({ error }),
  setToast: (toast) => set({ toast }),
  setInspected: (inspected) => set({ inspected }),
  setExporting: (exporting) => set({ exporting }),
  setStorageOk: (storageOk) => set({ storageOk }),
  setProjection: (projection) => set({ projection }),
  setSlice: (slice) => set({ slice }),
  setShowGamut: (showGamut) => set({ showGamut }),
  setShowDirtyZone: (showDirtyZone) => set({ showDirtyZone }),
  setInteraction: (interaction) => set({ interaction }),
}));
