import {
  SEMANTIC_ROLES,
  OK_VALIDATION_DEFAULTS,
  parseThemeOptions,
  createCalculationContext,
  ColorError,
  type BrandInput,
  type SemanticToken,
  type ColorRelationship,
  type BrandProfile,
  type V2Color,
  type V2Palette,
  type V2Theme,
  type ThemeMode,
  type ThemeOptions,
  type ThemeResult,
  type ThemeTokens,
  type ComponentProfile,
  type V2SemanticProfile,
  type SemanticPalette,
  type ColorToken,
} from "@cus/core";
import {
  createBrandProfile,
  createOklchColor,
  transformOklchState,
  colorDesign,
  colorOutput,
  minimumContrast,
  outputPair,
} from "@cus/color";
import { generateOklchPalette, deriveOklchBrandDNA } from "@cus/palette";

export const COMPONENT_REFERENCES: Readonly<Record<string, string>> =
  Object.freeze({
    "button.primary.background": "action.primary",
    "button.primary.foreground": "action.foreground",
    // V1.5 §22：primary 按钮列举七项含 border（实心按钮边框与背景同色）。
    "button.primary.border": "action.primary",
    "button.primary.hover": "action.hover",
    "button.primary.active": "action.active",
    "button.primary.focus": "focus.ring",
    "button.primary.disabled": "action.disabled",
    "button.primary.disabledText": "text.disabled",
    "button.primary.selected": "selection.background",
    "button.primary.loading": "action.loading",
    "button.secondary.background": "action.secondary",
    "button.secondary.foreground": "action.secondary.foreground",
    "button.secondary.hover": "action.secondary.hover",
    "button.secondary.active": "action.secondary.active",
    "button.secondary.focus": "focus.ring",
    "button.secondary.disabled": "action.disabled",
    "button.secondary.disabledText": "text.disabled",
    "button.secondary.selected": "selection.background",
    "button.secondary.loading": "action.loading",
    "button.secondary.border": "border.default",
    // Reference Theme V1.0 §21：Ghost 按钮（前景可交互文本语义；静止透明）。
    "button.ghost.background": "ghost.background",
    "button.ghost.foreground": "text.link",
    "button.ghost.hoverBackground": "ghost.hoverBackground",
    "button.ghost.activeBackground": "ghost.activeBackground",
    "button.accent.background": "accent.solid",
    "button.accent.foreground": "accent.foreground",
    "input.background": "surface.raised",
    "input.foreground": "text.primary",
    "input.placeholder": "text.muted",
    "input.border": "border.strong",
    // V1.5 §23：Input 八项（border.focus 命名对齐；danger 引用语义 danger 家族）。
    "input.border.hover": "border.hover",
    "input.border.focus": "focus.border",
    "input.border.danger": "border.danger",
    "input.disabled": "action.disabled",
    // Reference Theme V1.0 §22：Input 十项含浅光环（与 border.focus 组合）。
    "input.focusRing": "focus.ringSoft",
    // V1.5 §24：Link 五状态（default 复用 text.link 语义）。
    "link.default": "text.link",
    "link.hover": "link.hover",
    "link.active": "link.active",
    "link.visited": "link.visited",
    "link.disabled": "link.disabled",
    "card.background": "surface.raised",
    "card.foreground": "text.primary",
    "card.border": "border.default",
    "table.background": "surface.raised",
    "table.header": "surface.sunken",
    "table.foreground": "text.secondary",
    "table.border": "border.default",
    // Reference Theme V1.0 §34：行 hover 保持品牌连续性。
    "table.hover": "table.hover",
    "navigation.background": "surface.raised",
    "navigation.foreground": "text.secondary",
    // Reference Theme V1.0 §35：Active 背景/前景改引 §35 指定阶（primary.50|950
    // 与 text.link=primary.700|300），不再复用 selection 语义。
    "navigation.hover": "navigation.hover",
    "navigation.selected": "navigation.active",
    "navigation.selectedText": "text.link",
    "dialog.background": "surface.raised",
    "dialog.foreground": "text.primary",
    "dialog.overlay": "overlay.scrim",
    // CUS-THEME-01 §34：六类组件 Token（select/checkbox/radio/switch/tabs/tag）。
    "select.background": "surface.raised",
    "select.foreground": "text.primary",
    "select.border": "border.strong",
    "select.border.focus": "focus.border",
    "select.disabled": "action.disabled",
    "checkbox.background": "surface.raised",
    "checkbox.border": "border.strong",
    "checkbox.border.checked": "action.primary",
    "checkbox.foreground": "action.foreground",
    "checkbox.disabled": "action.disabled",
    "radio.background": "surface.raised",
    "radio.border": "border.strong",
    "radio.border.checked": "action.primary",
    "radio.foreground": "action.foreground",
    "radio.disabled": "action.disabled",
    "switch.background": "surface.raised",
    "switch.border": "border.strong",
    "switch.foreground": "text.primary",
    "switch.disabled": "action.disabled",
    "tabs.background": "surface.raised",
    "tabs.foreground": "text.secondary",
    "tabs.active": "action.primary",
    "tabs.hover": "navigation.hover",
    "tabs.border": "border.default",
    "tag.background": "surface.brand",
    "tag.foreground": "text.primary",
    "tag.border": "border.default",
  });
