// ─── CUS-UX-02 §5–§8/§14/§18–§19/§45：Color Volume 采样、自适应细化、射线拾取与缓存 ──
// 本模块只负责 Volume 几何与采样调度；色彩科学（Gamut/Dirty Zone/坐标转换）
// 由宿主经依赖注入提供，Renderer 不自行计算颜色（§40）。
import type { Oklab } from "./oklab";
import type { RGB } from "./rgb";
import type {
  ColorVolumeData,
  ColorVolumePoint,
  GamutStatus,
  SliceData,
  SliceDefinition,
  SlicePlane,
  VolumeBounds,
  VolumeCacheKey,
  VolumeSampleConfig,
} from "./explorer";

/** UX-02 §14：OKLab → 3D 坐标映射（X=a, Y=L, Z=b）。 */
export function oklabTo3D(p: Oklab): [number, number, number] {
  return [p.a, p.l, p.b];
}
/** UX-02 §14 逆变换：3D 坐标 → OKLab。 */
export function threeDToOklab(xyz: [number, number, number]): Oklab {
  return { l: xyz[1], a: xyz[0], b: xyz[2] };
}
/** UX-02 §15：OKLCH → OKLab 圆柱变换（a=C·cos H, b=C·sin H）。 */
export function oklchToOklab(cyl: {
  l: number;
  c: number;
  h: number | null;
}): Oklab {
  const rad = ((cyl.h ?? 0) * Math.PI) / 180;
  return { l: cyl.l, a: cyl.c * Math.cos(rad), b: cyl.c * Math.sin(rad) };
}
/** UX-02 §15 逆变换：OKLab → OKLCH（用于 3D 拾取后回到交互语言）。 */
export function oklabToOklch(p: Oklab): {
  l: number;
  c: number;
  h: number | null;
} {
  const c = Math.hypot(p.a, p.b);
  if (c < 1e-7) return { l: p.l, c: 0, h: null };
  let h = (Math.atan2(p.b, p.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: p.l, c, h };
}

/** UX-02 §6：Volume 点采样所需的引擎依赖（由宿主注入，避免 core→color 反向依赖）。 */
export interface VolumeSamplerDeps {
  /** OKLab → OKLCH（缺省用本模块 oklabToOklch）。 */
  toOklch?(p: Oklab): { l: number; c: number; h: number | null };
  /** §11：Gamut 三态判定。 */
  gamutOf(p: Oklab, target: "srgb" | "display-p3"): GamutStatus;
  /** §12：Dirty Zone 三态判定。 */
  dirtyOf(p: Oklab): "CLEAR" | "WARNING" | "DIRTY";
  /** CUS-IMPLEMENTATION-04 §5/§12：OKLab → sRGB display 颜色（用于 displayColor 字段）。 */
  displayOf(p: Oklab): RGB;
}

// ─── CUS-IMPLEMENTATION-04 §9：TypedArray 编码/解码 ──────────────────────────
const GAMUT_CODE: Record<GamutStatus, number> = {
  IN_GAMUT: 0,
  NEAR_BOUNDARY: 1,
  OUT_OF_GAMUT: 2,
};
const GAMUT_DECODE: GamutStatus[] = ["IN_GAMUT", "NEAR_BOUNDARY", "OUT_OF_GAMUT"];
const DIRTY_CODE: Record<"CLEAR" | "WARNING" | "DIRTY", number> = {
  CLEAR: 0,
  WARNING: 1,
  DIRTY: 2,
};
const DIRTY_DECODE: ("CLEAR" | "WARNING" | "DIRTY")[] = [
  "CLEAR",
  "WARNING",
  "DIRTY",
];
/** UX-02 §7：默认采样分辨率（64×64×64 仅为示例，实际由性能配置决定）。 */
export const DEFAULT_VOLUME_RESOLUTION = 64;
/** OKLab 各轴采样范围：L∈[0,1]，a/b∈[-0.4,0.4]（覆盖 sRGB/P3 全部色域）。 */
export const OKLAB_BOUNDS = {
  l: [0, 1] as [number, number],
  a: [-0.4, 0.4] as [number, number],
  b: [-0.4, 0.4] as [number, number],
};
/** §7：OKLab 默认包围盒（X=a, Y=L, Z=b）。 */
export const DEFAULT_VOLUME_BOUNDS: VolumeBounds = {
  min: { x: OKLAB_BOUNDS.a[0], y: OKLAB_BOUNDS.l[0], z: OKLAB_BOUNDS.b[0] },
  max: { x: OKLAB_BOUNDS.a[1], y: OKLAB_BOUNDS.l[1], z: OKLAB_BOUNDS.b[1] },
};

/** UX-02 §45：Volume 缓存键（space:gamut:resolution[:slice]）。 */
export function volumeCacheKey(key: VolumeCacheKey): string {
  const gamut = [...key.gamut].sort().join("+");
  const slice = key.slice ? `:${key.slice.axis}=${key.slice.value.toFixed(4)}` : "";
  return `${key.space}:${gamut}:${key.resolution}${slice}`;
}

/** UX-02 §7：Uniform Sampling——生成 L×a×b 规则网格的 OKLab 坐标。 */
export function uniformOklabGrid(resolution: number): Oklab[] {
  const n = Math.max(2, Math.floor(resolution));
  const pts: Oklab[] = [];
  const [lMin, lMax] = OKLAB_BOUNDS.l;
  const [aMin, aMax] = OKLAB_BOUNDS.a;
  const [bMin, bMax] = OKLAB_BOUNDS.b;
  for (let i = 0; i < n; i++) {
    const l = lMin + ((lMax - lMin) * (i + 0.5)) / n;
    for (let j = 0; j < n; j++) {
      const a = aMin + ((aMax - aMin) * (j + 0.5)) / n;
      for (let k = 0; k < n; k++) {
        const b = bMin + ((bMax - bMin) * (k + 0.5)) / n;
        pts.push({ l, a, b });
      }
    }
  }
  return pts;
}

/**
 * UX-02 §8：Adaptive Sampling——在 Gamut / Dirty Zone 边界附近细化采样。
 *
 * 策略：对每个 uniform 点，若其 gamut 或 dirty 状态与任一 6-邻域不同，
 * 则在该点与邻域中点插入 refinementLevels 层细化点。这样边界区域获得
 * 更高采样密度，而普通区域保持低采样，避免无限提高整个空间的采样率。
 */
export function refineBoundary(
  base: Oklab[],
  deps: VolumeSamplerDeps,
  levels = 1,
): Oklab[] {
  if (levels <= 0) return [];
  const extra: Oklab[] = [];
  const statusOf = (p: Oklab) =>
    `${deps.gamutOf(p, "srgb")}|${deps.gamutOf(p, "display-p3")}|${deps.dirtyOf(p)}`;
  // 仅对 base 中状态与邻域不同的点做细化（避免 O(n²) 全量比较）。
  // 邻域偏移取 uniform 网格步长的一半。
  const n = Math.round(Math.cbrt(base.length));
  if (!Number.isFinite(n) || n < 2) return [];
  const step = {
    l: (OKLAB_BOUNDS.l[1] - OKLAB_BOUNDS.l[0]) / n,
    a: (OKLAB_BOUNDS.a[1] - OKLAB_BOUNDS.a[0]) / n,
    b: (OKLAB_BOUNDS.b[1] - OKLAB_BOUNDS.b[0]) / n,
  };
  const neighbors: [number, number, number][] = [
    [step.l, 0, 0],
    [-step.l, 0, 0],
    [0, step.a, 0],
    [0, -step.a, 0],
    [0, 0, step.b],
    [0, 0, -step.b],
  ];
  for (const p of base) {
    const s = statusOf(p);
    for (const [dl, da, db] of neighbors) {
      const q: Oklab = { l: p.l + dl, a: p.a + da, b: p.b + db };
      if (
        q.l < OKLAB_BOUNDS.l[0] ||
        q.l > OKLAB_BOUNDS.l[1] ||
        q.a < OKLAB_BOUNDS.a[0] ||
        q.a > OKLAB_BOUNDS.a[1] ||
        q.b < OKLAB_BOUNDS.b[0] ||
        q.b > OKLAB_BOUNDS.b[1]
      )
        continue;
      if (statusOf(q) !== s) {
        // 在 p 与 q 之间插入 levels 层细化点。
        for (let k = 1; k <= levels; k++) {
          const t = k / (levels + 1);
          extra.push({
            l: p.l + (q.l - p.l) * t,
            a: p.a + (q.a - p.a) * t,
            b: p.b + (q.b - p.b) * t,
          });
        }
        break; // 每个点只细化一次，避免爆炸。
      }
    }
  }
  return extra;
}

/**
 * CUS-IMPLEMENTATION-04 §9：Volume 采样主入口——返回 TypedArray 主结构。
 * uniform + adaptive refinement，所有字段打包为 Float32Array/Uint8Array。
 */
export function sampleColorVolume(
  deps: VolumeSamplerDeps,
  config: VolumeSampleConfig = {},
): ColorVolumeData {
  const resolution = config.resolution ?? DEFAULT_VOLUME_RESOLUTION;
  const adaptive = config.adaptive ?? true;
  const levels = config.refinementLevels ?? 1;
  const base = uniformOklabGrid(resolution);
  const all = adaptive ? [...base, ...refineBoundary(base, deps, levels)] : base;
  const n = all.length;
  const points = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const gamut = new Uint8Array(n * 2);
  const dirtyZone = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const lab = all[i];
    const pi = i * 3;
    points[pi] = lab.a;
    points[pi + 1] = lab.l;
    points[pi + 2] = lab.b;
    const rgb = deps.displayOf(lab);
    colors[pi] = rgb.r;
    colors[pi + 1] = rgb.g;
    colors[pi + 2] = rgb.b;
    const gi = i * 2;
    gamut[gi] = GAMUT_CODE[deps.gamutOf(lab, "srgb")];
    gamut[gi + 1] = GAMUT_CODE[deps.gamutOf(lab, "display-p3")];
    dirtyZone[i] = DIRTY_CODE[deps.dirtyOf(lab)];
  }
  return {
    space: "OKLAB",
    bounds: { ...DEFAULT_VOLUME_BOUNDS },
    points,
    colors,
    gamut,
    dirtyZone,
    resolution,
  };
}
/** CUS-IMPLEMENTATION-04 §9 别名。 */
export const createVolumeData = sampleColorVolume;

