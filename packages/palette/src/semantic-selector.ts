/**
 * 增强语义色选择器 —— 硬约束过滤 + 软偏好评分。
 * 
 * 设计原则（参见 regalpine-cus-semantic-color-optimization.md §8）：
 * - 先过滤（feasible），再评分（score），最后选择（select）
 * - 语义色相约束作为硬约束，不被评分权重抵消
 * - 品牌协调、分离度等作为软偏好，用于比较合格候选
 * - 输出诊断信息，解释选择过程
 */

import {
  SEMANTIC_ROLES,
  SEMANTIC_HUES,
  type SemanticRole,
  type ThemeMode,
  type PaletteOptions,
  type LCh,
  type SemanticHuePolicy,
  isHueAllowed,
  hueDistance,
  createDefaultSemanticHuePolicies,
} from "@cus/core";
import {
  createColor,
  normalizeLch,
  clamp,
  lchToLab,
  deltaE2000,
  contrastRatio,
} from "@cus/color";
import type { SemanticPalette } from "@cus/core";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

/**
 * 候选评估结果 —— 包含完整的诊断信息。
 */
export interface CandidateEvaluation {
  /** 候选色相 */
  hue: number;
  /** 生成的颜色 */
  color: SemanticPalette[SemanticRole];
  /** 是否通过硬约束 */
  feasible: boolean;
  /** 未通过的原因列表 */
  rejectedReasons: string[];
  /** 评分明细（仅当 feasible=true 时有值） */
  score?: CandidateScore;
  /** 最终得分（仅当 feasible=true 时有值） */
  finalScore?: number;
}

/**
 * 候选评分明细。
 */
export interface CandidateScore {
  /** 锚点偏好得分（0-1，越接近锚点越高） */
  anchor: number;
  /** 品牌协调得分（0-1，与品牌色越接近越高） */
  brandHarmony: number;
  /** 语义分离度得分（0-1，与其他语义色差距越大越高） */
  separation: number;
  /** 色度适当度得分（0-1） */
  chroma: number;
  /** 加权总分 */
  total: number;
}

/**
 * 单个语义角色的选择结果。
 */
export interface SemanticSelectionResult {
  /** 选定的色相 */
  hue: number;
  /** 生成的颜色 */
  color: SemanticPalette[SemanticRole];
  /** 所有候选的评估详情 */
  candidates: CandidateEvaluation[];
  /** 选择诊断信息 */
  diagnostic: SelectionDiagnostic;
}

/**
 * 选择诊断信息。
 */
export interface SelectionDiagnostic {
  /** 语义角色 */
  role: SemanticRole;
  /** 应用的色相策略 */
  policy: SemanticHuePolicy;
  /** 候选总数 */
  totalCandidates: number;
  /** 通过硬约束的候选数 */
  feasibleCount: number;
  /** 最终选中的候选索引 */
  selectedIndex: number;
  /** 警告信息 */
  warnings: string[];
}

/**
 * 完整的语义色选择诊断报告。
 */
export interface SemanticSelectionDiagnostics {
  /** 使用的策略 */
  strategy: "harmonious" | "distinct";
  /** 主题模式 */
  theme: ThemeMode;
  /** 每个角色的选择结果 */
  results: Record<SemanticRole, SemanticSelectionResult>;
  /** 算法版本 */
  algorithmVersion: string;
  /** 全局警告 */
  warnings: string[];
}

// ─── 评分权重配置 ─────────────────────────────────────────────────────────────

interface ScoringWeights {
  anchor: number;
  brandHarmony: number;
  separation: number;
  chroma: number;
}

const HARMONIOUS_WEIGHTS: ScoringWeights = {
  anchor: 0.35,
  brandHarmony: 0.4,  // 更高的品牌协调权重
  separation: 0.2,    // 较低的分离度权重
  chroma: 0.05,
};

const DISTINCT_WEIGHTS: ScoringWeights = {
  anchor: 0.3,
  brandHarmony: 0.2,  // 较低的品牌协调权重
  separation: 0.45,   // 更高的分离度权重
  chroma: 0.05,
};

// ─── 硬约束检查 ───────────────────────────────────────────────────────────────

