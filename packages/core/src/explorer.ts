// ─── CUS-UX-01 §32–§39 / CUS-UX-02：Color Explorer 域模型、视图模型与标准事件契约 ──
// 本模块只定义 Explorer 的数据契约与协议；色彩科学（坐标转换、色域、Dirty
// Zone、Palette 生成）由 @cus/color 与 @cus/palette 提供，经依赖注入进入工厂。
import type { V2ColorSpace } from "./color";
import type { Oklab } from "./oklab";
import type { RGB } from "./rgb";
import type { ThemeMode, ValidationStatus } from "./index";

/**
 * UX-01 §8：Explorer 工作空间 —— 复用 core 既有 ColorSpace（含 lab /
 * lch 成员）；Designer 仅提供 §8 四个工作空间：oklch / oklab / lab /
 * lch，其余成员保留给计算上下文。
 */
export type ViewMode = "space" | "slice" | "gamut" | "ui";
/** UX-01 §33：感知色彩坐标（OKLCH 时 x=L、y=C、z=H）。 */
export interface ColorCoordinate {
  space: V2ColorSpace;
  x: number;
  y: number;
  z: number;
}
/** CUS-IMPLEMENTATION-04 §51：ColorAnchor 工厂（自动生成 id，缺省 source=USER, committed=false）。 */
let _anchorIdSeq = 0;
export function createColorAnchor(
  patch: { l: number; c: number; h: number | null } & Partial<{
    id: string;
    source: "USER" | "IMPORTED";
    committed: boolean;
  }>,
): ColorAnchor {
  return {
    id: patch.id ?? `anchor-${++_anchorIdSeq}`,
    space: "oklch",
    l: patch.l,
    c: patch.c,
    h: patch.h,
    source: patch.source ?? "USER",
    committed: patch.committed ?? false,
  };
}
/** UX-01 §15–§16：颜色锚点（Candidate 与 Committed 共用此感知坐标模型）。 */
export interface ColorAnchor {
  /** CUS-IMPLEMENTATION-04 §51：唯一标识。 */
  id: string;
  space: "oklch";
  l: number;
  c: number;
  h: number | null;
  /** CUS-IMPLEMENTATION-04 §51：来源标记。 */
  source: "USER" | "IMPORTED";
  /** CUS-IMPLEMENTATION-04 §51：是否已提交（非候选）。 */
  committed: boolean;
}
/** UX-01 §10/§34：视图轴定义（切片模式含固定轴与固定值）。 */
export interface AxisDefinition {
  horizontal: string;
  vertical: string;
  fixed?: string;
  fixedValue?: number;
}
/** UX-01 §12：Gamut 状态三态。 */
export type GamutOverlayStatus =
  | "IN_GAMUT"
  | "NEAR_GAMUT_BOUNDARY"
  | "OUT_OF_GAMUT";
/** UX-01 §34：Gamut 叠加层状态（锚点相对两个目标色域）。 */
export interface GamutOverlay {
  srgb: GamutOverlayStatus;
  displayP3: GamutOverlayStatus;
}
/** UX-01 §14/§34：Dirty Zone 叠加层（visible 由 §44 图层开关驱动）。 */
export interface DirtyZoneOverlay {
  enabled: boolean;
  visible: boolean;
}
/**
 * UX-01 §34：视图模型 record。
 * 注意：Designer 的 React 组件与本文档同名异义，导入时需使用别名。
 */
export interface ColorSpaceView {
  space: V2ColorSpace;
  mode: ViewMode;
  axes: AxisDefinition;
  gamut: GamutOverlay;
  dirtyZones: DirtyZoneOverlay;
  anchors: ColorAnchor[];
}
/** UX-01 §19：锚点约束校验状态。 */
export interface AnchorValidation {
  gamut: GamutOverlayStatus;
  perceptual: ValidationStatus;
  dirtyZone: ValidationStatus;
  contrast: ValidationStatus;
  palette: ValidationStatus;
}
/** UX-01 §22–§24：Palette 在感知空间中的轨迹预览。 */
export interface PalettePreviewProfile {
  theme?: ThemeMode;
  steps?: readonly number[];
}
export interface PalettePreviewStep {
  step: number;
  anchor: ColorAnchor;
}
export interface PalettePreview {
  anchor: ColorAnchor;
  steps: PalettePreviewStep[];
}

