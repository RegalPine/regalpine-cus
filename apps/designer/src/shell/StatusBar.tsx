import { useBrandStore } from "../stores/brand-store";
import { useViewStore } from "../stores/view-store";
import { useLocation } from "react-router";
import { MaterialIcon } from "../shared/icons/MaterialIcon";
import { useT } from "../i18n";
import type { TranslationKey } from "../i18n";

const routeKeys: Record<string, TranslationKey> = {
  "/studio/scale": "status.routeThemeStudio",
  "/studio/gamut": "status.routeGamutVolume",
  "/studio/gamut/hue-wheel": "status.routeHueWheel",
  "/studio/gamut/lc-cut": "status.routeLCCut",
  "/studio/contrast": "status.routeContrastMatrix",
  "/studio/testbed": "status.routeComponentTestbed",
  "/studio/semantic": "status.routeSemanticSurface",
  "/studio/export": "status.routeExportCenter",
};

export function StatusBar() {
  const brand = useBrandStore((s) => s.brand);
  const lch = useBrandStore((s) => s.lch);
  const space = useBrandStore((s) => s.space);
  const mode = useViewStore((s) => s.mode);
  const location = useLocation();
  const currentViewKey = routeKeys[location.pathname] ?? "status.unknown";
  const t = useT();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface-container-low border-t border-outline-variant/30 shadow-[0_-1px_6px_rgba(0,0,0,0.2)]">
      <div className="h-7 w-full px-margin-desktop flex items-center justify-between gap-space-lg">
        {/* Left: Brand info + current view */}
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs">
            <div
              className="w-3 h-3 rounded-sm shadow-sm"
              style={{ background: brand }}
            />
            <span className="font-code-value text-[11px] text-on-surface">
              {brand.toUpperCase()}
            </span>
          </div>
          <span className="text-outline-variant">|</span>
          <span className="font-code-value text-[11px] text-on-surface-variant">
            L:{lch.l.toFixed(2)} C:{lch.c.toFixed(3)} h:{lch.h?.toFixed(1) ?? "—"}°
          </span>
          <span className="text-outline-variant">|</span>
          <span className="font-code-value text-[11px] text-primary">
            {t(currentViewKey)}
          </span>
        </div>

        {/* Right: Status indicators */}
        <div className="flex items-center gap-space-md">
          <span className="font-mono text-[11px] text-outline">{t("status.activeEngine")}</span>
          <span className="text-outline-variant">|</span>
          <span className="font-mono text-[11px] text-secondary">{t("status.p3GamutMap")}: {space === "display-p3" ? t("status.on") : t("status.off")}</span>
          <span className="text-outline-variant">|</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            <span className="font-code-value text-[11px] text-on-surface-variant">
              {mode === "split" ? t("status.modeSplit") : mode === "dark" ? t("status.modeDark") : t("status.modeLight")}
            </span>
          </div>
          <span className="text-outline-variant">|</span>
          <div className="flex items-center gap-1 text-on-surface-variant">
            <MaterialIcon name="check_circle" size={14} className="text-secondary" />
            <span className="font-code-value text-[11px]">WCAG AAA</span>
          </div>
          <span className="text-outline-variant">|</span>
          <span className="font-code-value text-[11px] text-outline">
            v1.4.0
          </span>
        </div>
      </div>
    </div>
  );
}
