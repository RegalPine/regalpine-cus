import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { CusThemeProvider, CusTooltipProvider } from "@cus/ui";
import App from "./App";
import "./styles/tailwind.css";
import "./styles/app.css";
import "./styles/preview.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CusThemeProvider defaultMode="light">
      <CusTooltipProvider>
        <BrowserRouter basename="/cus">
          <Routes>
            <Route path="/" element={<Navigate to="/studio/explorer" replace />} />
            <Route path="/studio" element={<Navigate to="/studio/explorer" replace />} />
            <Route path="/studio/explorer" element={<App />} />
          </Routes>
        </BrowserRouter>
      </CusTooltipProvider>
    </CusThemeProvider>
  </StrictMode>,
);
