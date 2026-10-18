import { useState } from "react";
import { Link, useLocation } from "react-router";
import { MaterialIcon } from "../shared/icons/MaterialIcon";
import { useT, useI18NStore } from "../i18n";
import { useCVDStore } from "../stores";
import type { CVDType } from "../lib/cvd-sim";

const CVD_KEYS: Record<CVDType, "header.cvdNormal" | "header.cvdProtanopia" | "header.cvdDeuteranopia" | "header.cvdTritanopia" | "header.cvdAchromatopsia"> = {
  normal: "header.cvdNormal",
  protanopia: "header.cvdProtanopia",
  deuteranopia: "header.cvdDeuteranopia",
  tritanopia: "header.cvdTritanopia",
  achromatopsia: "header.cvdAchromatopsia",
};

interface NavItem {
  path: string;
  labelKey: "nav.scaleStudio" | "nav.gamutVolume" | "nav.contrastMatrix" | "nav.designTokens" | "nav.componentTestbed" | "nav.exportCenter";
}

const NAV_ITEMS: NavItem[] = [
  { path: "/studio/scale", labelKey: "nav.scaleStudio" },
  { path: "/studio/gamut", labelKey: "nav.gamutVolume" },
  { path: "/studio/contrast", labelKey: "nav.contrastMatrix" },
  { path: "/studio/semantic", labelKey: "nav.designTokens" },
  { path: "/studio/testbed", labelKey: "nav.componentTestbed" },
  { path: "/studio/export", labelKey: "nav.exportCenter" },
];

export function AppHeader() {
  const [cvdOpen, setCvdOpen] = useState(false);
  const cvdType = useCVDStore((s) => s.type);
  const setCvdType = useCVDStore((s) => s.setType);
  const location = useLocation();
  const t = useT();
  const locale = useI18NStore((s) => s.locale);
  const toggleLocale = useI18NStore((s) => s.toggleLocale);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.3)]">
      <div className="h-12 w-full px-margin-desktop flex items-center gap-space-lg">
        {/* Left: Logo */}
        <div className="flex items-center gap-space-md shrink-0">
          <MaterialIcon name="palette" size={24} className="text-primary" />
          <span className="font-headline-sm text-on-surface font-semibold tracking-tight">
            CUS Designer
          </span>
          <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface-variant font-code-value text-[10px]">
            v1.4.0
          </span>
        </div>

        {/* Center: Navigation tabs */}
        <nav className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0">
          {NAV_ITEMS.map((item) => {
            const isActive = item.path === "/studio/gamut"
              ? location.pathname.startsWith("/studio/gamut")
              : location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`px-space-md py-1 rounded whitespace-nowrap transition-colors font-ui text-[12px] ${
                  isActive
                    ? "bg-surface-container-high text-on-surface font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-space-sm shrink-0">
          {/* CVD Filter */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors"
              onClick={() => setCvdOpen(!cvdOpen)}
            >
              <MaterialIcon name="visibility" size={16} className={cvdType !== "normal" ? "text-tertiary" : ""} />
              <span className="hidden xl:inline font-medium">{cvdType === "normal" ? t("header.cvdSimulate") : t(CVD_KEYS[cvdType]).split(" ")[0]}</span>
              <MaterialIcon name="expand_more" size={14} className="text-outline" />
            </button>
            {cvdOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setCvdOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-surface-container-high rounded-lg shadow-xl border border-outline-variant/30 overflow-hidden">
                  <div className="px-space-md py-space-sm border-b border-outline-variant/20">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{t("header.cvdTitle")}</span>
                  </div>
                  {(Object.entries(CVD_KEYS) as [CVDType, typeof CVD_KEYS[CVDType]][]).map(([key, labelKey]) => (
                    <button
                      key={key}
                      className={`w-full px-space-md py-space-sm text-left font-label-sm text-label-sm transition-colors flex items-center justify-between ${
                        cvdType === key
                          ? "bg-primary-container/20 text-primary"
                          : "text-on-surface hover:bg-surface-container-highest"
                      }`}
                      onClick={() => { setCvdType(key); setCvdOpen(false); }}
                    >
                      <span>{t(labelKey)}</span>
                      {cvdType === key && <MaterialIcon name="check" size={16} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            className="flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors"
            onClick={toggleLocale}
          >
            <MaterialIcon name="language" size={16} className="text-primary" />
            <span className="font-medium">{locale === "zh-CN" ? "中 / EN" : "EN / 中"}</span>
          </button>
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
            <MaterialIcon name="person" size={16} className="text-on-primary" />
          </div>
        </div>
      </div>
    </header>
  );
}