/**
 * 检查候选是否满足硬约束。
 */
function checkFeasibility(
  hue: number,
  _role: SemanticRole,
  color: SemanticPalette[SemanticRole],
  policy: SemanticHuePolicy,
  mode: ThemeMode,
): { feasible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const dark = mode === "dark";
  
  // 1. 色相区间约束（硬约束）
  if (!isHueAllowed(hue, policy.allowed)) {
    reasons.push(`色相 ${hue}° 不在允许区间内`);
  }
  
  // 2. 对比度约束（硬约束）
  const fgContrast = contrastRatio(
    color.foreground.calculation.rgb,
    color.soft.calculation.rgb,
  );
  if (fgContrast < 4.5) {
    reasons.push(`前景/背景对比度不足: ${fgContrast.toFixed(2)} < 4.5`);
  }
  
  const baseContrast = contrastRatio(
    color.base.calculation.rgb,
    dark ? "#171717" : "#FFFFFF",
  );
  if (baseContrast < 3) {
    reasons.push(`基色对比度不足: ${baseContrast.toFixed(2)} < 3`);
  }
  
  // 3. 色度范围约束（软约束，转为警告）
  const chroma = color.base.calculation.lch.c;
  if (chroma < 30) {
    reasons.push(`色度过低: ${chroma.toFixed(1)}，可能影响语义识别`);
  }
  
  return {
    feasible: reasons.length === 0,
    reasons,
  };
}

// ─── 评分函数 ─────────────────────────────────────────────────────────────────

/**
 * 计算候选的锚点偏好得分。
 */
function scoreAnchor(hue: number, policy: SemanticHuePolicy): number {
  const distance = hueDistance(hue, policy.anchor);
  const maxDrift = policy.maxDrift ?? 20;
  // 距离越近得分越高，使用线性衰减
  return Math.max(0, 1 - distance / maxDrift);
}

/**
 * 计算候选的品牌协调得分。
 */
function scoreBrandHarmony(
  color: SemanticPalette[SemanticRole],
  brandLab: ReturnType<typeof lchToLab>,
): number {
  const candidateLab = color.base.calculation.lab;
  const distance = deltaE2000(candidateLab, brandLab);
  // 距离越小得分越高，使用 30 作为归一化基准
  return Math.max(0, 1 - Math.min(30, distance) / 30);
}

/**
 * 计算候选的语义分离度得分。
 */
function scoreSeparation(
  color: SemanticPalette[SemanticRole],
  existingResults: Record<string, SemanticSelectionResult>,
): number {
  const existing = Object.values(existingResults);
  if (existing.length === 0) return 1;  // 第一个角色，满分
  
  const distances = existing.map((r) =>
    deltaE2000(
      color.base.calculation.lab,
      r.color.base.calculation.lab,
    ),
  );
  const minDistance = Math.min(...distances);
  // 距离越大得分越高，使用 40 作为归一化基准
  return Math.min(1, minDistance / 40);
}

/**
 * 计算候选的色度适当度得分。
 */
function scoreChroma(color: SemanticPalette[SemanticRole]): number {
  const chroma = color.base.calculation.lch.c;
  // 色度在 40-60 范围内得分最高
  if (chroma >= 40 && chroma <= 60) return 1;
  if (chroma < 40) return chroma / 40;
  return Math.max(0, 1 - (chroma - 60) / 40);
}

/**
 * 计算候选的加权总分。
 */
function calculateTotalScore(
  scores: Omit<CandidateScore, "total">,
  weights: ScoringWeights,
): number {
  return (
    scores.anchor * weights.anchor +
    scores.brandHarmony * weights.brandHarmony +
    scores.separation * weights.separation +
    scores.chroma * weights.chroma
  );
}

// ─── 主选择函数 ───────────────────────────────────────────────────────────────

/**
 * 增强的语义色选择器 —— 带诊断信息的两阶段选择。
 */