/**
 * CUS-IMPLEMENTATION-04 §23：切片采样——返回 TypedArray SliceData。
 *
 * V1 仅提供 L/a/b 三种正交切片：
 * - axis="L"：固定 L，采样 a×b 平面
 * - axis="a"：固定 a，采样 L×b 平面
 * - axis="b"：固定 b，采样 L×a 平面
 */
export function sampleSlice(
  deps: VolumeSamplerDeps,
  slice: SliceDefinition,
  resolution = 64,
): SliceData {
  const n = Math.max(2, Math.floor(resolution));
  const total = n * n;
  const points = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const gamut = new Uint8Array(total * 2);
  const dirty = new Uint8Array(total);
  const [lMin, lMax] = OKLAB_BOUNDS.l;
  const [aMin, aMax] = OKLAB_BOUNDS.a;
  const [bMin, bMax] = OKLAB_BOUNDS.b;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      let lab: Oklab;
      if (slice.axis === "L") {
        lab = { l: slice.value, a: aMin + (aMax - aMin) * u, b: bMin + (bMax - bMin) * v };
      } else if (slice.axis === "a") {
        lab = { l: lMin + (lMax - lMin) * u, a: slice.value, b: bMin + (bMax - bMin) * v };
      } else {
        lab = { l: lMin + (lMax - lMin) * u, a: aMin + (aMax - aMin) * v, b: slice.value };
      }
      const pi = idx * 3;
      points[pi] = lab.a;
      points[pi + 1] = lab.l;
      points[pi + 2] = lab.b;
      const rgb = deps.displayOf(lab);
      colors[pi] = rgb.r;
      colors[pi + 1] = rgb.g;
      colors[pi + 2] = rgb.b;
      const gi = idx * 2;
      gamut[gi] = GAMUT_CODE[deps.gamutOf(lab, "srgb")];
      gamut[gi + 1] = GAMUT_CODE[deps.gamutOf(lab, "display-p3")];
      dirty[idx] = DIRTY_CODE[deps.dirtyOf(lab)];
      idx++;
    }
  }
  return { axis: slice.axis, value: slice.value, points, colors, gamut, dirty };
}
/** CUS-IMPLEMENTATION-04 §23 别名。 */
export const createSliceData = sampleSlice;

