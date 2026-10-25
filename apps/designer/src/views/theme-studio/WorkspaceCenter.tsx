/**
 * WorkspaceCenter — 中央工作台（色板阶梯 + 语义色阶 + 质量验证）。
 */
import { useMemo, useState } from "react";
import type { GeneratedTheme, ValidationReport } from "@cus/core";
import { contrastRatio } from "@cus/color";
import { PanelCard } from "../../shared/layout/PanelCard";
import { useT } from "../../i18n";

function getContrastLabel(ratio: number): { text: string; cls: string } {
  if (ratio >= 7) return { text: `${ratio.toFixed(1)}:1 AAA`, cls: "bg-secondary-container/20 text-secondary" };
  if (ratio >= 4.5) return { text: `${ratio.toFixed(1)}:1 AA`, cls: "bg-warning/20 text-warning" };
  return { text: `${ratio.toFixed(1)}:1 Fail`, cls: "bg-error/20 text-error" };
}

/* ── 内联质量验证面板（与整体 PanelCard 风格一致） ── */
function ValidationSection({ report }: { report: ValidationReport }) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState("issues");
  const categories = ["Color", "Gamut", "Palette", "Semantic", "Contrast", "Theme", "Component", "Hue"] as const;
  const t = useT();

  const filtered = report.results.filter(
    (r) => filter === "all" || (filter === "issues" ? r.status !== "PASS" : r.category === filter),
  );

  const statusIcon = (s: string) => (s === "PASS" ? "✓" : s === "WARN" ? "△" : "×");
  const chipCls = (s: string) =>
    s === "PASS"
      ? "bg-secondary-container/20 text-secondary"
      : s === "WARN"
        ? "bg-warning/20 text-warning"
        : "bg-error/20 text-error";

  return (
    <PanelCard level="low">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{t("workspace.validation")}</span>
          <span className="px-2 py-0.5 rounded bg-surface-container-high text-outline font-code-value text-body-sm">VALIDATION</span>
        </div>
        <button
          className="font-label-sm text-label-sm text-primary hover:underline cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t("workspace.collapseReport") : t("workspace.expandReport")}
        </button>
      </div>

      {/* 分类 Chip */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => {
          const values = report.results.filter((r) => r.category === cat);
          const status = values.some((r) => r.status === "FAIL") ? "FAIL" : values.some((r) => r.status === "WARN") ? "WARN" : "PASS";
          return (
            <button
              key={cat}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-code-value text-body-sm font-semibold cursor-pointer transition-opacity hover:opacity-80 ${chipCls(status)}`}
              onClick={() => { setExpanded(true); setFilter(cat); }}
            >
              <span>{statusIcon(status)}</span>{cat}
            </button>
          );
        })}
      </div>

      {/* 汇总 */}
      <div className="flex items-center justify-between font-code-value text-body-sm">
        <span className="text-on-surface">
          <b className="text-secondary">{report.counts.PASS}</b> {t("workspace.passCount")}{" "}
          <b className="text-warning">{report.counts.WARN}</b> {t("workspace.warnCount")}{" "}
          <b className="text-error">{report.counts.FAIL}</b> {t("workspace.failCount")}
        </span>
        <span className="text-outline">ΔEOK · ΔE00 · sRGB / P3</span>
      </div>

      {/* 展开报告 */}
      {expanded && (
        <div className="flex flex-col gap-space-sm pt-space-sm border-t border-outline-variant/20">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 font-label-sm text-label-sm text-outline">
              {t("workspace.filter")}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-surface-container-high text-on-surface rounded px-2 py-0.5 font-code-value text-body-sm cursor-pointer"
              >
                <option value="issues">{t("workspace.filterIssues")}</option>
                <option value="all">{t("workspace.filterAll")}</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <span className="font-code-value text-body-sm text-outline">{filtered.length} {t("workspace.checkCount")}</span>
          </div>
          <ul className="flex flex-col gap-1">
            {filtered.length ? (
              filtered.map((r) => (
                <li key={r.id} className="flex items-center gap-2 font-code-value text-body-sm py-1 px-2 rounded bg-surface-container-lowest">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${chipCls(r.status)}`}>{r.status}</span>
                  <span className="text-on-surface flex-1">{r.message}</span>
                  {r.value !== undefined && (
                    <span className="text-outline">
                      {r.value.toFixed(2)}{r.threshold !== undefined ? ` / ${r.threshold}` : ""}
                    </span>
                  )}
                </li>
              ))
            ) : (
              <li className="text-outline font-label-sm text-label-sm text-center py-2">{t("workspace.noIssues")}</li>
            )}
          </ul>
        </div>
      )}
    </PanelCard>
  );
}

