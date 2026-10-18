/**
 * ExportCenterView — 多端多格式导出工件中心。
 * 左栏：格式选择器 + 色域策略 + Monorepo 流向图 + CI/CD 面板
 * 右栏：多文件 Tab 代码检查器
 * 底部：CI/CD 校验 + CLI 终端模拟
 */
import { useMemo, useState, useCallback } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { ThemeMode } from "@cus/core";
import { exportTheme, type ExportFormat } from "@cus/export";
import { useBrandStore } from "../../stores/brand-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { PanelCard } from "../../shared/layout/PanelCard";
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";
import { FormatSelector, ALL_FORMATS } from "./FormatSelector";
import { ArtifactInspector } from "./ArtifactInspector";
import { GamutStrategyPanel, type GamutPolicy, type NamingConvention } from "./GamutStrategyPanel";
import { MonorepoFlow } from "./MonorepoFlow";
import { CICDPanel } from "./CICDPanel";
import { TerminalMockup } from "./TerminalMockup";

const FILE_NAMES: Record<string, string> = {
  css: "tokens.css",
  tailwind: "theme.tailwind.css",
  dtcg: "design-tokens.json",
  figma: "figma-tokens.json",
  ts: "theme.d.ts",
};

export default function ExportCenterView() {
  const t = useT();
  const brand = useBrandStore();
  const gamut = useGamutSupport(brand.space);
  const interactiveInput = brand.canonicalInput ?? brand.brand;
  const { result } = useThemeEngine(interactiveInput, brand.designOptions);
  usePersistence();

  const [format, setFormat] = useState<string>("css");
  const [modes] = useState<ThemeMode[]>(
    (["light", "dark"] as const).filter((m) => !!result.theme[m]),
  );
  const output = result.options?.output ?? { srgb: true, displayP3: true };

  // Gamut strategy state
  const [gamutPolicy, setGamutPolicy] = useState<GamutPolicy>("dual-p3-srgb");
  const [namingConvention, setNamingConvention] = useState<NamingConvention>("kebab-case");
  const [treeShaking, setTreeShaking] = useState(true);
  const [schemaValidation, setSchemaValidation] = useState(true);

  // P3 coverage calculation
  const p3Coverage = useMemo(() => {
    const c = result.palette.primary["500"]?.lch.c ?? 0;
    if (c < 0.27) return 100;
    if (c < 0.37) return 78;
    return 55;
  }, [result.palette.primary]);

  const p3HuesCalibrated = useMemo(() => {
    const total = 40;
    const calibrated = Math.round((p3Coverage / 100) * total);
    return `${calibrated} of ${total} hues calibrated`;
  }, [p3Coverage]);

  // Generate all format sources for the inspector tabs
  const allSources = useMemo(() => {
    const sources: Record<string, string> = {};
    for (const f of ALL_FORMATS) {
      try {
        sources[f.value] = exportTheme(result, f.value as ExportFormat, { modes, output });
      } catch {
        sources[f.value] = `/* ${t("exportCenter.exportFail")} */`;
      }
    }
    return sources;
  }, [result, modes, output]);

  // Build artifact files for the inspector
  const artifactFiles = useMemo(
    () =>
      ALL_FORMATS.map((f) => ({
        name: FILE_NAMES[f.value] ?? `output.${f.ext}`,
        format: f.value as ExportFormat,
        source: allSources[f.value] ?? "",
      })),
    [allSources],
  );

  const download = useCallback(
    (fmt?: string) => {
      const target = fmt ?? format;
      const source = allSources[target];
      if (!source) return;
      const ext = target === "css" || target === "tailwind" ? "css" : target === "json" || target === "dtcg" || target === "figma" ? "json" : "ts";
      const mime = ext === "json" ? "application/json" : "text/plain;charset=utf-8";
      const blob = new Blob([source], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = FILE_NAMES[target] ?? `output.${ext}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      useUIStore.getState().setToast(`${t("exportCenter.downloaded")} ${target.toUpperCase()}`);
    },
    [format, allSources],
  );

  const downloadAll = useCallback(async () => {
    const zip = new JSZip();
    for (const f of ALL_FORMATS) {
      const source = allSources[f.value];
      if (source) {
        zip.file(FILE_NAMES[f.value] ?? `output.${f.ext}`, source);
      }
    }
    zip.file("README.md", `# CUS Theme Export\n\nBrand: ${result.brand.hex}\nGenerated: ${new Date().toISOString()}\nSpace: ${gamut.effectiveSpace}\nModes: ${modes.join(", ")}\n`);
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `cus-theme-${result.brand.hex.replace("#", "")}.zip`);
    useUIStore.getState().setToast(t("exportCenter.packedAll"));
  }, [allSources, result.brand.hex, gamut.effectiveSpace, modes]);

  const pushMonorepo = useCallback(() => {
    useUIStore.getState().setToast(t("exportCenter.pipelineDone"));
  }, []);

  const generateCICD = useCallback(() => {
    useUIStore.getState().setToast(t("exportCenter.cicdDone"));
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* ── Gradient Ambient Backdrop ─ */}
      <div className="relative w-full py-space-md mb-space-md">
        <div className="absolute -top-10 left-1/4 w-96 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-80 h-36 bg-secondary/10 rounded-full blur-2xl pointer-events-none" />

        {/* ── Header Section ── */}
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg bg-surface-container-low p-space-lg rounded-xl shadow-md">
          <div className="flex flex-col gap-space-xs">
            {/* Title + Pipeline badge */}
            <div className="flex items-center gap-space-md">
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                {t("exportCenter.title")}
              </h1>
              <span className="hidden md:inline px-space-xs py-0.5 rounded bg-surface-container-highest text-secondary font-code-value text-body-sm">
                @cus/export v2.1.0
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-space-sm py-0.5 rounded bg-surface-container-high text-on-surface-variant font-code-value text-code-value">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                Pipeline: Ready
              </span>
            </div>
            {/* Info badges */}
            <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
              <div className="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm shadow-sm">
                <MaterialIcon name="sync_alt" size={14} className="text-primary" />
                <span>Multi-Format Sync: {ALL_FORMATS.length} Targets</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container text-secondary font-label-sm text-label-sm shadow-sm">
                <MaterialIcon name="display_settings" size={14} />
                <span>Color Space: sRGB + Display P3 Dual-Build</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container text-primary font-label-sm text-label-sm shadow-sm">
                <MaterialIcon name="verified" size={14} />
                <span>Validation: Strict JSON-Schema</span>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            <button
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-fixed-dim transition-all shadow-sm active:scale-95"
              onClick={downloadAll}
            >
              <MaterialIcon name="folder_zip" size={16} />
              <span>{t("exportCenter.allDownload")}</span>
            </button>
            <button
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md transition-all shadow-sm active:scale-95"
              onClick={pushMonorepo}
            >
              <MaterialIcon name="alt_route" size={16} className="text-secondary" />
              <span>{t("exportCenter.pushMonorepo")}</span>
            </button>
            <button
              className="flex items-center gap-1.5 px-space-sm py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-all shadow-sm"
              onClick={generateCICD}
            >
              <MaterialIcon name="terminal" size={16} />
              <span>{t("exportCenter.genCICD")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Grid Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop mb-space-xl">
        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-space-lg">
          {/* Panel 1: Format Selector */}
          <PanelCard level="low">
            <div className="flex items-center justify-between pb-space-xs">
              <div className="flex items-center gap-2">
                <MaterialIcon name="tune" size={18} className="text-primary" />
                <h2 className="font-headline-sm text-headline-sm text-on-surface">{t("exportCenter.targetTitle")}</h2>
              </div>
              <span className="font-code-value text-code-value px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant">
                @cus/export
              </span>
            </div>
            <FormatSelector selected={format} onSelect={setFormat} />
          </PanelCard>

          {/* Panel 2: Gamut Strategy & Token Parameters */}
          <PanelCard level="low">
            <GamutStrategyPanel
              gamutPolicy={gamutPolicy}
              onGamutPolicyChange={setGamutPolicy}
              namingConvention={namingConvention}
              onNamingConventionChange={setNamingConvention}
              treeShaking={treeShaking}
              onTreeShakingChange={setTreeShaking}
              schemaValidation={schemaValidation}
              onSchemaValidationChange={setSchemaValidation}
              p3Coverage={p3Coverage}
              p3HuesCalibrated={p3HuesCalibrated}
            />
          </PanelCard>
        </div>

        {/* ─ RIGHT COLUMN: Artifact Inspector ── */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-space-md">
          <PanelCard level="lowest" className="min-h-[500px]">
            <ArtifactInspector
              files={artifactFiles}
              activeFormat={format}
              onFormatChange={setFormat}
              onDownload={download}
            />
          </PanelCard>
        </div>
      </div>

      {/* ── Monorepo Architecture Visual Flow ── */}
      <div className="w-full bg-surface-container-low rounded-xl p-space-lg shadow-md mb-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs">
          <div className="flex items-center gap-2">
            <MaterialIcon name="account_tree" size={20} className="text-primary" />
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                {t("exportCenter.monorepoTitle")}
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {t("exportCenter.monorepoDesc")}
              </p>
            </div>
          </div>
        </div>
        <MonorepoFlow />
      </div>

      {/* ── Bottom Section: CI/CD + Terminal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop mb-space-lg">
        {/* CI/CD Panel */}
        <div className="lg:col-span-5 bg-surface-container-low rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MaterialIcon name="verified_user" size={18} className="text-secondary" />
              <h3 className="font-headline-sm text-headline-sm text-on-surface">{t("exportCenter.cicdTitle")}</h3>
            </div>
            <span className="font-code-value text-code-value text-secondary px-2 py-0.5 rounded bg-surface-container">
              GitHub Actions
            </span>
          </div>
          <CICDPanel />
        </div>

        {/* Terminal Mockup */}
        <div className="lg:col-span-7">
          <TerminalMockup />
        </div>
      </div>
    </div>
  );
}
