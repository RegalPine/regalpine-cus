/**
 * GamutViewTabs — 色域探索视图内部共享的子导航标签栏。
 *
 * 在 GamutVolumeView / HueWheelView / LCCutView 三个视图顶部统一渲染，
 * 保证不同视图状态下导航一致（与原型对齐）。
 */
import { Link, useLocation } from "react-router";
import { useT } from "../i18n";

interface GamutTab {
  path: string;
  labelKey: "gamut.tabOblique" | "gamut.tabHueWheel" | "gamut.tabLcCut";
  sublabelKey: "gamut.oblique" | "gamut.hueWheel" | "gamut.lcCut";
}

const TABS: GamutTab[] = [
  { path: "/studio/gamut", labelKey: "gamut.tabOblique", sublabelKey: "gamut.oblique" },
  { path: "/studio/gamut/hue-wheel", labelKey: "gamut.tabHueWheel", sublabelKey: "gamut.hueWheel" },
  { path: "/studio/gamut/lc-cut", labelKey: "gamut.tabLcCut", sublabelKey: "gamut.lcCut" },
];

export function GamutViewTabs() {
  const location = useLocation();
  const t = useT();

  return (
    <div className="flex items-center gap-space-xs bg-surface-container-lowest p-1 rounded-lg">
      {TABS.map((tab) => {
        const isActive = location.pathname === tab.path;
        if (isActive) {
          return (
            <span
              key={tab.path}
              className="flex items-center gap-1.5 px-space-md py-1 rounded font-label-sm text-label-sm bg-primary text-on-primary font-semibold shadow-sm"
            >
              {t(tab.labelKey)} ({t(tab.sublabelKey)})
              <span className="px-1 py-0.2 rounded bg-on-primary/20 text-on-primary font-code-value text-[10px]">
                {t("gamut.active")}
              </span>
            </span>
          );
        }
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className="flex items-center gap-1.5 px-space-md py-1 rounded font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            {t(tab.labelKey)} ({t(tab.sublabelKey)})
          </Link>
        );
      })}
    </div>
  );
}
