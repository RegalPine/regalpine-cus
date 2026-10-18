import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router";
import { CusThemeProvider, CusTooltipProvider } from "@cus/ui";
import { AppShell } from "./shell/AppShell";
import ThemeStudioView from "./views/theme-studio/ThemeStudioView";
import GamutVolumeView from "./views/gamut-volume/GamutVolumeView";
import HueWheelView from "./views/gamut-hue-wheel/HueWheelView";
import LCCutView from "./views/gamut-lc-cut/LCCutView";
import ContrastMatrixView from "./views/contrast-matrix/ContrastMatrixView";
import TestbedView from "./views/component-testbed/TestbedView";
import SemanticSurfaceView from "./views/semantic-surface/SemanticSurfaceView";
import ExportCenterView from "./views/export-center/ExportCenterView";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/tailwind.css";
import "./styles/app.css";
import "./styles/preview.css";

const router = createBrowserRouter(
  [
    { path: "/", element: <Navigate to="/studio/scale" replace /> },
    { path: "/studio", element: <Navigate to="/studio/scale" replace /> },
    {
      element: <AppShell />,
      children: [
        { path: "/studio/explorer", element: <Navigate to="/studio/scale" replace /> },
        { path: "/studio/scale", element: <ThemeStudioView /> },
        { path: "/studio/gamut", element: <GamutVolumeView /> },
        { path: "/studio/gamut/hue-wheel", element: <HueWheelView /> },
        { path: "/studio/gamut/lc-cut", element: <LCCutView /> },
        { path: "/studio/contrast", element: <ContrastMatrixView /> },
        { path: "/studio/testbed", element: <TestbedView /> },
        { path: "/studio/semantic", element: <SemanticSurfaceView /> },
        { path: "/studio/export", element: <ExportCenterView /> },
      ],
    },
  ],
  { basename: "/cus" },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CusThemeProvider defaultMode="dark">
      <CusTooltipProvider>
        <RouterProvider router={router} />
      </CusTooltipProvider>
    </CusThemeProvider>
  </StrictMode>,
);
