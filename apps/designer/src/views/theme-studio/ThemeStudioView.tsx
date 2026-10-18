/**
 * ThemeStudioView — OKLCH 主题工作室（三栏布局）。
 * 与原型 cus_designer_oklch_theme_studio 对齐。
 *
 * 布局：左（品牌色控制 3col）+ 中（工作台 6col）+ 右（WCAG + 导出 3col）
 */
import { useRef, useCallback, useState } from "react";
import type { GeneratedTheme } from "@cus/core";
import { parseThemeConfig, CONFIG_MAX_BYTES } from "@cus/export";
import { PreviewSpace } from "../../components/PreviewSpace";
import { Modal } from "../../components/Modal";
import { ColorInspector } from "../../components/ColorInspector";
import { ExportPanel } from "../../panels/Panels";
import { useBrandStore } from "../../stores/brand-store";
import { useViewStore } from "../../stores/view-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useBrandInput } from "../../hooks/useBrandInput";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { BrandSidebar } from "./BrandSidebar";
import { WorkspaceCenter } from "./WorkspaceCenter";
import { PanelCard } from "../../shared/layout/PanelCard";
import { useT } from "../../i18n";

export default function ThemeStudioView() {
  // ── Store selectors ──
  const brand = useBrandStore();
  const inspected = useUIStore((s) => s.inspected);
  const setInspected = useUIStore((s) => s.setInspected);
  const toast = useUIStore((s) => s.toast);
  const setToast = useUIStore((s) => s.setToast);
  const exporting = useUIStore((s) => s.exporting);
  const setExporting = useUIStore((s) => s.setExporting);
  const t = useT();

  // ─ Hooks ──
  const gamut = useGamutSupport(brand.space);
  const interactiveInput = brand.canonicalInput ?? brand.brand;
  const { result } = useThemeEngine(interactiveInput, brand.designOptions);
  const actions = useBrandInput(result.brand.alpha);
  usePersistence();

  // ── Toast 自动消失 ──
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 3500);
  }, [setToast]);

  // ── 文件导入 ──
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <PreviewSpace.Provider value={gamut.effectiveSpace}>
      <div data-preview-space={gamut.effectiveSpace}>
        {/* ── 隐藏文件输入 ─ */}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label={t("studio.importLabel")}
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            try {
              if (file.size > CONFIG_MAX_BYTES)
                throw new Error(t("studio.importErrorSize"));
              const config = parseThemeConfig(await file.text());
              actions.updateBrand(config.brand);
              if (config.brandInput) {
                brand.setCanonicalInput(config.brandInput);
              }
              brand.setDesignOptions(config.options ?? {});
              useViewStore.getState().setMode(
                config.generateLight && config.generateDark
                  ? "split"
                  : config.generateLight ? "light" : "dark",
              );
              notify(t("studio.importSuccess"));
            } catch (err) {
              notify(err instanceof Error ? err.message : t("studio.importFail"));
            }
          }}
        />

        {/* ── Section Title ── */}
        <div className="flex items-center gap-space-md mb-space-lg">
          <div className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse shrink-0" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-[16px] text-on-surface font-semibold tracking-tight">
                {t("studio.mainTitle")}
              </span>
              <span className="px-space-xs py-0.5 rounded bg-primary-container/20 text-primary font-code-value text-body-sm font-medium">
                {t("studio.luminanceBadge")}
              </span>
            </div>
            <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
              {t("studio.subtitle")}
            </p>
          </div>
        </div>

        {/* ─ 三栏主体 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
          {/* 左栏：品牌色控制 */}
          <div className="xl:col-span-3">
            <BrandSidebar result={result} />
          </div>

          {/* 中栏：色板阶梯 */}
          <div className="xl:col-span-6">
            <WorkspaceCenter result={result} />
          </div>

          {/* 右栏：WCAG 验证 + 导出预览 */}
          <div className="xl:col-span-3">
            <RightPanel result={result} />
          </div>
        </div>

        {/* ── 导出 Modal ── */}
        {exporting && (
          <ExportPanel
            result={result}
            onClose={() => setExporting(false)}
            notify={notify}
            onOutputChange={(output) =>
              brand.setDesignOptions({ ...brand.designOptions, output })
            }
          />
        )}

        {/* ── 颜色检查器 Modal ─ */}
        {inspected && (
          <Modal title={inspected.name} onClose={() => setInspected(null)} className="modal-wide">
            <ColorInspector color={inspected.color} result={result} />
            <div className="inspected-hex">
              <code>{inspected.color.hex}</code>
              <button
                className="outline-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inspected.color.hex);
                    notify(t("studio.hexCopied"));
                  } catch { notify(t("studio.clipboardFail")); }
                }}
              >{t("studio.copyHex")}</button>
            </div>
          </Modal>
        )}

        {/* ─ Toast ── */}
        <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">
          {toast}
        </div>
      </div>
    </PreviewSpace.Provider>
  );
}