// ─── CUS-UX-02 §6/§11/§30–§32/§37/§43：Color Volume Explorer 数据模型 ────────
/** UX-02 §11：Gamut 三态（与 UX-01 §12 同形，为 Volume 点单独命名以对齐规范）。 */
export type GamutStatus = "IN_GAMUT" | "NEAR_BOUNDARY" | "OUT_OF_GAMUT";
/** UX-02 §6：Volume 采样点——Renderer 不自行计算颜色，所有字段由 Engine 注入。 */
export interface ColorVolumePoint {
  lab: Oklab;
  oklch: { l: number; c: number; h: number | null };
  /** CUS-IMPLEMENTATION-04 §5：最终屏幕显示值（非空间坐标）。 */
  displayColor: RGB;
  gamut: { srgb: GamutStatus; p3: GamutStatus };
  dirtyZone: "CLEAR" | "WARNING" | "DIRTY";
}
/** CUS-IMPLEMENTATION-04 §6：三维向量。 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
/** CUS-IMPLEMENTATION-04 §7：Volume 包围盒。 */
export interface VolumeBounds {
  min: Vec3;
  max: Vec3;
}
/**
 * CUS-IMPLEMENTATION-04 §9：Color Volume TypedArray 主结构。
 * 推荐使用 TypedArray 避免 Array<object> 的内存与 GC 开销（§10）。
 * - points: Float32Array，stride 3（a, l, b）
 * - colors: Float32Array，stride 3（r, g, b，displayColor）
 * - gamut: Uint8Array，stride 2（srgb, p3；0=IN, 1=NEAR, 2=OUT）
 * - dirtyZone: Uint8Array，stride 1（0=CLEAR, 1=WARNING, 2=DIRTY）
 */
export interface ColorVolumeData {
  space: "OKLAB";
  bounds: VolumeBounds;
  points: Float32Array;
  colors: Float32Array;
  gamut: Uint8Array;
  dirtyZone: Uint8Array;
  resolution: number;
}
/**
 * CUS-IMPLEMENTATION-04 §23：Slice TypedArray 主结构。
 * - points: Float32Array，stride 3
 * - colors: Float32Array，stride 3
 * - gamut: Uint8Array，stride 2
 * - dirty: Uint8Array，stride 1
 */
export interface SliceData {
  axis: "L" | "a" | "b";
  value: number;
  points: Float32Array;
  colors: Float32Array;
  gamut: Uint8Array;
  dirty: Uint8Array;
}
/** UX-02 §30：任意切片平面（V1 UI 仅提供 L/a/b 正交切片，数据模型保留扩展能力）。 */
export interface SlicePlane {
  normal: [number, number, number];
  distance: number;
}
/** UX-02 §31：切片坐标定义（V1 仅 L/a/b 三轴）。 */
export interface SliceDefinition {
  axis: "L" | "a" | "b";
  value: number;
}
/** UX-02 §33：Gamut 边界——由 GamutEngine.maxChroma(L,H,gamut) 采样得到。 */
export interface GamutBoundary {
  target: "srgb" | "display-p3";
  /** 边界折线/三角网格顶点（OKLab 坐标），由 Engine 注入。 */
  points: Oklab[];
}
/** UX-02 §12：Dirty Zone 区域——空间数据，由 Color Quality Engine 计算。 */
export interface DirtyZoneRegion {
  status: "CLEAR" | "WARNING" | "DIRTY";
  /** 区域内采样点（OKLab），用于 Overlay 渲染。 */
  points: Oklab[];
}
/** UX-02 §32：Slice Renderer 输入——Renderer 不重新计算颜色。 */
export interface SliceRenderData {
  points: ColorVolumePoint[];
  boundary: GamutBoundary[];
  dirtyZones: DirtyZoneRegion[];
  anchor?: Oklab;
  slice: SliceDefinition;
}
/** UX-02 §43：选色结果——携带来源标记，供多视图联动与提交策略区分。 */
export interface ColorSelectionResult {
  color: Oklab;
  oklch: { l: number; c: number; h: number | null };
  gamut: { srgb: GamutStatus; p3: GamutStatus };
  dirtyZone: "CLEAR" | "WARNING" | "DIRTY";
  source: "3D_PICK" | "SLICE_PICK" | "PARAMETER";
}
/** UX-02 §25：投影模式（V1 默认 Orthographic，色彩空间分析需要几何稳定性）。 */
export type ProjectionMode = "ORTHOGRAPHIC" | "PERSPECTIVE";
/** UX-02 §37：Color Explorer 完整状态（单一权威源，多视图共享 Anchor）。 */
export interface ExplorerState {
  space: "OKLAB" | "OKLCH" | "LAB" | "LCH" | "XYZ";
  projection: "3D" | "SLICE";
  cameraProjection: ProjectionMode;
  slice?: SliceDefinition;
  gamut: ("srgb" | "display-p3")[];
  showGamut: boolean;
  showDirtyZone: boolean;
  anchor: ColorAnchor;
  /** CUS-IMPLEMENTATION-04 §38：交互模式（互斥：CAMERA_ROTATE 与 ANCHOR_DRAG 不可同时）。 */
  interaction: InteractionMode;
}
/** UX-02 §45：Volume 缓存键（space:gamut:resolution[:slice]）。 */
export interface VolumeCacheKey {
  space: "OKLAB" | "OKLCH";
  gamut: ("srgb" | "display-p3")[];
  resolution: number;
  slice?: SliceDefinition;
}
/** CUS-IMPLEMENTATION-04 §11：Volume 采样分辨率档位。 */
export type VolumeResolution = 32 | 48 | 64 | 96;
/** CUS-IMPLEMENTATION-04 §38：交互模式（互斥：CAMERA_ROTATE 与 ANCHOR_DRAG 不可同时）。 */
export type InteractionMode =
  | "IDLE"
  | "CAMERA_ROTATE"
  | "CAMERA_PAN"
  | "ANCHOR_DRAG";
