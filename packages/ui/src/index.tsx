/**
 * CUS-IMPLEMENTATION-01 §76–§78：React 集成层。
 */
import { createContext, useContext, useMemo, useEffect, useRef, useState } from "react";
import type { Theme, ThemeMode, GeneratedTheme, OKLCH, V2Color, ColorScale as ColorScaleType } from "@cus/core";
import { exportCSS } from "@cus/export";
import { renderColor } from "@cus/color";

// ─── Context ─────────────────────────────────────────────────────────────────

export interface CusThemeContextValue {
  theme: Theme | null;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const CusThemeContext = createContext<CusThemeContextValue>({
  theme: null,
  mode: "light",
  setMode: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export interface CusThemeProviderProps {
  theme?: Theme;
  result?: GeneratedTheme;
  defaultMode?: ThemeMode;
  children: React.ReactNode;
  prefix?: string;
}

export function CusThemeProvider({
  theme,
  result,
  defaultMode = "light",
  children,
  prefix = "--cus-",
}: CusThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(defaultMode);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const cssVars = useMemo(() => {
    if (result && exportCSS) {
      try { return exportCSS(result, { modes: [mode] }); } catch { return ""; }
    }
    if (theme) return generateCSSFromSpecTheme(theme, prefix);
    return "";
  }, [result, theme, mode, prefix]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!styleRef.current) {
      styleRef.current = document.createElement("style");
      styleRef.current.setAttribute("data-cus-theme", "");
      document.head.appendChild(styleRef.current);
    }
    styleRef.current.textContent = cssVars;
    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, [cssVars]);

  const value = useMemo(() => ({ theme: theme ?? null, mode, setMode }), [theme, mode]);

  return (
    <CusThemeContext.Provider value={value}>
      <div data-theme={mode}>{children}</div>
    </CusThemeContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useCusTheme(): CusThemeContextValue {
  return useContext(CusThemeContext);
}

export function useSemanticColor(tokenPath: string, prefix = "--cus-"): string {
  return `var(${prefix}${tokenPath.replace(/\./g, "-")})`;
}

// ─── CSS Generation ──────────────────────────────────────────────────────────

function generateCSSFromSpecTheme(theme: Theme, prefix: string): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(theme.semantic)) {
    if (typeof value === "string") lines.push(`  ${prefix}${key.replace(/\./g, "-")}: ${value};`);
  }
  for (const [key, value] of Object.entries(theme.components)) {
    lines.push(`  ${prefix}${key.replace(/\./g, "-")}: ${value};`);
  }
  return `[data-theme="${theme.mode}"] {\n${lines.join("\n")}\n}`;
}

// ─── Button Component ────────────────────────────────────────────────────────

export interface CusButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function CusButton({ variant = "primary", size = "md", style, children, ...rest }: CusButtonProps) {
  const bg = useSemanticColor(
    variant === "primary" ? "action.primary"
      : variant === "danger" ? "color.functional.danger"
      : variant === "ghost" ? "color.surface.default"
      : "action.secondary",
  );
  const fg = useSemanticColor("action.foreground");
  const padding = size === "sm" ? "4px 12px" : size === "lg" ? "12px 24px" : "8px 16px";

  return (
    <button {...rest} style={{ backgroundColor: bg, color: fg, padding, border: "none", borderRadius: 6, cursor: "pointer", ...style }}>
      {children}
    </button>
  );
}

// ─── CUS-IMPLEMENTATION-02 §51：ColorPreview / ColorSwatch / ColorScale ─────

export interface ColorPreviewProps {
  color: OKLCH;
  label?: string;
  size?: number;
}

export function ColorPreview({ color, label, size = 48 }: ColorPreviewProps) {
  const bg = `oklch(${color.l} ${color.c} ${color.h ?? 0})`;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ width: size, height: size, backgroundColor: bg, borderRadius: 4, border: "1px solid #ccc" }} />
      {label && <span style={{ fontSize: 11, color: "#666" }}>{label}</span>}
    </div>
  );
}

export interface ColorSwatchProps {
  color: V2Color;
  step: number;
  className?: string;
}

export function ColorSwatch({ color, step, className }: ColorSwatchProps) {
  const css = renderColor(color);
  return (
    <div className={className} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{ width: 32, height: 32, backgroundColor: css, borderRadius: 4, border: "1px solid #00000006" }} />
      <span style={{ fontSize: 10, color: "#888" }}>{step}</span>
    </div>
  );
}

export interface ColorScaleProps {
  colors: ColorScaleType;
  label: string;
}

export function ColorScale({ colors, label }: ColorScaleProps) {
  const steps = (Object.keys(colors) as unknown as number[]).sort((a, b) => Number(a) - Number(b));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <div style={{ display: "flex", gap: 2 }}>
        {steps.map((step) => (
          <ColorSwatch key={String(step)} color={colors[step as keyof ColorScaleType]} step={Number(step)} />
        ))}
      </div>
    </div>
  );
}

// ─── CUS-IMPLEMENTATION-03 §5：Radix UI Wrapper Components ──────────────────

export { CusSlider } from "./components/slider";
export {
  CusSelect,
  CusSelectGroup,
  CusSelectValue,
  CusSelectTrigger,
  CusSelectContent,
  CusSelectItem,
} from "./components/select";
export {
  CusTabs,
  CusTabsList,
  CusTabsTrigger,
  CusTabsContent,
} from "./components/tabs";
export {
  CusDialog,
  CusDialogTrigger,
  CusDialogClose,
  CusDialogPortal,
  CusDialogOverlay,
  CusDialogContent,
  CusDialogHeader,
  CusDialogFooter,
  CusDialogTitle,
  CusDialogDescription,
} from "./components/dialog";
export {
  CusPopover,
  CusPopoverTrigger,
  CusPopoverAnchor,
  CusPopoverClose,
  CusPopoverContent,
} from "./components/popover";
export {
  CusTooltipProvider,
  CusTooltip,
  CusTooltipTrigger,
  CusTooltipContent,
} from "./components/tooltip";
export { CusToggle } from "./components/toggle";
export { CusSwitch } from "./components/switch";
export { CusScrollArea } from "./components/scroll-area";
export { CusCheckbox } from "./components/checkbox";
