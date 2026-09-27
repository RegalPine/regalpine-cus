// CUS-IMPLEMENTATION-04 §44/§66：ColorVolumeRenderer / SliceRenderer 公开 API。
//
// V1 阶段核心层不直接依赖 three.js；此类定义规范要求的 API 契约（§66），
// 具体 WebGL 实现由 Designer 层注入（Phase 5 将 three.js 逻辑从 ColorSpace3D
// 提取到此处）。当前方法体为占位——调用方通过 setData/render/dispose 驱动。
import type { Oklab } from "./oklab";
import type { ColorVolumeData, SliceData, SlicePlane } from "./explorer";

/**
 * CUS-IMPLEMENTATION-04 §44：Volume 渲染器生命周期。
 *
 * ```ts
 * const renderer = new ColorVolumeRenderer(canvas);
 * renderer.setData(volumeData);
 * renderer.render();
 * return () => renderer.dispose();
 * ```
 */
export class ColorVolumeRenderer {
  private _canvas: HTMLCanvasElement;
  private _data: ColorVolumeData | null = null;
  private _anchor: Oklab | null = null;
  private _disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
  }

  /** §44：设置/替换 Volume 数据（TypedArray 主结构）。 */
  setData(data: ColorVolumeData): void {
    this._data = data;
  }

  /** §44：执行一帧渲染。由 requestAnimationFrame 循环调用，而非 React setState。 */
  render(): void {
    if (this._disposed || !this._data) return;
    // Phase 5：接入 three.js InstancedMesh 点云渲染（从 ColorSpace3D 提取）。
  }

  /** 设置当前锚点（用于高亮显示）。 */
  setAnchor(anchor: Oklab): void {
    this._anchor = anchor;
  }

  /** §44：释放 GPU 资源（Buffer / Shader / Texture / Framebuffer）。 */
  dispose(): void {
    this._disposed = true;
    this._data = null;
    this._anchor = null;
  }

  /** 当前绑定的 canvas（只读）。 */
  get canvas(): HTMLCanvasElement {
    return this._canvas;
  }

  /** 当前数据（只读，供测试/调试）。 */
  get data(): ColorVolumeData | null {
    return this._data;
  }

  /** 当前锚点（只读）。 */
  get anchor(): Oklab | null {
    return this._anchor;
  }
}

/**
 * CUS-IMPLEMENTATION-04 §23/§66：Slice 渲染器。
 *
 * 负责将 SliceData TypedArray 渲染到 2D canvas（或 3D 场景中的切片平面）。
 */
export class SliceRenderer {
  private _data: SliceData | null = null;
  private _plane: SlicePlane | null = null;
  private _disposed = false;

  /** 设置/替换切片数据。 */
  setData(data: SliceData): void {
    this._data = data;
  }

  /** 设置切片平面（用于 3D 中的平面可视化）。 */
  setPlane(plane: SlicePlane): void {
    this._plane = plane;
  }

  /** 执行一帧渲染。 */
  render(): void {
    if (this._disposed || !this._data) return;
    // Phase 5：接入切片渲染逻辑。
  }

  /** 释放资源。 */
  dispose(): void {
    this._disposed = true;
    this._data = null;
    this._plane = null;
  }

  get data(): SliceData | null {
    return this._data;
  }

  get plane(): SlicePlane | null {
    return this._plane;
  }
}