/** UX-02 §7–§8：Volume 采样配置（uniform + boundary refinement）。 */
export interface VolumeSampleConfig {
  /** L/a/b 各轴采样数；默认 64。 */
  resolution?: number;
  /** 是否在 Gamut/Dirty Zone 边界附近自适应细化（默认 true）。 */
  adaptive?: boolean;
  /** 自适应细化的额外层数（默认 1）。 */
  refinementLevels?: number;
  /** 目标色域（用于边界判定）。 */
  gamut?: ("srgb" | "display-p3")[];
}

// ─── §37–§39：标准交互事件 ──────────────────────────────────────────────────
export interface ColorSelectPayload {
  space: V2ColorSpace;
  coordinate: { l: number; c: number; h: number | null };
}
export interface ColorCommitPayload {
  anchor: ColorAnchor;
  validation: {
    gamut: GamutOverlayStatus;
    contrast: ValidationStatus;
    dirtyZone: ValidationStatus;
    palette: ValidationStatus;
  };
}
export interface SpaceChangePayload {
  from: V2ColorSpace;
  to: V2ColorSpace;
}
export interface SliceChangePayload {
  fixed: "l" | "c" | "h";
  value: number;
  horizontal: string;
  vertical: string;
}
export interface GamutChangePayload {
  target: "srgb" | "display-p3";
  visible: boolean;
}
export interface DirtyZoneTogglePayload {
  visible: boolean;
}
export interface PaletteUpdatePayload {
  anchor: ColorAnchor;
}
export interface ContextChangePayload {
  context: string;
}
export interface ExplorerEventPayloads {
  COLOR_HOVER: ColorSelectPayload | null;
  COLOR_SELECT: ColorSelectPayload;
  COLOR_DRAG: ColorSelectPayload;
  COLOR_COMMIT: ColorCommitPayload;
  SPACE_CHANGE: SpaceChangePayload;
  SLICE_CHANGE: SliceChangePayload;
  GAMUT_CHANGE: GamutChangePayload;
  DIRTY_ZONE_TOGGLE: DirtyZoneTogglePayload;
  PALETTE_UPDATE: PaletteUpdatePayload;
  CONTEXT_CHANGE: ContextChangePayload;
}
export type ExplorerEventType = keyof ExplorerEventPayloads;
export type ExplorerEvent = {
  [K in ExplorerEventType]: { type: K; payload: ExplorerEventPayloads[K] };
}[ExplorerEventType];
export type ExplorerListener = (event: ExplorerEvent) => void;
export interface ExplorerEventTarget {
  dispatch(event: ExplorerEvent): void;
  subscribe(listener: ExplorerListener): () => void;
}

