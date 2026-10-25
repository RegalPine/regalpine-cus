/**
 * TestbedView — 组件真实交互实测场。
 * Split 双域对照（Light+Dark）· 视口模式 · 排版密度 · 环境光模拟 · 全局强制交互状态。
 *
 * 布局：控制栏 + 双列 Light/Dark 组件测试区 + CSS 变量诊断面板 + 色度倍增器。
 */
import { useState, useCallback, useMemo } from "react";
import { renderColor } from "@cus/color";
import { useBrandStore } from "../../stores/brand-store";
import type { Density } from "../../stores/view-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { MaterialIcon } from "../../shared/icons/MaterialIcon";
import { useT } from "../../i18n";
import { saveAs } from "file-saver";
import { useUIStore } from "../../stores/ui-store";

type ViewMode = "split" | "light" | "dark";
type AmbientMode = "d65" | "oled" | "warm";
type ForcedState = "normal" | "hover" | "focus" | "disabled" | "skeleton";
type SegmentedTab = "tokens" | "cssVars" | "wcagMap";

/* ─── 子组件：Dropdown 弹出菜单 ─── */
function DropdownMenu({ mutedText, mode }: { mutedText: string; mode: "light" | "dark" }) {
  const t = useT();
  const bg = mode === "light" ? "#f8fafc" : "#1c2028";
  const itemBg = mode === "light" ? "#ffffff" : "#262a33";
  const activeBg = mode === "light" ? "#eef2ff" : "rgba(192,193,255,0.15)";
  const activeText = mode === "light" ? "#494bd6" : "#c0c1ff";
  const shortcutBg = mode === "light" ? "#e0e7ff" : "#c0c1ff";
  const shortcutText = mode === "light" ? "#494bd6" : "#0f131c";

  return (
    <div className="flex flex-col gap-1.5 p-space-sm rounded" style={{ background: bg }}>
      <span className="font-code-value text-[11px]" style={{ color: mutedText }}>{t("testbed.dropdownMenu")}</span>
      <div className="flex flex-col gap-1 rounded p-1 shadow-sm" style={{ background: itemBg }}>
        <div className="flex items-center justify-between px-space-sm py-1 rounded font-label-sm text-label-sm font-semibold" style={{ background: activeBg, color: activeText }}>
          <span className="flex items-center gap-1.5">
            <MaterialIcon name="palette" size={16} />
            {t("testbed.recalibratePalette")}
          </span>
          <span className="font-code-value text-[10px] px-1 py-0.5 rounded" style={{ background: shortcutBg, color: shortcutText }}>⌘K</span>
        </div>
        <div className="flex items-center justify-between px-space-sm py-1 rounded font-label-sm text-label-sm" style={{ color: mode === "light" ? "#475569" : "#c7c4d7" }}>
          <span className="flex items-center gap-1.5">
            <MaterialIcon name="file_download" size={16} />
            {t("testbed.exportTokens")}
          </span>
          <span className="font-code-value text-[10px]" style={{ color: mutedText }}>⇧E</span>
        </div>
      </div>
    </div>
  );
}

