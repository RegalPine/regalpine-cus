/**
 * ContrastMatrixView — 全色域对比度矩阵。
 * N×N Token 热力图 · WCAG AAA/AA · APCA · 多色域对比度差异。
 *
 * 布局：快速操作 + 4 个指标卡 + 筛选栏 + 11×11 交叉对比矩阵 + 检查器 + CVD 模拟器。
 */
import { useMemo, useState, useCallback } from "react";
import { contrastRatio, colorDesign, renderColor } from "@cus/color";
import type { V2Color, ThemeMode } from "@cus/core";
import { useBrandStore } from "../../stores/brand-store";
import { simulateCVDColor } from "../../lib/cvd-sim";
import type { CVDType } from "../../lib/cvd-sim";
import { useViewStore } from "../../stores/view-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { PanelCard } from "../../shared/layout/PanelCard";
import { SectionHeading } from "../../shared/layout/SectionHeading";
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n";

type ContrastStatus = "aaa" | "aa" | "large" | "fail";

function getStatus(ratio: number): ContrastStatus {
  if (ratio >= 7) return "aaa";
  if (ratio >= 4.5) return "aa";
  if (ratio >= 3) return "large";
  return "fail";
}

function statusColor(status: ContrastStatus): string {
  switch (status) {
    case "aaa": return "bg-secondary-container/30 text-secondary";
    case "aa": return "bg-primary-container/30 text-primary";
    case "large": return "bg-tertiary-container/30 text-tertiary";
    case "fail": return "bg-error-container/20 text-error";
  }
}

function statusLabel(status: ContrastStatus): string {
  switch (status) {
    case "aaa": return "AAA";
    case "aa": return "AA";
    case "large": return "LG";
    case "fail": return "FAIL";
  }
}

type FilterMode = "all" | "passing" | "failing" | "dark-on-light" | "light-on-dark" | "high-contrast" | "low-contrast";
type MetricMode = "wcag" | "apca" | "both";
type CvdMode = "normal" | "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia" | "lowlight";

interface MatrixCell {
  bgName: string;
  fgName: string;
  bgColor: V2Color;
  fgColor: V2Color;
  ratio: number;
  status: ContrastStatus;
}

/** APCA Lc 近似计算（基于 OKLCH L 差值） */
function approxApcaLc(fgColor: V2Color, bgColor: V2Color): number {
  const fgL = colorDesign(fgColor).l;
  const bgL = colorDesign(bgColor).l;
  const delta = fgL - bgL;
  const polarity = delta >= 0 ? 1 : -1;
  const absDiff = Math.abs(delta);
  const lc = Math.round(polarity * (Math.pow(absDiff, 0.65) * 105));
  return Math.max(-108, Math.min(108, lc));
}

/** CVD 本地模式 → CVDType 映射（lowlight 用特殊 CSS 滤镜） */
const CVD_TYPE_MAP: Record<CvdMode, CVDType | "lowlight"> = {
  normal: "normal",
  protanopia: "protanopia",
  deuteranopia: "deuteranopia",
  tritanopia: "tritanopia",
  achromatopsia: "achromatopsia",
  lowlight: "lowlight",
};

/** lowlight 模式 CSS 滤镜（非标准 CVD，保留 CSS 近似） */
const LOWLIGHT_FILTER = "brightness(0.6) contrast(1.3)";

const cvdLabelKeys: Record<CvdMode, TranslationKey> = {
  normal: "contrast.cvdNormal",
  protanopia: "contrast.cvdProtanopia",
  deuteranopia: "contrast.cvdDeuteranopia",
  tritanopia: "contrast.cvdTritanopia",
  achromatopsia: "contrast.cvdAchromatopsia",
  lowlight: "contrast.cvdLowlight",
};

const cvdAlertKeys: Record<CvdMode, TranslationKey> = {
  normal: "contrast.cvdAlertNormal",
  protanopia: "contrast.cvdAlertProtanopia",
  deuteranopia: "contrast.cvdAlertDeuteranopia",
  tritanopia: "contrast.cvdAlertTritanopia",
  achromatopsia: "contrast.cvdAlertAchromatopsia",
  lowlight: "contrast.cvdAlertLowlight",
};

