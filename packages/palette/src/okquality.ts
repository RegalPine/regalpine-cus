import {
  OK_BRAND_EPSILON,
  type AdjustmentType,
  type ChromaEnvelope,
  type ChromaResolution,
  type ColorContext,
  type ColorRole,
  type ConstraintDecisionRecord,
  type ConstraintPriority,
  type DirtyZoneRouteResult,
  type GamutLossLevel,
  type OKLCH,
  type RelaxationReason,
  type SurfaceArea,
  type ThemeMode,
  DEFAULT_CONSTRAINT_PRIORITY,
} from "@cus/core";
import { clamp, mapOklchToGamut, normalizeHue } from "@cus/color";

// ─── V2.5 §7–§13：Quality Envelope ──────────────────────────────────────────
// 角色色度基线（OKLCH 尺度）。工程初始值：语义/主色 role 需要明确的色彩属性，
// 中性 role 允许接近无彩色（§12–§13 不定义全局 Cmin，只定义 Cmin(Role,L,H,Theme)）。
export const ROLE_CHROMA_MIN: Record<ColorRole, number> = {
  background: 0,
  surface: 0,
  neutral: 0,
  border: 0.004,
  text: 0.008,
  primary: 0.05,
  secondary: 0.045,
  accent: 0.05,
  action: 0.05,
  success: 0.045,
  warning: 0.045,
  danger: 0.05,
  info: 0.04,
};
export const ROLE_CHROMA_MAX: Record<ColorRole, number> = {
  background: 0.016,
  surface: 0.024,
  neutral: 0.02,
  border: 0.05,
  text: 0.12,
  primary: 0.33,
  secondary: 0.33,
  accent: 0.33,
  action: 0.33,
  success: 0.17,
  warning: 0.17,
  danger: 0.17,
  info: 0.17,
};
// V2.5 §34：Neutral Chroma Budget 随品牌色度联动（与生成端公式一致），
// 大面积 Surface 更低、小面积可略高（§35）。
export const NEUTRAL_BUDGET_CAP = 0.02;
// V2.5 §15：Dark 特殊防护（muddy dark）；washed-out 阈值见 validation 层报告逻辑。
const MUDDY_DARK_L = 0.3;
const MUDDY_DARK_BOOST = 0.015;
// V2.5 §73–§74：生成↔验证反馈必须有限且确定，默认 8 次，超限即 Generation Failure。
export const MAX_QUALITY_ITERATIONS = 8;

const position = (l: number): number =>
  clamp(1 - Math.abs(l - 0.55) / 0.55, 0, 1);

/**
 * V2.5 §13：Cmin(Role, L, Theme)。
 * 中段（L≈0.55 的 action/主色区）施加完整语义下限，两端按曲线放宽——
 * 浅端 tint 与深端 shade 允许更低色度；Dark 深端衰减更慢以防 muddy dark（§15）。
 * 无彩色（h === null）时 min 归零，灰阶品牌家族保持无彩色。
 */
export function chromaMin(
  role: ColorRole,
  l: number,
  theme: ThemeMode,
  h: number | null,
): number {
  const base = ROLE_CHROMA_MIN[role];
  if (base === 0 || h === null) return 0;
  const p = position(l);
  const factor =
    theme === "dark"
      ? 0.15 + 0.85 * Math.pow(p, 1.8)
      : 0.15 + 0.85 * Math.pow(p, 1.5);
  const min = base * factor;
  // §15：L 很低且 Cmin 也低容易产生黑灰浑浊。
  if (theme === "dark" && l < MUDDY_DARK_L) return min + MUDDY_DARK_BOOST;
  return min;
}

/**
 * V2.5 §34–§35：Neutral Chroma Budget。
 * 预算取决于品牌色度、Surface 面积、明度与主题（§34）；
 * 大面积（canvas 级）预算更低，小面积（border/icon 级）允许略高（§35）。
 */
export function neutralChromaBudget(
  brandChroma: number,
  area?: SurfaceArea,
  l?: number,
): number {
  const base = Math.min(NEUTRAL_BUDGET_CAP, Math.max(0, brandChroma) * 0.08);
  const areaFactor = area === "large" ? 0.75 : area === "small" ? 1.25 : 1;
  const lightnessFactor =
    l !== undefined && l > 0.9 ? 0.85 : l !== undefined && l < 0.15 ? 0.9 : 1;
  return base * areaFactor * lightnessFactor;
}

/**
 * V2.5 §7–§9：Quality Envelope Q(L,H,Context) —— 给定明度/色相/角色的
 * 合理 Chroma 区间。Quality Boundary 与 Gamut Boundary 相互独立（§9–§11）；
 * Gamut 容量在 resolveChroma 的第二步（Gamut Envelope）参与。
 */
