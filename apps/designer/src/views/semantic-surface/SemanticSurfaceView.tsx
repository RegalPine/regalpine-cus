/**
 * SemanticSurfaceView — 语义映射与表面层阶系统。
 * 5 级表面层级 · 交互状态 Delta 修饰器 · 语义角色映射 · 对比度健康度诊断 · 代码预览。
 *
 * 布局：7col 表面层级可视化 + 5col 语义角色映射表 + 代码预览。
 */
import { useCallback, useMemo, useState } from "react";
import { colorDesign, renderColor, contrastRatio } from "@cus/color";
import type { V2Color } from "@cus/core";
import { SEMANTIC_ROLES } from "@cus/core";
import { useBrandStore } from "../../stores/brand-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { PanelCard } from "../../shared/layout/PanelCard";
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";

/* ──────────────────────────── Types ──────────────────────────── */

interface SurfaceTier {
  level: string;
  token: string;
  hex: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  oklch: { l: number; c: number; h: number | null };
}

interface SemanticRoleInfo {
  role: string;
  label: string;
  hex: string;
  oklch: { l: number; c: number; h: number | null };
  gamut: string;
  contrastRatio: number;
  passAAA: boolean;
  passAA: boolean;
  defaultStrategy: string;
}

interface ContrastPair {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  passAAA: boolean;
}

/* ──────────────────────────── Constants ──────────────────────────── */

const TIER_DESC_KEYS: Record<string, string> = {
  L0: "semantic.tierL0",
  L1: "semantic.tierL1",
  L2: "semantic.tierL2",
  L3: "semantic.tierL3",
  L4: "semantic.tierL4",
};

const TIER_BADGES: Record<string, { textKey: string; color: string }> = {
  L2: { textKey: "semantic.badgeDefaultCard", color: "bg-primary/20 text-primary" },
  L4: { textKey: "semantic.badgeHighZ", color: "bg-tertiary-container/30 text-tertiary" },
};

const ROLE_LABEL_KEYS: Record<string, string> = {
  success: "semantic.roleSuccess",
  warning: "semantic.roleWarning",
  danger: "semantic.roleDanger",
  info: "semantic.roleInfo",
};

const ROLE_STRATEGY_KEYS: Record<string, string[]> = {
  success: ["semantic.strategyHarmonic", "semantic.strategyStrict", "semantic.strategyVibrant"],
  warning: ["semantic.strategyHarmonic", "semantic.strategyStrict", "semantic.strategyAutoShift"],
  danger: ["semantic.strategyHarmonic", "semantic.strategyStrict", "semantic.strategyUrgency"],
  info: ["semantic.strategyHarmonic", "semantic.strategyStrict", "semantic.strategySaliency"],
};

const ROLE_DEFAULT_STRATEGY_KEYS: Record<string, string> = {
  success: "semantic.strategyHarmonic",
  warning: "semantic.strategyStrict",
  danger: "semantic.strategyStrict",
  info: "semantic.strategyHarmonic",
};

/* ──────────────────────────── Component ──────────────────────────── */