const SURFACES = ["surface.default", "surface.raised", "surface.sunken"];
function semanticToken(
  key: string,
  ref: string,
  mode: ThemeMode,
): SemanticToken {
  const state: SemanticToken["state"] = key.includes("disabled")
    ? "disabled"
    : key === "action.hover" ||
        key === "action.secondary.hover" ||
        key === "link.hover" ||
        // Reference Theme V1.0 §34/§35/§21：行/导航项/幽灵按钮的悬停背景。
        key === "table.hover" ||
        key === "navigation.hover" ||
        key === "ghost.hoverBackground"
      ? "hover"
      : key === "action.active" ||
          key === "action.secondary.active" ||
          key === "link.active" ||
          key === "ghost.activeBackground"
        ? "active"
        : key === "action.loading"
          ? "loading"
          : key === "navigation.active" || key.startsWith("selection.")
            ? "selected"
            : key.startsWith("focus.")
              ? "focus"
              : "default";
  const role: SemanticToken["role"] =
    key === "overlay.scrim" || key === "surface.overlay"
      ? "overlay"
      : key.includes("border")
        ? "border"
        : key.startsWith("text.") ||
            key.startsWith("icon.") ||
            key.startsWith("link.") ||
            key.endsWith("foreground")
          ? "foreground"
          : "background";
  const relationship = (
    token: string,
    usage: ColorRelationship["usage"],
  ): ColorRelationship => ({
    token,
    usage,
    ...(usage === "text"
      ? { textSize: 14, fontWeight: 400, minContrast: 4.5 }
      : {}),
    ...(usage === "non-text" ? { minContrast: 3 } : {}),
    minDeltaL: 0,
    minDeltaE: 0,
  });
  let relationships = [
    relationship(
      "surface.default",
      state === "disabled" ? "disabled" : "decorative",
    ),
  ];
  if (
    [
      "text.primary",
      "text.secondary",
      "text.muted",
      "text.link",
      // V1.5 §24：Link 状态色同样受正文对比约束。
      "link.hover",
      "link.active",
      "link.visited",
    ].includes(key)
  )
    relationships = SURFACES.map((s) => relationship(s, "text"));
  else if (
    [
      "action.primary",
      "action.secondary",
      "accent.solid",
      "focus.ring",
      "focus.border",
      "icon.primary",
      "icon.secondary",
      "border.strong",
      "border.danger",
    ].includes(key)
  )
    relationships = SURFACES.map((s) => relationship(s, "non-text"));
  else if (key === "action.foreground")
    relationships = [
      "action.primary",
      "action.hover",
      "action.active",
      "action.loading",
    ].map((s) => relationship(s, "text"));
  else if (key === "action.secondary.foreground")
    relationships = [
      "action.secondary",
      "action.secondary.hover",
      "action.secondary.active",
    ].map((s) => relationship(s, "text"));
  else if (key === "accent.foreground")
    relationships = [relationship("accent.solid", "text")];
  else if (key === "text.inverse")
    relationships = ["action.primary", "surface.inverse"].map((s) =>
      relationship(s, "text"),
    );
  else if (key === "selection.foreground")
    relationships = [relationship("selection.background", "text")];
  else if (key.startsWith("feedback.") && key.endsWith(".foreground"))
    relationships = [relationship(key.replace(/foreground$/, "soft"), "text")];
  // V1.5 §25：alert 的 icon（语义主色）落在 alert 背景（soft）上，按 WCAG
  // 1.4.11 需 non-text ≥3；border 为装饰性强调，维持 decorative 不做硬约束。
  else if (/^feedback\.[a-z]+\.base$/.test(key))
    relationships = [relationship(key.replace(/\.base$/, ".soft"), "non-text")];
  // CUS-THEME-01 §25/§26：On-Color 键（feedback.{role}.on 对 feedback.{role}.base）。
  else if (/^feedback\.[a-z]+\.on$/.test(key))
    relationships = [relationship(key.replace(/\.on$/, ".base"), "text")];
  // CUS-THEME-01 §23：Disabled 配对对比（text.disabled × action.disabled）。
  else if (key === "text.disabled")
    relationships = [
      relationship("surface.default", "disabled"),
      relationship("action.disabled", "disabled"),
    ];
  else if (key === "action.disabled")
    relationships = [
      relationship("surface.default", "disabled"),
      relationship("text.disabled", "disabled"),
    ];
  else if (key === "surface.default")
    relationships = [relationship("surface.raised", "decorative")];
  const transitionFrom =
    key === "table.hover" ||
    key === "navigation.hover" ||
    key === "ghost.hoverBackground"
      ? // Reference Theme V1.0 §34/§35/§21：品牌连续性悬停底在灰阶品牌下与
        // 组件默认底同色（ΔE=0），不设强制可区分检查。
        null
      : state === "hover"
        ? key.startsWith("action.secondary")
          ? "action.secondary"
          : key === "link.hover"
            ? "text.link"
            : "action.primary"
        : state === "active"
          ? key.startsWith("action.secondary")
            ? "action.secondary.hover"
            : key === "link.active"
              ? "link.hover"
              : key === "ghost.activeBackground"
                ? "ghost.hoverBackground"
                : "action.hover"
          : null;
  return {
    ref,
    role,
    state,
    theme: mode,
    relationships,
    ...(transitionFrom
      ? {
          transition: {
            from: transitionFrom,
            minDeltaE: 0,
            minDeltaEOK: OK_VALIDATION_DEFAULTS.state,
          },
        }
      : {}),
  };
}
// V1.3 §28：Overlay 的期望亮度削减比例（desired luminance reduction）。
export const OVERLAY_REDUCTION = { light: 0.45, dark: 0.72 } as const;
// scrim 色取自品牌中性深色家族（Light）或纯黑（Dark），alpha 由目标亮度削减反解。
function overlayScrim(
  brand: BrandProfile,
  base: V2Color,
  mode: ThemeMode,
): V2Color {
  const design = { l: mode === "dark" ? 0 : 0.1, c: 0, h: null };
  const desired =
    colorOutput(base).rendered.xyz.y * (1 - OVERLAY_REDUCTION[mode]);
  let low = 0,
    high = 1;
  for (let i = 0; i < 24; i++) {
    const alpha = (low + high) / 2;
    const probe = createOklchColor(design, alpha);
    const y = outputPair(probe, base, "srgb").foreground.xyz.y;
    if (y > desired) low = alpha;
    else high = alpha;
  }
  return createOklchColor(design, high, {
    id: `${mode}.overlay.scrim`,
    source: JSON.stringify(brand.input),
    mode,
    family: "overlay",
    step: "scrim",
    parameters: { reduction: OVERLAY_REDUCTION[mode], alpha: high },
  });
}
// 前景墨色按实际背景对比度选择白或最深的品牌中性色。
function pickInk(background: V2Color, neutral: V2Palette["neutral"]): string {
  const white = minimumContrast(neutral[0], background);
  const black = minimumContrast(neutral[950], background);
  return white >= black ? "neutral.0" : "neutral.950";
}
// CUS-THEME-01 §30：border.strong 基于 surface.default 对比度动态解析。
// 遍历 neutral 阶，选择首个对 surface.default 满足 non-text ≥3 对比度的阶。
function pickBorderStrong(neutral: V2Palette["neutral"], dark: boolean): string {
  const surfaceDefault = neutral[dark ? 950 : 50];
  const candidates = dark ? [500, 600, 400, 700] : [500, 400, 600, 300];
  for (const step of candidates) {
    if (minimumContrast(neutral[step as keyof typeof neutral], surfaceDefault) >= 3)
      return `neutral.${step}`;
  }
  return "neutral.500";
}
function makeTheme(
  brand: BrandProfile,
  palette: V2Palette,
  mode: ThemeMode,
  options: ThemeOptions = {},
): ThemeTokens {
  const dark = mode === "dark";
  const high = options.contrast === "high";
  const primitive: Record<string, V2Color> = {};
  for (const scale of ["primary", "secondary", "accent"] as const)
    for (const [step, color] of Object.entries(palette[scale]))
      primitive[`${scale}.${step}`] = color;
  // V1.3 §16：Neutral 0..1000 全层级进入 primitive，供表面/墨色引用。
  for (const [step, color] of Object.entries(palette.neutral))
    primitive[`neutral.${step}`] = color;
  // V1.3 §20：Feedback Palette 50..950 进入 primitive（success.500 等）。
  for (const role of SEMANTIC_ROLES)
    for (const [step, color] of Object.entries(palette.feedback[role]))
      primitive[`${role}.${step}`] = color;
  // V1.4 §11/§12：原始品牌色保留在 primary 家族命名空间，与算法生成的
  // primary.500 分离；CSS 变量输出为 --cus-color-primary-brand。
  primitive["primary.brand"] = createOklchColor(brand.oklch, brand.alpha, {
    id: `${mode}.primary.brand`,
    source: JSON.stringify(brand.input),
    mode,
    family: "primary",
    step: "brand",
  });
  primitive["overlay.scrim"] = overlayScrim(
    brand,
    palette.neutral[dark ? 950 : 50],
    mode,
  );
  // Reference Theme V1.0 §21：Ghost 按钮的静止背景为完全透明。
  primitive["transparent"] = createOklchColor({ l: 0, c: 0, h: null }, 0, {
    id: `${mode}.transparent`,
    source: JSON.stringify(brand.input),
    mode,
    family: "transparent",
    step: "default",
  });
  const chooseStep = (scale: V2Palette["primary"], preferred: number) => {
    const ink = palette.neutral[dark ? 950 : 0];
    const steps = Object.keys(scale)
      .map(Number)
      .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
    return (steps.find((step) => {
      const base = scale[step as keyof typeof scale];
      return [0, 0.04, 0.08].every((delta) => {
        const state = delta
          ? transformOklchState(colorDesign(base), {
              deltaL: dark ? delta : -delta,
              chromaScale: delta === 0.04 ? 0.98 : 0.95,
            })
          : base;
        return (
          minimumContrast(ink, state) >= 4.5 &&
          [
            palette.neutral[dark ? 900 : 0],
            palette.neutral[dark ? 950 : 100],
          ].every((bg) => minimumContrast(state, bg) >= 3)
        );
      });
    }) ?? preferred) as keyof typeof scale;
  };
  const actionStep = chooseStep(
    palette.primary,
    dark ? (high ? 300 : 400) : high ? 800 : 500,
  );
  const secondaryStep = chooseStep(palette.secondary, dark ? 300 : 600);
  const accentStep = chooseStep(palette.accent, dark ? 300 : 600);
  const actionSource = palette.primary[actionStep];
  const secondarySource = palette.secondary[secondaryStep];
  const accentSource = palette.accent[accentStep];
  primitive["state.hover"] = transformOklchState(colorDesign(actionSource), {
    deltaL: dark ? 0.03 : -0.03,
    chromaScale: 0.99,
  });
  primitive["state.active"] = transformOklchState(colorDesign(actionSource), {
    deltaL: dark ? 0.05 : -0.05,
    chromaScale: 0.97,
  });
  primitive["state.secondary.hover"] = transformOklchState(
    colorDesign(secondarySource),
    {
      deltaL: dark ? 0.03 : -0.03,
      chromaScale: 0.99,
    },
  );
  primitive["state.secondary.active"] = transformOklchState(
    colorDesign(secondarySource),
    {
      deltaL: dark ? 0.05 : -0.05,
      chromaScale: 0.97,
    },
  );
  // V1.5 §24：Link 状态色基于 text.link 源阶派生（deltaL 朝远离背景方向，
  // 保证对比度只增不减）。
  const linkSource = palette.primary[dark ? 300 : 500];
  primitive["state.link.hover"] = transformOklchState(colorDesign(linkSource), {
    deltaL: dark ? 0.03 : -0.03,
    chromaScale: 0.99,
  });
  primitive["state.link.active"] = transformOklchState(
    colorDesign(linkSource),
    {
      deltaL: dark ? 0.05 : -0.05,
      chromaScale: 0.97,
    },
  );
  const feedback = palette.semantic;
  for (const role of SEMANTIC_ROLES) {
    for (const [part, color] of Object.entries(feedback[role]))
      primitive[`feedback.${role}.${part}`] = color;
  }
  const focusStep = dark ? (high ? 200 : 300) : high ? 700 : 600;
  const refs: Record<string, string> = {
    // CUS-THEME-01 §16/§28：标准键名（surface.default 与 background 同义）。
    "surface.default": dark ? "neutral.950" : "neutral.50",
    background: dark ? "neutral.950" : "neutral.50",
    // V2.4 §28：surface.canvas 与 surface.default 同源，作为页面背景基准。
    "surface.canvas": dark ? "neutral.950" : "neutral.50",
    "surface.raised": dark ? "neutral.900" : "neutral.0",
    // CUS-THEME-01 §16：surface.elevated 与 surface.raised 同义。
    "surface.elevated": dark ? "neutral.900" : "neutral.0",
    "surface.sunken": dark ? "neutral.1000" : "neutral.100",
    // V1.4 §18：标准六项 Surface（overlay 复用 V1.3 §28 的动态 scrim）。
    "surface.overlay": "overlay.scrim",
    "surface.brand": dark ? "primary.900" : "primary.100",
    "surface.inverse": dark ? "neutral.50" : "neutral.950",
    "text.primary": dark ? "neutral.50" : "neutral.950",
    "text.secondary": dark ? "neutral.300" : "neutral.600",
    // CUS-THEME-01 §31：text.muted（原 text.tertiary）。
    "text.muted": dark ? "neutral.400" : "neutral.600",
    "text.disabled": dark ? "neutral.500" : "neutral.400",
    "text.inverse": dark ? "neutral.950" : "neutral.0",
    "text.link": dark ? "primary.300" : "primary.500",
    // V1.5 §24：Link 状态语义键（visited 用同家族更深/更浅阶，确保可区分；
    // disabled 与 text.disabled 同源 primitive——语义层不可间接引用）。
    "link.hover": "state.link.hover",
    "link.active": "state.link.active",
    "link.visited": dark ? "primary.200" : "primary.800",
    "link.disabled": dark ? "neutral.500" : "neutral.400",
    "border.default": dark ? "neutral.700" : "neutral.300",
    // V1.4 §19：subtle/default/strong 按 ΔL 递增；danger 引用语义家族实色。
    "border.subtle": dark ? "neutral.800" : "neutral.200",
    // CUS-THEME-01 §30：border.strong 基于 surface.default 对比度动态解析。
    "border.strong": pickBorderStrong(palette.neutral, dark),
    "border.danger": dark ? "danger.400" : "danger.600",
    // V1.5 §23：交互边框 hover 强调（light 加深 / dark 提亮）。
    "border.hover": dark ? "neutral.500" : "neutral.400",
    "action.primary": `primary.${actionStep}`,
    "action.foreground": pickInk(actionSource, palette.neutral),
    "action.hover": "state.hover",
    "action.active": "state.active",
    "action.disabled": dark ? "neutral.800" : "neutral.100",
    "action.loading": `primary.${actionStep}`,
    "action.secondary": `secondary.${secondaryStep}`,
    "action.secondary.hover": "state.secondary.hover",
    "action.secondary.active": "state.secondary.active",
    "action.secondary.foreground": pickInk(secondarySource, palette.neutral),
    "accent.solid": `accent.${accentStep}`,
    "accent.foreground": pickInk(accentSource, palette.neutral),
    "icon.primary": dark ? "neutral.200" : "neutral.700",
    "icon.secondary": dark ? "neutral.400" : "neutral.600",
    "focus.ring": `primary.${focusStep}`,
    // V1.4 §21：Focus 三件套（ring 外圈 / border 边框 / background 底色）。
    "focus.border": dark ? "primary.400" : "primary.700",
    "focus.background": dark ? "primary.900" : "primary.100",
    // Reference Theme V1.0 §32/§22：浅光环（Input focusRing 专用；与
    // focus.border 组合承担可见性，自身不设 non-text 硬约束）。
    "focus.ringSoft": dark ? "primary.500" : "primary.200",
    // CUS-THEME-01 §32：Focus 语义键（default/invalid/success）。
    "focus.default": `primary.${focusStep}`,
    "focus.invalid": dark ? "danger.400" : "danger.600",
    "focus.success": dark ? "success.400" : "success.600",
    // CUS-THEME-01 §6/§33：Brand 语义命名空间。
    "brand.primary": `primary.${actionStep}`,
    "brand.primary.hover": "state.hover",
    "brand.primary.active": "state.active",
    "brand.primary.subtle": dark ? "primary.900" : "primary.100",
    "brand.primary.on": pickInk(actionSource, palette.neutral),
    "brand.primary.muted": dark ? "primary.900" : "primary.100",
    "brand.primary.strong": `primary.${actionStep}`,
    "brand.primary.contrast": pickInk(actionSource, palette.neutral),
    // Reference Theme V1.0 §34/§35：表格行与导航项的品牌连续性悬停底。
    "table.hover": dark ? "primary.950" : "primary.50",
    "navigation.hover": dark ? "primary.900" : "primary.50",
    "navigation.active": dark ? "primary.950" : "primary.50",
    // Reference Theme V1.0 §21：Ghost 按钮背景三态（悬停/按下用品牌浅底）。
    "ghost.background": "transparent",
    "ghost.hoverBackground": dark ? "primary.900" : "primary.50",
    "ghost.activeBackground": dark ? "primary.800" : "primary.100",
    "selection.background": dark ? "primary.900" : "primary.100",
    "selection.foreground": dark ? "primary.100" : "primary.900",
    "overlay.scrim": "overlay.scrim",
  };
  const components = { ...COMPONENT_REFERENCES };
  for (const role of SEMANTIC_ROLES) {
    // CUS-THEME-01 §24/§25/§26：feedback 家族含 base/soft/strong/foreground/border/on。
    for (const part of ["base", "soft", "foreground", "border"])
      refs[`feedback.${role}.${part}`] = `feedback.${role}.${part}`;
    // CUS-THEME-01 §24：strong 变体（更深阶，引用 primitive ${role}.700）。
    refs[`feedback.${role}.strong`] = `${role}.700`;
    // CUS-THEME-01 §25/§26：On-Color 键（引用 pickInk 计算结果）。
    refs[`feedback.${role}.on`] = pickInk(feedback[role].base, palette.neutral);
    for (const kind of ["badge", "alert"]) {
      components[`${kind}.${role}.background`] = `feedback.${role}.soft`;
      components[`${kind}.${role}.foreground`] = `feedback.${role}.foreground`;
      components[`${kind}.${role}.border`] = `feedback.${role}.border`;
    }
    // V1.5 §25：alert 四子项含 icon（用语义主色，non-text 对 soft 背景）。
    components[`alert.${role}.icon`] = `feedback.${role}.base`;
  }
  for (const [key, color] of Object.entries(primitive)) {
    if (key.startsWith("state.") && color.provenance) {
      color.provenance = {
        ...color.provenance,
        id: `${mode}.${key}`,
        source: JSON.stringify(brand.input),
        mode,
        family: key.includes("secondary")
          ? "secondary"
          : key.includes("link")
            ? "link"
            : "primary",
        step: key.endsWith("active") ? "active" : "hover",
        parent: key.includes("secondary")
          ? secondarySource.provenance?.id
          : key.includes("link")
            ? linkSource.provenance?.id
            : actionSource.provenance?.id,
        parameters: {
          ...colorDesign(color),
          deltaL: (dark ? 1 : -1) * (key.endsWith("active") ? 0.08 : 0.04),
          chromaScale: key.endsWith("active") ? 0.95 : 0.98,
        },
      };
    }
  }
  return {
    mode,
    primitive,
    semantic: Object.fromEntries(
      Object.entries(refs).map(([k, ref]) => [k, semanticToken(k, ref, mode)]),
    ),
    component: Object.fromEntries(
      Object.entries(components).map(([k, ref]) => [k, { ref }]),
    ),
  };
}
export const generateLightTheme = (
  brand: BrandProfile,
  palette: V2Palette,
  options: ThemeOptions = {},
): ThemeTokens =>
  makeTheme(
    brand,
    palette.primary[500].design
      ? palette
      : generateOklchPalette(brand, "light", options),
    "light",
    options,
  );