/** UX-02 §18：相机射线（屏幕坐标 → 世界空间射线）。 */
export interface Ray3 {
  origin: [number, number, number];
  direction: [number, number, number];
}

/**
 * UX-02 §18–§19：射线与 Volume 包围盒求交，返回连续 OKLab 坐标。
 *
 * 规范明确禁止"最近采样点"式拾取（会导致分辨率依赖、色点跳跃、
 * 采样密度影响结果）。本实现使用 slab method 求射线与 AABB 的
 * 进入/离开参数，取进入点（或射线起点在盒内时的起点）作为连续坐标。
 *
 * 返回 null 表示射线与 Volume 不相交。
 */
export function rayVolumeIntersect(
  ray: Ray3,
  bounds: { l: [number, number]; a: [number, number]; b: [number, number] } = OKLAB_BOUNDS,
): Oklab | null {
  // 3D 坐标系：X=a, Y=L, Z=b（§14）。
  const axes: [number, number][] = [
    bounds.a, // X
    bounds.l, // Y
    bounds.b, // Z
  ];
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    const [lo, hi] = axes[i];
    const o = ray.origin[i];
    const d = ray.direction[i];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const inv = 1 / d;
    let t1 = (lo - o) * inv;
    let t2 = (hi - o) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  // 取进入点；若射线起点在盒内（tMin<0），则取起点。
  const t = tMin >= 0 ? tMin : 0;
  if (t > tMax) return null;
  const x = ray.origin[0] + ray.direction[0] * t;
  const y = ray.origin[1] + ray.direction[1] * t;
  const z = ray.origin[2] + ray.direction[2] * t;
  return threeDToOklab([x, y, z]);
}