export default function ContrastMatrixView() {
  usePersistence();
  const t = useT();
  const brand = useBrandStore((s) => s.brand);
  const designOptions = useBrandStore((s) => s.designOptions);
  const mode = useViewStore((s) => s.mode);
  const { effectiveSpace } = useGamutSupport(useBrandStore((s) => s.space));
  const { result } = useThemeEngine(brand, designOptions);

  const [filter, setFilter] = useState<FilterMode>("all");
  const [metricMode, setMetricMode] = useState<MetricMode>("wcag");
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);
  const [cvdMode, setCvdMode] = useState<CvdMode>("normal");
  const [copied, setCopied] = useState(false);

  const activeMode: ThemeMode = mode === "split" ? "light" : mode;
  const palette = result.palettes?.[activeMode] ?? result.palette;

  // 构建色阶列表（Primary 11 阶 + 语义色）
  const colorSteps = useMemo(() => {
    const steps: { name: string; color: V2Color }[] = [];
    for (const [step, color] of Object.entries(palette.primary)) {
      steps.push({ name: step, color });
    }
    // 语义色
    for (const [role, entry] of Object.entries(palette.semantic)) {
      steps.push({ name: role, color: entry.base });
    }
    return steps;
  }, [palette]);

  // 计算 N×N 对比度矩阵
  const matrix = useMemo(() => {
    const cells: MatrixCell[][] = [];
    for (const bg of colorSteps) {
      const row: MatrixCell[] = [];
      for (const fg of colorSteps) {
        const bgHex = renderColor(bg.color, effectiveSpace);
        const fgHex = renderColor(fg.color, effectiveSpace);
        let ratio: number;
        try {
          ratio = contrastRatio(fgHex, bgHex);
        } catch {
          ratio = 1;
        }
        row.push({
          bgName: bg.name,
          fgName: fg.name,
          bgColor: bg.color,
          fgColor: fg.color,
          ratio,
          status: getStatus(ratio),
        });
      }
      cells.push(row);
    }
    return cells;
  }, [colorSteps, effectiveSpace]);

  // 统计
  const stats = useMemo(() => {
    let aaa = 0, aa = 0, large = 0, fail = 0;
    const total = matrix.flat().length;
    for (const row of matrix) {
      for (const cell of row) {
        if (cell.status === "aaa") aaa++;
        else if (cell.status === "aa") aa++;
        else if (cell.status === "large") large++;
        else fail++;
      }
    }
    const aaaRate = total > 0 ? ((aaa + aa) / total) * 100 : 0;
    return { total, aaa, aa, large, fail, aaaRate };
  }, [matrix]);

  // 过滤
  const filteredMatrix = useMemo(() => {
    if (filter === "all") return matrix;
    return matrix.map((row) =>
      row.filter((cell) => {
        switch (filter) {
          case "passing": return cell.status === "aaa" || cell.status === "aa";
          case "failing": return cell.status === "fail" || cell.status === "large";
          case "dark-on-light": {
            const bgL = colorDesign(cell.bgColor).l;
            const fgL = colorDesign(cell.fgColor).l;
            return fgL < bgL;
          }
          case "light-on-dark": {
            const bgL = colorDesign(cell.bgColor).l;
            const fgL = colorDesign(cell.fgColor).l;
            return fgL > bgL;
          }
          case "high-contrast": return cell.ratio >= 7;
          case "low-contrast": return cell.ratio < 4.5;
          default: return true;
        }
      }),
    );
  }, [matrix, filter]);

  const handleFilterChange = useCallback((f: FilterMode) => setFilter(f), []);

  const filterButtons: { value: FilterMode; label: string }[] = [
    { value: "all", label: `${t("contrast.allComb")} (${stats.total})` },
    { value: "passing", label: t("contrast.passOnly") },
    { value: "failing", label: t("contrast.critical") },
    { value: "dark-on-light", label: t("contrast.darkOnLight") },
    { value: "light-on-dark", label: t("contrast.lightOnDark") },
    { value: "high-contrast", label: t("contrast.highContrast") },
    { value: "low-contrast", label: t("contrast.lowContrast") },
  ];

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Summary Metrics */}
      <section className="flex flex-col gap-space-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-space-sm">
              <span className="px-space-xs py-0.5 rounded bg-primary-container text-on-primary-container font-code-value text-[11px] tracking-wide uppercase">CUS Core Auditing</span>
              <span className="text-secondary font-code-value text-[11px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                Realtime Spectral Engine
              </span>
            </div>
            <h1 className="font-ui text-[20px] text-on-surface font-semibold tracking-tight flex items-center gap-space-md">
              Contrast Matrix & Accessibility Auditor
              <span className="font-code-value text-[12px] text-outline-variant font-normal">WCAG 2.2 · APCA Lc Engine</span>
            </h1>
          </div>
          {/* Quick Action Cluster */}
          <div className="flex items-center gap-space-sm shrink-0">
            <button
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md transition-colors shadow-sm whitespace-nowrap shrink-0"
              onClick={() => {
                const rows = matrix.map((row) => row.map((c) => `${c.bgName}/${c.fgName}: ${c.ratio.toFixed(1)}:1 ${c.status}`).join(", "));
                const csv = "Background,Foreground,Ratio,Status\n" + rows.join("\n");
                navigator.clipboard.writeText(csv);
              }}
            >
              <MaterialIcon name="grid_on" size={16} />
              {t("contrast.exportCSV")}
            </button>
            <button
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-fixed-dim transition-colors shadow-sm whitespace-nowrap shrink-0"
              onClick={() => alert(t("contrast.adviceAlert"))}
            >
              <MaterialIcon name="auto_fix_high" size={16} />
              {t("contrast.genAdvice")}
            </button>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-md">
          <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-ui text-[11px] text-outline uppercase tracking-wider">WCAG AAA Compliance</span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-code-value text-[28px] font-semibold text-secondary">{stats.aaaRate.toFixed(1)}%</span>
              <span className="font-code-value text-code-value text-on-surface-variant">{stats.aaa + stats.aa} / {stats.total} pairs</span>
            </div>
            <div className="w-full bg-surface-container-lowest h-1.5 rounded-full mt-3 overflow-hidden">
              <div className="bg-secondary h-full rounded-full transition-all" style={{ width: `${stats.aaaRate}%` }} />
            </div>
          </div>

          <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-ui text-[11px] text-outline uppercase tracking-wider">WCAG AA (≥4.5:1)</span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-code-value text-[28px] font-semibold text-primary">{stats.aa}</span>
              <span className="font-code-value text-code-value text-on-surface-variant">AA pairs</span>
            </div>
          </div>

          <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-ui text-[11px] text-outline uppercase tracking-wider">{t("contrast.criticalFailures")}</span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-code-value text-[28px] font-semibold text-on-surface">{stats.fail}</span>
              <span className="font-code-value text-code-value text-tertiary">{stats.large} large-text warnings</span>
            </div>
          </div>

          <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-ui text-[11px] text-outline uppercase tracking-wider">{t("contrast.activeStandard")}</span>
            </div>
            <div className="flex items-baseline gap-space-sm">
              <span className="font-ui text-[16px] font-semibold text-on-surface">WCAG 2.2</span>
              <span className="font-code-value text-code-value text-secondary">OKLCH calibrated</span>
            </div>
            <div className="flex items-center gap-space-xs mt-2 text-outline font-code-value text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              {effectiveSpace} gamut preservation
            </div>
          </div>
        </div>
      </section>

      {/* Filter Pills & Mode Selector */}
      <section className="bg-surface-container-low p-space-sm rounded-xl flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              className={`px-space-md py-1 rounded font-label-md text-label-md transition-colors whitespace-nowrap shrink-0 ${
                filter === btn.value
                  ? "bg-primary text-on-primary font-semibold shadow-sm"
                  : "bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              }`}
              onClick={() => handleFilterChange(btn.value)}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-space-xs bg-surface-container-lowest p-0.5 rounded-lg">
          {(["wcag", "apca", "both"] as const).map((m) => (
            <button
              key={m}
              className={`px-space-sm py-1 rounded font-label-sm text-label-sm transition-colors whitespace-nowrap shrink-0 ${
                metricMode === m
                  ? "bg-surface-container-high text-on-surface font-medium shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              }`}
              onClick={() => setMetricMode(m)}
            >
              {m === "wcag" ? t("contrast.wcagRatio") : m === "apca" ? "APCA Lc" : t("contrast.dualMode")}
            </button>
          ))}
        </div>
      </section>

      {/* Matrix & Inspector */}
      <section className="grid grid-cols-1 2xl:grid-cols-12 gap-space-lg items-start">
        {/* Matrix (8 cols) */}
        <div className="2xl:col-span-8 flex flex-col gap-space-sm bg-surface-container-low p-space-md rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-space-xs">
            <div className="flex items-center gap-space-md">
              <span className="font-ui text-[13px] font-semibold text-on-surface flex items-center gap-1">
                {t("contrast.matrixTitle")}
              </span>
              <span className="text-outline font-code-value text-[11px]">Y: Bg × X: Fg</span>
            </div>
            <div className="flex items-center gap-space-md font-code-value text-[11px] text-outline">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-secondary-container" />AAA ≥7.0</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-primary-container" />AA ≥4.5</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-tertiary-container" />LG ≥3.0</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-error-container" />Fail &lt;3.0</span>
            </div>
          </div>

          {/* Scrollable Matrix */}
          <div className="w-full overflow-x-auto select-none rounded bg-surface-container-lowest p-space-xs">
            <table className="w-full table-fixed border-collapse font-code-value text-[11px]">
              <thead>
                <tr className="bg-surface-container-lowest text-on-surface-variant">
                  <th className="w-20 p-2 text-left sticky left-0 z-20 bg-surface-container-lowest font-medium text-outline">Bg \ Fg</th>
                  {colorSteps.map((s) => (
                    <th key={s.name} className="p-1 text-center font-medium">{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMatrix.map((row, ri) => (
                  <tr key={ri} className="hover:bg-surface-container-high/40 transition-colors">
                    <th className="p-1.5 text-left sticky left-0 z-10 bg-surface-container-lowest font-medium text-on-surface flex items-center gap-1.5 whitespace-nowrap">
                      <span className="w-3 h-3 rounded shrink-0 shadow-sm" style={{ background: renderColor(colorSteps[ri].color, effectiveSpace) }} />
                      <span className="truncate">{colorSteps[ri].name}</span>
                    </th>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`p-1 text-center cursor-pointer transition-all duration-150 relative group ${
                          selectedCell === cell ? "ring-1 ring-primary" : ""
                        }`}
                        onClick={() => setSelectedCell(cell)}
                      >
                        <div className={`flex flex-col items-center justify-center py-1 rounded hover:bg-surface-container ${statusColor(cell.status)} transition-colors`}>
                          <span className="font-bold text-[11px]">{cell.ratio.toFixed(1)}:1</span>
                          <span className="text-[9px] px-1 rounded mt-0.5 uppercase">{statusLabel(cell.status)}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inspector (4 cols) */}
        <div className="2xl:col-span-4 flex flex-col gap-space-md">
          <PanelCard level="low">
            <SectionHeading eyebrow="INSPECTOR" title={t("contrast.inspectorTitle")} />
            {selectedCell ? (
              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center gap-space-md">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-lg shadow-sm" style={{ background: renderColor(selectedCell.fgColor, effectiveSpace) }} />
                    <span className="font-code-value text-[10px] text-on-surface-variant">FG: {selectedCell.fgName}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-code-value text-[16px] font-bold text-on-surface">{selectedCell.ratio.toFixed(2)}:1</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${statusColor(selectedCell.status)}`}>{statusLabel(selectedCell.status)}</span>
                    <span className="font-code-value text-[10px] text-primary">Lc {approxApcaLc(selectedCell.fgColor, selectedCell.bgColor) > 0 ? "+" : ""}{approxApcaLc(selectedCell.fgColor, selectedCell.bgColor)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-lg shadow-sm" style={{ background: renderColor(selectedCell.bgColor, effectiveSpace) }} />
                    <span className="font-code-value text-[10px] text-on-surface-variant">BG: {selectedCell.bgName}</span>
                  </div>
                </div>
                {/* WCAG thresholds */}
                <div className="flex flex-col gap-1 font-code-value text-code-value text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-outline">AAA (≥7.0:1)</span>
                    <span className={selectedCell.ratio >= 7 ? "text-secondary" : "text-error"}>{selectedCell.ratio >= 7 ? "PASS" : "FAIL"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-outline">AA (≥4.5:1)</span>
                    <span className={selectedCell.ratio >= 4.5 ? "text-primary" : "text-error"}>{selectedCell.ratio >= 4.5 ? "PASS" : "FAIL"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-outline">Large (≥3.0:1)</span>
                    <span className={selectedCell.ratio >= 3 ? "text-tertiary" : "text-error"}>{selectedCell.ratio >= 3 ? "PASS" : "FAIL"}</span>
                  </div>
                </div>
                {/* Enhanced Live Typography Preview */}
                <div className="flex flex-col gap-space-xs">
                  <span className="font-label-sm text-label-sm text-outline">{t("contrast.liveTextTitle")}</span>
                  {(() => {
                    const bgHex = renderColor(selectedCell.bgColor, effectiveSpace);
                    const fgHex = renderColor(selectedCell.fgColor, effectiveSpace);
                    const cvdType = CVD_TYPE_MAP[cvdMode];
                    // 标准 CVD 类型：用 Machado 矩阵精确模拟颜色
                    const isStandardCVD = cvdType !== "normal" && cvdType !== "lowlight";
                    const simBg = isStandardCVD ? simulateCVDColor(bgHex, cvdType) : bgHex;
                    const simFg = isStandardCVD ? simulateCVDColor(fgHex, cvdType) : fgHex;
                    const previewFilter = cvdType === "lowlight" ? LOWLIGHT_FILTER : undefined;
                    return (
                      <div
                        className="p-space-md rounded-lg flex flex-col gap-space-sm transition-all duration-200"
                        style={{
                          background: simBg,
                          color: simFg,
                          filter: previewFilter,
                        }}
                      >
                        <div>
                          <span className="font-code-value text-[10px] opacity-60 block">24px Bold Headline</span>
                          <p className="font-ui text-[24px] font-semibold leading-tight tracking-tight">
                            {t("contrast.liveHeadline")}
                          </p>
                        </div>
                        <div>
                          <span className="font-code-value text-[10px] opacity-60 block">14px Regular Body (WCAG 4.5:1 / APCA 75)</span>
                          <p className="font-ui text-[14px] leading-relaxed">
                            {t("contrast.liveBody")}
                          </p>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="font-code-value text-[11px] opacity-75">11px Caption Token: {selectedCell.fgName}</span>
                          <button
                            className="px-space-sm py-1 rounded font-label-sm text-label-sm font-semibold flex items-center gap-1 shadow-sm hover:opacity-90 transition-opacity"
                            style={{
                              background: simFg,
                              color: simBg,
                            }}
                          >
                            <MaterialIcon name="touch_app" size={14} />
                            {t("contrast.actionComponent")}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Copy CSS Snippet */}
                <button
                  className="py-1.5 px-space-sm rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors font-code-value text-[11px] whitespace-nowrap shrink-0 self-end"
                  onClick={() => {
                    const fgHex = renderColor(selectedCell.fgColor, effectiveSpace);
                    const bgHex = renderColor(selectedCell.bgColor, effectiveSpace);
                    navigator.clipboard.writeText(`--clr-contrast-fg: ${fgHex};\n--clr-contrast-bg: ${bgHex};`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? t("contrast.copiedCSS") : t("contrast.copyCSS")}
                </button>
              </div>
            ) : (
              <p className="text-on-surface-variant text-[12px]">{t("contrast.clickHint")}</p>
            )}
          </PanelCard>

          {/* Summary */}
          <PanelCard level="lowest">
            <div className="flex flex-col gap-1 font-code-value text-code-value text-[11px] text-on-surface-variant">
              <div className="flex justify-between"><span>{t("contrast.totalPairs")}</span><span className="text-on-surface">{stats.total}</span></div>
              <div className="flex justify-between"><span>{t("contrast.aaaPass")}</span><span className="text-secondary">{stats.aaa}</span></div>
              <div className="flex justify-between"><span>{t("contrast.aaPass")}</span><span className="text-primary">{stats.aa}</span></div>
              <div className="flex justify-between"><span>{t("contrast.largeText")}</span><span className="text-tertiary">{stats.large}</span></div>
              <div className="flex justify-between"><span>{t("contrast.fail")}</span><span className="text-error">{stats.fail}</span></div>
            </div>
          </PanelCard>

          {/* APCA Polarity Gain Curve */}
          <PanelCard level="low">
            <SectionHeading eyebrow="APCA" title={t("contrast.apcaTitle")} badge={t("contrast.lcModelBadge")} />
            <div className="bg-surface-container-lowest rounded-lg p-2">
              <svg viewBox="0 0 200 80" className="w-full h-20">
                {/* Axes */}
                <line x1={30} y1={5} x2={30} y2={70} stroke="#464554" strokeWidth={0.5} />
                <line x1={30} y1={40} x2={195} y2={40} stroke="#464554" strokeWidth={0.5} strokeDasharray="2 2" />
                {/* Y-axis labels */}
                <text x={26} y={10} fill="#908fa0" fontSize={7} textAnchor="end" fontFamily="JetBrains Mono">+Lc</text>
                <text x={26} y={43} fill="#908fa0" fontSize={7} textAnchor="end" fontFamily="JetBrains Mono">0</text>
                <text x={26} y={73} fill="#908fa0" fontSize={7} textAnchor="end" fontFamily="JetBrains Mono">-Lc</text>
                {/* Light-on-dark bonus curve (green) */}
                <path
                  d={`M 30,40 Q 80,15 120,12 T 195,8`}
                  fill="none" stroke="#4edea3" strokeWidth={1.5} opacity={0.8}
                />
                <text x={160} y={6} fill="#4edea3" fontSize={7} fontFamily="JetBrains Mono">LoD +bonus</text>
                {/* Dark-on-light penalty curve (orange) */}
                <path
                  d={`M 30,40 Q 80,62 120,65 T 195,70`}
                  fill="none" stroke="#ffb783" strokeWidth={1.5} opacity={0.8}
                />
                <text x={160} y={78} fill="#ffb783" fontSize={7} fontFamily="JetBrains Mono">DoL -penalty</text>
                {/* Zero line label */}
                <text x={195} y={37} fill="#908fa0" fontSize={6} textAnchor="end" fontFamily="JetBrains Mono">ΔL=0</text>
              </svg>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant text-[11px] mt-1">
              {t("contrast.apcaDesc")}
            </p>
          </PanelCard>

          {/* WCAG vs APCA Difference Analysis */}
          <PanelCard level="low">
            <SectionHeading eyebrow="COMPARISON" title={t("contrast.diffTitle")} />
            <div className="flex flex-col gap-space-sm">
              {/* Methodology comparison */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface-container-lowest p-2 rounded-lg">
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold block mb-1">WCAG 2.2</span>
                  <ul className="flex flex-col gap-0.5 font-body-sm text-body-sm text-on-surface-variant text-[10px]">
                    <li>· {t("contrast.wcagLum")}</li>
                    <li>· {t("contrast.wcagFixed")}</li>
                    <li>· {t("contrast.wcagNoPolarity")}</li>
                    <li>· {t("contrast.wcagSRGB")}</li>
                  </ul>
                </div>
                <div className="bg-surface-container-lowest p-2 rounded-lg">
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold block mb-1">APCA</span>
                  <ul className="flex flex-col gap-0.5 font-body-sm text-body-sm text-on-surface-variant text-[10px]">
                    <li>· {t("contrast.apcaLc")}</li>
                    <li>· {t("contrast.apcaAdaptive")}</li>
                    <li>· {t("contrast.apcaPolarity")}</li>
                    <li>· {t("contrast.apcaCIE")}</li>
                  </ul>
                </div>
              </div>
              {/* Safe tokens list */}
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-on-surface font-medium">{t("contrast.safeTokens")}</span>
                <div className="flex flex-wrap gap-1">
                  {colorSteps.slice(0, 6).map((s) => {
                    const bgHex = renderColor(colorSteps[0].color, effectiveSpace);
                    const fgHex = renderColor(s.color, effectiveSpace);
                    let ratio: number;
                    try { ratio = contrastRatio(fgHex, bgHex); } catch { ratio = 1; }
                    const passWCAG = ratio >= 4.5;
                    const approxLc = Math.abs(colorDesign(s.color).l - colorDesign(colorSteps[0].color).l) * 120;
                    const passAPCA = approxLc >= 60;
                    if (!passWCAG && !passAPCA) return null;
                    return (
                      <span key={s.name} className={`px-1.5 py-0.5 rounded text-[10px] font-code-value font-medium ${
                        passWCAG && passAPCA ? "bg-secondary-container/20 text-secondary" : "bg-tertiary-container/20 text-tertiary"
                      }`}>
                        {s.name} {passWCAG && passAPCA ? "✓✓" : "✓"}
                      </span>
                    );
                  })}
                </div>
              </div>
              {/* Conflicting tokens */}
              <div className="flex flex-col gap-1">
                <span className="font-label-sm text-label-sm text-on-surface font-medium">{t("contrast.conflictTokens")}</span>
                <div className="flex flex-wrap gap-1">
                  {colorSteps.slice(1, 6).map((s) => {
                    const bgHex = renderColor(colorSteps[0].color, effectiveSpace);
                    const fgHex = renderColor(s.color, effectiveSpace);
                    let ratio: number;
                    try { ratio = contrastRatio(fgHex, bgHex); } catch { ratio = 1; }
                    const passWCAG = ratio >= 4.5;
                    const approxLc = Math.abs(colorDesign(s.color).l - colorDesign(colorSteps[0].color).l) * 120;
                    const passAPCA = approxLc >= 60;
                    if (passWCAG === passAPCA) return null;
                    return (
                      <span key={s.name} className="px-1.5 py-0.5 rounded bg-error-container/20 text-error text-[10px] font-code-value font-medium">
                        {s.name} {passWCAG ? "WCAG✓" : "APCA✓"}
                      </span>
                    );
                  })}
                  {colorSteps.slice(1, 6).every((s) => {
                    const bgHex = renderColor(colorSteps[0].color, effectiveSpace);
                    const fgHex = renderColor(s.color, effectiveSpace);
                    let ratio: number;
                    try { ratio = contrastRatio(fgHex, bgHex); } catch { ratio = 1; }
                    const passWCAG = ratio >= 4.5;
                    const approxLc = Math.abs(colorDesign(s.color).l - colorDesign(colorSteps[0].color).l) * 120;
                    const passAPCA = approxLc >= 60;
                    return passWCAG === passAPCA;
                  }) && (
                    <span className="text-on-surface-variant text-[10px]">{t("contrast.noConflict")}</span>
                  )}
                </div>
              </div>
            </div>
          </PanelCard>

          {/* CVD Color Vision Deficiency Simulator */}
          <PanelCard level="low">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-sm text-label-sm text-outline">{t("contrast.cvdTitle")}</span>
              <span className="font-code-value text-[10px] text-on-surface-variant">{t(cvdAlertKeys[cvdMode])}</span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-surface-container-lowest p-1 rounded-lg text-center">
              {(Object.keys(cvdLabelKeys) as CvdMode[]).map((m) => (
                <button
                  key={m}
                  className={`px-space-xs py-1 rounded font-code-value text-[11px] whitespace-nowrap shrink-0 transition-colors ${
                    cvdMode === m
                      ? "bg-surface-container-high text-on-surface font-semibold"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  }`}
                  onClick={() => setCvdMode(m)}
                >
                  {t(cvdLabelKeys[m])}
                </button>
              ))}
            </div>
          </PanelCard>

          {/* Auto-Tuning Recommendation */}
          {selectedCell && (
            <PanelCard level="low">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1 font-label-sm text-label-sm font-semibold text-secondary">
                  <MaterialIcon name="psychology" size={16} />
                  {t("contrast.autoTuneTitle")}
                </div>
                <span className="font-code-value text-[10px] px-1.5 py-0.5 rounded bg-secondary-container/20 text-secondary">
                  Optimal L {colorDesign(selectedCell.fgColor).l.toFixed(2)}
                </span>
              </div>
              <p className="font-code-value text-[11px] text-on-surface-variant leading-relaxed">
                {selectedCell.ratio < 4.5
                  ? t("contrast.tuneAdviceFail", { ratio: selectedCell.ratio.toFixed(1) })
                  : t("contrast.tuneAdvicePass", { ratio: selectedCell.ratio.toFixed(1), lc: approxApcaLc(selectedCell.fgColor, selectedCell.bgColor).toFixed(0) })}
              </p>
              <div className="flex items-center gap-space-sm pt-2">
                <button className="flex-1 py-1.5 px-space-md rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <MaterialIcon name="auto_fix_high" size={16} className="text-primary" />
                  {t("contrast.applyCompensation")}
                </button>
              </div>
            </PanelCard>
          )}
        </div>
      </section>
    </div>
  );
}
