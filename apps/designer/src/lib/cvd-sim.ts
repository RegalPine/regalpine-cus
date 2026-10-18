/**
 * CVD (Color Vision Deficiency) Simulation — Machado 2009 线性变换矩阵。
 *
 * 基于 Jorge Machado 硕士论文 "Colour Blindness: A Method for Simulation"，
 * 在 linear RGB 空间对颜色施加锥体细胞减损矩阵，产生色觉障碍视觉效果。
 *
 * 支持两种输出：
 *   1. `cvdMatrixCSS()` — 生成 SVG feColorMatrix 属性字符串，用于 CSS `filter: url(#...)`。
 *      浏览器自动在 sRGB ↔ linear RGB 间转换，精度可靠。
 *   2. `simulateCVDColor()` — 对单个 hex 颜色做 JS 侧模拟，返回 hex 结果。
 *      用于需要在应用滤镜前就拿到模拟后颜色值的场景（如对比度矩阵本地预览）。
 *
 * References:
 *   - Machado, J. (2009). Colour Blindness: A Method for Simulation.
 *   - Brettel, H., Viénot, F. and Mollon, J.D. (1997). Computerised simulation of color appearance for dichromats.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CVDType = "normal" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

/** 3×3 矩阵，行优先排列。 */
export type Matrix3x3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

// ── Machado 2009 全严重度模拟矩阵 (linear RGB) ─────────────────────────────

const IDENTITY: Matrix3x3 = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

/** Protanopia — L 锥体缺失 */
const PROTANOPIA: Matrix3x3 = [
  0.152280, 1.052583, -0.204863,
  0.114503, 0.786281, 0.099216,
  -0.003882, -0.048116, 1.051998,
];

/** Deuteranopia — M 锥体缺失 */
const DEUTERANOPIA: Matrix3x3 = [
  0.367322, 0.860646, -0.227968,
  0.280085, 0.672501, 0.047413,
  -0.011820, 0.042940, 0.968881,
];

/** Tritanopia — S 锥体缺失 */
const TRITANOPIA: Matrix3x3 = [
  1.255528, -0.076749, -0.178779,
  -0.078411, 0.930809, 0.147602,
  0.004733, 0.691367, 0.303900,
];

// ── 矩阵工具 ─────────────────────────────────────────────────────────────────

/** 按 severity (0–1) 在 identity 与 full 矩阵间线性插值。 */
function lerpMatrix(identity: Matrix3x3, full: Matrix3x3, amount: number): Matrix3x3 {
  const t = Math.max(0, Math.min(1, amount));
  return identity.map((v, i) => v + (full[i] - v) * t) as Matrix3x3;
}

/** 将 Matrix3x3 转为 SVG feColorMatrix 的 20 值空格分隔字符串。 */
export function matrixToFeColorMatrix(m: Matrix3x3): string {
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
  ].map((v) => (v === 0 ? "0" : v.toFixed(6))).join(" ");
}

// ── 公共 API ─────────────────────────────────────────────────────────────────

/**
 * 获取指定 CVD 类型的 feColorMatrix 属性值。
 * 用于嵌入 SVG `<filter>` 元素，再通过 CSS `filter: url(#id)` 应用。
 *
 * @param type  色觉缺陷类型
 * @param severity  严重程度 0–1，默认 1（全缺失）
 */
export function cvdFeColorMatrix(type: CVDType, severity = 1): string {
  if (type === "normal" || severity === 0) {
    return matrixToFeColorMatrix(IDENTITY);
  }
  if (type === "achromatopsia") {
    // 全色盲：Rec.709 亮度权重 → 灰度
    return [
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
    ].map((v) => v.toFixed(6)).join(" ");
  }

  const full = type === "protanopia" ? PROTANOPIA
    : type === "deuteranopia" ? DEUTERANOPIA
    : TRITANOPIA;

  return matrixToFeColorMatrix(lerpMatrix(IDENTITY, full, severity));
}

/**
 * 获取可直接用于 CSS `filter` 属性的 SVG 滤镜 data-URI。
 * 无需在 DOM 中放置 SVG 元素，直接 `filter: url("data:image/svg+xml,...")` 即可。
 *
 * @example
 *   element.style.filter = cvdFilterCSS("protanopia");
 */
export function cvdFilterCSS(type: CVDType, severity = 1): string {
  if (type === "normal" || severity === 0) return "none";
  const values = cvdFeColorMatrix(type, severity);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="cvd"><feColorMatrix type="matrix" values="${values}" /></filter></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}#cvd")`;
}

// ── JS 侧逐色模拟 ───────────────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

function rgb01ToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 对单个 sRGB hex 颜色做 CVD 模拟，返回模拟后的 hex 颜色。
 *
 * 流程：hex → sRGB [0,1] → linear RGB → 矩阵变换 → clamp → sRGB → hex。
 */
export function simulateCVDColor(hex: string, type: CVDType, severity = 1): string {
  if (type === "normal" || severity === 0) return hex;

  const [r, g, b] = hexToRgb01(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  if (type === "achromatopsia") {
    // Rec.709 亮度
    const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    const sy = linearToSrgb(y);
    return rgb01ToHex(sy, sy, sy);
  }

  const full = type === "protanopia" ? PROTANOPIA
    : type === "deuteranopia" ? DEUTERANOPIA
    : TRITANOPIA;
  const m = lerpMatrix(IDENTITY, full, severity);

  const outR = clamp01(m[0] * lr + m[1] * lg + m[2] * lb);
  const outG = clamp01(m[3] * lr + m[4] * lg + m[5] * lb);
  const outB = clamp01(m[6] * lr + m[7] * lg + m[8] * lb);

  return rgb01ToHex(linearToSrgb(outR), linearToSrgb(outG), linearToSrgb(outB));
}
