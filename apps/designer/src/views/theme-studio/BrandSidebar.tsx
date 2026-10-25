/**
 * BrandSidebar — 品牌色输入 + OKLCH 滑杆 + 设计偏好 + 预设色 + 流水线。
 * 与原型 cus_designer_oklch_theme_studio 对齐。
 */
import * as Slider from "@radix-ui/react-slider";
import {
  CusCheckbox,
} from "@cus/ui";
import type { ThemeOptions, GeneratedTheme } from "@cus/core";
import { parseThemeOptions } from "@cus/core";
import { useBrandStore } from "../../stores/brand-store";
import { useViewStore } from "../../stores/view-store";
import { useUIStore } from "../../stores/ui-store";
import { useBrandInput, fmtValue } from "../../hooks/useBrandInput";
import { PanelCard } from "../../shared/layout/PanelCard";
import { OKLCHPicker } from "../../components/OKLCHPicker";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../i18n/translations";

/** 推荐感知基准预设（含传统品牌色） */
const PRESET_COLORS = [
  { hex: "#6366f1", nameKey: "brand.presetElectricIndigo" as const },
  { hex: "#10b981", nameKey: "brand.presetEmeraldPulse" as const },
  { hex: "#8b5cf6", nameKey: "brand.presetCyberViolet" as const },
  { hex: "#f97316", nameKey: "brand.presetSunsetTangerine" as const },
  { hex: "#2457C5", nameKey: "brand.presetRoyalBlue" as const },
  { hex: "#7954B3", nameKey: "brand.presetAmethyst" as const },
  { hex: "#C54B64", nameKey: "brand.presetCrimsonRose" as const },
  { hex: "#C8782B", nameKey: "brand.presetAmberGold" as const },
  { hex: "#24836A", nameKey: "brand.presetForestTeal" as const },
  { hex: "#272B35", nameKey: "brand.presetGraphite" as const },
  { hex: "#6B7280", nameKey: "brand.presetNeutral" as const },
];

const HUE_NAME_KEYS: { max: number; key: TranslationKey }[] = [
  { max: 15, key: "brand.hueRed" },
  { max: 45, key: "brand.hueOrange" },
  { max: 75, key: "brand.hueYellow" },
  { max: 105, key: "brand.hueLime" },
  { max: 135, key: "brand.hueGreen" },
  { max: 165, key: "brand.hueTeal" },
  { max: 195, key: "brand.hueCyan" },
  { max: 225, key: "brand.hueSky" },
  { max: 255, key: "brand.hueBlue" },
  { max: 285, key: "brand.hueIndigoViolet" },
  { max: 315, key: "brand.huePurple" },
  { max: 360, key: "brand.hueMagentaPink" },
];
function getHueNameKey(h: number): TranslationKey {
  for (const entry of HUE_NAME_KEYS) {
    if (h < entry.max) return entry.key;
  }
  return "brand.hueRed";
}