export function WorkspaceCenter({
  result,
}: {
  result: GeneratedTheme;
}) {
  const t = useT();

  const primaryContrasts = useMemo(() => {
    return Object.entries(result.palette.primary).map(([step, color]) => {
      const isLight = color.lch.l > 0.5;
      const bg = isLight ? "#0a0e16" : "#FFFFFF";
      const ratio = contrastRatio(color.hex, bg);
      return { step, color, label: getContrastLabel(ratio) };
    });
  }, [result.palette.primary]);

  const semanticScales = useMemo(() => {
    const feedbackRoles: { key: string; labelKey: "workspace.success" | "workspace.warning" | "workspace.danger" | "workspace.info"; dotColor: string; textColor: string }[] = [
      { key: "success", labelKey: "workspace.success", dotColor: "bg-secondary", textColor: "text-secondary" },
      { key: "warning", labelKey: "workspace.warning", dotColor: "bg-tertiary", textColor: "text-tertiary" },
      { key: "danger", labelKey: "workspace.danger", dotColor: "bg-error", textColor: "text-error" },
      { key: "info", labelKey: "workspace.info", dotColor: "bg-primary", textColor: "text-primary" },
    ];
    const feedbackScales = feedbackRoles
      .filter((r) => result.palette.feedback[r.key as keyof typeof result.palette.feedback])
      .map((r) => {
        const scale = result.palette.feedback[r.key as keyof typeof result.palette.feedback];
        const steps = Object.entries(scale).map(([step, color]) => {
          const isLight = color.lch.l > 0.5;
          const bg = isLight ? "#0a0e16" : "#FFFFFF";
          const ratio = contrastRatio(color.hex, bg);
          return { step, color, label: getContrastLabel(ratio) };
        });
        return { role: r.key, label: t(r.labelKey), dotColor: r.dotColor, textColor: r.textColor, steps, group: "feedback" };
      });

    // Additional palette scales
    const extraScales: { key: "secondary" | "accent" | "neutral"; labelKey: "workspace.secondary" | "workspace.accent" | "workspace.neutral"; dotColor: string; textColor: string }[] = [
      { key: "secondary", labelKey: "workspace.secondary", dotColor: "bg-secondary", textColor: "text-secondary" },
      { key: "accent", labelKey: "workspace.accent", dotColor: "bg-tertiary", textColor: "text-tertiary" },
      { key: "neutral", labelKey: "workspace.neutral", dotColor: "bg-outline", textColor: "text-on-surface" },
    ];
    const paletteScales = extraScales
      .filter((r) => result.palette[r.key])
      .map((r) => {
        const scale = result.palette[r.key];
        const steps = Object.entries(scale).map(([step, color]) => {
          const isLight = color.lch.l > 0.5;
          const bg = isLight ? "#0a0e16" : "#FFFFFF";
          const ratio = contrastRatio(color.hex, bg);
          return { step, color, label: getContrastLabel(ratio) };
        });
        return { role: r.key, label: t(r.labelKey), dotColor: r.dotColor, textColor: r.textColor, steps, group: "palette" };
      });

    // neutral 排到最后
    const nonNeutralPalette = paletteScales.filter((s) => s.role !== "neutral");
    const neutralPalette = paletteScales.filter((s) => s.role === "neutral");
    return [...nonNeutralPalette, ...feedbackScales, ...neutralPalette];
  }, [result.palette, t]);

  return (
    <div className="flex flex-col gap-space-lg">
      {/* ── Section 1: Primary Scale 阶梯体系 ── */}
      <PanelCard level="low">
        <div className="flex items-center justify-between mb-space-md">
          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{t("workspace.primaryScale")}</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-code-value text-body-sm font-semibold">50 – 950</span>
          </div>
          <div className="flex items-center gap-2 font-code-value text-body-sm text-outline shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />{t("workspace.oklchInterp")}
            </span>
            <span>·</span>
            <span>11 Steps</span>
          </div>
        </div>
        <p className="font-label-sm text-label-sm text-outline mb-space-md">{t("workspace.fitDesc")}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-11 gap-1.5">
          {primaryContrasts.map(({ step, color, label }) => {
            const isBase = step === "500";
            const isLight = color.lch.l > 0.5;
            const textColor = isLight ? "text-slate-800" : "text-white";
            return (
              <div
                key={step}
                className={`flex flex-col bg-surface-container-lowest rounded-lg p-1.5 group hover:bg-surface-container-high transition-all ${
                  isBase ? "ring-1 ring-primary shadow-md relative" : ""
                }`}
              >
                {isBase && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-primary text-on-primary font-code-value text-[9px] font-bold">BASE</span>
                )}
                <div
                  className={`w-full h-14 rounded shadow-inner mb-2 flex items-center justify-center relative transition-transform group-hover:scale-[1.02] ${textColor}`}
                  style={{ background: color.hex }}
                >
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[14px]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(color.hex);
                      } catch { /* ignore */ }
                    }}
                    aria-label={`${t("workspace.copyAria")} ${color.hex}`}
                  >📋</button>
                </div>
                <span className={`font-code-value text-code-value font-bold ${isBase ? "text-primary" : "text-on-surface"}`}>{step}</span>
                <span className={`font-code-value text-[11px] truncate ${isBase ? "text-on-surface font-semibold" : "text-on-surface-variant"}`}>{color.hex}</span>
                <span className="font-code-value text-[10px] text-outline mt-1">
                  L: {color.lch.l.toFixed(2)} C: {color.lch.c.toFixed(2)}
                </span>
                <div className={`mt-1 px-1 py-0.5 rounded ${label.cls} font-code-value text-[10px] text-center font-semibold`}>
                  {label.text}
                </div>
              </div>
            );
          })}
        </div>
      </PanelCard>

      {/* ── Section 2: 语义色阶色板 ── */}
      <PanelCard level="low">
        <div className="flex items-center justify-between mb-space-md">
          <div className="flex items-center gap-2">
            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{t("workspace.semanticScales")}</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-outline font-code-value text-body-sm">{semanticScales.length} Scales × 11 Steps</span>
          </div>
          <span className="font-code-value text-body-sm text-outline">@cus/semantic-engine feedback</span>
        </div>
        <div className="flex flex-col gap-space-lg">
          {semanticScales.map(({ role, label, dotColor, textColor, steps }) => (
            <div key={role} className="flex flex-col gap-space-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
                <span className={`font-label-md text-label-md font-semibold ${textColor}`}>{label}</span>
                <span className="font-code-value text-[11px] text-outline">{role.toUpperCase()}</span>
              </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-11 gap-1.5">
                  {steps.map(({ step, color, label }) => {
                    const isLight = color.lch.l > 0.5;
                    const textColor = isLight ? "text-slate-800" : "text-white";
                    return (
                      <div
                        key={step}
                        className="flex flex-col bg-surface-container-lowest rounded-lg p-1.5 group hover:bg-surface-container-high transition-all"
                      >
                        <div
                          className={`w-full h-10 rounded shadow-inner mb-1.5 flex items-center justify-center relative transition-transform group-hover:scale-[1.02] ${textColor}`}
                          style={{ background: color.hex }}
                        >
                          <button
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[12px]"
                            onClick={async () => {
                              try { await navigator.clipboard.writeText(color.hex); } catch { /* ignore */ }
                            }}
                            aria-label={`${t("workspace.copyAria")} ${color.hex}`}
                          >📋</button>
                        </div>
                        <span className="font-code-value text-[11px] font-bold text-on-surface">{step}</span>
                        <span className="font-code-value text-[10px] truncate text-on-surface-variant">{color.hex}</span>
                        <span className="font-code-value text-[9px] text-outline mt-0.5">
                          L:{color.lch.l.toFixed(2)} C:{color.lch.c.toFixed(2)}
                        </span>
                        <div className={`mt-0.5 px-1 py-0.5 rounded ${label.cls} font-code-value text-[9px] text-center font-semibold`}>
                          {label.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
          ))}
        </div>
      </PanelCard>

      {/* ── Section 3: 质量验证 ── */}
      <ValidationSection report={result.validation} />
    </div>
  );
}
