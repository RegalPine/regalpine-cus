import {
  ACHROMATIC_BRAND_EPSILON,
  NEUTRAL_STEPS,
  SEMANTIC_HUES,
  SEMANTIC_ROLES,
  STEPS,
  ColorError,
  createCalculationContext,
  type BrandInput,
  type ThemeOptions,
  type ValidationOptions,
  type V2Color,
  type GeneratedTheme,
  type ThemeResult,
  type ThemeTokens,
  type ValidationCategory,
  type ValidationReport,
  type ValidationResult,
  type ValidationStatus,
} from "@cus/core";
import {
  contrastRatio,
  composite,
  hueDistance,
  rgbToXyz,
  xyzToLab,
  ACHROMATIC_EPSILON,
  deltaE2000,
  isInGamut,
  lchToRgb,
  lchToLab,
  parseHex,
} from "@cus/color";
import { COMPONENT_REFERENCES, createTheme, resolveToken } from "@cus/theme";

import { validateOklch } from "./okvalidation";
export { validateOklch } from "./okvalidation";
// V2.5：Color Quality & Cleanliness 验证。
export * from "./quality";

export function validate(
  input: ThemeResult,
  options: ValidationOptions = {},
): ValidationReport {
  if (input.designSpace === "oklch") return validateOklch(input, options);
  const collision = options.semanticCollisionThreshold ?? 10;
  const warning = options.semanticWarningThreshold ?? Math.max(20, collision);
  if (
    ![collision, warning].every((v) => Number.isFinite(v) && v >= 0) ||
    warning < collision
  )
    throw new ColorError(
      "INVALID_INPUT",
      "语义碰撞阈值必须为非负有限数，提示阈值不得低于失败阈值",
    );
  const results: ValidationResult[] = [];
  const add = (
    id: string,
    category: ValidationCategory,
    status: ValidationStatus,
    message: string,
    value?: number,
    threshold?: number,
    code?: ValidationResult["code"],
  ) =>
    results.push({
      id,
      category,
      status,
      message,
      ...(code
        ? { code }
        : status === "FAIL"
          ? { code: "VALIDATION_ERROR" as const }
          : {}),
      ...(value === undefined ? {} : { value }),
      ...(threshold === undefined ? {} : { threshold }),
    });
  const check = (
    id: string,
    category: ValidationCategory,
    ok: boolean,
    message: string,
    value?: number,
    threshold?: number,
  ) => add(id, category, ok ? "PASS" : "FAIL", message, value, threshold);
  try {
    if (!input.context)
      throw new ColorError("VALIDATION_ERROR", "缺少编译上下文");
    createCalculationContext(input.context);
  } catch {
    add("context", "Color", "FAIL", "计算上下文缺失或无效");
  }
  const colorCheck = (key: string, color: V2Color) => {
    try {
      if (!color.context)
        throw new ColorError("VALIDATION_ERROR", "缺少颜色上下文");
      createCalculationContext(color.context);
      const lchValid = [
        color.lch,
        color.target,
        color.mapped,
        color.calculation.lch,
      ].every(
        (v) =>
          Number.isFinite(v.l) &&
          Number.isFinite(v.c) &&
          v.c >= 0 &&
          (v.h === null
            ? v.c < ACHROMATIC_EPSILON
            : Number.isFinite(v.h) && v.h >= 0 && v.h < 360),
      );
      const finite = [
        ...Object.values(color.rgb),
        ...Object.values(color.lab),
        ...Object.values(color.calculation.rgb),
        ...Object.values(color.calculation.lab),
        color.calculation.alpha,
        color.alpha,
        color.chromaReduction,
      ].every(Number.isFinite);
      const parsed = parseHex(color.hex);
      const calculatedRgb = lchToRgb(color.mapped),
        calculatedLab = lchToLab(color.mapped);
      const calculationOk =
        color.context.targetSpace === "srgb" &&
        color.calculation.alpha >= 0 &&
        color.calculation.alpha <= 1 &&
        (["r", "g", "b"] as const).every(
          (k) => Math.abs(color.calculation.rgb[k] - calculatedRgb[k]) < 1e-12,
        ) &&
        (["l", "a", "b"] as const).every(
          (k) => Math.abs(color.calculation.lab[k] - calculatedLab[k]) < 1e-12,
        ) &&
        (["l", "c", "h"] as const).every(
          (k) => color.calculation.lch[k] === color.mapped[k],
        );
      check(
        `${key}.valid`,
        "Color",
        finite &&
          lchValid &&
          calculationOk &&
          color.strategy === "CHROMA_REDUCTION" &&
          color.lch.l >= 0 &&
          color.lch.l <= 100.00001 &&
          color.lch.c >= 0 &&
          color.alpha >= 0 &&
          color.alpha <= 1 &&
          color.alpha === (parsed.alpha ?? 1) &&
          color.target.l >= 0 &&
          color.target.l <= 100 &&
          color.target.c >= 0 &&
          color.mapped.c >= 0 &&
          color.chromaReduction >= 0 &&
          color.chromaReduction <= 1 &&
          (["r", "g", "b"] as const).every(
            (channel) =>
              Math.abs(
                (parsed[channel] as number) -
                  (color.rgb[channel] as number),
              ) < 1e-9,
          ),
        `${key} 数值与 HEX 有效`,
      );
      check(
        `${key}.gamut`,
        "Gamut",
        isInGamut(color.rgb, 0) && isInGamut(lchToRgb(color.mapped)),
        `${key} 位于 sRGB 色域`,
      );
      check(
        `${key}.chroma`,
        "Gamut",
        color.mapped.c <= color.target.c + 1e-6 &&
          Math.abs(color.mapped.l - color.target.l) < 1e-6 &&
          (color.mapped.h === color.target.h ||
            (color.mapped.h !== null &&
              color.target.h !== null &&
              Math.abs(color.mapped.h - color.target.h) < 1e-6)),
        `${key} 映射保持 L* / h°，仅降低 C*`,
      );
      if (color.chromaReduction > 0.5)
        add(
          `${key}.reduction`,
          "Gamut",
          "WARN",
          `${key} 色度降低 ${(color.chromaReduction * 100).toFixed(1)}%`,
          color.chromaReduction,
          0.5,
        );
    } catch {
      add(`${key}.invalid`, "Color", "FAIL", `${key} 包含无效颜色数据`);
    }
  };
  const checkScale = <S extends number>(
    name: string,
    scale: Record<S, V2Color>,
    steps: readonly S[],
    completeMessage: string,
  ) => {
    for (const step of steps)
      if (scale[step]) colorCheck(`${name}.${step}`, scale[step]);
    check(
      `${name}.complete`,
      "Palette",
      steps.every((step) => !!scale[step]),
      completeMessage,
    );
    check(
      `${name}.monotonic`,
      "Palette",
      steps
        .slice(1)
        .every((step, i) => scale[steps[i]]?.lch.l > scale[step]?.lch.l),
      `${name} 渲染明度严格递减`,
    );
    for (let i = 1; i < steps.length; i++) {
      const a = scale[steps[i - 1]],
        b = scale[steps[i]];
      if (a && b) {
        try {
          const d = deltaE2000(a.lab, b.lab);
          check(
            `${name}.${steps[i]}.distance`,
            "Palette",
            Number.isFinite(d) && d >= 2,
            `${name} 相邻色阶可区分`,
            d,
            2,
          );
        } catch {
          add(
            `${name}.${steps[i]}.distance`,
            "Palette",
            "FAIL",
            `${name} 色阶数据无效，无法计算色差`,
          );
        }
      }
    }
  };
  for (const name of ["primary", "secondary", "accent"] as const)
    checkScale(name, input.palette[name], STEPS, `${name} 包含完整 11 级色阶`);
  checkScale(
    "neutral",
    input.palette.neutral,
    NEUTRAL_STEPS,
    "neutral 包含完整 0–1000 十三级色阶",
  );
  check(
    "neutral.chroma",
    "Palette",
    Object.values(input.palette.neutral).every((c) => c.mapped.c <= 4),
    "Neutral C* 上限为 4",
  );
  for (const role of SEMANTIC_ROLES) {
    const scale = input.palette.feedback?.[role];
    if (!scale) {
      check(
        `feedback.${role}.complete`,
        "Palette",
        false,
        `feedback.${role} 缺少 50–950 色阶`,
      );
      continue;
    }
    checkScale(role, scale, STEPS, `feedback.${role} 包含完整 11 级色阶`);
    for (const part of ["base", "soft", "foreground", "border"] as const)
      colorCheck(
        `semantic.${role}.${part}`,
        input.palette.semantic[role]?.[part],
      );
  }
  if (input.brand.alpha < 1)
    add(
      "brand.alpha",
      "Color",
      "WARN",
      "品牌 Alpha 已保留；色板使用不透明色，透明色对比度需指定背景",
    );
  // V1.4 §5：Brand DNA 摘要与生成管线一致（数值层比对，分类标签由派生保证）。
  if (input.brandDNA) {
    const dna = input.brandDNA;
    const primaryHue = input.palette.primary[500]?.target.h ?? null;
    const hueOk =
      dna.hue === null
        ? primaryHue === null
        : (hueDistance(primaryHue, dna.hue) ?? Infinity) < 1e-6;
    check("dna.hue", "Palette", hueOk, "Brand DNA 色相与生成色板一致");
    check(
      "dna.values",
      "Palette",
      dna.chroma === input.brand.lch.c && dna.lightness === input.brand.lch.l,
      "Brand DNA 数值摘要与品牌档案一致",
    );
  }
  // V1.3 §41：Hue 语义稳定性（无彩色品牌为灰阶家族，跳过色相检查）。
  // 无彩色判定与生成端一致，用感知阈值而非回读色相是否为 null。
  if (
    input.brand.lch.c >= ACHROMATIC_BRAND_EPSILON &&
    input.brand.lch.h !== null
  ) {
    const brandHue = input.brand.lch.h;
    const hueCheck = (
      id: string,
      message: string,
      value: number | null,
      ok: boolean,
      threshold: number,
    ) =>
      add(
        id,
        "Hue",
        value !== null && ok ? "PASS" : "FAIL",
        message,
        value ?? 0,
        threshold,
      );
    const primaryDist = hueDistance(
      input.palette.primary[500]?.target.h ?? null,
      brandHue,
    );
    hueCheck(
      "hue.primary",
      "primary 色相与品牌一致",
      primaryDist,
      primaryDist !== null && primaryDist < 1e-6,
      1e-6,
    );
    const neutralDist = hueDistance(
      input.palette.neutral[500]?.target.h ?? null,
      brandHue,
    );
    hueCheck(
      "hue.neutral",
      "neutral 色相与品牌一致",
      neutralDist,
      neutralDist !== null && neutralDist < 1e-6,
      1e-6,
    );
    const secondaryDist = hueDistance(
      input.palette.secondary[500]?.target.h ?? null,
      brandHue,
    );
    hueCheck(
      "hue.secondary",
      "secondary 为品牌色相的受控偏移",
      secondaryDist,
      secondaryDist !== null && secondaryDist >= 10 && secondaryDist <= 90,
      10,
    );
    const accentDist = hueDistance(
      input.palette.accent[500]?.target.h ?? null,
      brandHue,
    );
    hueCheck(
      "hue.accent",
      "accent 与品牌保持明显色相距离",
      accentDist,
      accentDist !== null && accentDist >= 90,
      90,
    );
    for (const role of SEMANTIC_ROLES) {
      // 选定色相须落在语义家族声明区间内：取对任一候选的最短环绕距离。
      const scaleHue = input.palette.feedback?.[role]?.[500]?.target.h ?? null;
      const roleDist = Math.min(
        ...SEMANTIC_HUES[role]
          .map((cand) => hueDistance(scaleHue, cand))
          .filter((d): d is number => d !== null),
      );
      hueCheck(
        `hue.semantic.${role}`,
        `${role} 色相位于语义家族区间`,
        roleDist,
        Number.isFinite(roleDist) && roleDist <= 12,
        12,
      );
    }
  }
  for (const mode of ["light", "dark"] as const) {
    const tokens = input.theme[mode];
    if (!tokens) continue;
    for (const [key, color] of Object.entries(tokens.primitive))
      colorCheck(`${mode}.${key}`, color);
    for (const layer of ["semantic", "component"] as const) {
      for (const key of Object.keys(tokens[layer])) {
        try {
          resolveToken(tokens, key, layer);
        } catch {
          add(
            `${mode}.${layer}.${key}`,
            "Component",
            "FAIL",
            `${mode}.${key} 引用缺失、越层或循环`,
          );
        }
      }
    }
    const componentOk = Object.keys(COMPONENT_REFERENCES).every(
      (key) =>
        typeof tokens.component[key]?.ref === "string" &&
        Object.hasOwn(tokens.semantic, tokens.component[key].ref),
    );
    check(
      `${mode}.component`,
      "Component",
      componentOk,
      `${mode} 组件仅引用 Semantic Token`,
    );
    for (const [key, token] of Object.entries(tokens.semantic)) {
      const otherTheme = input.theme[mode === "light" ? "dark" : "light"];
      const other = otherTheme?.semantic[key];
      const metadataOk =
        token.theme === mode &&
        ["foreground", "background", "border", "overlay"].includes(
          token.role,
        ) &&
        [
          "default",
          "hover",
          "active",
          "disabled",
          "loading",
          "selected",
          "focus",
        ].includes(token.state) &&
        Array.isArray(token.relationships) &&
        token.relationships.length > 0 &&
        (!otherTheme ||
          (other?.role === token.role && other?.state === token.state));
      check(
        `${mode}.${key}.role`,
        "Semantic",
        metadataOk,
        `${mode}.${key} 角色、状态、主题与关系声明`,
      );
      if (!metadataOk) continue;
      for (const relation of token.relationships) {
        const id = `${mode}.${key}/${relation.token}`;
        try {
          if (
            !["text", "non-text", "decorative", "disabled"].includes(
              relation.usage,
            )
          )
            throw new ColorError("VALIDATION_ERROR", "缺少用途声明");
          if (
            relation.usage === "text" &&
            ![relation.textSize, relation.fontWeight].every(
              (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
            )
          )
            throw new ColorError(
              "VALIDATION_ERROR",
              "文字关系必须声明字号与字重",
            );
          const large =
            (relation.textSize ?? 0) >= 24 ||
            ((relation.textSize ?? 0) >= 18.6667 &&
              (relation.fontWeight ?? 0) >= 700);
          const baseline =
            relation.usage === "text"
              ? large
                ? 3
                : 4.5
              : relation.usage === "non-text"
                ? 3
                : 0;
          const threshold = Math.max(baseline, relation.minContrast ?? 0);
          if (
            ![
              relation.minContrast ?? 0,
              relation.minDeltaL ?? 0,
              relation.minDeltaE ?? 0,
            ].every((v) => Number.isFinite(v) && v >= 0)
          )
            throw new ColorError("VALIDATION_ERROR", "颜色关系阈值无效");
          const fg = resolveToken(tokens, key),
            bg = resolveToken(tokens, relation.token);
          const canvas = relation.canvas
            ? resolveToken(tokens, relation.canvas).hex
            : undefined;
          const contrast = contrastRatio(fg.hex, bg.hex, canvas);
          const background =
            bg.alpha < 1
              ? composite(parseHex(bg.hex), parseHex(canvas!))
              : bg.rgb;
          const foreground = composite(parseHex(fg.hex), background);
          const a = xyzToLab(rgbToXyz(foreground)),
            b = xyzToLab(rgbToXyz(background));
          const deltaL = Math.abs(a.l - b.l),
            deltaE = deltaE2000(a, b);
          const ok =
            contrast >= threshold &&
            deltaL >= (relation.minDeltaL ?? 0) &&
            deltaE >= (relation.minDeltaE ?? 0);
          check(
            id,
            "Contrast",
            ok,
            `${mode} ${key} / ${relation.token} 颜色约束（非完整可访问性结论）`,
            contrast,
            threshold,
          );
          results[results.length - 1].metrics = { contrast, deltaL, deltaE };
        } catch {
          add(id, "Contrast", "FAIL", `${mode}.${key} 关系、上下文或颜色无效`);
        }
      }
      if (token.transition) {
        try {
          const { from, minDeltaE } = token.transition;
          if (!Number.isFinite(minDeltaE) || minDeltaE < 0)
            throw new ColorError("VALIDATION_ERROR", "状态阈值无效");
          const d = deltaE2000(
            resolveToken(tokens, from).lab,
            resolveToken(tokens, key).lab,
          );
          check(
            `${mode}.${from}/${key}`,
            "Component",
            d >= minDeltaE,
            `${mode} 声明的状态转换 ΔE00`,
            d,
            minDeltaE,
          );
        } catch {
          add(
            `${mode}.${key}.transition`,
            "Component",
            "FAIL",
            "状态转换声明无效",
          );
        }
      }
    }
    try {
      const lightness = (key: string) => resolveToken(tokens, key).lch.l;
      check(
        `${mode}.surfaces`,
        "Theme",
        lightness("surface.raised") > lightness("surface.default") &&
          lightness("surface.default") > lightness("surface.sunken"),
        `${mode} 独立背景层级`,
      );
      validateSemantics(tokens, mode, add, collision, warning);
    } catch {
      add(`${mode}.theme`, "Theme", "FAIL", `${mode} 主题必需 Token 缺失`);
    }
  }
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  results.forEach((r) => counts[r.status]++);
  // V2.4 §35：色域合规摘要。
  const gamutResults = results.filter((r) => r.category === "Gamut");
  const srgbOk = !gamutResults
    .filter((r) => r.targetSpace === "srgb" || !r.targetSpace)
    .some((r) => r.status === "FAIL");
  // D1 修复：displayP3 独立计算，不再复用 srgbOk。
  const p3Ok = !gamutResults
    .filter((r) => r.targetSpace === "display-p3")
    .some((r) => r.status === "FAIL");
  return {
    status: counts.FAIL ? "FAIL" : counts.WARN ? "WARN" : "PASS",
    results,
    counts,
    gamut: { srgb: srgbOk, displayP3: p3Ok },
  };
}
function validateSemantics(
  tokens: ThemeTokens,
  mode: string,
  add: (
    id: string,
    category: ValidationCategory,
    status: ValidationStatus,
    message: string,
    value?: number,
    threshold?: number,
    code?: ValidationResult["code"],
  ) => void,
  collision: number,
  warning: number,
): void {
  for (let i = 0; i < SEMANTIC_ROLES.length; i++) {
    const a = SEMANTIC_ROLES[i];
    for (const b of SEMANTIC_ROLES.slice(i + 1)) {
      const d = deltaE2000(
        resolveToken(tokens, `feedback.${a}.base`).lab,
        resolveToken(tokens, `feedback.${b}.base`).lab,
      );
      add(
        `${mode}.${a}/${b}`,
        "Semantic",
        d < collision ? "FAIL" : d < warning ? "WARN" : "PASS",
        `${mode} ${a} / ${b} 语义区分`,
        d,
        d < collision ? collision : warning,
        // V2.5 §54：语义撞色归入码表词。
        d < warning ? "SEMANTIC_COLOR_COLLISION" : undefined,
      );
    }
    const d = deltaE2000(
      tokens.primitive["primary.brand"].lab,
      resolveToken(tokens, `feedback.${a}.base`).lab,
    );
    if (d < collision)
      add(
        `${mode}.brand/${a}`,
        "Semantic",
        "WARN",
        `品牌色与 ${a} 接近，请配合图标和文案区分`,
        d,
        collision,
        "SEMANTIC_COLOR_COLLISION",
      );
  }
}
export function generateValidatedTheme(
  source: BrandInput,
  options: ThemeOptions & ValidationOptions = {},
): GeneratedTheme {
  const result = createTheme(source, options);
  return { ...result, validation: validate(result, options) };
}
// V2.4 §35：validateTheme 别名。
export const validateTheme = validate;