export function BrandSidebar({
  result,
}: {
  result: GeneratedTheme;
}) {
  const brand = useBrandStore();
  const { recent, setRecent } = useViewStore();
  const notify = useUIStore((s) => s.setToast);
  const actions = useBrandInput(result.brand.alpha);
  const t = useT();

  /** 设计偏好控件配置 */
  const PREF_CONTROLS = [
    { key: "chroma", label: t("brand.chromaLabel"), values: { muted: t("brand.chromaMuted"), balanced: t("brand.chromaBalanced"), vivid: t("brand.chromaVivid") } },
    { key: "contrast", label: t("brand.contrastLabel"), values: { normal: t("brand.contrastNormal"), high: t("brand.contrastHigh") } },
    { key: "neutral", label: t("brand.neutralLabel"), values: { "brand-tinted": t("brand.neutralBrandTinted"), pure: t("brand.neutralPure") } },
    { key: "semantic", label: t("brand.semanticLabel"), values: { harmonious: t("brand.semanticHarmonious"), distinct: t("brand.semanticDistinct") } },
  ] as const;
  const PREF_DEFAULTS: Record<string, string> = {
    chroma: "balanced", contrast: "normal", neutral: "brand-tinted", semantic: "harmonious",
  };

  return (
    <div className="flex flex-col gap-space-md">
      {/* ── Brand & Perception Card ── */}
      <PanelCard level="low">
        <div className="flex items-center justify-between mb-space-md">
          <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-2">
            <span className="text-primary text-[18px]">🎨</span>
            {t("brand.title")}
          </h2>
          <span className="px-1.5 py-0.5 rounded bg-surface-container-high font-code-value text-body-sm text-secondary">OKLCH</span>
        </div>

        {/* Brand Color Input Group */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl flex flex-col gap-2.5 mb-space-md">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">{t("brand.anchorLabel")}</span>
            <span className="font-code-value text-body-sm text-secondary flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
              {t("brand.autoRecalibrate")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-lg shrink-0 shadow-sm transition-colors duration-200"
              style={{ background: result.brand.hex }}
            />
            <div className="flex-1 flex items-center bg-surface-container-high rounded-lg px-2.5 py-1.5">
              <span className="font-code-value text-body-sm text-outline mr-1.5">HEX</span>
              <input
                className="w-full bg-transparent text-on-surface font-code-value text-code-value focus:outline-none uppercase font-semibold"
                value={brand.draft}
                maxLength={9}
                spellCheck={false}
                aria-label={t("brand.ariaHex")}
                onChange={(e) => actions.updateBrand(e.target.value)}
              />
            </div>
          </div>
          {/* Computed OKLCH Badge */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container text-on-surface-variant font-code-value text-body-sm">
            <span className="text-outline">OKLCH:</span>
            <span className="text-primary font-semibold">
              oklch({fmtValue(result.brand.oklch.l, 2)} {fmtValue(result.brand.oklch.c, 2)} {result.brand.oklch.h != null ? fmtValue(result.brand.oklch.h, 1) : "—" })
            </span>
          </div>
          {brand.error && <p className="text-error text-[11px]" role="alert">{brand.error}</p>}
        </div>

        {/* OKLCH 2D Picker */}
        <div className="mb-space-md">
          <OKLCHPicker
            value={brand.lch}
            onChange={(next) => actions.applyLch(next)}
          />
        </div>

        {/* Sliders Module (L, C, H) */}
        <div className="flex flex-col gap-space-md pt-1">
          {/* Lightness L */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-label-sm text-label-sm">
              <span className="text-on-surface flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary-fixed" />
                {t("brand.lightness")}
              </span>
              <div className="flex items-center gap-1 font-code-value text-body-sm">
                <span className="text-on-surface font-semibold">{Math.round(result.brand.oklch.l * 100)}%</span>
                <span className="text-outline">/</span>
                <span className="text-primary">{fmtValue(result.brand.oklch.l, 2)}</span>
              </div>
            </div>
            <div className="relative w-full h-2.5 rounded-full overflow-hidden bg-surface-container-highest shadow-inner">
              <div className="absolute inset-0 bg-gradient-to-r from-black via-primary-container to-white opacity-90" />
              <Slider.Root
                min={0.10} max={0.95} step={0.01}
                value={[Math.min(0.95, Math.max(0.10, result.brand.oklch.l))]}
                className="absolute inset-0 w-full h-full"
                onValueChange={([value]) => actions.updateLch("l", value)}
                onPointerDown={() => { actions.draggingRef.current = true; }}
                onPointerUp={() => { actions.draggingRef.current = false; actions.flushLch(); }}
                onPointerCancel={() => { actions.draggingRef.current = false; actions.flushLch(); }}
              >
                <Slider.Track className="w-full h-full bg-transparent" />
                <Slider.Thumb className="sr-only" aria-label={t("brand.ariaLightness")} />
              </Slider.Root>
            </div>
          </div>
          {/* Chroma C */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-label-sm text-label-sm">
              <span className="text-on-surface flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-tertiary" />
                {t("brand.chroma")}
              </span>
              <div className="flex items-center gap-1 font-code-value text-body-sm">
                <span className="text-tertiary font-semibold">{fmtValue(result.brand.oklch.c, 2)}</span>
                <span className="px-1 rounded bg-secondary-container/20 text-secondary text-[10px]">{t("brand.p3Gamut")}</span>
              </div>
            </div>
            <div className="relative w-full h-2.5 rounded-full overflow-hidden bg-surface-container-highest shadow-inner">
              <div className="absolute inset-0 bg-gradient-to-r from-slate-600 via-primary to-primary-container opacity-90" />
              <Slider.Root
                min={0} max={0.35} step={0.01}
                value={[Math.min(0.35, result.brand.oklch.c)]}
                className="absolute inset-0 w-full h-full"
                onValueChange={([value]) => actions.updateLch("c", value)}
                onPointerDown={() => { actions.draggingRef.current = true; }}
                onPointerUp={() => { actions.draggingRef.current = false; actions.flushLch(); }}
                onPointerCancel={() => { actions.draggingRef.current = false; actions.flushLch(); }}
              >
                <Slider.Track className="w-full h-full bg-transparent" />
                <Slider.Thumb className="sr-only" aria-label={t("brand.ariaChroma")} />
              </Slider.Root>
            </div>
          </div>
          {/* Hue h */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-label-sm text-label-sm">
              <span className="text-on-surface flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                {t("brand.hue")}
              </span>
              <div className="flex items-center gap-1 font-code-value text-body-sm">
                <span className="text-secondary font-semibold">
                  {result.brand.oklch.h != null ? `${fmtValue(result.brand.oklch.h, 1)}°` : "—"}
                </span>
                <span className="text-outline">
                  {result.brand.oklch.h != null ? t(getHueNameKey(result.brand.oklch.h)) : t("brand.achromatic")}
                </span>
              </div>
            </div>
            <div
              className="relative w-full h-2.5 rounded-full overflow-hidden shadow-inner"
              style={{ background: "linear-gradient(to right, #ef4444, #f59e0b, #10b981, #06b6d4, #6366f1, #d946ef, #ef4444)" }}
            >
              <Slider.Root
                min={0} max={360} step={0.5}
                value={[result.brand.oklch.h ?? 0]}
                className="absolute inset-0 w-full h-full"
                onValueChange={([value]) => actions.updateLch("h", value)}
                onPointerDown={() => { actions.draggingRef.current = true; }}
                onPointerUp={() => { actions.draggingRef.current = false; actions.flushLch(); }}
                onPointerCancel={() => { actions.draggingRef.current = false; actions.flushLch(); }}
              >
                <Slider.Track className="w-full h-full bg-transparent" />
                <Slider.Thumb className="sr-only" aria-label={t("brand.ariaHue")} />
              </Slider.Root>
            </div>
          </div>
        </div>

        {/* Design Preferences Controls */}
        <div className="flex flex-col gap-2.5 pt-4">
          <label className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{t("brand.prefTitle")}</label>
          {PREF_CONTROLS.map(({ key, label, values }) => {
            const currentVal = (brand.designOptions[key as keyof ThemeOptions] as string) ?? PREF_DEFAULTS[key];
            const valEntries = Object.entries(values);
            return (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
                <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-lg font-label-sm text-body-sm shrink-0">
                  {valEntries.map(([v, text]) => (
                    <button
                      key={v}
                      className={`px-2 py-0.5 rounded transition-colors ${
                        currentVal === v
                          ? "bg-surface-container-high text-on-surface font-semibold shadow-sm"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                      onClick={() => brand.setDesignOptions(parseThemeOptions({ ...brand.designOptions, [key]: v }))}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {/* Light/Dark mode checkboxes */}
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant cursor-pointer">
              <CusCheckbox
                checked={brand.designOptions.lightMode !== false}
                disabled={brand.designOptions.darkMode === false}
                onCheckedChange={(v) => {
                  brand.setDesignOptions({ ...brand.designOptions, lightMode: !!v });
                  if (!v) useViewStore.getState().setMode("dark");
                }}
              /> {t("brand.generateLight")}
            </label>
            <label className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant cursor-pointer">
              <CusCheckbox
                checked={brand.designOptions.darkMode !== false}
                disabled={brand.designOptions.lightMode === false}
                onCheckedChange={(v) => {
                  brand.setDesignOptions({ ...brand.designOptions, darkMode: !!v });
                  if (!v) useViewStore.getState().setMode("light");
                }}
              /> {t("brand.generateDark")}
            </label>
          </div>
          {/* Output format checkboxes */}
          <div className="flex items-center gap-4">
            {(["srgb", "displayP3"] as const).map((target) => {
              const output = brand.designOptions.output ?? { srgb: true, displayP3: true };
              return (
                <label key={target} className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant cursor-pointer">
                  <CusCheckbox
                    checked={output[target]}
                    disabled={output[target] && Object.values(output).filter(Boolean).length === 1}
                    onCheckedChange={(v) =>
                      brand.setDesignOptions({ ...brand.designOptions, output: { ...output, [target]: !!v } })
                    }
                  /> {target === "srgb" ? t("brand.srgbOutput") : t("brand.p3Output")}
                </label>
              );
            })}
          </div>
        </div>

        {/* Presets Row — 推荐感知基准预设 */}
        <div className="flex flex-col gap-1.5 pt-4">
          <div className="flex items-center justify-between">
            <label className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{t("brand.presetsLabel")}</label>
            <button className="text-[11px] text-on-surface-variant hover:text-on-surface" onClick={() => actions.updateBrand("#2457C5")}>{t("brand.reset")}</button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_COLORS.map((p) => (
              <button
                key={p.hex}
                className="px-2 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-left flex items-center gap-2 transition-all relative"
                onClick={() => actions.updateBrand(p.hex)}
                aria-pressed={result.brand.hex === p.hex}
              >
                <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ background: p.hex }} />
                <span className="font-label-sm text-label-sm text-on-surface truncate">{t(p.nameKey)}</span>
                {result.brand.hex === p.hex && <span className="text-[10px] text-primary font-bold ml-auto">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Gamut Mapping Alert Card */}
        <div className="mt-4 bg-surface-container-lowest p-space-md rounded-xl flex items-start gap-2.5">
          <span className="text-secondary text-[20px] shrink-0 mt-0.5">✓</span>
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-surface font-semibold">{t("brand.gamutTitle")}</span>
            <span className="font-body-sm text-body-sm text-secondary font-medium">{t("brand.gamutDesc")}</span>
            <span className="font-label-sm text-[11px] text-outline mt-0.5">{t("brand.gamutAlgo")}</span>
          </div>
        </div>
      </PanelCard>

      {/* ── 最近主题 (保留功能) ── */}
      <PanelCard level="low">
        <div className="flex items-center justify-between mb-2">
          <span className="font-label-sm text-label-sm text-on-surface font-medium">{t("brand.recentThemes")}</span>
          <button
            className="text-[11px] text-on-surface-variant hover:text-on-surface"
            onClick={() => {
              setRecent([result.brand.source, ...recent.filter((c) => c !== result.brand.source)].slice(0, 5));
              notify(t("brand.savedToRecent"));
            }}
          >{t("brand.save")}</button>
        </div>
        {recent.length ? recent.map((c) => (
          <button
            key={c}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-surface-container-high transition-colors text-left"
            onClick={() => actions.updateBrand(c)}
          >
            <span className="w-4 h-4 rounded shrink-0" style={{ background: c }} />
            <code className="font-code-value text-[11px] text-on-surface-variant">{c}</code>
          </button>
        )) : <p className="text-[11px] text-on-surface-variant">{t("brand.saveHint")}</p>}
      </PanelCard>
    </div>
  );
}