export const generateDarkTheme = (
  brand: BrandProfile,
  _palette: V2Palette,
  options: ThemeOptions = {},
): ThemeTokens =>
  makeTheme(
    brand,
    generateOklchPalette(brand, "dark", options),
    "dark",
    options,
  );
export function generateTheme(
  brand: BrandProfile,
  palette: V2Palette,
  options: ThemeOptions = {},
): V2Theme {
  options = parseThemeOptions(options);
  return {
    light:
      options.lightMode === false
        ? null
        : generateLightTheme(brand, palette, options),
    dark:
      options.darkMode === false
        ? null
        : generateDarkTheme(brand, palette, options),
  };
}
export function createTheme(
  source: BrandInput,
  options: ThemeOptions = {},
): ThemeResult {
  options = parseThemeOptions(options);
  const brand = createBrandProfile(source);
  const palette = generateOklchPalette(brand, "light", options);
  const dark =
    options.darkMode === false
      ? null
      : generateOklchPalette(brand, "dark", options);
  return {
    designSpace: "oklch",
    palettes: { light: options.lightMode === false ? null : palette, dark },
    context: createCalculationContext({ sourceSpace: "oklch" }),
    brand,
    brandDNA: deriveOklchBrandDNA(brand.oklch),
    palette,
    theme: {
      light:
        options.lightMode === false
          ? null
          : makeTheme(brand, palette, "light", options),
      dark: dark ? makeTheme(brand, dark, "dark", options) : null,
    },
    ...(Object.keys(options).length ? { options } : {}),
  };
}
export function resolveToken(
  tokens: ThemeTokens,
  key: string,
  layer: "semantic" | "component" = "semantic",
): V2Color {
  const semanticKey = layer === "component" ? tokens.component[key]?.ref : key;
  const primitiveKey = semanticKey && tokens.semantic[semanticKey]?.ref;
  if (!primitiveKey || !Object.hasOwn(tokens.primitive, primitiveKey))
    throw new ColorError(
      "VALIDATION_ERROR",
      `无效的 ${layer} Token 引用：${key}`,
    );
  return tokens.primitive[primitiveKey];
}
export function resolvedTokens(
  tokens: ThemeTokens,
  layer: "semantic" | "component" = "semantic",
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(tokens[layer]).map((key) => [
      key,
      resolveToken(tokens, key, layer).hex,
    ]),
  );
}
// V2.4 §24：独立语义 Token 生成 API。
export function generateSemanticTokens(
  brand: BrandProfile,
  palette: V2Palette,
  mode: ThemeMode = "light",
  options: ThemeOptions = {},
): Record<string, SemanticToken> {
  const tokens = makeTheme(brand, palette, mode, options);
  return tokens.semantic;
}
// CUS-THEME-01 §52：Semantic Mapping API。
export function map(
  palette: V2Palette,
  _profile: V2SemanticProfile,
): SemanticPalette {
  return palette.semantic;
}
// CUS-THEME-01 §53：Component Token API。
export function resolveComponents(
  _semanticTheme: ThemeTokens,
  profile: ComponentProfile = {},
): Record<string, ColorToken> {
  const refs = profile.components
    ? Object.fromEntries(
        Object.entries(COMPONENT_REFERENCES).filter(([key]) =>
          profile.components!.some((prefix) => key.startsWith(prefix)),
        ),
      )
    : { ...COMPONENT_REFERENCES };
  return Object.fromEntries(
    Object.entries(refs).map(([key, ref]) => [key, { ref }]),
  );
}
