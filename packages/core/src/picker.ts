// CUS-IMPLEMENTATION-04 §28–§29/§36/§66：AnchorPicker 与 CoordinateMapper 公开 API。
import type { Oklab } from "./oklab";
import type { ColorSelectionResult, SliceDefinition } from "./explorer";
import { rayVolumeIntersect } from "./volume";
import type { Ray3 } from "./volume";

/**
 * CUS-IMPLEMENTATION-04 §36：屏幕坐标 ↔ OKLab 坐标映射。
 *
 * 3D 与 2D 分别实现此接口：
 * - 3D：经 Camera 投影矩阵将屏幕坐标转为射线，再与 Volume 求交。
 * - 2D：切片平面上的正交逆映射。
 */
export interface CoordinateMapper {
  /** 屏幕坐标 → OKLab（不在有效区域时返回 null）。 */
  screenToOklab(x: number, y: number): Oklab | null;
  /** OKLab → 屏幕坐标。 */
  oklabToScreen(color: Oklab): { x: number; y: number };
}

/**
 * CUS-IMPLEMENTATION-04 §28：锚点拾取器。
 *
 * 将屏幕坐标转换为 ColorSelectionResult（含 gamut/dirtyZone/source）。
 * 内部使用 CoordinateMapper 完成坐标转换，再经依赖注入获取 gamut/dirtyZone。
 */
export class AnchorPicker {
  private _mapper: CoordinateMapper;
  private _source: ColorSelectionResult["source"];

  constructor(
    mapper: CoordinateMapper,
    source: ColorSelectionResult["source"] = "3D_PICK",
  ) {
    this._mapper = mapper;
    this._source = source;
  }

  /** §28：拾取屏幕坐标处的颜色（返回 null 表示无有效交点）。 */
  pick(
    screenX: number,
    screenY: number,
    deps?: {
      oklabToOklch?: (p: Oklab) => { l: number; c: number; h: number | null };
      gamutOf?: (p: Oklab, target: "srgb" | "display-p3") => "IN_GAMUT" | "NEAR_BOUNDARY" | "OUT_OF_GAMUT";
      dirtyOf?: (p: Oklab) => "CLEAR" | "WARNING" | "DIRTY";
    },
  ): ColorSelectionResult | null {
    const color = this._mapper.screenToOklab(screenX, screenY);
    if (!color) return null;

    const toOklch = deps?.oklabToOklch ?? defaultOklabToOklch;
    const oklch = toOklch(color);
    const gamutOf = deps?.gamutOf ?? (() => "IN_GAMUT" as const);
    const dirtyOf = deps?.dirtyOf ?? (() => "CLEAR" as const);

    return {
      color,
      oklch,
      gamut: {
        srgb: gamutOf(color, "srgb"),
        p3: gamutOf(color, "display-p3"),
      },
      dirtyZone: dirtyOf(color),
      source: this._source,
    };
  }

  /** 更换坐标映射器（例如从 3D 切换到 2D 切片）。 */
  setMapper(mapper: CoordinateMapper): void {
    this._mapper = mapper;
  }

  get mapper(): CoordinateMapper {
    return this._mapper;
  }
}

// ─── 内置 CoordinateMapper 实现 ─────────────────────────────────────────────

/**
 * 3D CoordinateMapper：使用 slab-method 射线与 Volume 包围盒求交。
 *
 * 需要外部提供从屏幕坐标到射线的转换（由 Camera 投影矩阵决定）。
 * 本类只负责 screen → Ray3 → rayVolumeIntersect → Oklab 的管线。
 */
export class VolumeCoordinateMapper implements CoordinateMapper {
  private _screenToRay: (x: number, y: number) => Ray3;

  constructor(screenToRay: (x: number, y: number) => Ray3) {
    this._screenToRay = screenToRay;
  }

  screenToOklab(x: number, y: number): Oklab | null {
    const ray = this._screenToRay(x, y);
    return rayVolumeIntersect(ray);
  }

  oklabToScreen(color: Oklab): { x: number; y: number } {
    // 正向映射需要 Camera 投影矩阵的逆——由 screenToRay 的提供者实现。
    // 此处返回 OKLab 的 a/b 作为近似屏幕坐标（3D 正交投影下的简化）。
    return { x: color.a, y: color.b };
  }
}

/**
 * 2D Slice CoordinateMapper：切片平面上的正交逆映射。
 *
 * axis="L"：屏幕 X→a, Y→b（L 固定）
 * axis="a"：屏幕 X→L, Y→b（a 固定）
 * axis="b"：屏幕 X→L, Y→a（b 固定）
 */
export class SliceCoordinateMapper implements CoordinateMapper {
  private _slice: SliceDefinition;
  private _bounds: { horizontal: [number, number]; vertical: [number, number] };
  private _viewport: { width: number; height: number };

  constructor(
    slice: SliceDefinition,
    bounds: { horizontal: [number, number]; vertical: [number, number] },
    viewport: { width: number; height: number },
  ) {
    this._slice = slice;
    this._bounds = bounds;
    this._viewport = viewport;
  }

  screenToOklab(x: number, y: number): Oklab | null {
    const u = x / this._viewport.width;
    const v = y / this._viewport.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const h = this._bounds.horizontal[0] + (this._bounds.horizontal[1] - this._bounds.horizontal[0]) * u;
    const vert = this._bounds.vertical[0] + (this._bounds.vertical[1] - this._bounds.vertical[0]) * v;
    if (this._slice.axis === "L") return { l: this._slice.value, a: h, b: vert };
    if (this._slice.axis === "a") return { l: h, a: this._slice.value, b: vert };
    return { l: h, a: vert, b: this._slice.value };
  }

  oklabToScreen(color: Oklab): { x: number; y: number } {
    let h: number;
    let v: number;
    if (this._slice.axis === "L") {
      h = color.a;
      v = color.b;
    } else if (this._slice.axis === "a") {
      h = color.l;
      v = color.b;
    } else {
      h = color.l;
      v = color.a;
    }
    const [hMin, hMax] = this._bounds.horizontal;
    const [vMin, vMax] = this._bounds.vertical;
    return {
      x: ((h - hMin) / (hMax - hMin)) * this._viewport.width,
      y: ((v - vMin) / (vMax - vMin)) * this._viewport.height,
    };
  }

  /** 更新切片定义（切片值变更时）。 */
  setSlice(slice: SliceDefinition): void {
    this._slice = slice;
  }
}

// ─── 内部工具 ───────────────────────────────────────────────────────────────

function defaultOklabToOklch(p: Oklab): { l: number; c: number; h: number | null } {
  const c = Math.hypot(p.a, p.b);
  if (c < 1e-7) return { l: p.l, c: 0, h: null };
  let h = (Math.atan2(p.b, p.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: p.l, c, h };
}