/* ─── 子组件：Segmented Tabs ─── */
function SegmentedTabs({ active, onChange, mode }: { active: SegmentedTab; onChange: (t: SegmentedTab) => void; mode: "light" | "dark" }) {
  const t = useT();
  const trackBg = mode === "light" ? "#e2e8f0" : "#0a0e16";
  const activeBg = mode === "light" ? "#ffffff" : "#262a33";
  const activeText = mode === "light" ? "#0f172a" : "#dfe2ee";
  const inactiveText = mode === "light" ? "#64748b" : "#908fa0";

  return (
    <div className="flex flex-col gap-1.5 p-space-sm rounded" style={{ background: mode === "light" ? "#f8fafc" : "#1c2028" }}>
      <span className="font-code-value text-[11px]" style={{ color: mode === "light" ? "#64748b" : "#908fa0" }}>{t("testbed.segmentedTabs")}</span>
      <div className="flex items-center p-1 rounded-lg" style={{ background: trackBg }}>
        {(["tokens", "cssVars", "wcagMap"] as const).map((tab) => {
          const label = tab === "tokens" ? t("testbed.tabTokens") : tab === "cssVars" ? t("testbed.tabCssVars") : t("testbed.tabWcagMap");
          const isActive = active === tab;
          return (
            <button
              key={tab}
              className="flex-1 py-1 rounded font-label-sm text-label-sm transition-colors"
              style={{
                background: isActive ? activeBg : "transparent",
                color: isActive ? activeText : inactiveText,
                fontWeight: isActive ? 600 : 400,
                boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              }}
              onClick={() => onChange(tab)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 子组件：Custom Toggle Switch ─── */
function ToggleSwitch({ checked, onChange, label, primaryColor, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  primaryColor: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-label-sm text-label-sm" style={{ color: "#334155" }}>{label}</span>
      <div
        className="w-9 h-5 rounded-full p-0.5 flex items-center shadow-sm cursor-pointer transition-colors"
        style={{
          background: checked ? primaryColor : "#94a3b8",
          justifyContent: checked ? "flex-end" : "flex-start",
          opacity: disabled ? 0.4 : 1,
          pointerEvents: disabled ? "none" : "auto",
        }}
        onClick={() => !disabled && onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
      </div>
    </div>
  );
}

/* ─── 子组件：Color Slider ─── */
function ColorSlider({ value, onChange, primaryColor, label, disabled }: {
  value: number;
  onChange: (v: number) => void;
  primaryColor: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-1 min-w-[140px]">
      <span className="font-code-value text-[11px]" style={{ color: "#64748b" }}>{label}:</span>
      <div className="relative w-full h-3 rounded-full flex items-center" style={{ background: `linear-gradient(to right, #000000, ${primaryColor}, #ffffff)` }}>
        <div
          className="w-3.5 h-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] cursor-pointer absolute"
          style={{ left: `${value * 100}%`, transform: "translateX(-50%)", opacity: disabled ? 0.4 : 1 }}
          onMouseDown={(e) => {
            if (disabled) return;
            const rect = e.currentTarget.parentElement!.getBoundingClientRect();
            const move = (ev: MouseEvent) => {
              const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
              onChange(x);
            };
            const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      </div>
      <span className="font-code-value text-[11px] font-semibold" style={{ color: "#0f172a" }}>{value.toFixed(2)}</span>
    </div>
  );
}

/* ─── 子组件：Metric Card with Sparkline ─── */
function MetricCard({ primaryColor, mode }: { primaryColor: string; mode: "light" | "dark" }) {
  const t = useT();
  const bg = mode === "light" ? "#f8fafc" : "#1c2028";
  const text = mode === "light" ? "#0f172a" : "#dfe2ee";
  const mutedText = mode === "light" ? "#64748b" : "#908fa0";
  const badgeBg = mode === "light" ? "#dcfce7" : "rgba(78,222,163,0.15)";
  const badgeText = mode === "light" ? "#15803d" : "#4edea3";

  return (
    <div className="p-space-sm rounded flex flex-col justify-between" style={{ background: bg }}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-label-sm text-label-sm" style={{ color: mutedText }}>{t("testbed.perceptualUniformity")}</span>
        <span className="px-1.5 py-0.5 rounded font-code-value text-[10px] font-semibold" style={{ background: badgeBg, color: badgeText }}>+24.5%</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-headline-lg text-headline-lg font-bold" style={{ color: text }}>0.9984</span>
        <span className="font-code-value text-[11px]" style={{ color: mutedText }}>{t("testbed.oklchMse")}</span>
      </div>
      <div className="w-full h-10">
        <svg className="w-full h-full" fill="none" viewBox="0 0 160 40" style={{ color: primaryColor }}>
          <path d="M0,35 Q30,10 60,25 T120,8 T160,2" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
          <path d="M0,35 Q30,10 60,25 T120,8 T160,2 L160,40 L0,40 Z" fill="currentColor" opacity={mode === "light" ? 0.08 : 0.15} />
        </svg>
      </div>
    </div>
  );
}

/* ─── 子组件：Avatar Stack ─── */
function AvatarStack({ mode }: { mode: "light" | "dark" }) {
  const t = useT();
  const bg = mode === "light" ? "#f8fafc" : "#1c2028";
  const mutedText = mode === "light" ? "#64748b" : "#908fa0";
  const avatarBg = mode === "light" ? "#494bd6" : "#c0c1ff";
  const avatarText = mode === "light" ? "#ffffff" : "#0f131c";
  const statusColor = mode === "light" ? "#10b981" : "#4edea3";
  const statusText = mode === "light" ? "#334155" : "#dfe2ee";
  const commitText = mode === "light" ? "#94a3b8" : "#908fa0";

  return (
    <div className="p-space-sm rounded flex flex-col justify-between" style={{ background: bg }}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-label-sm text-label-sm" style={{ color: mutedText }}>{t("testbed.activeSynthesizers")}</span>
        <span className="font-code-value text-[10px] font-semibold" style={{ color: mode === "light" ? "#494bd6" : "#4edea3" }}>{t("testbed.onlineCount", { count: 3 })}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          <div className="w-8 h-8 rounded-full bg-slate-300 shadow-sm flex items-center justify-center font-code-value text-[10px] font-semibold" style={{ color: "#334155" }}>A</div>
          <div className="w-8 h-8 rounded-full bg-slate-400 shadow-sm flex items-center justify-center font-code-value text-[10px] font-semibold text-white">B</div>
          <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm font-code-value text-[10px] font-semibold" style={{ background: avatarBg, color: avatarText }}>+5</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }} />
          <span className="font-code-value text-[11px]" style={{ color: statusText }}>{t("testbed.allSyncdFigma")}</span>
        </div>
      </div>
      <div className="mt-2 font-code-value text-[10px]" style={{ color: commitText }}>
        {t("testbed.lastCommit")}
      </div>
    </div>
  );
}

/* ─── 子组件：Code Block Preview ─── */
function CodeBlockPreview({ mode }: { mode: "light" | "dark" }) {
  const t = useT();
  const bg = "#0f172a";
  const text = "#f8fafc";
  const mutedText = "#64748b";
  const tagColor = "#f43f5e";
  const funcColor = mode === "light" ? "#a5b4fc" : "#c0c1ff";
  const accentColor = mode === "light" ? "#34d399" : "#4edea3";
  const specColor = mode === "light" ? "#38bdf8" : "#4edea3";

  return (
    <div className="rounded p-space-sm font-code-value text-[11px] leading-relaxed overflow-x-auto shadow-inner" style={{ background: bg, color: text }}>
      <div className="mb-1 flex items-center justify-between">
        <span style={{ color: mutedText }}>tokens.generated.css</span>
        <span style={{ color: specColor }}>{t("testbed.cssVarSpec")}</span>
      </div>
      <div>
        <span style={{ color: tagColor }}>--sys-primary</span>: <span style={{ color: funcColor }}>oklch</span>(0.58 0.24 275.4);
      </div>
      <div>
        <span style={{ color: tagColor }}>--sys-surface</span>: <span style={{ color: funcColor }}>oklch</span>(0.98 0.01 260.0);
      </div>
      <div>
        <span style={{ color: tagColor }}>--sys-accent</span>: <span style={{ color: accentColor }}>oklch</span>(0.82 0.18 152.3);
      </div>
    </div>
  );
}

/* ─── 子组件：Toast Notification ─── */
function ToastNotification({ mode, onClose }: { mode: "light" | "dark"; onClose: () => void }) {
  const t = useT();
  const bg = mode === "light" ? "#0f172a" : "#262a33";
  const text = "#ffffff";
  const linkColor = mode === "light" ? "#818cf8" : "#c0c1ff";
  const closeColor = mode === "light" ? "#94a3b8" : "#908fa0";
  const iconColor = mode === "light" ? "#38bdf8" : "#c0c1ff";

  return (
    <div className="flex items-center justify-between p-space-sm rounded-lg shadow-lg" style={{ background: bg, color: text }}>
      <div className="flex items-center gap-2">
        <MaterialIcon name="info" size={18} className="" />
        <span className="font-label-sm text-label-sm" style={{ color: iconColor }}>
          <span style={{ color: text }}>{t("testbed.toastCompiled")}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <a className="font-label-sm text-label-sm font-semibold hover:underline" style={{ color: linkColor }} href="#">{t("testbed.toastDownload")}</a>
        <button className="hover:opacity-80 transition-opacity" style={{ color: closeColor }} onClick={onClose}>
          <MaterialIcon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

/* ─── 主组件 ── */
export default function TestbedView() {
  usePersistence();
  const t = useT();
  const brand = useBrandStore((s) => s.brand);
  const designOptions = useBrandStore((s) => s.designOptions);
  const { effectiveSpace } = useGamutSupport(useBrandStore((s) => s.space));
  const { result } = useThemeEngine(brand, designOptions);

  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [density, setDensity] = useState<Density>("comfortable");
  const [forcedState, setForcedState] = useState<ForcedState>("normal");
  const [ambient, setAmbient] = useState<AmbientMode>("d65");
  const [chromaMultiplier, setChromaMultiplier] = useState(1.0);
  const [sliderL, setSliderL] = useState(0.58);
  const [apcaToggle, setApcaToggle] = useState(true);
  const [segTab, setSegTab] = useState<SegmentedTab>("tokens");
  const [toastVisible, setToastVisible] = useState(true);

  // 获取 primary / secondary 色用于组件预览
  const primaryColor = useMemo(() => {
    const p500 = result.palette.primary["500"];
    return p500 ? renderColor(p500, effectiveSpace) : "#494bd6";
  }, [result, effectiveSpace]);

  const secondaryColor = useMemo(() => {
    const s = result.palette.secondary["500"];
    return s ? renderColor(s, effectiveSpace) : "#4edea3";
  }, [result, effectiveSpace]);

  const destructiveColor = "#ffb4ab";
  const destructiveBg = "#93000a";

  // 密度通过 data-density 属性覆盖 spacing token，控制组件间距关系

  // 环境光滤镜 + 色度倍增器
  const ambientFilter = ambient === "warm"
    ? `sepia(0.15) brightness(0.95) saturate(${chromaMultiplier})`
    : ambient === "oled"
      ? `brightness(0.85) contrast(1.1) saturate(${chromaMultiplier})`
      : `saturate(${chromaMultiplier})`;

  const handleForcedState = useCallback((state: ForcedState) => setForcedState(state), []);

  // 快照导出
  const handleSnapshot = useCallback(() => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      config: { viewMode, density, forcedState, ambient, chromaMultiplier, sliderL, apcaToggle },
      brand: { hex: brand, oklch: result.brand.oklch },
      designOptions,
      effectiveSpace,
      tokenCount: result.validation.results.length,
      passRate: `${result.validation.counts.PASS}/${result.validation.results.length}`,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
    saveAs(blob, `testbed-snapshot-${Date.now()}.json`);
    useUIStore.getState().setToast(t("testbed.snapshotExported"));
  }, [viewMode, density, forcedState, ambient, chromaMultiplier, sliderL, apcaToggle, brand, designOptions, effectiveSpace, result, t]);

  // 应用所有通道
  const handleApplyAllChannels = useCallback(() => {
    useUIStore.getState().setToast(t("testbed.channelsApplied", { multiplier: chromaMultiplier.toFixed(2) }));
  }, [chromaMultiplier, t]);

  // 交互状态 CSS class
  const stateClass = forcedState === "hover" ? "opacity-80 scale-[1.02]" : forcedState === "focus" ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : forcedState === "disabled" ? "opacity-40 pointer-events-none" : forcedState === "skeleton" ? "animate-pulse bg-surface-container-high" : "";

  /** 渲染单个面板（Light 或 Dark） */
  const renderComponentPanel = (mode: "light" | "dark") => {
    const bg = mode === "light" ? "#f8fafc" : "#0f131c";
    const text = mode === "light" ? "#0f172a" : "#dfe2ee";
    const surfaceBg = mode === "light" ? "#ffffff" : "#1c2028";
    const mutedText = mode === "light" ? "#64748b" : "#908fa0";
    const outlineText = mode === "light" ? "#94a3b8" : "#464554";
    const wcagRatio = mode === "light" ? "11.2:1" : "14.6:1";
    const oklchCoord = mode === "light" ? "L=0.98 C=0.01" : "L=0.18 C=0.02";
    const statusDot = mode === "light" ? "#10b981" : "#4edea3";
    const isDisabled = forcedState === "disabled";

    return (
      <div
        className="flex flex-col gap-space-lg rounded-xl p-space-lg shadow-md transition-all duration-300 relative overflow-hidden"
        style={{ background: bg, color: text, filter: ambientFilter }}
        data-density={density}
      >
        {/* ─ Watermark Badge ── */}
        <div className="flex items-center justify-between pb-space-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: primaryColor }} />
            <span className="font-ui text-[16px] font-semibold tracking-tight" style={{ color: text }}>{mode === "light" ? t("testbed.lightTarget") : t("testbed.darkTarget")}</span>
            <span className="font-code-value text-[11px] px-1.5 py-0.5 rounded" style={{ background: mode === "light" ? "#e2e8f0" : "#262a33", color: mutedText }}>{oklchCoord}</span>
          </div>
          <div className="flex items-center gap-2 font-code-value text-[11px]" style={{ color: mutedText }}>
            <span>WCAG AAA {wcagRatio}</span>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusDot }} />
          </div>
        </div>

        {/* ── Section 1: Navigation & Action Triggers ── */}
        <div className="flex flex-col gap-space-md p-space-md rounded-lg shadow-sm" style={{ background: surfaceBg }}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold" style={{ color: mutedText }}>{t("testbed.secNav")}</span>
            <span className="font-code-value text-[11px]" style={{ color: outlineText }}>&lt;Button /&gt;</span>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            {/* Primary Button */}
            <button className={`px-space-md py-1.5 rounded font-label-md text-label-md font-medium flex items-center gap-1.5 transition-all shadow-[0_2px_10px_rgba(73,75,214,0.35)] ${stateClass}`} style={{ background: primaryColor, color: "#ffffff" }}>
              <MaterialIcon name="rocket_launch" size={16} className="text-[16px]" />
              {t("testbed.primaryOklch")}
            </button>
            {/* Secondary Outlined */}
            <button className={`px-space-md py-1.5 rounded font-label-md text-label-md flex items-center gap-1.5 transition-all shadow-sm ${stateClass}`} style={{ background: mode === "light" ? "#ffffff" : "#262a33", color: text, border: `1px solid ${mode === "light" ? "#e2e8f0" : "#464554"}` }}>
              <MaterialIcon name="tune" size={16} />
              {t("testbed.secondary")}
            </button>
            {/* Ghost */}
            <button className={`px-space-md py-1.5 rounded font-label-md text-label-md transition-colors ${stateClass}`} style={{ color: mode === "light" ? "#475569" : "#c7c4d7" }}>
              {t("testbed.ghostLink")}
            </button>
            {/* Destructive */}
            <button className={`px-space-sm py-1.5 rounded font-label-md text-label-md flex items-center gap-1 transition-colors ${stateClass}`} style={{ background: mode === "light" ? "#fee2e2" : destructiveBg, color: mode === "light" ? "#b91c1c" : destructiveColor }}>
              <MaterialIcon name="delete" size={16} />
              {t("testbed.delete")}
            </button>
            {/* Icon-only */}
            <button className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${stateClass}`} style={{ background: mode === "light" ? "#f1f5f9" : "#262a33", color: mode === "light" ? "#334155" : text }}>
              <MaterialIcon name="more_vert" size={18} />
            </button>
          </div>

          {/* Dropdown & Segmented Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-space-xs">
            <DropdownMenu mutedText={mutedText} mode={mode} />
            <SegmentedTabs active={segTab} onChange={setSegTab} mode={mode} />
          </div>
        </div>

        {/* ── Section 2: Form Controls & Input Bounds ── */}
        <div className="flex flex-col gap-space-md p-space-md rounded-lg shadow-sm" style={{ background: surfaceBg }}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold" style={{ color: mutedText }}>{t("testbed.secForm")}</span>
            <span className="font-code-value text-[11px]" style={{ color: outlineText }}>&lt;Input /&gt;</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            {/* Text Field Active */}
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm font-medium" style={{ color: mode === "light" ? "#475569" : "#c7c4d7" }}>{t("testbed.tokenName")}</label>
              <div className="relative flex items-center">
                <MaterialIcon name="tag" size={16} className="absolute left-2.5" />
                <input
                  type="text"
                  value="brand-primary-900"
                  className={`w-full pl-8 pr-space-sm py-1.5 rounded font-code-value text-code-value shadow-inner focus:outline-none transition-all ${stateClass}`}
                  style={{
                    background: mode === "light" ? "#f8fafc" : "#0a0e16",
                    color: text,
                    border: `1px solid ${mode === "light" ? "#e2e8f0" : "#464554"}`,
                  }}
                  disabled={isDisabled}
                />
              </div>
            </div>
            {/* Error Input */}
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm font-medium flex items-center justify-between" style={{ color: mode === "light" ? "#b91c1c" : destructiveColor }}>
                <span>{t("testbed.chromaSaturation")}</span>
                <span className="font-code-value text-[10px]">dE 4.8 Clipping</span>
              </label>
              <input
                type="text"
                value="0.328 (Out of P3)"
                className={`w-full px-space-sm py-1.5 rounded font-code-value text-code-value focus:outline-none ${stateClass}`}
                style={{
                  background: mode === "light" ? "#fef2f2" : "rgba(255,180,171,0.1)",
                  color: mode === "light" ? "#991b1b" : destructiveColor,
                  boxShadow: `0 0 0 2px ${mode === "light" ? "#ef4444" : destructiveColor}`,
                }}
                disabled={isDisabled}
              />
            </div>
          </div>

          {/* Checkbox, Toggle Switch & Color Slider */}
          <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-xs p-space-sm rounded" style={{ background: mode === "light" ? "#f8fafc" : "#1c2028" }}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: primaryColor }} disabled={isDisabled} />
              <span className="font-label-sm text-label-sm" style={{ color: mode === "light" ? "#334155" : text }}>{t("testbed.clampGamut")}</span>
            </label>
            <ToggleSwitch checked={apcaToggle} onChange={setApcaToggle} label="APCA 2.0" primaryColor={primaryColor} disabled={isDisabled} />
            <ColorSlider value={sliderL} onChange={setSliderL} primaryColor={primaryColor} label="L" disabled={isDisabled} />
          </div>
        </div>

        {/* ── Section 3: Data Display & Visual Telemetry ─ */}
        <div className="flex flex-col gap-space-md p-space-md rounded-lg shadow-sm" style={{ background: surfaceBg }}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold" style={{ color: mutedText }}>{t("testbed.secData")}</span>
            <span className="font-code-value text-[11px]" style={{ color: outlineText }}>&lt;MetricCard /&gt;</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <MetricCard primaryColor={primaryColor} mode={mode} />
            <AvatarStack mode={mode} />
          </div>
          {/* Code Block */}
          <CodeBlockPreview mode={mode} />
        </div>

        {/* ── Section 4: Feedback Banners & Alerts ── */}
        <div className="flex flex-col gap-space-md p-space-md rounded-lg shadow-sm" style={{ background: surfaceBg }}>
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-semibold" style={{ color: mutedText }}>{t("testbed.secFeedback")}</span>
            <span className="font-code-value text-[11px]" style={{ color: outlineText }}>&lt;Alert /&gt;</span>
          </div>
          <div className="flex flex-col gap-2">
            {/* Success */}
            <div className="flex items-center gap-2 p-space-sm rounded" style={{ background: mode === "light" ? "#ecfdf5" : `${secondaryColor}15`, color: mode === "light" ? "#065f46" : secondaryColor }}>
              <MaterialIcon name="task_alt" size={18} />
              <span className="font-label-sm text-label-sm font-medium flex-1">{t("testbed.gamutSuccess")}</span>
              <span className="font-code-value text-[10px]">200 OK</span>
            </div>
            {/* Warning */}
            <div className="flex items-center gap-2 p-space-sm rounded" style={{ background: mode === "light" ? "#fffbeb" : "rgba(255,183,131,0.12)", color: mode === "light" ? "#92400e" : "#ffb783" }}>
              <MaterialIcon name="warning" size={18} />
              <span className="font-label-sm text-label-sm font-medium flex-1">{t("testbed.hueShiftWarn")}</span>
              <span className="font-code-value text-[10px]">{t("testbed.inspect")}</span>
            </div>
          </div>
          {/* Toast */}
          {toastVisible && <ToastNotification mode={mode} onClose={() => setToastVisible(false)} />}
        </div>
      </div>
    );
  };

  // 密度标签映射（Standard ↔ comfortable）
  const densityLabels: Record<Density, string> = { comfortable: t("testbed.densityStandard"), compact: t("testbed.densityCompact"), dense: t("testbed.densitySpacious") };

  return (
    <div className="flex flex-col w-full">
      {/* ── Top Ambient & Context Telemetry Banner ── */}
      <div className="w-full bg-surface-container-low px-gutter-desktop py-space-sm mb-space-md flex flex-wrap items-center justify-between gap-space-md rounded-xl">
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container-high text-primary font-code-value text-code-value">
            <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
            {t("testbed.engineOk")}
          </div>
          <div className="h-3 w-px bg-outline-variant" />
          <div className="flex items-center gap-2 font-code-value text-code-value text-on-surface-variant">
            <span>{t("testbed.targetGamut")}</span>
            <span className="text-secondary font-semibold">{effectiveSpace} {t("testbed.wideGamut")}</span>
            <span className="text-outline">|</span>
            <span>{t("testbed.deltaThreshold")}</span>
          </div>
        </div>
        <div className="flex items-center gap-space-sm font-label-sm text-label-sm">
          <span className="text-on-surface-variant flex items-center gap-1">
            <MaterialIcon name="verified_user" size={16} className="text-secondary" />
            {t("testbed.apcaPassed")}
          </span>
          <div className="h-3 w-px bg-outline-variant" />
          <button
            className="px-space-sm py-1 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded transition-colors flex items-center gap-1 shrink-0"
            onClick={handleSnapshot}
          >
            <MaterialIcon name="photo_camera" size={14} />
            {t("testbed.snapshot")}
          </button>
        </div>
      </div>

      {/* ── Control Bar ── */}
      <div className="w-full bg-surface-container rounded-xl p-space-md mb-space-lg shadow-sm flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-lg flex-wrap">
            {/* Viewport Mode */}
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{t("testbed.viewMode")} / VIEW MODE</span>
              <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-lg">
                {(["split", "light", "dark"] as const).map((m) => (
                  <button
                    key={m}
                    className={`px-space-md py-1 rounded font-label-md text-label-md transition-colors flex items-center gap-1.5 shrink-0 ${
                      viewMode === m ? "bg-primary text-on-primary font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                    }`}
                    onClick={() => setViewMode(m)}
                  >
                    <MaterialIcon name={m === "split" ? "view_column" : m === "light" ? "light_mode" : "dark_mode"} size={16} />
                    {m === "split" ? t("testbed.splitDual") : m === "light" ? t("testbed.lightOnly") : t("testbed.darkOnly")}
                  </button>
                ))}
              </div>
            </div>

            {/* Density */}
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{t("testbed.density")} / DENSITY</span>
              <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-lg">
                {(["compact", "comfortable", "dense"] as const).map((d) => (
                  <button
                    key={d}
                    className={`px-space-sm py-1 rounded font-code-value text-code-value transition-colors shrink-0 ${
                      density === d ? "bg-surface-container-high text-on-surface font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => setDensity(d)}
                  >
                    {densityLabels[d]}
                  </button>
                ))}
              </div>
            </div>

            {/* Ambient */}
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{t("testbed.ambient")} / AMBIENT</span>
              <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-lg">
                {([
                  { value: "d65" as const, label: t("testbed.d65"), dot: "#dfe2ee" },
                  { value: "oled" as const, label: t("testbed.midnight"), dot: "#0a0e16" },
                  { value: "warm" as const, label: t("testbed.warm"), dot: "#ffb783" },
                ]).map((a) => (
                  <button
                    key={a.value}
                    className={`px-space-sm py-1 rounded font-label-sm text-label-sm flex items-center gap-1 transition-colors shrink-0 ${
                      ambient === a.value ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => setAmbient(a.value)}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: a.dot, border: a.value === "oled" ? "1px solid #464554" : "none" }} />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Forced State */}
          <div className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">{t("testbed.forcedState")} / FORCED STATE</span>
            <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-lg flex-wrap">
              {(["normal", "hover", "focus", "disabled", "skeleton"] as const).map((state) => (
                <button
                  key={state}
                  className={`px-space-sm py-1 rounded font-code-value text-code-value transition-colors shrink-0 ${
                    forcedState === state ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                  onClick={() => handleForcedState(state)}
                >
                  {state === "normal" ? t("testbed.stateNormal") : state === "hover" ? t("testbed.stateHover") : state === "focus" ? t("testbed.stateFocus") : state === "disabled" ? t("testbed.stateDisabled") : t("testbed.stateSkeleton")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dual-Column Test Canvas ── */}
      <div className={`grid gap-space-lg w-full mb-space-xl ${viewMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 max-w-4xl mx-auto"}`}>
        {(viewMode === "split" || viewMode === "light") && renderComponentPanel("light")}
        {(viewMode === "split" || viewMode === "dark") && renderComponentPanel("dark")}
      </div>

      {/* ── Diagnostics Footer: Realtime CSS Variable Cascade ── */}
      <div className="w-full bg-surface-container rounded-xl p-space-lg shadow-md flex flex-col lg:flex-row gap-space-xl items-stretch justify-between">
        {/* Variable Cascade Readout */}
        <div className="flex-1 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MaterialIcon name="terminal" size={18} className="text-primary" />
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">{t("testbed.realtimeCascade")}</span>
            </div>
            <span className="font-code-value text-code-value text-secondary">{t("testbed.computedActive")}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm p-space-md rounded-lg bg-surface-container-lowest font-code-value text-code-value">
            <div className="flex flex-col gap-1 p-space-xs rounded bg-surface-container-low">
              <span className="text-outline text-[11px]">--cus-primary</span>
              <span className="text-primary font-semibold">oklch(0.58 0.24 275.4)</span>
              <span className="text-on-surface-variant text-[10px]">{t("testbed.relLuminance")}: 0.28</span>
            </div>
            <div className="flex flex-col gap-1 p-space-xs rounded bg-surface-container-low">
              <span className="text-outline text-[11px]">--cus-surface</span>
              <span className="text-on-surface font-semibold">oklch(0.18 0.02 260.0)</span>
              <span className="text-on-surface-variant text-[10px]">{t("testbed.apcaScore")}: Lc 84</span>
            </div>
            <div className="flex flex-col gap-1 p-space-xs rounded bg-surface-container-low">
              <span className="text-outline text-[11px]">--cus-border-interactive</span>
              <span className="text-secondary font-semibold">oklch(0.40 0.12 275.4)</span>
              <span className="text-on-surface-variant text-[10px]">{t("testbed.hairlineContrast")}: 4.5:1 Pass</span>
            </div>
          </div>
        </div>

        {/* Live One-click Theme Multiplier */}
        <div className="w-full lg:w-80 flex flex-col justify-between gap-space-sm bg-surface-container-low p-space-md rounded-lg">
          <div className="flex items-center justify-between">
            <span className="font-label-md text-label-md text-on-surface font-semibold">{t("testbed.chromaMultiplier")}</span>
            <span className="font-code-value text-code-value px-1.5 py-0.5 rounded bg-primary text-on-primary font-bold">{chromaMultiplier.toFixed(2)}x</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {t("testbed.dynamicStretch")}
          </p>
          <div className="flex flex-col gap-1.5">
            <input
              type="range"
              className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
              min={0.8}
              max={1.2}
              step={0.05}
              value={chromaMultiplier}
              onChange={(e) => setChromaMultiplier(Number(e.target.value))}
            />
            <div className="flex justify-between font-code-value text-[10px] text-outline">
              <span>{t("testbed.mutedLabel")}</span>
              <span>{t("testbed.standardLabel")}</span>
              <span>{t("testbed.vibrantLabel")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-space-xs">
            <button
              className="flex-1 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-sm text-label-sm transition-colors shrink-0"
              onClick={() => setChromaMultiplier(1.0)}
            >
              {t("testbed.resetParam")}
            </button>
            <button
              className="flex-1 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold hover:bg-primary-fixed-dim transition-colors shrink-0"
              onClick={handleApplyAllChannels}
            >
              {t("testbed.applyAllChannels")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