/**
 * UX-02 §18–§19：射线与切片平面求交（n·p = d），返回连续 OKLab 坐标。
 *
 * 用于 3D 中拖动 Slice Plane 时的精确拾取，以及 2D 切片视图的
 * 屏幕坐标 → 色彩空间坐标逆变换。
 */
export function raySliceIntersect(
  ray: Ray3,
  plane: SlicePlane,
): Oklab | null {
  const [nx, ny, nz] = plane.normal;
  const denom = nx * ray.direction[0] + ny * ray.direction[1] + nz * ray.direction[2];
  if (Math.abs(denom) < 1e-12) return null; // 射线平行于平面
  const t =
    (plane.distance -
      (nx * ray.origin[0] + ny * ray.origin[1] + nz * ray.origin[2])) /
    denom;
  if (t < 0) return null; // 交点在射线背后
  return threeDToOklab([
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ]);
}

/**
 * CUS-IMPLEMENTATION-04 §32：Ray Marching——沿射线步进找最近有效采样区域。
 *
 * 与 rayVolumeIntersect（连续坐标 slab method）不同，本函数在 Volume 数据
 * 中实际步进，寻找第一个 gamut 状态为 IN_GAMUT 或 NEAR_BOUNDARY 的采样点。
 * 作为可选增强，供 AnchorPicker.pick 内部使用。
 *
 * @returns 最近的 OKLab 坐标，或 null（无有效点或射线不相交）。
 */
export function rayMarchVolume(
  ray: Ray3,
  data: ColorVolumeData,
  options: { stepSize?: number; maxSteps?: number } = {},
): Oklab | null {
  const stepSize = options.stepSize ?? 0.01;
  const maxSteps = options.maxSteps ?? 200;
  // 先求射线与包围盒的交点，确定步进起点。
  const entry = rayVolumeIntersect(ray);
  if (!entry) return null;
  // 将 entry 转回 3D 坐标开始步进。
  const [ex, ey, ez] = oklabTo3D(entry);
  const [dx, dy, dz] = ray.direction;
  for (let i = 0; i < maxSteps; i++) {
    const t = i * stepSize;
    const x = ex + dx * t;
    const y = ey + dy * t;
    const z = ez + dz * t;
    // 检查是否在 bounds 内。
    if (
      x < data.bounds.min.x || x > data.bounds.max.x ||
      y < data.bounds.min.y || y > data.bounds.max.y ||
      z < data.bounds.min.z || z > data.bounds.max.z
    ) break;
    // 找最近的采样点并检查 gamut 状态。
    const lab = threeDToOklab([x, y, z]);
    const count = data.points.length / 3;
    let bestDist = Infinity;
    let bestGamut = 2; // OUT_OF_GAMUT
    for (let j = 0; j < count; j++) {
      const pi = j * 3;
      const px = data.points[pi];
      const py = data.points[pi + 1];
      const pz = data.points[pi + 2];
      const dist = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestGamut = Math.max(data.gamut[j * 2], data.gamut[j * 2 + 1]);
      }
    }
    // 找到 IN_GAMUT (0) 或 NEAR_BOUNDARY (1) 的点即返回。
    if (bestGamut <= 1) return lab;
  }
  return null;
}

