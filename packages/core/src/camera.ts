// CUS-IMPLEMENTATION-04 §39–§40/§66：CameraController 公开 API。
//
// §39 默认 Orthographic 投影；§25 色彩空间分析需要几何稳定性。
// 本类管理相机的旋转/平移/缩放状态，不直接操作 three.js 对象——
// 由 Designer 层在渲染循环中读取 state 并同步到 THREE.Camera。

/** §39：相机投影类型。 */
export type CameraProjection = "orthographic" | "perspective";

/** 相机内部状态快照（供渲染层消费）。 */
export interface CameraState {
  projection: CameraProjection;
  /** 绕 Y 轴旋转角（弧度）。 */
  rotationY: number;
  /** 绕 X 轴旋转角（弧度）。 */
  rotationX: number;
  /** 平移偏移（世界坐标）。 */
  panX: number;
  panY: number;
  panZ: number;
  /** 缩放因子（1 = 默认）。 */
  zoom: number;
}

/** 默认初始状态：从右前上方 45° 俯瞰 Volume（§40 建议位置）。 */
const DEFAULT_STATE: CameraState = {
  projection: "orthographic",
  rotationY: Math.PI / 4,
  rotationX: Math.PI / 6,
  panX: 0,
  panY: 0,
  panZ: 0,
  zoom: 1,
};

/**
 * CUS-IMPLEMENTATION-04 §39：Camera 控制器。
 *
 * ```ts
 * const camera = new CameraController();
 * camera.rotate(0.1, 0);
 * camera.pan(0, -0.05);
 * camera.zoom(0.1);
 * camera.reset();
 * ```
 *
 * 互斥约束（§38）由 InteractionMode 状态机在 Explorer 层保证，
 * 本类只维护相机参数，不做互斥检查。
 */
export class CameraController {
  private _state: CameraState;
  private _rotationSpeed = 0.005;
  private _panSpeed = 0.002;
  private _zoomSpeed = 0.1;
  private _minZoom = 0.2;
  private _maxZoom = 5;

  constructor(initial: Partial<CameraState> = {}) {
    this._state = { ...DEFAULT_STATE, ...initial };
  }

  /** §39：旋转相机（屏幕像素增量 → 弧度增量）。 */
  rotate(dx: number, dy: number): void {
    this._state.rotationY += dx * this._rotationSpeed;
    this._state.rotationX += dy * this._rotationSpeed;
    // 限制 X 轴旋转避免万向锁
    this._state.rotationX = Math.max(
      -Math.PI / 2 + 0.01,
      Math.min(Math.PI / 2 - 0.01, this._state.rotationX),
    );
  }

  /** §39：平移相机。 */
  pan(dx: number, dy: number): void {
    this._state.panX += dx * this._panSpeed;
    this._state.panY += dy * this._panSpeed;
  }

  /** §39：缩放（正值放大，正值缩小）。 */
  zoom(delta: number): void {
    this._state.zoom *= 1 + delta * this._zoomSpeed;
    this._state.zoom = Math.max(
      this._minZoom,
      Math.min(this._maxZoom, this._state.zoom),
    );
  }

  /** §39：重置到默认视角（§40 建议位置）。 */
  reset(): void {
    this._state = { ...DEFAULT_STATE };
  }

  /** 当前相机状态快照（只读，渲染层消费）。 */
  get state(): Readonly<CameraState> {
    return { ...this._state };
  }

  /** 调整旋转灵敏度。 */
  setRotationSpeed(speed: number): void {
    this._rotationSpeed = speed;
  }

  /** 调整平移灵敏度。 */
  setPanSpeed(speed: number): void {
    this._panSpeed = speed;
  }

  /** 调整缩放灵敏度。 */
  setZoomSpeed(speed: number): void {
    this._zoomSpeed = speed;
  }
}