// ─── §32：Color Explorer 接口与工厂 ─────────────────────────────────────────
export interface ColorExplorer {
  createView(
    space: V2ColorSpace,
    mode: ViewMode,
    overlay?: {
      gamut: GamutOverlay;
      dirtyZones: DirtyZoneOverlay;
      anchors: ColorAnchor[];
    },
  ): ColorSpaceView;
  select(coordinate: ColorCoordinate): ColorAnchor;
  validate(anchor: ColorAnchor): AnchorValidation;
  preview(anchor: ColorAnchor, profile?: PalettePreviewProfile): PalettePreview;
  readonly events: ExplorerEventTarget;
  /**
   * UX-02 §42：Color Selection Pipeline——从任意来源（3D 拾取 / 切片拾取 /
   * 参数输入）生成统一的 ColorSelectionResult。Renderer 不自行计算颜色。
   */
  selectFrom(
    source: ColorSelectionResult["source"],
    coordinate: ColorCoordinate | ColorAnchor,
  ): ColorSelectionResult;
  /** UX-02 §37：返回当前 Explorer 状态快照（单一权威源）。 */
  getState(): ExplorerState;
  /** UX-02 §37：更新 Explorer 状态（部分字段）。 */
  setState(patch: Partial<ExplorerState>): void;
}
export interface ColorExplorerDeps {
  /** 坐标 → 感知锚点（§16：所有输入最终转换为 Perceptual Anchor）。 */
  coordinateToAnchor(coordinate: ColorCoordinate): ColorAnchor;
  /** §12：色域三态判定。 */
  gamutStatusOf(
    anchor: ColorAnchor,
    target: "srgb" | "display-p3",
  ): GamutOverlayStatus;
  /** §14：Dirty Zone 判定（引擎权威实现）。 */
  dirtyZoneOf(anchor: ColorAnchor): boolean;
  /** §19：其余约束由宿主按当前上下文实现，缺省视为 PASS。 */
  contrastOf?(anchor: ColorAnchor): ValidationStatus;
  perceptualOf?(anchor: ColorAnchor): ValidationStatus;
  paletteStatusOf?(anchor: ColorAnchor): ValidationStatus;
  /** §22–§24：Palette 轨迹。 */
  paletteOf(anchor: ColorAnchor, profile?: PalettePreviewProfile): PalettePreview;
  axesFor?(space: V2ColorSpace, mode: ViewMode): AxisDefinition;
  /**
   * UX-02 §43：锚点 → OKLab（用于 ColorSelectionResult.color 字段）。
   * 缺省时以 OKLCH→OKLab 圆柱变换近似（a=C·cos H, b=C·sin H）。
   */
  anchorToOklab?(anchor: ColorAnchor): Oklab;
  /**
   * UX-02 §12：Dirty Zone 三态（CLEAR/WARNING/DIRTY）。
   * 缺省时由 dirtyZoneOf 布尔值映射（true→DIRTY, false→CLEAR）。
   */
  dirtyZoneStatusOf?(anchor: ColorAnchor): "CLEAR" | "WARNING" | "DIRTY";
  /** UX-02 §11：Gamut 三态（IN_GAMUT/NEAR_BOUNDARY/OUT_OF_GAMUT）。
   *  缺省时由 gamutStatusOf 映射（NEAR_GAMUT_BOUNDARY→NEAR_BOUNDARY）。 */
  gamutStatus3Of?(
    anchor: ColorAnchor,
    target: "srgb" | "display-p3",
  ): GamutStatus;
}
const DEFAULT_AXES: Partial<Record<V2ColorSpace, AxisDefinition>> = {
  oklch: { horizontal: "H", vertical: "C", fixed: "L" },
  oklab: { horizontal: "b", vertical: "a" },
  lab: { horizontal: "b*", vertical: "a*", fixed: "L*" },
  lch: { horizontal: "h°", vertical: "C*", fixed: "L*" },
};
export function createColorExplorer(
  deps: ColorExplorerDeps,
  initialState?: Partial<ExplorerState>,
): ColorExplorer {
  const listeners = new Set<ExplorerListener>();
  const events: ExplorerEventTarget = {
    dispatch: (event) => listeners.forEach((listener) => listener(event)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const anchorOf = (coordinate: ColorCoordinate): ColorAnchor => {
    if (coordinate.space === "oklch")
      return createColorAnchor({
        l: coordinate.x,
        c: coordinate.y,
        h: coordinate.z,
      });
    return deps.coordinateToAnchor(coordinate);
  };
  // UX-02 §37：Explorer 状态单一权威源（多视图共享 Anchor）。
  let state: ExplorerState = {
    space: "OKLAB",
    projection: "3D",
    cameraProjection: "ORTHOGRAPHIC",
    slice: { axis: "L", value: 0.62 },
    gamut: ["srgb", "display-p3"],
    showGamut: true,
    showDirtyZone: true,
    anchor: createColorAnchor({ l: 0.62, c: 0.18, h: 250 }),
    interaction: "IDLE",
    ...initialState,
  };
  // UX-02 §43：锚点 → OKLab（缺省以圆柱变换近似）。
  const toOklab = (anchor: ColorAnchor): Oklab => {
    if (deps.anchorToOklab) return deps.anchorToOklab(anchor);
    const h = anchor.h ?? 0;
    const rad = (h * Math.PI) / 180;
    return {
      l: anchor.l,
      a: anchor.c * Math.cos(rad),
      b: anchor.c * Math.sin(rad),
    };
  };
  const gamut3 = (
    anchor: ColorAnchor,
    target: "srgb" | "display-p3",
  ): GamutStatus => {
    if (deps.gamutStatus3Of) return deps.gamutStatus3Of(anchor, target);
    const s = deps.gamutStatusOf(anchor, target);
    return s === "NEAR_GAMUT_BOUNDARY" ? "NEAR_BOUNDARY" : s;
  };
  const dirty3 = (anchor: ColorAnchor): "CLEAR" | "WARNING" | "DIRTY" => {
    if (deps.dirtyZoneStatusOf) return deps.dirtyZoneStatusOf(anchor);
    return deps.dirtyZoneOf(anchor) ? "DIRTY" : "CLEAR";
  };
  return {
    events,
    createView(space, mode, overlay) {
      return {
        space,
        mode,
        axes:
          deps.axesFor?.(space, mode) ??
          DEFAULT_AXES[space] ?? { horizontal: "x", vertical: "y" },
        gamut: overlay?.gamut ?? { srgb: "IN_GAMUT", displayP3: "IN_GAMUT" },
        dirtyZones: overlay?.dirtyZones ?? { enabled: true, visible: false },
        anchors: overlay?.anchors ?? [],
      };
    },
    select(coordinate) {
      return anchorOf(coordinate);
    },
    validate(anchor) {
      const srgb = deps.gamutStatusOf(anchor, "srgb");
      const displayP3 = deps.gamutStatusOf(anchor, "display-p3");
      return {
        // 锚点约束以 sRGB 为基线：sRGB 域内时汇总 P3 状态，否则如实报告越界。
        gamut: srgb === "IN_GAMUT" ? displayP3 : srgb,
        perceptual: deps.perceptualOf?.(anchor) ?? "PASS",
        dirtyZone: deps.dirtyZoneOf(anchor) ? "FAIL" : "PASS",
        contrast: deps.contrastOf?.(anchor) ?? "PASS",
        palette: deps.paletteStatusOf?.(anchor) ?? "PASS",
      };
    },
    preview(anchor, profile) {
      return deps.paletteOf(anchor, profile);
    },
    // UX-02 §42：Color Selection Pipeline——统一 3D/切片/参数三来源。
    selectFrom(source, input) {
      const anchor: ColorAnchor =
        "space" in input && input.space === "oklch" && !("x" in input)
          ? (input as ColorAnchor)
          : anchorOf(input as ColorCoordinate);
      return {
        color: toOklab(anchor),
        oklch: { l: anchor.l, c: anchor.c, h: anchor.h },
        gamut: {
          srgb: gamut3(anchor, "srgb"),
          p3: gamut3(anchor, "display-p3"),
        },
        dirtyZone: dirty3(anchor),
        source,
      };
    },
    getState() {
      return state;
    },
    setState(patch) {
      state = { ...state, ...patch };
    },
  };
}
