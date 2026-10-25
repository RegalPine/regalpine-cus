/**
 * 色相区间约束工具 —— 支持跨 0° 的环形区间判定。
 * 
 * 设计原则（参见 regalpine-cus-semantic-color-optimization.md §6.2）：
 * - 色相是环形变量，0° 与 360° 等价
 * - 区间可能跨越 0°（如红色区间 350°–20°）
 * - 不使用简单的 start <= hue && hue <= end 处理所有情况
 */

// ─── 类型定义 ───────────────────────────────────────────────────────────────

/**
 * 色相区间 —— 支持跨 0° 的环形区间。
 * 
 * @example
 * // 普通区间（绿色方向）
 * { start: 125, end: 165, wraps: false }
 * 
 * @example
 * // 跨 0° 区间（红色方向）
 * { start: 350, end: 20, wraps: true }
 */
export interface HueInterval {
  /** 色相起点，单位为度，范围 [0, 360) */
  start: number;
  /** 色相终点，单位为度，范围 [0, 360) */
  end: number;
  /** 区间是否跨越 0°（即 start > end 的情况） */
  wraps: boolean;
}

/**
 * 语义色相策略 —— 定义单个语义角色的色相约束。
 */
export interface SemanticHuePolicy {
  /** 语义色相锚点（首选色相） */
  anchor: number;
  /** 允许的色相区间，可支持多个区间 */
  allowed: HueInterval[];
  /** 锚点附近的偏好程度（0-1，用于评分而非硬约束） */
  anchorWeight: number;
  /** 允许的最大色相偏移（用于诊断和策略控制） */
  maxDrift?: number;
}

// ─── 核心工具函数 ─────────────────────────────────────────────────────────────

/**
 * 归一化色相角度到 [0, 360) 范围。
 * 
 * @example
 * normalizeHue(370)  // => 10
 * normalizeHue(-10)  // => 350
 * normalizeHue(720)  // => 0
 */
export function normalizeHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

/**
 * 计算两个色相角度之间的最短距离（考虑环形）。
 * 
 * @example
 * hueDistance(10, 350)   // => 20（跨越 0°）
 * hueDistance(90, 270)   // => 180
 * hueDistance(0, 180)    // => 180
 */
export function hueDistance(a: number, b: number): number {
  const na = normalizeHue(a);
  const nb = normalizeHue(b);
  const d = Math.abs(na - nb);
  return Math.min(d, 360 - d);
}

/**
 * 判断色相是否在单个区间内。
 * 
 * @param hue - 待判定的色相角度（会自动归一化）
 * @param interval - 色相区间
 * 
 * @example
 * // 普通区间
 * isHueInInterval(145, { start: 125, end: 165, wraps: false })  // => true
 * isHueInInterval(100, { start: 125, end: 165, wraps: false })  // => false
 * 
 * @example
 * // 跨 0° 区间（红色）
 * isHueInInterval(5, { start: 350, end: 20, wraps: true })   // => true
 * isHueInInterval(355, { start: 350, end: 20, wraps: true }) // => true
 * isHueInInterval(100, { start: 350, end: 20, wraps: true }) // => false
 */
export function isHueInInterval(hue: number, interval: HueInterval): boolean {
  const h = normalizeHue(hue);
  const { start, end, wraps } = interval;
  
  if (wraps) {
    // 跨 0° 区间：h >= start || h <= end
    return h >= start || h <= end;
  } else {
    // 普通区间：start <= h <= end
    return h >= start && h <= end;
  }
}

/**
 * 判断色相是否在任意一个允许区间内。
 * 
 * @param hue - 待判定的色相角度
 * @param allowed - 允许的色相区间列表
 * 
 * @example
 * const allowed = [
 *   { start: 125, end: 165, wraps: false },  // 绿色
 *   { start: 100, end: 120, wraps: false },  // 黄绿色
 * ];
 * isHueAllowed(145, allowed)  // => true（在绿色区间）
 * isHueAllowed(110, allowed)  // => true（在黄绿色区间）
 * isHueAllowed(200, allowed)  // => false
 */
export function isHueAllowed(hue: number, allowed: HueInterval[]): boolean {
  return allowed.some(interval => isHueInInterval(hue, interval));
}

/**
 * 计算色相到最近允许区间的距离。
 * 如果色相已在区间内，返回 0。
 * 
 * @param hue - 待计算的色相角度
 * @param allowed - 允许的色相区间列表
 * @returns 最短距离（0 表示在区间内）
 */