/** UX-02 §30：SliceDefinition → SlicePlane（法向量与距离）。 */
export function sliceToPlane(slice: SliceDefinition): SlicePlane {
  if (slice.axis === "L") return { normal: [0, 1, 0], distance: slice.value };
  if (slice.axis === "a") return { normal: [1, 0, 0], distance: slice.value };
  return { normal: [0, 0, 1], distance: slice.value };
}

/** UX-02 §30 逆：SlicePlane → SliceDefinition（仅正交平面可逆）。 */
export function planeToSlice(plane: SlicePlane): SliceDefinition | null {
  const [nx, ny, nz] = plane.normal;
  const eps = 1e-9;
  if (Math.abs(nx) < eps && Math.abs(ny - 1) < eps && Math.abs(nz) < eps)
    return { axis: "L", value: plane.distance };
  if (Math.abs(nx - 1) < eps && Math.abs(ny) < eps && Math.abs(nz) < eps)
    return { axis: "a", value: plane.distance };
  if (Math.abs(nx) < eps && Math.abs(ny) < eps && Math.abs(nz - 1) < eps)
    return { axis: "b", value: plane.distance };
  return null;
}

/**
 * UX-02 §45：Volume 数据缓存（space:gamut:resolution[:slice] → 采样结果）。
 *
 * 缓存只是性能优化，不允许为了缓存改变最终颜色精度（§46）。
 * 使用 Map + LRU 上限，避免长时间运行内存膨胀。
 */
export class VolumeCache {
  private readonly map = new Map<string, ColorVolumeData>();
  constructor(private readonly maxSize = 16) {}
  get(key: VolumeCacheKey): ColorVolumeData | undefined {
    const k = volumeCacheKey(key);
    const v = this.map.get(k);
    if (v) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(key: VolumeCacheKey, value: ColorVolumeData): void {
    const k = volumeCacheKey(key);
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, value);
    while (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value;
      if (first === undefined) break;
      this.map.delete(first);
    }
  }
  clear(): void {
    this.map.clear();
  }
  get size(): number {
    return this.map.size;
  }
}

// ─── CUS-IMPLEMENTATION-04 §9：TypedArray → 逻辑点提取 ─────────────────────
/** 从 ColorVolumeData 提取第 i 个逻辑点（调试/测试用）。 */
export function volumePointAt(data: ColorVolumeData, i: number): ColorVolumePoint {
  const pi = i * 3;
  const gi = i * 2;
  const a = data.points[pi];
  const l = data.points[pi + 1];
  const b = data.points[pi + 2];
  const lab = { l, a, b };
  return {
    lab,
    oklch: oklabToOklch(lab),
    displayColor: {
      r: data.colors[pi],
      g: data.colors[pi + 1],
      b: data.colors[pi + 2],
    },
    gamut: {
      srgb: GAMUT_DECODE[data.gamut[gi]] ?? "IN_GAMUT",
      p3: GAMUT_DECODE[data.gamut[gi + 1]] ?? "IN_GAMUT",
    },
    dirtyZone: DIRTY_DECODE[data.dirtyZone[i]] ?? "CLEAR",
  };
}
/** 从 SliceData 提取第 i 个逻辑点。 */
export function slicePointAt(data: SliceData, i: number): ColorVolumePoint {
  const pi = i * 3;
  const gi = i * 2;
  const a = data.points[pi];
  const l = data.points[pi + 1];
  const b = data.points[pi + 2];
  const lab = { l, a, b };
  return {
    lab,
    oklch: oklabToOklch(lab),
    displayColor: {
      r: data.colors[pi],
      g: data.colors[pi + 1],
      b: data.colors[pi + 2],
    },
    gamut: {
      srgb: GAMUT_DECODE[data.gamut[gi]] ?? "IN_GAMUT",
      p3: GAMUT_DECODE[data.gamut[gi + 1]] ?? "IN_GAMUT",
    },
    dirtyZone: DIRTY_DECODE[data.dirty[i]] ?? "CLEAR",
  };
}
/** ColorVolumeData 中的点数。 */
export function volumePointCount(data: ColorVolumeData): number {
  return data.points.length / 3;
}
/** SliceData 中的点数。 */
export function slicePointCount(data: SliceData): number {
  return data.points.length / 3;
}
