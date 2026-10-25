import { Outlet } from "react-router";
import { AppHeader } from "./AppHeader";
import { StatusBar } from "./StatusBar";
import { useCVDStore } from "../stores";
import type { CVDType } from "../lib/cvd-sim";

/** CSS filter 函数近似模拟 CVD（不依赖 SVG DOM，100% 可靠） */
function cvdCSSFilter(type: CVDType): string | undefined {
  switch (type) {
    case "protanopia":    return "hue-rotate(-20deg) saturate(0.6) brightness(0.95)";
    case "deuteranopia":  return "hue-rotate(-10deg) saturate(0.5) brightness(0.95)";
    case "tritanopia":    return "hue-rotate(60deg) saturate(0.4) brightness(1.05)";
    case "achromatopsia": return "grayscale(1)";
    default:              return undefined;
  }
}

export function AppShell() {
  const cvdType = useCVDStore((s) => s.type);
  const filter = cvdCSSFilter(cvdType);

  return (
    <>
      <AppHeader />
      {/* CVD 滤镜仅作用于内容区，Header/StatusBar 在外层不受影响 */}
      <div
        className="min-h-screen bg-surface font-ui text-on-surface antialiased"
        style={filter ? { filter } : undefined}
      >
        <main className="pt-[56px] pb-10 min-h-screen px-4 sm:px-gutter md:px-gutter-desktop">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </>
  );
}