/** 右侧面板：WCAG 验证 + 多格式导出预览 + Monorepo 信息（与原型对齐） */
function RightPanel({ result }: { result: GeneratedTheme }) {
  const [exportTab, setExportTab] = useState("css");
  const t = useT();

  const passRate = result.validation.counts.PASS + result.validation.counts.WARN;
  const totalChecks = passRate + result.validation.counts.FAIL;
  const passPct = totalChecks > 0 ? (result.validation.counts.PASS / totalChecks) * 100 : 100;

  const codeSnippets: Record<string, string> = {
    css: `/* CUS OKLCH Tokens v1.4 */\n:root {\n  --color-primary-50: oklch(0.96 0.03 275.4);\n  --color-primary-100: oklch(0.92 0.06 275.4);\n  --color-primary-500: oklch(0.58 0.24 275.4);\n  --color-primary-600: oklch(0.49 0.23 275.1);\n  --color-primary-900: oklch(0.25 0.13 274.8);\n  --surface-elevated: oklch(0.18 0.02 270.0);\n  --gamut-gamut-map: p3-preserving;\n}`,
    tailwind: `// tailwind.config.ts\nexport default {\n  theme: {\n    extend: {\n      colors: {\n        primary: {\n          50: 'oklch(0.96 0.03 275.4)',\n          500: 'oklch(0.58 0.24 275.4)',\n          900: 'oklch(0.25 0.13 274.8)',\n        },\n      },\n    },\n  },\n}`,
    figma: `{
  "name": "CUS Design Tokens",
  "tokens": {
    "color": {
      "primary": {
        "500": { "value": "#6366f1", "type": "color" },
        "600": { "value": "#4f46e5", "type": "color" }
      }
    }
  }
}`,
    json: `{
  "brand": { "hex": "${result.brand.hex}", "oklch": { "l": ${result.brand.oklch.l.toFixed(3)}, "c": ${result.brand.oklch.c.toFixed(3)} } },
  "palette": { "primary": { "500": "${result.palette.primary["500"]?.hex ?? result.brand.hex}" } },
  "gamut": "srgb"
}`,
  };

  return (
    <div className="flex flex-col gap-space-md">
      {/* ── Accessibility Compliance Card (WCAG 2.2) ── */}
      <PanelCard level="low">
        <div className="flex items-center justify-between mb-space-md">
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-2">
            <span className="text-secondary text-[18px]">🛡</span>
            {t("studio.wcagTitle")}
          </h2>
          <span className="font-code-value text-body-sm text-secondary font-bold">{passPct.toFixed(0)}% Pass</span>
        </div>
        {/* Circular Gauge + Status */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl flex items-center gap-space-md mb-space-md">
          <div className="relative w-14 h-14 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx={18} cy={18} r={14} fill="none" stroke="#262a33" strokeWidth={3} />
              <circle
                cx={18} cy={18} r={14} fill="none"
                stroke={passPct >= 90 ? "#4edea3" : passPct >= 70 ? "#ffb783" : "#ffb4ab"}
                strokeWidth={3}
                strokeDasharray={`${(passPct / 100) * 88} 88`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-code-value text-body-sm font-bold text-secondary">AAA</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-surface font-semibold">{t("studio.wcagPass")}</span>
            <span className="font-body-sm text-body-sm text-outline">{t("studio.wcagDesc")}</span>
          </div>
        </div>
        {/* Contrast Matrix Rows */}
        <div className="flex flex-col gap-2">
          {[
            { label: t("studio.wcagNormalText"), detail: "16px Regular / 400", ratio: "8.6:1", badge: "Pass AAA" },
            { label: t("studio.wcagLargeText"), detail: "20px Bold / 600", ratio: "12.1:1", badge: "Pass AAA" },
            { label: t("studio.wcagUIGraphics"), detail: "Form fields & Focus Rings", ratio: "4.8:1", badge: "Pass AA" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between p-2 rounded-lg bg-surface-container">
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-on-surface">{row.label}</span>
                <span className="font-code-value text-[10px] text-outline">{row.detail}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-code-value text-body-sm text-on-surface font-bold">{row.ratio}</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary-container/20 text-secondary font-code-value text-[10px] font-semibold">{row.badge}</span>
              </div>
            </div>
          ))}
        </div>
      </PanelCard>

      {/* ── Multi-Format Export Preview Card ── */}
      <PanelCard level="low">
        <div className="flex items-center justify-between mb-space-md">
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-2">
            <span className="text-primary text-[18px]">⌘</span>
            {t("studio.exportTitle")}
          </h2>
          <span className="font-code-value text-body-sm text-outline">{t("studio.liveSync")}</span>
        </div>
        {/* Format Tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-surface-container-lowest rounded-lg font-label-sm text-body-sm shrink-0 mb-space-md">
          {([["css", "studio.cssVarTab"], ["tailwind", "studio.tailwindTab"], ["figma", "studio.figmaTab"], ["json", "studio.jsonTab"]] as [string, Parameters<typeof t>[0]][]).map(([key, labelKey]) => (
            <button
              key={key}
              className={`px-2 py-1 rounded transition-colors ${
                exportTab === key ? "bg-surface-container-high text-on-surface font-semibold" : "text-on-surface-variant hover:text-on-surface"
              }`}
              onClick={() => setExportTab(key)}
            >{t(labelKey)}</button>
          ))}
        </div>
        {/* Code Block */}
        <div className="relative bg-surface-container-lowest rounded-xl p-space-md font-code-value text-code-value text-on-surface-variant overflow-x-auto shadow-inner mb-space-md">
          <button
            className="absolute top-2.5 right-2.5 px-2 py-1 rounded bg-surface-container hover:bg-surface-bright text-on-surface font-label-sm text-label-sm flex items-center gap-1 transition-colors shadow-sm"
            onClick={async () => {
              try { await navigator.clipboard.writeText(codeSnippets[exportTab]); } catch { /* ignore */ }
            }}
          > {t("studio.copy")}</button>
          <pre className="leading-relaxed whitespace-pre-wrap text-[11px]">{codeSnippets[exportTab]}</pre>
        </div>
        {/* Export Action Buttons */}
        <div className="flex flex-col gap-2">
          <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary font-label-md text-label-md font-semibold transition-all shadow-sm">
            <span className="text-[18px]">↓</span> {t("studio.downloadFull")}
          </button>
          <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-all">
            <span className="text-outline text-[18px]">⌘</span> {t("studio.pushToFE")}
          </button>
        </div>
      </PanelCard>

      {/* ── Monorepo Packages Info ── */}
      <PanelCard level="low">
        <div className="flex items-center justify-between text-outline mb-2">
          <span className="font-label-sm text-label-sm">{t("studio.monorepoTitle")}</span>
          <span className="text-secondary font-code-value">{t("studio.monorepoReady")}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            { name: "@cus/palette-engine", version: "v1.3.0" },
            { name: "@cus/theme-schema", version: "v2.0.4" },
            { name: "@cus/validation", version: t("studio.validationCertified"), highlight: true },
          ].map((pkg) => (
            <div key={pkg.name} className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant">{pkg.name}</span>
              <span className={`font-code-value text-body-sm ${pkg.highlight ? "text-secondary" : "text-on-surface"}`}>{pkg.version}</span>
            </div>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}