export function qualityEnvelope(
  l: number,
  h: number | null,
  role: ColorRole,
  theme: ThemeMode,
  area?: SurfaceArea,
  brandChroma?: number,
): ChromaEnvelope {
  const min = chromaMin(role, l, theme, h);
  let max = ROLE_CHROMA_MAX[role];
  if (role === "neutral" || role === "background" || role === "surface")
    max =
      brandChroma !== undefined
        ? neutralChromaBudget(brandChroma, area, l)
        : ROLE_CHROMA_MAX[role] * (area === "large" ? 0.75 : 1);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

// ─── CUS-UX-01 §14：Dirty Zone 判定 ──────────────────────────────────
export type DirtyZoneStatus = "CLEAN" | "DIRTY";
/**
 * Dirty Zone 的唯一权威判定：坐标色度落在 Quality Envelope [Cmin, Cmax]
 * 之外即为 DIRTY。可视化层（UX-01 §14/§44）只消费本函数，不得自行创造
 * Dirty Zone；dirtyZoneEnabled 为 false 时一律视为 CLEAN。
 */
export function dirtyZoneStatus(
  color: OKLCH,
  context: Pick<ColorContext, "role" | "theme" | "area"> & {
    brandChroma?: number;
    dirtyZoneEnabled?: boolean;
  },
): DirtyZoneStatus {
  if (context.dirtyZoneEnabled === false) return "CLEAN";
  const envelope = qualityEnvelope(
    color.l,
    color.h,
    context.role,
    context.theme,
    context.area,
    context.brandChroma,
  );
  return color.c < envelope.min - 1e-9 || color.c > envelope.max + 1e-9
    ? "DIRTY"
    : "CLEAN";
}

// ─── V2.5 §20–§23：Gamut Efficiency / Loss ──────────────────────────────────
/** V2.5 §20：GamutEfficiency = Cactual / Cdesired。 */
export function gamutEfficiency(desired: number, actual: number): number {
  if (!(desired > 0)) return 1;
  return clamp(actual / desired, 0, 1);
}
/** V2.5 §21：GamutLoss = 1 − GamutEfficiency。 */
export function gamutLoss(desired: number, actual: number): number {
  return 1 - gamutEfficiency(desired, actual);
}
/** V2.5 §22：五档分类（CUS 工程初始阈值，不是色度学标准）。 */
export function gamutLossLevel(loss: number): GamutLossLevel {
  if (loss < 0.1) return "excellent";
  if (loss < 0.2) return "acceptable";
  if (loss < 0.3) return "warning";
  if (loss < 0.5) return "significant";
  return "severe";
}

// ─── V2.5 §50–§51：Quality-Aware Chroma ─────────────────────────────────────
export type ChromaContextInput = Pick<
  ColorContext,
  "role" | "theme" | "area"
> & {
  brandChroma?: number;
  maxIterations?: number;
  /** V1.1 §33：关闭时跳过 Quality Envelope 约束，仅保留 Gamut 容量钳制。 */
  dirtyZoneEnabled?: boolean;
};

/**
 * V2.5 §51：resolveChroma —— Initial Estimate → Quality Envelope →
 * Gamut Envelope → Select C。
 */
export function resolveChroma(
  initial: number,
  l: number,
  h: number | null,
  context: ChromaContextInput,
): number {
  return resolveChromaDetailed(initial, l, h, context).chroma;
}

/**
 * V2.5 §24–§26/§48–§50：Quality-Aware 解析明细。
 * Binary Search + Quality Constraints 的闭式等价实现：每轮先钳入 Quality
 * Envelope，再钳入 Gamut 容量（保留 P3 色度），循环最多 maxIterations=8 次
 * （§73–§74，有限且确定；超限返回 generation-failure 而非无限搜索）。
 */
export function resolveChromaDetailed(
  initial: number,
  l: number,
  h: number | null,
  context: ChromaContextInput,
): ChromaResolution {
  const dirtyZoneEnabled = context.dirtyZoneEnabled !== false;
  const envelope = dirtyZoneEnabled
    ? qualityEnvelope(
        l,
        h,
        context.role,
        context.theme,
        context.area,
        context.brandChroma,
      )
    : { min: 0, max: Infinity };
  const probe = { l, c: Math.max(0, initial), h };
  const srgb = mapOklchToGamut(probe, "srgb");
  const p3 = mapOklchToGamut(probe, "display-p3");
  // 生成端保留 P3 色度，sRGB 编译时独立压缩。
  const capacity = Math.max(srgb.c, p3.c);
  const maxIterations = context.maxIterations ?? MAX_QUALITY_ITERATIONS;
  let c = Math.max(0, initial);
  let iterations = 0;
  let status: ChromaResolution["status"] = "converged";
  for (; iterations < maxIterations; iterations++) {
    const clamped = Math.min(
      Math.max(c, envelope.min),
      Math.min(envelope.max, capacity),
    );
    if (Math.abs(clamped - c) < 1e-9) {
      c = clamped;
      break;
    }
    c = clamped;
  }
  if (iterations >= maxIterations) status = "generation-failure";
  const outside =
    dirtyZoneEnabled &&
    ((Math.abs(initial - envelope.min) > 1e-9 && initial < envelope.min) ||
      (initial > envelope.max && Math.abs(initial - envelope.max) > 1e-9));
  const overCapacity = initial > capacity + 1e-9;
  const reason: ChromaResolution["reason"] =
    status === "generation-failure"
      ? "generation-failure"
      : outside && overCapacity
        ? "quality-and-gamut-clamp"
        : outside
          ? "quality-envelope-clamp"
          : overCapacity
            ? "gamut-clamp"
            : "within-envelope";
  return {
    chroma: c,
    requested: Math.max(0, initial),
    iterations: iterations + (status === "converged" ? 1 : 0),
    status,
    reason,
    envelope,
    srgbCapacity: srgb.c,
    p3Capacity: p3.c,
  };
}

// ─── PALETTE-01 §18/§40：Dirty-Zone Routing 四路线 ─────────────────────────
const DIRTY_ZONE_HUE_STEP = 3; // Route B: ΔH 步进（度）。
const DIRTY_ZONE_HUE_MAX = 5;  // Route B: ΔH 上限（§40 禁止 Large Hue Jump）。

/**
 * PALETTE-01 §40：Dirty-Zone Routing。
 * 当调色板轨迹进入 Dirty Zone 时，按优先级尝试四条路线：
 * A. 降低色度（已有 resolveChromaDetailed 逻辑）
 * B. 微调色相（±ΔH，ΔH ≤ 5°）
 * C. 同时降低色度 + 微调色相
 * D. 标记为 generation-failure（V1.0 不实现局部曲线重构）
 */
export function routeDirtyZone(
  color: OKLCH,
  context: ChromaContextInput & { brandChroma?: number },
): DirtyZoneRouteResult {
  const envelope = qualityEnvelope(
    color.l,
    color.h,
    context.role,
    context.theme,
    context.area,
    context.brandChroma,
  );
  // Route A: 降低色度到 envelope 内。
  if (color.c > envelope.max + 1e-9) {
    return {
      color: { l: color.l, c: envelope.max, h: color.h },
      route: "A",
      adjustments: ["CHROMA_REDUCTION"],
    };
  }
  if (color.c < envelope.min - 1e-9 && color.h !== null) {
    // Route B: 色度太低，尝试微调色相找到更高 Cmin 的方向。
    const routeB = tryHueAdjustment(color, envelope, context);
    if (routeB) return routeB;
    // Route C: 同时提升色度到下限 + 色相微调。
    if (routeB === null && color.h !== null) {
      return {
        color: { l: color.l, c: envelope.min, h: color.h },
        route: "C",
        adjustments: ["CHROMA_REDUCTION", "HUE_COMPENSATION"],
      };
    }
  }
  // Route D: 无法路由，标记失败。
  return {
    color: { ...color },
    route: "D",
    adjustments: ["DIRTY_ZONE_REROUTE"],
  };
}

/** Route B：尝试 ±ΔH 找到 clean 方向。 */
function tryHueAdjustment(
  color: OKLCH,
  _envelope: ChromaEnvelope,
  context: ChromaContextInput & { brandChroma?: number },
): DirtyZoneRouteResult | null {
  if (color.h === null) return null;
  for (let dh = DIRTY_ZONE_HUE_STEP; dh <= DIRTY_ZONE_HUE_MAX; dh += DIRTY_ZONE_HUE_STEP) {
    for (const sign of [1, -1]) {
      const newH = normalizeHue(color.h + sign * dh);
      const newEnvelope = qualityEnvelope(
        color.l,
        newH,
        context.role,
        context.theme,
        context.area,
        context.brandChroma,
      );
      if (color.c >= newEnvelope.min - 1e-9 && color.c <= newEnvelope.max + 1e-9) {
        return {
          color: { l: color.l, c: color.c, h: newH },
          route: "B",
          adjustments: ["HUE_COMPENSATION"],
        };
      }
    }
  }
  return null;
}

// ─── PALETTE-01 §41–§42：约束放松与冲突检测 ────────────────────────────────
/**
 * §42：按优先级放松约束并生成 Decision Record。
 * 默认优先级：Semantic Role > Lightness Structure > Gamut Validity >
 *   Contrast > Hue Stability > Chroma Preservation。
 */
export function relaxConstraints(
  requested: OKLCH,
  constraints: {
    gamut?: "srgb" | "display-p3";
    role?: ColorRole;
    theme?: ThemeMode;
    area?: SurfaceArea;
    brandChroma?: number;
    priority?: readonly ConstraintPriority[];
  },
): { resolved: OKLCH; record: ConstraintDecisionRecord } {
  const priority = constraints.priority ?? DEFAULT_CONSTRAINT_PRIORITY;
  const adjustments: AdjustmentType[] = [];
  const reasons: RelaxationReason[] = [];
  let resolved = { ...requested };
  // 按优先级逐项检查并放松。
  for (const p of priority) {
    switch (p) {
      case "gamut-validity": {
        const target = constraints.gamut ?? "srgb";
        if (resolved.h !== null) {
          const mapped = mapOklchToGamut(resolved, target);
          if (mapped.c < resolved.c - 1e-9) {
            resolved = { ...resolved, c: mapped.c };
            adjustments.push("CHROMA_REDUCTION");
            reasons.push(target === "srgb" ? "SRGB_GAMUT" : "P3_GAMUT");
          }
        }
        break;
      }
      case "lightness-structure": {
        // Lightness ordering 由调用方（Palette 级）检查，此处不重复。
        break;
      }
      case "chroma-preservation": {
        // 最低优先级：如果已经放松到这里，保留当前色度不再降低。
        break;
      }
      default:
        // semantic-role / contrast / hue-stability：由上层 Palette 生成器处理。
        break;
    }
  }
  const record: ConstraintDecisionRecord = {
    requested: { l: requested.l, c: requested.c, h: requested.h },
    resolved: { l: resolved.l, c: resolved.c, h: resolved.h },
    adjustments,
    reason: reasons,
  };
  return { resolved, record };
}

/**
 * PALETTE-01 §43：为单个颜色生成 Decision Record（比较 requested vs resolved）。
 */
export function buildDecisionRecord(
  requested: OKLCH,
  resolved: OKLCH,
  gamutTarget?: "srgb" | "display-p3",
): ConstraintDecisionRecord | null {
  const adjustments: AdjustmentType[] = [];
  const reasons: RelaxationReason[] = [];
  const dC = requested.c - resolved.c;
  const dH = requested.h !== null && resolved.h !== null
    ? Math.abs(requested.h - resolved.h)
    : 0;
  const dL = Math.abs(requested.l - resolved.l);
  if (dC > 1e-9) {
    adjustments.push("CHROMA_REDUCTION");
    reasons.push(gamutTarget === "display-p3" ? "P3_GAMUT" : "SRGB_GAMUT");
  }
  if (dH > 0.5) {
    adjustments.push("HUE_COMPENSATION");
    reasons.push("DIRTY_ZONE");
  }
  if (dL > 1e-9) {
    adjustments.push("LIGHTNESS_ADJUSTMENT");
    reasons.push("LIGHTNESS_ORDERING");
  }
  if (adjustments.length === 0) return null;
  return {
    requested: { l: requested.l, c: requested.c, h: requested.h },
    resolved: { l: resolved.l, c: resolved.c, h: resolved.h },
    adjustments,
    reason: reasons,
  };
}

// ─── V2.5 §75–§76：Constraint Conflict ──────────────────────────────────────
/**
 * 品牌锚点约束冲突检测：品牌色度超出目标空间能力时报告冲突并保留
 * Original Brand（§75 不允许自动改变品牌色或静默降低 Chroma）。
 */
export function brandConstraintConflicts(
  brand: { l: number; c: number; h: number | null },
): import("@cus/core").QualityConflict[] {
  if (brand.c < OK_BRAND_EPSILON || brand.h === null) return [];
  const srgb = mapOklchToGamut(brand, "srgb");
  const loss = gamutLoss(brand.c, srgb.c);
  if (loss <= 0.3) return [];
  const level = gamutLossLevel(loss);
  return [
    {
      code: "CONTEXT_CONFLICT",
      message: `品牌色度 ${(brand.c * 100).toFixed(1)}% 经 sRGB 映射损失 ${(
        loss * 100
      ).toFixed(1)}%（${level}），已保留原始品牌色。`,
      requested: { l: brand.l, c: brand.c, h: brand.h },
      actual: { l: brand.l, c: srgb.c, h: brand.h },
      reason: `Brand chroma exceeds sRGB capacity (gamut loss ${(
        loss * 100
      ).toFixed(1)}%, ${level}); original brand preserved.`,
    },
  ];
}
