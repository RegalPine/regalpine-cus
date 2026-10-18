import { Outlet } from "react-router";
import { AppHeader } from "./AppHeader";
import { StatusBar } from "./StatusBar";
import { useCVDStore } from "../stores";
import { cvdFeColorMatrix } from "../lib/cvd-sim";

export function AppShell() {
  const cvdType = useCVDStore((s) => s.type);
  const cvdSeverity = useCVDStore((s) => s.severity);
  const isActive = cvdType !== "normal";
  const matrixValues = cvdFeColorMatrix(cvdType, cvdSeverity);

  return (
    <div
      className="min-h-screen bg-surface font-ui text-on-surface antialiased"
      style={isActive ? { filter: "url(#cvd-filter)" } : undefined}
    >
      {/* 内联 SVG 滤镜定义 — 浏览器在 linear RGB 空间自动执行 sRGB↔linear 转换 */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <filter id="cvd-filter" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={matrixValues} />
          </filter>
        </defs>
      </svg>
      <AppHeader />
      <main className="pt-[56px] pb-10 min-h-screen px-4 sm:px-gutter md:px-gutter-desktop">
        <Outlet />
      </main>
      <StatusBar />
    </div>
  );
}