export function selectSemanticWithDiagnostics(
  input: LCh,
  mode: ThemeMode = "light",
  options: PaletteOptions = {},
): SemanticSelectionDiagnostics {
  const brand = normalizeLch(input);
  const brandLab = lchToLab(brand);
  const strategy = options.semantic ?? "harmonious";
  const weights = strategy === "distinct" ? DISTINCT_WEIGHTS : HARMONIOUS_WEIGHTS;
  const policies = createDefaultSemanticHuePolicies();
  
  const results = {} as Record<SemanticRole, SemanticSelectionResult>;
  const warnings: string[] = [];
  
  for (const role of SEMANTIC_ROLES) {
    const policy = policies[role] as SemanticHuePolicy;
    const candidates = SEMANTIC_HUES[role].map((h) => {
      const dark = mode === "dark";
      const c = clamp(brand.c * 0.65, 38, 58);
      
      // 生成颜色
      const base = createColor({ l: dark ? 72 : 44, c, h });
      const soft = createColor({ l: dark ? 19 : 96, c: dark ? 13 : 7, h });
      const foreground = createColor({ l: dark ? 84 : 32, c: c * 0.65, h });
      const border = createColor({ l: dark ? 50 : 66, c: c * 0.45, h });
      
      const color = { base, soft, foreground, border } as SemanticPalette[SemanticRole];
      
      // 第一阶段：硬约束检查
      const { feasible, reasons } = checkFeasibility(h, role, color, policy, mode);
      
      if (!feasible) {
        return {
          hue: h,
          color,
          feasible: false,
          rejectedReasons: reasons,
        } as CandidateEvaluation;
      }
      
      // 第二阶段：软偏好评分
      const anchorScore = scoreAnchor(h, policy);
      const brandScore = scoreBrandHarmony(color, brandLab);
      const separationScore = scoreSeparation(color, results);
      const chromaScore = scoreChroma(color);
      
      const totalScore = calculateTotalScore(
        {
          anchor: anchorScore,
          brandHarmony: brandScore,
          separation: separationScore,
          chroma: chromaScore,
        },
        weights,
      );
      
      return {
        hue: h,
        color,
        feasible: true,
        rejectedReasons: [],
        score: {
          anchor: anchorScore,
          brandHarmony: brandScore,
          separation: separationScore,
          chroma: chromaScore,
          total: totalScore,
        },
        finalScore: totalScore,
      } as CandidateEvaluation;
    });
    
    // 选择：优先从合格候选中选择最高分
    const feasibleCandidates = candidates.filter((c) => c.feasible && c.finalScore !== undefined);
    
    let selectedIndex: number;
    let selectedCandidate: CandidateEvaluation;
    
    if (feasibleCandidates.length > 0) {
      // 有合格候选，选择最高分
      feasibleCandidates.sort((a, b) => b.finalScore! - a.finalScore!);
      selectedCandidate = feasibleCandidates[0];
      selectedIndex = candidates.indexOf(selectedCandidate);
    } else {
      // 无合格候选，回退到所有候选中评分最高的
      warnings.push(`${role}: 无合格候选，使用回退策略`);
      candidates.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
      selectedCandidate = candidates[0];
      selectedIndex = candidates.indexOf(selectedCandidate);
    }
    
    results[role] = {
      hue: selectedCandidate.hue,
      color: selectedCandidate.color,
      candidates,
      diagnostic: {
        role,
        policy,
        totalCandidates: candidates.length,
        feasibleCount: feasibleCandidates.length,
        selectedIndex,
        warnings: selectedCandidate.rejectedReasons,
      },
    };
  }
  
  return {
    strategy,
    theme: mode,
    results,
    algorithmVersion: "1.0.0",
    warnings,
  };
}

/**
 * 简化的语义色选择器 —— 兼容现有 API。
 */
export function selectSemanticEnhanced(
  input: LCh,
  mode: ThemeMode = "light",
  options: PaletteOptions = {},
): Record<SemanticRole, { hue: number; color: SemanticPalette[SemanticRole] }> {
  const diagnostics = selectSemanticWithDiagnostics(input, mode, options);
  
  return Object.fromEntries(
    SEMANTIC_ROLES.map((role) => [
      role,
      {
        hue: diagnostics.results[role].hue,
        color: diagnostics.results[role].color,
      },
    ]),
  ) as Record<SemanticRole, { hue: number; color: SemanticPalette[SemanticRole] }>;
}