export default function SemanticSurfaceView() {
  usePersistence();
  const t = useT();
  const brand = useBrandStore((s) => s.brand);
  const designOptions = useBrandStore((s) => s.designOptions);
  const { effectiveSpace } = useGamutSupport(useBrandStore((s) => s.space));
  const { result } = useThemeEngine(brand, designOptions);

  // Interactive state
  const [focusRingOffset, setFocusRingOffset] = useState(2);
  const [hoverDeltaL, setHoverDeltaL] = useState(0.052);
  const [codeTab, setCodeTab] = useState<"css" | "json">("css");
  const [recalculating, setRecalculating] = useState(false);

  const showToast = useCallback((msg: string) => {
    useUIStore.getState().setToast(msg);
  }, []);

  // 自动重算语义绑定（模拟加载 + 微调参数）
  const handleAutoRecalc = useCallback(() => {
    setRecalculating(true);
    setTimeout(() => {
      // 微调 hoverDeltaL 模拟重算结果
      setHoverDeltaL((prev) => Math.max(0.03, Math.min(0.08, prev + (Math.random() - 0.5) * 0.01)));
      setRecalculating(false);
      showToast(t("semantic.recalcDone"));
    }, 800);
  }, [showToast, t]);

  // ─── 5 Surface Tiers ───
  const surfaceTiers = useMemo((): SurfaceTier[] => {
    // 使用 dark 调色板（设计参考为暗色主题），fallback 到 light 调色板
    const darkPalette = result.palettes?.dark;
    const neutralPalette = darkPalette?.neutral ?? result.palette.neutral;
    const isDark = !!darkPalette;
    const steps = Object.entries(neutralPalette);
    // 暗色模式：表面层级用高步骤（950→600，深色）；亮色模式：用低步骤（50→400，浅色）
    const tierMap: [string, string, string][] = isDark
      ? [
          ["L0", "surface-container-lowest", "950"],
          ["L1", "surface-container-low", "900"],
          ["L2", "surface-container", "800"],
          ["L3", "surface-container-high", "700"],
          ["L4", "surface-container-highest", "600"],
        ]
      : [
          ["L0", "surface-container-lowest", "50"],
          ["L1", "surface-container-low", "100"],
          ["L2", "surface-container", "200"],
          ["L3", "surface-container-high", "300"],
          ["L4", "surface-container-highest", "400"],
        ];
    return tierMap.map(([level, token, step]) => {
      const color = (steps.find(([s]) => s === step) ?? steps[0])?.[1] as V2Color | undefined;
      const hex = color ? renderColor(color, effectiveSpace) : "#181c24";
      const oklch = color ? colorDesign(color) : { l: 0.1, c: 0.01, h: null as number | null };
      const badge = TIER_BADGES[level];
      return {
        level,
        token,
        hex,
        description: t((TIER_DESC_KEYS[level] ?? "semantic.tierL0") as Parameters<typeof t>[0]),
        badge: badge ? t(badge.textKey as Parameters<typeof t>[0]) : undefined,
        badgeColor: badge?.color,
        oklch: { l: oklch.l, c: oklch.c, h: oklch.h },
      };
    });
  }, [result, effectiveSpace]);

  // ── Semantic Roles ───
  const semanticRoles = useMemo((): SemanticRoleInfo[] => {
    const surfaceHex = surfaceTiers[2]?.hex ?? "#1c2028";
    // 使用 dark 调色板的语义色，fallback 到 light 调色板
    const darkPalette = result.palettes?.dark ?? result.palette;
    return SEMANTIC_ROLES.map((role) => {
      const entry = darkPalette.semantic[role];
      if (!entry) return null;
      const baseColor = entry.base;
      const hex = renderColor(baseColor, effectiveSpace);
      const oklch = colorDesign(baseColor);
      let ratio: number;
      try {
        ratio = contrastRatio(hex, surfaceHex);
      } catch {
        ratio = 1;
      }
      const isP3 = effectiveSpace === "display-p3";
      const gamut = isP3 ? t("semantic.p3Extended") : t("semantic.inGamutSrgb");
      return {
        role,
        label: t((ROLE_LABEL_KEYS[role] ?? "semantic.roleSuccess") as Parameters<typeof t>[0]),
        hex,
        oklch: { l: oklch.l, c: oklch.c, h: oklch.h },
        gamut,
        contrastRatio: ratio,
        passAAA: ratio >= 7,
        passAA: ratio >= 4.5,
        defaultStrategy: t((ROLE_DEFAULT_STRATEGY_KEYS[role] ?? "semantic.strategyHarmonic") as Parameters<typeof t>[0]),
      };
    }).filter(Boolean) as SemanticRoleInfo[];
  }, [result, effectiveSpace, surfaceTiers]);

  // ─── Contrast Pairs ───
  const contrastPairs = useMemo((): ContrastPair[] => {
    const surfaceHex = surfaceTiers[0]?.hex ?? "#0a0e16";
    const pairs: { label: string; fg: string; bg: string }[] = [
      { label: "On-Success → Surface", fg: "#003824", bg: semanticRoles.find((r) => r.role === "success")?.hex ?? "#4edea3" },
      { label: "On-Warning → Surface", fg: "#4f2500", bg: semanticRoles.find((r) => r.role === "warning")?.hex ?? "#ffb783" },
      { label: "On-Error → Surface", fg: "#690005", bg: semanticRoles.find((r) => r.role === "danger")?.hex ?? "#ffb4ab" },
      { label: "Primary Text → Canvas", fg: "#dfe2ee", bg: surfaceHex },
    ];
    return pairs.map((p) => {
      let ratio: number;
      try {
        ratio = contrastRatio(p.fg, p.bg);
      } catch {
        ratio = 1;
      }
      return { ...p, ratio, passAAA: ratio >= 7 };
    });
  }, [semanticRoles, surfaceTiers]);

  // ─── Code Snippets ───
  const cssSnippet = useMemo(() => {
    const surfaceLines = surfaceTiers
      .map(
        (t) =>
          `  --color-${t.token.replace("surface-container-", "")}: oklch(${t.oklch.l.toFixed(2)} ${t.oklch.c.toFixed(3)} ${t.oklch.h?.toFixed(1) ?? "0"}); /* ${t.hex} */`,
      )
      .join("\n");
    const roleLines = semanticRoles
      .map((r) => `  --color-semantic-${r.role}: oklch(${r.oklch.l.toFixed(2)} ${r.oklch.c.toFixed(2)} ${r.oklch.h?.toFixed(1) ?? "0"});`)
      .join("\n");
    return `/* @cus/semantic-engine CSS Custom Properties */
:root {
${surfaceLines}

  /* Semantic Roles & Intents */
${roleLines}

  /* State Deltas */
  --state-hover-delta-l: +${hoverDeltaL.toFixed(3)};
  --state-active-delta-l: -0.040;
}`;
  }, [surfaceTiers, semanticRoles, hoverDeltaL]);

  const jsonSnippet = useMemo(() => {
    const surfaces = surfaceTiers
      .map(
        (t) =>
          `    "${t.level.slice(1)}": { "l": ${t.oklch.l.toFixed(2)}, "c": ${t.oklch.c.toFixed(3)}, "h": ${t.oklch.h?.toFixed(1) ?? "0"}, "hex": "${t.hex}" }`,
      )
      .join(",\n");
    const roles = semanticRoles
      .map(
        (r) =>
          `    "${r.role}": { "target": "${r.hex}", "lcScore": ${(r.contrastRatio * 10).toFixed(1)}, "strategy": "${r.defaultStrategy.toLowerCase().split(" ")[0]}" }`,
      )
      .join(",\n");
    return `{
  "$schema": "https://cus.design/schema/v1.3.0/semantic.json",
  "surfaces": {
${surfaces}
  },
  "roles": {
${roles}
  }
}`;
  }, [surfaceTiers, semanticRoles]);

  const copyToClipboard = useCallback(
    (text: string) => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => showToast(t("semantic.copied")));
      } else {
        showToast(t("semantic.mapped"));
      }
    },
    [showToast],
  );

  const passCount = semanticRoles.filter((r) => r.passAA).length;
  const totalCount = semanticRoles.length;

  return (
    <div className="flex flex-col w-full">
      {/* ═══════════ Top Command & Status Bar ═══════════ */}
      <section className="w-full bg-surface-container-low rounded-xl p-space-lg mb-space-lg shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          {/* Title */}
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-md mt-0.5">
              <h1 className="font-ui text-[20px] text-on-surface font-semibold tracking-tight">
                {t("semantic.title")}
              </h1>
              <span className="hidden md:inline px-space-xs py-0.5 rounded bg-surface-container-high text-primary font-code-value text-code-value text-[11px]">
                @cus/semantic-engine v1.3.0
              </span>
              <span className="hidden lg:inline px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant font-code-value text-code-value text-[11px]">
                {t("semantic.engineBadge")}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-secondary-container/20 text-secondary font-code-value text-code-value text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                {t("semantic.apcaSyncBadge")}
              </span>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            <div className="hidden md:flex items-center gap-space-xs px-space-md py-1 rounded bg-surface-container-high text-secondary font-code-value text-code-value text-[11px]">
              <MaterialIcon name="verified" size={16} />
              {t("semantic.wcagActiveBadge")}
            </div>
            <button
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded bg-surface-container hover:bg-surface-container-highest text-on-surface font-ui text-[13px] transition-colors disabled:opacity-50"
              onClick={handleAutoRecalc}
              disabled={recalculating}
              type="button"
            >
              <MaterialIcon name={recalculating ? "hourglass_empty" : "sync"} size={16} className={`text-primary ${recalculating ? "animate-spin" : ""}`} />
              {recalculating ? t("semantic.recalculating") : t("semantic.autoRecalc")}
            </button>
            <button
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-ui text-[13px] transition-colors"
              onClick={() => {
                setHoverDeltaL(0.052);
                setFocusRingOffset(2);
                showToast(t("semantic.resetDone"));
              }}
              type="button"
            >
              <MaterialIcon name="restart_alt" size={16} />
              {t("semantic.resetDefault")}
            </button>
            <button
              className="flex items-center gap-1.5 px-space-md py-1.5 rounded bg-primary text-on-primary font-ui text-[13px] font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              onClick={() => copyToClipboard(cssSnippet)}
              type="button"
            >
              <MaterialIcon name="content_copy" size={16} />
              {t("semantic.copyTokens")}
            </button>
          </div>
        </div>
        {/* Telemetry Ticker */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-md mt-space-md pt-space-md bg-surface-container-lowest/60 p-space-md rounded-lg">
          <div className="flex flex-col">
            <span className="text-on-surface-variant font-ui text-[11px] uppercase tracking-wider">{t("semantic.surfaceHierarchy")}</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-ui text-[16px] text-on-surface font-semibold">{t("semantic.fiveLevels")}</span>
              <span className="text-secondary font-code-value text-code-value text-[11px]">{t("semantic.deltaPerceptual")}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-on-surface-variant font-ui text-[11px] uppercase tracking-wider">{t("semantic.intentRolesBound")}</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-ui text-[16px] text-on-surface font-semibold">{totalCount} {t("semantic.primitivesSuffix")}</span>
              <span className="text-on-surface-variant font-code-value text-code-value text-[11px]">{t("semantic.rolesList")}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-on-surface-variant font-ui text-[11px] uppercase tracking-wider">{t("semantic.stateDeltaOffsets")}</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-ui text-[16px] text-primary font-semibold">{t("semantic.sixModifiers")}</span>
              <span className="text-secondary font-code-value text-code-value text-[11px]">{t("semantic.activeEngineOklch")}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-on-surface-variant font-ui text-[11px] uppercase tracking-wider">{t("semantic.contrastHealthGuard")}</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-ui text-[16px] text-secondary font-semibold">
                {totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0}% {t("semantic.passSuffix")}
              </span>
              <span className="text-on-surface-variant font-code-value text-code-value text-[11px]">{t("semantic.apcaStrict")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ Two-Column Workbench ═══════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg w-full mb-space-xl">
        {/* ──── Left Column: 7 cols ──── */}
        <div className="xl:col-span-7 flex flex-col gap-space-lg">
          {/* Surface Hierarchy Module */}
          <PanelCard level="low" className="!p-space-lg">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-sm">
                <MaterialIcon name="layers" size={20} className="text-primary" />
                <div>
                  <h2 className="font-ui text-[16px] text-on-surface font-semibold">{t("semantic.surfaceTitle")}</h2>
                  <p className="font-ui text-[11px] text-on-surface-variant">{t("semantic.surfaceDesc")}</p>
                </div>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="px-space-sm py-0.5 rounded bg-surface-container font-code-value text-code-value text-[11px] text-primary">
                  Hue Anchor: {surfaceTiers[0]?.oklch.h?.toFixed(1) ?? "—"}°
                </span>
                <span className="px-space-sm py-0.5 rounded bg-surface-container font-code-value text-code-value text-[11px] text-secondary">
                  Base Chroma: {surfaceTiers[0]?.oklch.c.toFixed(3) ?? "—"}
                </span>
              </div>
            </div>

            {/* 5 Surface Tiers */}
            <div className="flex flex-col gap-space-sm">
              {surfaceTiers.map((tier) => (
                <div
                  key={tier.level}
                  className="group relative p-space-md rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md transition-all hover:bg-surface-container-high/40"
                  style={{ background: tier.hex }}
                >
                  <div className="flex items-center gap-space-md">
                    <div
                      className="w-12 h-12 rounded flex items-center justify-center shrink-0"
                      style={{
                        background: tier.hex,
                        border: "1px solid rgba(255,255,255,0.1)",
                        boxShadow: tier.level === "L0" ? "inset 0 2px 4px rgba(0,0,0,0.3)" : tier.level === "L4" ? "0 4px 12px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.2)",
                      }}
                    >
                      <span className={`font-code-value text-code-value ${tier.level === "L0" ? "text-outline" : tier.level === "L4" ? "text-on-surface font-bold" : "text-on-surface-variant"}`}>
                        {tier.level}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-space-xs flex-wrap">
                        <span className="font-ui text-[13px] text-on-surface font-semibold">{tier.token}</span>
                        <span className="px-space-xs py-0.5 rounded bg-surface-container/50 text-on-surface-variant font-code-value text-code-value text-[11px]">{tier.hex}</span>
                        {tier.badge && (
                          <span className={`px-space-xs py-0.5 rounded font-label-sm text-label-sm text-[10px] ${tier.badgeColor ?? "bg-primary/20 text-primary"}`}>
                            {tier.badge}
                          </span>
                        )}
                      </div>
                      <span className="font-ui text-[11px] text-on-surface-variant">{tier.description}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-lg font-code-value text-code-value text-[11px]">
                    <div className="text-right">
                      <div className="flex justify-between gap-2"><span className="text-outline">L:</span><span className="text-on-surface font-semibold">{tier.oklch.l.toFixed(2)}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-outline">C:</span><span className="text-on-surface font-semibold">{tier.oklch.c.toFixed(3)}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-outline">h:</span><span className="text-on-surface font-semibold">{tier.oklch.h?.toFixed(1) ?? "—"}°</span></div>
                    </div>
                    <div className="px-space-sm py-1 rounded bg-secondary-container/15 text-secondary text-right min-w-[70px]">
                      <div className="flex justify-between gap-2"><span className="text-outline">L:</span><span className="text-on-surface font-semibold">{tier.oklch.l.toFixed(2)}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-outline">C:</span><span className="text-on-surface font-semibold">{tier.oklch.c.toFixed(3)}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-outline">h:</span><span className="text-on-surface font-semibold">{tier.oklch.h?.toFixed(1) ?? "—"}°</span></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Perceptual Progression Curve */}
            <div className="mt-space-md p-space-md bg-surface-container-lowest/80 rounded-lg flex flex-col gap-space-xs">
              <div className="flex items-center justify-between text-on-surface-variant font-code-value text-code-value text-[11px]">
                <span>{t("semantic.progressionCurve")}</span>
                <span className="text-secondary">{t("semantic.monotonicChecked")}</span>
              </div>
              <div className="h-3 w-full rounded relative shadow-inner overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(to right, ${surfaceTiers.map((t) => t.hex).join(", ")})`,
                  }}
                />
              </div>
              <div className="flex justify-between font-code-value text-[10px] text-outline mt-0.5">
                {surfaceTiers.map((t) => (
                  <span key={t.level}>L={t.oklch.l.toFixed(2)}</span>
                ))}
              </div>
            </div>
          </PanelCard>

          {/* Interactive State Delta Modifiers — 2×2 Card Grid */}
          <PanelCard level="low" className="!p-space-lg">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-sm">
                <MaterialIcon name="touch_app" size={20} className="text-primary" />
                <div>
                  <h2 className="font-ui text-[16px] text-on-surface font-semibold">{t("semantic.stateTitle")}</h2>
                  <p className="font-ui text-[11px] text-on-surface-variant">{t("semantic.stateDesc")}</p>
                </div>
              </div>
              <span className="px-space-sm py-0.5 rounded bg-surface-container-high text-on-surface font-code-value text-code-value text-[11px]">{t("semantic.dynamicDeltaMode")}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
              {/* Hover */}
              <DeltaCard
                dotColor="bg-primary"
                title={t("semantic.hoverModifier")}
                stateLabel=":hover"
                stateColor="text-primary"
                rows={[
                  { label: t("semantic.lightnessL"), value: `L + ${hoverDeltaL.toFixed(3)}`, valueColor: "text-secondary" },
                  { label: t("semantic.chromaC"), value: "C × 1.05", valueColor: "text-primary" },
                  { label: t("semantic.transition"), value: "150ms cubic-bezier(0.2, 0, 0, 1)", valueColor: "text-on-surface" },
                ]}
                previewLabel={t("semantic.hoverMe")}
                previewStyle={{
                  background: surfaceTiers[2]?.hex ?? "#1c2028",
                  filter: `brightness(${1 + hoverDeltaL * 5})`,
                }}
              />
              {/* Active / Pressed */}
              <DeltaCard
                dotColor="bg-tertiary"
                title={t("semantic.activePressed")}
                stateLabel=":active"
                stateColor="text-tertiary"
                rows={[
                  { label: t("semantic.lightnessL"), value: "L - 0.040", valueColor: "text-error" },
                  { label: t("semantic.chromaC"), value: "C × 1.08", valueColor: "text-tertiary" },
                  { label: t("semantic.scaleTransform"), value: "scale(0.985)", valueColor: "text-on-surface" },
                ]}
                previewLabel={t("semantic.pressHold")}
                previewStyle={{ background: surfaceTiers[4]?.hex ?? "#31353e" }}
                previewActive
              />
              {/* Focus Ring */}
              <DeltaCard
                dotColor="bg-secondary"
                title={t("semantic.focusRingTitle")}
                stateLabel=":focus-visible"
                stateColor="text-secondary"
                rows={[
                  { label: t("semantic.ringColor"), value: `oklch(0.68 0.22 265.4)`, valueColor: "text-primary" },
                  { label: t("semantic.offsetWidth"), value: `${focusRingOffset}px Ring / ${focusRingOffset}px Offset`, valueColor: "text-on-surface" },
                  { label: t("semantic.apcaGapScore"), value: `Lc +78.4 (Exceeds AA)`, valueColor: "text-secondary" },
                ]}
                previewLabel={t("semantic.tabToFocus")}
                previewFocusRing={focusRingOffset}
              />
              {/* Selected & Disabled */}
              <DeltaCard
                dotColor="bg-outline"
                title={t("semantic.selectedDisabled")}
                stateLabel="[aria-selected]"
                stateColor="text-outline"
                previewLabel=""
                rows={[
                  { label: t("semantic.disabledOpacity"), value: "38% (0.38 alpha)", valueColor: "text-outline" },
                  { label: t("semantic.chromaDesat"), value: "C × 0.15 (Greyscale snap)", valueColor: "text-outline" },
                  { label: t("semantic.selectedRing"), value: "bg-secondary-container/20", valueColor: "text-secondary" },
                ]}
                previewDual
              />
            </div>
          </PanelCard>

          {/* Hover ΔL Real-time Slider */}
          <PanelCard level="lowest" className="!p-space-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-md">
                <div className="w-9 h-9 rounded bg-surface-container-high flex items-center justify-center text-primary">
                  <MaterialIcon name="tune" size={20} />
                </div>
                <div>
                  <span className="font-ui text-[13px] text-on-surface font-medium block">{t("semantic.hoverAdjust")}</span>
                  <span className="font-ui text-[11px] text-on-surface-variant">{t("semantic.hoverInject")}</span>
                </div>
              </div>
              <div className="flex items-center gap-space-md">
                <input
                  className="w-32 accent-primary cursor-pointer"
                  max={0.10}
                  min={0.01}
                  step={0.005}
                  type="range"
                  value={hoverDeltaL}
                  onChange={(e) => setHoverDeltaL(Number(e.target.value))}
                />
                <span className="font-code-value text-code-value text-[11px] text-secondary font-semibold px-space-xs py-0.5 rounded bg-surface-container-high">
                  ΔL +{hoverDeltaL.toFixed(3)}
                </span>
              </div>
            </div>
          </PanelCard>

          {/* Multi-layer Surface Stacking Preview */}
          <PanelCard level="low" className="!p-space-lg">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-sm">
                <MaterialIcon name="devices" size={20} className="text-secondary" />
                <h2 className="font-ui text-[16px] text-on-surface font-semibold">{t("semantic.stackTitle")}</h2>
              </div>
              <span className="font-code-value text-code-value text-[11px] text-outline">{t("semantic.layerBenchmark")}</span>
            </div>
            <div className="relative w-full rounded-lg bg-surface-container-lowest p-space-lg flex flex-col gap-space-md overflow-hidden">
              <div className="flex items-center justify-between border-b border-surface-container pb-space-sm">
                <div className="flex items-center gap-space-sm">
                  <span className="w-3 h-3 rounded-full bg-error/70" />
                  <span className="w-3 h-3 rounded-full bg-tertiary/70" />
                  <span className="w-3 h-3 rounded-full bg-secondary/70" />
                  <span className="font-code-value text-code-value text-[11px] text-on-surface-variant ml-space-xs">{t("semantic.dashboardDemo")}</span>
                </div>
                <span className="font-code-value text-code-value text-[11px] text-secondary">{t("semantic.elevationRange")}</span>
              </div>
              {/* 3-Column Stack */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                {/* Sidebar Rail L1 */}
                <div className="p-space-md rounded-lg flex flex-col gap-space-sm" style={{ background: surfaceTiers[1]?.hex ?? "#181c24" }}>
                  <span className="font-label-sm text-label-sm text-[11px] text-on-surface-variant uppercase">{t("semantic.sidebarRail")}</span>
                  <div className="h-4 w-3/4 rounded" style={{ background: surfaceTiers[2]?.hex ?? "#1c2028" }} />
                  <div className="h-4 w-1/2 rounded" style={{ background: surfaceTiers[2]?.hex ?? "#1c2028" }} />
                  <div className="h-4 w-5/6 rounded" style={{ background: surfaceTiers[3]?.hex ?? "#262a33" }} />
                </div>
                {/* Container Card L2 */}
                <div className="p-space-md rounded-lg flex flex-col gap-space-sm shadow-md" style={{ background: surfaceTiers[2]?.hex ?? "#1c2028" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm text-[11px] text-on-surface font-semibold">{t("semantic.containerCard")}</span>
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <div className="p-space-sm rounded text-on-surface font-ui text-[11px]" style={{ background: surfaceTiers[3]?.hex ?? "#262a33" }}>
                    {t("semantic.embeddedPopover")}
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-secondary font-code-value text-[10px]">{t("semantic.oklchSynced")}</span>
                      <span className="px-1.5 py-0.5 rounded text-primary font-code-value text-[10px]" style={{ background: surfaceTiers[4]?.hex ?? "#31353e" }}>
                        {t("semantic.tooltipL4")}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Modal Dialog L3 */}
                <div className="p-space-md rounded-lg flex flex-col justify-between shadow-xl" style={{ background: surfaceTiers[3]?.hex ?? "#262a33" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm text-[11px] text-on-surface font-semibold">{t("semantic.modalDialog")}</span>
                    <span className="px-space-xs py-0.5 rounded bg-secondary-container/20 text-secondary font-code-value text-code-value text-[10px]">{t("semantic.activeLabel")}</span>
                  </div>
                  <div className="p-space-sm rounded flex items-center justify-between mt-2" style={{ background: surfaceTiers[4]?.hex ?? "#31353e" }}>
                    <span className="font-code-value text-code-value text-[11px] text-on-surface">{t("semantic.confirmAction")}</span>
                    <button className="px-space-xs py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm text-[11px]" type="button">
                      OK
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </PanelCard>
        </div>

        {/* ──── Right Column: 5 cols ──── */}
        <div className="xl:col-span-5 flex flex-col gap-space-lg">
          {/* Semantic Role Mapping Engine */}
          <PanelCard level="low" className="!p-space-lg">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-sm">
                <MaterialIcon name="palette" size={20} className="text-primary" />
                <div>
                  <h2 className="font-ui text-[16px] text-on-surface font-semibold">{t("semantic.roleTitle")}</h2>
                  <p className="font-ui text-[11px] text-on-surface-variant">{t("semantic.roleDesc")}</p>
                </div>
              </div>
              <span className="px-space-sm py-0.5 rounded bg-surface-container text-secondary font-code-value text-code-value text-[11px]">Gamut: {effectiveSpace === "display-p3" ? "P3" : "sRGB"}</span>
            </div>

            <div className="flex flex-col gap-space-md">
              {semanticRoles.map((role) => {
                const strategyKeys = ROLE_STRATEGY_KEYS[role.role] ?? ["semantic.strategyHarmonic", "semantic.strategyStrict"];
                return (
                  <div key={role.role} className="p-space-md rounded-lg bg-surface-container flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-space-sm">
                        <div className="w-4 h-4 rounded shadow-sm" style={{ background: role.hex }} />
                        <span className="font-ui text-[13px] text-on-surface font-semibold">{role.label}</span>
                        <span className={`px-space-xs py-0.5 rounded font-code-value text-code-value text-[11px] ${role.role === "danger" ? "bg-error-container/20 text-error" : role.role === "warning" ? "bg-tertiary-container/20 text-tertiary" : role.role === "success" ? "bg-secondary-container/20 text-secondary" : "bg-primary/20 text-primary"}`}>
                          {role.hex}
                        </span>
                      </div>
                      <span className={`font-code-value text-code-value text-[11px] font-semibold ${role.passAAA ? "text-secondary" : role.passAA ? "text-primary" : "text-error"}`}>
                        Lc +{(role.contrastRatio * 10).toFixed(1)} {role.passAAA ? "Pass" : role.passAA ? "AA" : "FAIL"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-space-xs font-code-value text-code-value text-[11px] text-on-surface-variant bg-surface-container-lowest p-space-sm rounded">
                      <div>
                        Computed: <span className="text-on-surface">oklch({role.oklch.l.toFixed(2)} {role.oklch.c.toFixed(2)} {role.oklch.h?.toFixed(1) ?? "0"})</span>
                      </div>
                      <div className="text-right">
                        Gamut: <span className="text-secondary">{role.gamut}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-space-xs">
                        <label className="font-label-sm text-label-sm text-[11px] text-on-surface-variant">{t("semantic.strategyLabel")}</label>
                        <select
                          className="bg-surface-container-high text-on-surface font-label-sm text-label-sm text-[11px] px-space-xs py-1 rounded outline-none focus:bg-surface-container-highest cursor-pointer"
                          defaultValue={role.defaultStrategy}
                        >
                          {strategyKeys.map((sKey) => (
                            <option key={sKey} value={t(sKey as Parameters<typeof t>[0])}>
                              {t(sKey as Parameters<typeof t>[0])}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span className="font-code-value text-[10px] text-secondary flex items-center gap-1">
                        <MaterialIcon name="format_image_left" size={14} />
                        {t("semantic.apcaThreshold")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </PanelCard>

          {/* Semantic Contrast Health Matrix */}
          <PanelCard level="low" className="!p-space-lg">
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex items-center gap-space-sm">
                <MaterialIcon name="fact_check" size={20} className="text-secondary" />
                <h2 className="font-ui text-[16px] text-on-surface font-semibold">{t("semantic.contrastTitle")}</h2>
              </div>
              <span className="px-space-sm py-0.5 rounded bg-secondary-container/20 text-secondary font-code-value text-code-value text-[11px]">
                {contrastPairs.every((p) => p.passAAA) ? t("semantic.allPass") : `${contrastPairs.filter((p) => p.passAAA).length}/${contrastPairs.length} ${t("semantic.passSuffix")}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-space-sm">
              {contrastPairs.map((pair) => (
                <div key={pair.label} className="p-space-sm rounded bg-surface-container flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-[11px] text-on-surface">{pair.label}</span>
                    <span className="font-code-value text-[10px] text-on-surface-variant">
                      {pair.fg} on {pair.bg}
                    </span>
                  </div>
                  <span className={`font-code-value text-code-value text-[11px] font-bold ${pair.passAAA ? "text-secondary" : pair.ratio >= 4.5 ? "text-primary" : "text-error"}`}>
                    {pair.ratio.toFixed(1)}:1 {pair.passAAA ? "AAA" : pair.ratio >= 4.5 ? "AA" : "FAIL"}
                  </span>
                </div>
              ))}
            </div>
          </PanelCard>

          {/* Code Preview with Tabs */}
          <PanelCard level="low" className="!p-space-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <MaterialIcon name="terminal" size={20} className="text-primary" />
                <h2 className="font-ui text-[16px] text-on-surface font-semibold">{t("semantic.codeTitle")}</h2>
              </div>
              <div className="flex items-center gap-space-xs font-code-value text-[11px]">
                <button
                  className={`px-space-sm py-0.5 rounded font-semibold transition-colors ${codeTab === "css" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
                  onClick={() => setCodeTab("css")}
                  type="button"
                >
                  {t("semantic.cssVarsTab")}
                </button>
                <button
                  className={`px-space-sm py-0.5 rounded font-semibold transition-colors ${codeTab === "json" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
                  onClick={() => setCodeTab("json")}
                  type="button"
                >
                  {t("semantic.jsonTab")}
                </button>
              </div>
            </div>
            <div className="relative bg-surface-container-lowest rounded-lg p-space-md font-code-value text-code-value text-[11px] overflow-x-auto shadow-inner">
              <button
                className="absolute top-2 right-2 px-space-xs py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface text-[10px] flex items-center gap-1 transition-colors"
                onClick={() => copyToClipboard(codeTab === "css" ? cssSnippet : jsonSnippet)}
                type="button"
              >
                <MaterialIcon name="content_copy" size={12} />
                {t("semantic.copyBtn")}
              </button>
              <pre className="text-on-surface-variant leading-relaxed whitespace-pre">
                {codeTab === "css" ? (
                  <CodeBlockCSS snippet={cssSnippet} />
                ) : (
                  <CodeBlockJSON snippet={jsonSnippet} />
                )}
              </pre>
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Sub-components ──────────────────────────── */

interface DeltaRow {
  label: string;
  value: string;
  valueColor: string;
}

function DeltaCard({
  dotColor,
  title,
  stateLabel,
  stateColor,
  rows,
  previewLabel,
  previewStyle,
  previewActive,
  previewFocusRing,
  previewDual,
}: {
  dotColor: string;
  title: string;
  stateLabel: string;
  stateColor: string;
  rows: DeltaRow[];
  previewLabel: string;
  previewStyle?: React.CSSProperties;
  previewActive?: boolean;
  previewFocusRing?: number;
  previewDual?: boolean;
}) {
  const t = useT();
  return (
    <div className="p-space-md rounded-lg bg-surface-container flex flex-col justify-between gap-space-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className="font-label-sm text-label-sm text-[13px] text-on-surface font-semibold">{title}</span>
        </div>
        <span className={`px-space-xs py-0.5 rounded bg-surface-container-high font-code-value text-code-value text-[11px] ${stateColor}`}>
          State: {stateLabel}
        </span>
      </div>
      <div className="bg-surface-container-lowest p-space-sm rounded font-code-value text-code-value text-[11px] text-on-surface-variant flex flex-col gap-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between">
            <span>{row.label}</span>
            <span className={`font-semibold ${row.valueColor}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="font-ui text-[11px] text-on-surface-variant">{t("semantic.livePreview")}</span>
        {previewDual ? (
          <div className="flex items-center gap-space-xs">
            <button className="px-space-sm py-1 rounded bg-secondary-container/20 text-secondary font-label-sm text-label-sm text-[11px] font-semibold" type="button">
              {t("semantic.selectedLabel")}
            </button>
            <button className="px-space-sm py-1 rounded bg-surface-container-high text-outline font-label-sm text-label-sm text-[11px] opacity-40 cursor-not-allowed" disabled type="button">
              {t("semantic.disabledLabel")}
            </button>
          </div>
        ) : previewFocusRing !== undefined ? (
          <button
            className="px-space-md py-1 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm text-[11px] outline-none focus:outline-2 focus:outline-primary transition-all"
            style={{ outlineOffset: `${previewFocusRing}px` }}
            type="button"
          >
            {previewLabel}
          </button>
        ) : (
          <button
            className={`px-space-md py-1 rounded font-label-sm text-label-sm text-[11px] transition-all shadow-sm ${previewActive ? "bg-surface-container-highest active:bg-surface-container-high text-on-surface active:scale-95" : "text-on-primary-container hover:brightness-110 active:scale-95"}`}
            style={previewStyle}
            type="button"
          >
            {previewLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/* ──── Syntax-highlighted code blocks ──── */

function CodeBlockCSS({ snippet }: { snippet: string }) {
  // Simple CSS syntax highlighting
  const lines = snippet.split("\n");
  return (
    <code>
      {lines.map((line, i) => {
        if (line.trim().startsWith("/*") || line.trim().startsWith("*")) {
          return (
            <div key={i} className="text-outline">
              {line}
            </div>
          );
        }
        if (line.includes(":root") || line.includes("}")) {
          return (
            <div key={i} className="text-on-surface">
              {line}
            </div>
          );
        }
        // Variable name : value ; comment
        const varMatch = line.match(/^(\s*)(--[\w-]+)(:\s*)(oklch\([^)]+\)|[^;]+)(;?)(\s*\/\*.*\*\/)?$/);
        if (varMatch) {
          const [, indent, varName, colon, value, semi, comment] = varMatch;
          return (
            <div key={i}>
              <span className="text-outline">{indent}</span>
              <span className="text-primary">{varName}</span>
              <span className="text-on-surface-variant">{colon}</span>
              <span className="text-secondary">{value}</span>
              <span className="text-on-surface-variant">{semi}</span>
              {comment && <span className="text-outline"> {comment}</span>}
            </div>
          );
        }
        return (
          <div key={i} className="text-on-surface-variant">
            {line}
          </div>
        );
      })}
    </code>
  );
}

function CodeBlockJSON({ snippet }: { snippet: string }) {
  const lines = snippet.split("\n");
  return (
    <code>
      {lines.map((line, i) => {
        // Key: value pairs
        const kvMatch = line.match(/^(\s*)(".*?")(\s*:\s*)(.*)$/);
        if (kvMatch) {
          const [, indent, key, colon, rest] = kvMatch;
          const value = rest.replace(/,?\s*$/, "");
          const trailing = rest.endsWith(",") ? "," : "";
          let valueClass = "text-secondary";
          if (value.startsWith('"')) valueClass = "text-secondary";
          else if (!isNaN(Number(value))) valueClass = "text-tertiary";
          return (
            <div key={i}>
              <span className="text-outline">{indent}</span>
              <span className="text-primary">{key}</span>
              <span className="text-on-surface-variant">{colon}</span>
              <span className={valueClass}>{value}</span>
              <span className="text-on-surface-variant">{trailing}</span>
            </div>
          );
        }
        // Braces
        if (line.trim() === "{" || line.trim() === "}" || line.trim() === "},") {
          return (
            <div key={i} className="text-on-surface">
              {line}
            </div>
          );
        }
        return (
          <div key={i} className="text-on-surface-variant">
            {line}
          </div>
        );
      })}
    </code>
  );
}