export function hueDistanceToAllowed(hue: number, allowed: HueInterval[]): number {
  if (isHueAllowed(hue, allowed)) {
    return 0;
  }
  
  const h = normalizeHue(hue);
  let minDistance = Infinity;
  
  for (const interval of allowed) {
    // 计算到区间起点的距离
    const distToStart = hueDistance(h, interval.start);
    // 计算到区间终点的距离
    const distToEnd = hueDistance(h, interval.end);
    // 取较近的一个
    minDistance = Math.min(minDistance, distToStart, distToEnd);
  }
  
  return minDistance;
}

/**
 * 将色相约束到最近的允许区间内。
 * 如果色相已在区间内，返回原值。
 * 
 * @param hue - 待约束的色相角度
 * @param allowed - 允许的色相区间列表
 * @returns 约束后的色相角度
 */
export function constrainHue(hue: number, allowed: HueInterval[]): number {
  if (isHueAllowed(hue, allowed)) {
    return normalizeHue(hue);
  }
  
  const h = normalizeHue(hue);
  let closestHue = h;
  let minDistance = Infinity;
  
  for (const interval of allowed) {
    // 尝试将色相约束到区间的起点或终点
    for (const boundary of [interval.start, interval.end]) {
      const dist = hueDistance(h, boundary);
      if (dist < minDistance) {
        minDistance = dist;
        closestHue = boundary;
      }
    }
  }
  
  return closestHue;
}

// ─── 预设策略 ─────────────────────────────────────────────────────────────────

/**
 * 创建默认的语义色相策略配置。
 * 
 * 基于设计文档 §6.3 的初始配置示例：
 * - Success: 145° 锚点，125°–165° 允许范围
 * - Warning: 80° 锚点，55°–100° 允许范围
 * - Danger: 25° 锚点，5°–40° 允许范围
 * - Info: 235° 锚点，210°–255° 允许范围
 */
export function createDefaultSemanticHuePolicies(): Record<string, SemanticHuePolicy> {
  return {
    success: {
      anchor: 145,
      allowed: [{ start: 125, end: 165, wraps: false }],
      anchorWeight: 0.7,
      maxDrift: 20,
    },
    warning: {
      anchor: 80,
      allowed: [{ start: 55, end: 100, wraps: false }],
      anchorWeight: 0.7,
      maxDrift: 25,
    },
    danger: {
      anchor: 25,
      allowed: [{ start: 5, end: 40, wraps: false }],
      anchorWeight: 0.7,
      maxDrift: 20,
    },
    info: {
      anchor: 235,
      allowed: [{ start: 210, end: 255, wraps: false }],
      anchorWeight: 0.7,
      maxDrift: 25,
    },
  };
}

/**
 * 从现有的离散候选数组创建色相策略。
 * 
 * @param candidates - 现有的候选色相数组（如 SEMANTIC_HUES.success）
 * @param anchorWeight - 锚点权重（默认 0.7）
 * 
 * @example
 * // 从 [145, 135, 155] 创建策略
 * createPolicyFromCandidates([145, 135, 155])
 * // => {
 * //   anchor: 145,
 * //   allowed: [{ start: 130, end: 160, wraps: false }],
 * //   anchorWeight: 0.7
 * // }
 */
export function createPolicyFromCandidates(
  candidates: readonly number[],
  anchorWeight: number = 0.7,
): SemanticHuePolicy {
  if (candidates.length === 0) {
    throw new Error("候选色相数组不能为空");
  }
  
  // 锚点为第一个候选（或最接近中心的值）
  const anchor = candidates[0];
  
  // 计算允许区间：从最小候选到最大候选，扩展 5° 容差
  const sorted = [...candidates].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  // 检查是否跨 0°
  const span = max - min;
  const wraps = span > 180;
  
  let start: number, end: number;
  if (wraps) {
    // 跨 0° 情况：区间从 max 到 min（跨越 0°）
    start = normalizeHue(max - 5);
    end = normalizeHue(min + 5);
  } else {
    // 普通情况：区间从 min 到 max
    start = normalizeHue(min - 5);
    end = normalizeHue(max + 5);
  }
  
  return {
    anchor,
    allowed: [{ start, end, wraps }],
    anchorWeight,
    maxDrift: wraps ? (360 - span) / 2 : span / 2 + 5,
  };
}
