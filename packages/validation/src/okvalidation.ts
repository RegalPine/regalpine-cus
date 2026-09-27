import {
  ColorError,
  STEPS,
  NEUTRAL_STEPS,
  SEMANTIC_ROLES,
  OK_VALIDATION_DEFAULTS,
  OK_BRAND_EPSILON,
  type ThemeResult,
  type ValidationOptions,
  type ValidationReport,
  type ValidationResult,
  type ValidationCategory,
  type ValidationStatus,
  type V2Color,
  type RGBSpace,
} from "@cus/core";
import {
  asUIColor,
  colorOutput,
  colorDesign,
  createOklchColor,
  deltaEOK,
  deltaE2000,
  hueDistance,
  isInGamut,
  outputPair,
  normalizeOklch,
  transformOklchState,
} from "@cus/color";
import { resolveToken, COMPONENT_REFERENCES } from "@cus/theme";
import { NEUTRAL_BUDGET_CAP, OK_SEMANTIC_HUES } from "@cus/palette";
// V2.5：Palette 级 Quality 检查（Hue Stability / Discontinuity / Brand Anchor）。
import {
  brandAnchorQuality,
  paletteDiscontinuity,
  paletteHueStability,
} from "./quality";
import type { SemanticRole } from "@cus/core";

function assertFiniteTree(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw new ColorError("NUMERICAL_ERROR", "颜色坐标包含非有限数");
  if (value && typeof value === "object")
    Object.values(value).forEach(assertFiniteTree);
}

function sameCoordinates(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof b === "number")
    return (
      typeof a === "number" && Number.isFinite(a) && Math.abs(a - b) < 1e-9
    );
  if (b && typeof b === "object")
    return (
      !!a &&
      typeof a === "object" &&
      Object.entries(b).every(([k, v]) =>
        sameCoordinates((a as Record<string, unknown>)[k], v),
      )
    );
  return a === b;
}
export function validateOklch(
  input: ThemeResult,
  options: ValidationOptions = {},
): ValidationReport {
  const results: ValidationResult[] = [];
  const add = (
    id: string,
    category: ValidationCategory,
    status: ValidationStatus,
    message: string,
    value?: number,
    threshold?: number,
    space?: RGBSpace,
    colors: V2Color[] = [],
  ) => {
    const r: ValidationResult = {
      id,
      category,
      status,
      message,
      ...(value !== undefined ? { value } : {}),
      ...(threshold !== undefined ? { threshold } : {}),
      ...(space ? { targetSpace: space } : {}),
      colorIds: colors.flatMap((c) => (c?.provenance ? [c.provenance.id] : [])),
    };
    if (status === "FAIL")
      r.code =
        category === "Gamut"
          ? "OUT_OF_GAMUT"
          : threshold !== undefined
            ? "METRIC_THRESHOLD_NOT_MET"
            : "VALIDATION_ERROR";
    results.push(r);
    return r;
  };
  const check = (
    id: string,
    category: ValidationCategory,
    ok: boolean,
    message: string,
    value?: number,
    threshold?: number,
    space?: RGBSpace,
    colors: V2Color[] = [],
  ) =>
    add(
      id,
      category,
      ok ? "PASS" : "FAIL",
      message,
      value,
      threshold,
      space,
      colors,
    );
  const invalid = (
    id: string,
    category: ValidationCategory,
    error: unknown,
    space?: RGBSpace,
    colors: V2Color[] = [],
  ) => {
    const r = add(
      id,
      category,
      "FAIL",
      `${id}: ${String(error)}`,
      undefined,
      undefined,
      space,
      colors,
    );
    r.code = error instanceof ColorError ? error.code : "INVALID_INPUT";
    return r;
  };
  const adjacent = options.adjacentOKMin ?? OK_VALIDATION_DEFAULTS.adjacent,
    state = options.stateOKMin ?? OK_VALIDATION_DEFAULTS.state;
  if (![adjacent, state].every((v) => Number.isFinite(v) && v >= 0))
    throw new ColorError("INVALID_INPUT", "ΔEOK 阈值无效");
  const fail = options.semanticOKFail ?? OK_VALIDATION_DEFAULTS.semanticFail,
    warn = options.semanticOKWarn ?? OK_VALIDATION_DEFAULTS.semanticWarn;
  const hueFail = options.semanticHueFail ?? OK_VALIDATION_DEFAULTS.hueFail,
    hueWarn = options.semanticHueWarn ?? OK_VALIDATION_DEFAULTS.hueWarn;
  if (
    ![fail, warn, hueFail, hueWarn].every(
      (v) => Number.isFinite(v) && v >= 0,
    ) ||
    warn < fail ||
    hueWarn < hueFail ||
    hueWarn > 180
  )
    throw new ColorError("INVALID_INPUT", "V2 验证阈值无效");
  const legacyFail = options.semanticCollisionThreshold ?? 0,
    legacyWarn = options.semanticWarningThreshold ?? legacyFail;
  if (
    ![legacyFail, legacyWarn].every((v) => Number.isFinite(v) && v >= 0) ||
    legacyWarn < legacyFail
  )
    throw new ColorError("INVALID_INPUT", "ΔE00 阈值无效");
  check(
    "context",
    "Color",
    input.designSpace === "oklch" &&
      input.context?.sourceSpace === "oklch" &&
      input.context?.whitePoint === "D65" &&
      input.context?.observer === "CIE1931_2",
    "OKLCH 设计空间 / D65 / CIE 1931 2°",
  );
  check(
    "dna.values",
    "Color",
    input.brandDNA?.model === "oklch" &&
      input.brandDNA.lightness === input.brand.oklch.l &&
      input.brandDNA.chroma === input.brand.oklch.c,
    "Brand DNA 使用 OKLCH",
  );
  for (const mode of ["light", "dark"] as const) {
    const tokens = input.theme[mode];
    check(
      `${mode}.enabled`,
      "Theme",
      !!tokens ===
        (mode === "light"
          ? input.options?.lightMode !== false
          : input.options?.darkMode !== false),
      `${mode} 主题开关与生成结果一致`,
    );
    if (!tokens) continue;
    if (!tokens.primitive || !tokens.semantic || !tokens.component) {
      const r = add(
        `${mode}.structure`,
        "Theme",
        "FAIL",
        "缺少 Primitive / Semantic / Component 容器",
      );
      r.code = "MISSING_REFERENCE";
      continue;
    }
    const palette = input.palettes?.[mode];
    check(`${mode}.palette`, "Palette", !!palette, `${mode} 独立色板存在`);
    for (const role of SEMANTIC_ROLES)
      for (const part of ["base", "soft", "foreground", "border"] as const)
        check(
          `${mode}.palette.${role}.${part}`,
          "Palette",
          !!palette?.semantic?.[role]?.[part] &&
            sameCoordinates(
              palette.semantic[role][part],
              tokens.primitive[`feedback.${role}.${part}`],
            ),
          "语义色板与 Primitive 一致",
        );
    const scales = palette
      ? {
          primary: palette.primary,
          secondary: palette.secondary,
          accent: palette.accent,
          neutral: palette.neutral,
          ...Object.fromEntries(
            SEMANTIC_ROLES.map((role) => [role, palette.feedback?.[role]]),
          ),
        }
      : {};
    for (const [family, scale] of Object.entries(scales)) {
      const steps = family === "neutral" ? NEUTRAL_STEPS : STEPS;
      check(
        `${mode}.${family}.complete`,
        "Palette",
        !!scale &&
          steps.every((step) => !!(scale as Record<number, V2Color>)[step]),
        `${mode}.${family} 色阶完整`,
      );
      if (!scale) continue;
      for (const [step, c] of Object.entries(scale))
        check(
          `${mode}.${family}.${step}.source`,
          "Palette",
          sameCoordinates(c, tokens.primitive[`${family}.${step}`]),
          "色板与 Primitive 数据一致",
        );
      const brandHue =
        input.brand.oklch.c < OK_BRAND_EPSILON ? null : input.brand.oklch.h;
      if (["primary", "secondary", "accent", "neutral"].includes(family)) {
        const distances = Object.values(scale).map((c) =>
          Number.isFinite(c?.design?.h) && Number.isFinite(brandHue)
            ? hueDistance(c.design!.h, brandHue)
            : null,
        );
        const ok = Object.values(scale).every((c, i) =>
          c?.design?.h === null
            ? c.design.c === 0
            : brandHue !== null &&
              distances[i] !== null &&
              (family === "primary" || family === "neutral"
                ? distances[i]! < 1e-7
                : family === "secondary"
                  ? distances[i]! >= 15 && distances[i]! <= 60
                  : distances[i]! >= 90),
        );
        check(
          `${mode}.hue.${family}`,
          "Hue",
          ok,
          `${family} OKLCH 色相与品牌约束`,
        );
      }
      // V2.2 §28/§30：收集距离与色度差用于 Smoothness 与 Chroma Stability。
      const distBySpace: Record<string, number[]> = { srgb: [], "display-p3": [] };
      for (const space of ["srgb", "display-p3"] as const)
        for (let i = 1; i < steps.length; i++) {
          const a = (scale as Record<number, V2Color>)[steps[i - 1]],
            b = (scale as Record<number, V2Color>)[steps[i]];
          try {
            const x = colorOutput(a, space).rendered.oklab,
              y = colorOutput(b, space).rendered.oklab,
              d = deltaEOK(x, y);
            distBySpace[space].push(d);
            check(
              `${mode}.${family}.${steps[i]}.${space}.order`,
              "Palette",
              colorDesign(a).l > colorDesign(b).l && x.l > y.l,
              `${mode}.${family} 明度单调`,
              x.l - y.l,
              0,
              space,
              [a, b],
            );
            check(
              `${mode}.${family}.${steps[i]}.${space}.distance`,
              "Palette",
              d >= adjacent,
              `${mode}.${family} 相邻 ΔEOK`,
              d,
              adjacent,
              space,
              [a, b],
            );
          } catch (error) {
            invalid(
              `${mode}.${family}.${steps[i]}.${space}`,
              "Palette",
              error,
              space,
              [a, b],
            );
          }
        }
      // V2.2 §28：Palette Smoothness = variance(相邻 ΔEOK)。
      for (const space of ["srgb", "display-p3"] as const) {
        const distances = distBySpace[space];
        if (distances.length >= 2) {
          const mean = distances.reduce((s, v) => s + v, 0) / distances.length;
          const variance =
            distances.reduce((s, v) => s + (v - mean) ** 2, 0) /
            distances.length;
          const r = add(
            `${mode}.${family}.${space}.smoothness`,
            "Palette",
            "PASS",
            `${mode}.${family} ${space} Smoothness (variance)`,
            +variance.toFixed(6),
            undefined,
            space,
          );
          r.metrics = { contrast: 0, deltaL: 0, deltaE: 0, deltaEOK: variance };
        }
      }
      // V2.2 §30：Chroma Stability —— 设计色度的无算法依据剧烈震荡检测。
      const dChromas = steps.map(
        (step) => colorDesign((scale as Record<number, V2Color>)[step]).c,
      );
      const deltaCs: number[] = [];
      for (let i = 1; i < dChromas.length; i++)
        deltaCs.push(dChromas[i] - dChromas[i - 1]);
      if (deltaCs.length >= 2) {
        let signChanges = 0;
        for (let i = 1; i < deltaCs.length; i++)
          if (deltaCs[i] * deltaCs[i - 1] < 0) signChanges++;
        if (signChanges > 2)
          add(
            `${mode}.${family}.chromaStability`,
            "Palette",
            "WARN",
            `${mode}.${family} 色度震荡 ${signChanges} 次变号`,
            signChanges,
            2,
          );
      }
      // V2.5 §17–§19：Hue Stability（三态）—— primary/neutral 对品牌色相，
      // 语义家族对角色中心色相；secondary/accent 的受控偏移不在此列。
      if (
        family === "primary" ||
        family === "neutral" ||
        (SEMANTIC_ROLES as readonly string[]).includes(family)
      ) {
        const refHue: number | readonly number[] | null =
          family === "primary" || family === "neutral"
            ? brandHue
            : OK_SEMANTIC_HUES[family as SemanticRole];
        const stability = paletteHueStability(
          steps.map(
            (s) => (scale as Record<number, V2Color>)[s]?.design?.h ?? null,
          ),
          refHue,
        );
        const r = add(
          `${mode}.${family}.hueStability`,
          "Quality",
          stability.status === "pass"
            ? "PASS"
            : stability.status === "warning"
              ? "WARN"
              : "FAIL",
          `${mode}.${family} Hue Stability (max drift ${stability.deviation.toFixed(2)}°)`,
          stability.deviation,
          4,
        );
        if (stability.status !== "pass") r.code = "HUE_DRIFT";
      }
      // V2.5 §44–§45：Palette Discontinuity —— ΔPi >> median(ΔP) 并归因。
      for (const space of ["srgb", "display-p3"] as const) {
        const breaks = paletteDiscontinuity(
          steps.map((s) => colorDesign((scale as Record<number, V2Color>)[s])),
          distBySpace[space],
          steps.map(
            (s) => !!palette?.overrides?.[`${family}.${s}`],
          ),
        );
        for (const b of breaks) {
          const r = add(
            `${mode}.${family}.${space}.discontinuity.${b.index}`,
            "Quality",
            "WARN",
            `${mode}.${family} ${space} 第 ${b.index} 段 ΔEOK ${b.delta.toFixed(3)} 异常跳变（中位数 ${b.median.toFixed(3)}，原因：${b.cause}）`,
            b.delta,
            b.threshold,
            space,
          );
          r.code = "PALETTE_DISCONTINUITY";
        }
      }
      // V2.5 §46–§47：Brand Anchor Quality（对 primary 家族评估）。
      // 锚点用 primary.brand primitive 的 sRGB 渲染坐标（与色阶同空间，
      // 避免 out-of-gamut 品牌色导致虚假断裂）。
      if (family === "primary" && distBySpace.srgb.length) {
        const anchorMean =
          distBySpace.srgb.reduce((s, v) => s + v, 0) /
          distBySpace.srgb.length;
        const brandAnchorOklab = colorOutput(
          tokens.primitive["primary.brand"],
          "srgb",
        ).rendered.oklab;
        const anchor = brandAnchorQuality(
          brandAnchorOklab,
          steps.map(
            (s) =>
              colorOutput((scale as Record<number, V2Color>)[s], "srgb")
                .rendered.oklab,
          ),
          anchorMean,
        );
        const r = add(
          `${mode}.brandAnchor`,
          "Quality",
          anchor.status === "pass"
            ? "PASS"
            : anchor.status === "warning"
              ? "WARN"
              : "FAIL",
          `${mode} Brand Anchor ΔEOK ${anchor.anchorDistance.toFixed(4)}（相邻步距均值 ${anchorMean.toFixed(4)}）`,
          anchor.anchorDistance,
        );
        if (anchor.status !== "pass") r.code = anchor.code;
      }
    }
    // V2.5 §33–§34：Neutral Contamination —— 中性家族色度预算。
    if (palette) {
      const contaminated = NEUTRAL_STEPS.filter(
        (s) =>
          palette.neutral[s] &&
          colorDesign(palette.neutral[s]).c > NEUTRAL_BUDGET_CAP + 1e-9,
      );
      const r = check(
        `${mode}.neutral.contamination`,
        "Quality",
        contaminated.length === 0,
        `${mode} neutral 色度预算（≤ ${NEUTRAL_BUDGET_CAP}）`,
        contaminated.length,
        0,
      );
      if (contaminated.length) r.code = "NEUTRAL_CONTAMINATION";
    }
    for (const [key, color] of Object.entries(tokens.primitive)) {
      const id = `${mode}.${key}`;
      try {
        const c = asUIColor(color);
        assertFiniteTree(c);
        normalizeOklch(c.design);
        check(
          `${id}.source`,
          "Color",
          c.provenance.id === id &&
            c.provenance.source === JSON.stringify(input.brand.input) &&
            c.provenance.model === "oklch" &&
            c.provenance.mode === mode &&
            !!c.provenance.family &&
            c.provenance.step !== undefined &&
            Object.values(c.provenance.parameters).every(
              (v) => typeof v !== "number" || Number.isFinite(v),
            ),
          `${id} 设计来源与参数`,
          undefined,
          undefined,
          undefined,
          [c],
        );
        if (key.startsWith("state.")) {
          const parent = Object.values(tokens.primitive).find(
            (v) => v.provenance?.id === c.provenance.parent,
          );
          const p = c.provenance.parameters;
          const derived =
            parent &&
            transformOklchState(
              colorDesign(parent),
              { deltaL: Number(p.deltaL), chromaScale: Number(p.chromaScale) },
              colorOutput(parent, "display-p3").calculation.alpha,
            );
          check(
            `${id}.parent`,
            "Color",
            !!derived && sameCoordinates(c.design, derived.design),
            "状态从原始设计父节点派生",
            undefined,
            undefined,
            undefined,
            parent ? [parent, c] : [c],
          );
        }
        const expected = createOklchColor(
          c.design,
          c.outputs.displayP3.calculation.alpha,
        );
        for (const space of ["srgb", "display-p3"] as const) {
          const out = colorOutput(c, space),
            reference = colorOutput(expected, space);
          check(
            `${id}.${space}.gamut`,
            "Gamut",
            out.space === space &&
              isInGamut(out.rendered.rgb) &&
              isInGamut(out.calculation.rgb),
            `${id} ${space} 渲染色域`,
            undefined,
            undefined,
            space,
            [c],
          );
          check(
            `${id}.${space}.mapping`,
            "Color",
            sameCoordinates(out, reference),
            `${id} ${space} 设计→映射→序列化一致`,
            undefined,
            undefined,
            space,
            [c],
          );
          if (out.chromaReduction > 1e-6)
            add(
              `${id}.${space}.reduction`,
              "Gamut",
              "WARN",
              `${id} ${space} 色度压缩 ${(out.chromaReduction * 100).toFixed(2)}%`,
              out.chromaReduction,
              0,
              space,
              [c],
            );
        }
        check(
          `${id}.gamut`,
          "Gamut",
          isInGamut(c.rgb),
          `${id} sRGB 兼容坐标有效`,
        );
        check(
          `${id}.fallback`,
          "Color",
          [
            "hex",
            "alpha",
            "rgb",
            "lab",
            "lch",
            "target",
            "mapped",
            "chromaReduction",
          ].every((k) =>
            sameCoordinates(
              c[k as keyof typeof c],
              expected[k as keyof typeof expected],
            ),
          ),
          `${id} HEX 与 sRGB 回退一致`,
          undefined,
          undefined,
          undefined,
          [c],
        );
      } catch (error) {
        invalid(`${id}.invalid`, "Color", error, undefined, [color]);
      }
    }
    const required = { ...COMPONENT_REFERENCES };
    for (const role of SEMANTIC_ROLES) {
      for (const kind of ["badge", "alert"])
        for (const part of ["background", "foreground", "border"])
          required[`${kind}.${role}.${part}`] =
            `feedback.${role}.${part === "background" ? "soft" : part}`;
      required[`alert.${role}.icon`] = `feedback.${role}.base`;
    }
    const componentCheck = check(
      `${mode}.component`,
      "Component",
      Object.entries(required).every(
        ([key, ref]) => tokens.component[key]?.ref === ref,
      ) &&
        Object.values(tokens.component).every((t) => !!tokens.semantic[t?.ref]),
      `${mode} 组件完整且仅引用 Semantic Token`,
    );
    if (componentCheck.status === "FAIL")
      componentCheck.code = "MISSING_REFERENCE";
    for (const [key, token] of Object.entries(tokens.semantic)) {
      if (!token || typeof token !== "object") {
        add(`${mode}.${key}.role`, "Semantic", "FAIL", "Token 数据无效");
        continue;
      }
      check(
        `${mode}.${key}.role`,
        "Semantic",
        token.theme === mode &&
          !!tokens.primitive[token.ref] &&
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
          token.relationships.length > 0,
        `${mode}.${key} 引用与角色声明`,
      );
      if (!tokens.primitive[token.ref]) {
        const r = add(
          `${mode}.${key}.reference`,
          "Semantic",
          "FAIL",
          `缺少 Primitive 引用：${token.ref}`,
        );
        r.code = "MISSING_REFERENCE";
      }
      for (const space of ["srgb", "display-p3"] as const) {
        for (const relation of Array.isArray(token.relationships)
          ? token.relationships
          : []) {
          const id = `${mode}.${key}/${relation?.token}.${space}`;
          try {
            if (
              !["text", "non-text", "decorative", "disabled"].includes(
                relation.usage,
              )
            )
              throw new ColorError("VALIDATION_ERROR", "无效关系用途");
            if (
              relation.usage === "text" &&
              ![relation.textSize, relation.fontWeight].every(
                (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
              )
            )
              throw new ColorError("VALIDATION_ERROR", "文字须声明字号字重");
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
                  : relation.usage === "disabled"
                    ? 1.0
                    : 0;
            const threshold = Math.max(baseline, relation.minContrast ?? 0);
            if (
              ![
                threshold,
                relation.minDeltaEOK ?? 0,
                relation.minDeltaE ?? 0,
                relation.minDeltaL ?? 0,
              ].every((v) => Number.isFinite(v) && v >= 0)
            )
              throw new ColorError("VALIDATION_ERROR", "关系阈值无效");
            const references = [
              key,
              relation.token,
              ...(relation.canvas ? [relation.canvas] : []),
            ];
            if (
              references.some(
                (ref) => !tokens.primitive[tokens.semantic[ref]?.ref],
              )
            ) {
              const r = add(
                id,
                "Contrast",
                "FAIL",
                "关系包含缺失的 Token 引用",
                undefined,
                undefined,
                space,
              );
              r.code = "MISSING_REFERENCE";
              continue;
            }
            const fg = resolveToken(tokens, key),
              bg = resolveToken(tokens, relation.token),
              canvas = relation.canvas
                ? resolveToken(tokens, relation.canvas)
                : undefined;
            const pair = outputPair(fg, bg, space, canvas);
            const d = deltaEOK(pair.foreground.oklab, pair.background.oklab),
              e = deltaE2000(pair.foreground.lab, pair.background.lab),
              l = Math.abs(pair.foreground.oklab.l - pair.background.oklab.l);
            const legacyL = Math.abs(
              pair.foreground.lab.l - pair.background.lab.l,
            );
            const r = check(
              id,
              "Contrast",
              pair.contrast >= threshold &&
                d >= (relation.minDeltaEOK ?? 0) &&
                e >= (relation.minDeltaE ?? 0) &&
                legacyL >= (relation.minDeltaL ?? 0),
              `${mode} ${key} / ${relation.token} ${space} 颜色约束（非完整无障碍认证）`,
              pair.contrast,
              threshold,
              space,
              [fg, bg],
            );
            r.metrics = {
              contrast: pair.contrast,
              deltaL: legacyL,
              deltaE: e,
              deltaEOK: d,
              deltaE00: e,
              deltaLOK: l,
              hueDistance: hueDistance(
                pair.foreground.oklch.h,
                pair.background.oklch.h,
              ),
            };
            // CUS-THEME-01 §50：Contrast FAIL 时产出 THEME_CONSTRAINT_CONFLICT。
            if (r.status === "FAIL" && r.category === "Contrast") {
              r.code = "THEME_CONSTRAINT_CONFLICT";
              r.requiredConstraint = `≥${threshold}:1`;
              r.candidateResolution = `考虑调整 ${key} 或 ${relation.token} 的色阶选择`;
            }
          } catch (error) {
            invalid(id, "Contrast", error, space);
          }
        }
        if (token.transition) {
          const id = `${mode}.${key}.${space}.transition`;
          try {
            const before = resolveToken(tokens, token.transition.from),
              after = resolveToken(tokens, key),
              threshold =
                options.stateOKMin ?? token.transition.minDeltaEOK ?? state;
            if (!Number.isFinite(threshold) || threshold < 0)
              throw new ColorError("VALIDATION_ERROR", "状态阈值无效");
            const d = deltaEOK(
              colorOutput(before, space).rendered.oklab,
              colorOutput(after, space).rendered.oklab,
            );
            check(
              id,
              "Component",
              d >= threshold,
              `${mode}.${key} 状态 ΔEOK`,
              d,
              threshold,
              space,
              [before, after],
            );
            const legacyThreshold = token.transition.minDeltaE ?? 0;
            if (!Number.isFinite(legacyThreshold) || legacyThreshold < 0)
              throw new ColorError("INVALID_INPUT", "ΔE00 状态阈值无效");
            if (legacyThreshold > 0) {
              const e = deltaE2000(
                colorOutput(before, space).rendered.lab,
                colorOutput(after, space).rendered.lab,
              );
              check(
                `${id}.deltaE00`,
                "Component",
                e >= legacyThreshold,
                "状态 ΔE00（旧单位）",
                e,
                legacyThreshold,
                space,
                [before, after],
              );
            }
          } catch (error) {
            invalid(id, "Component", error, space);
          }
        }
      }
    }
    for (const space of ["srgb", "display-p3"] as const) {
      try {
        const base = resolveToken(tokens, "surface.default"),
          raised = resolveToken(tokens, "surface.raised"),
          sunken = resolveToken(tokens, "surface.sunken");
        const light = (c: V2Color) => colorOutput(c, space).rendered.oklab.l;
        check(
          `${mode}.${space}.surfaces`,
          "Theme",
          light(raised) > light(base) && light(base) > light(sunken),
          `${mode} ${space} 独立背景层级`,
          undefined,
          undefined,
          space,
          [raised, base, sunken],
        );
      } catch (error) {
        invalid(`${mode}.${space}.surfaces`, "Theme", error, space);
      }
      for (let i = 0; i < SEMANTIC_ROLES.length; i++) {
        const role = SEMANTIC_ROLES[i];
        try {
          const a = resolveToken(tokens, `feedback.${role}.base`),
            x = colorOutput(a, space).rendered;
          const h = colorDesign(a).h;
          if (h === null)
            add(
              `${mode}.${role}.${space}.hue`,
              "Hue",
              "WARN",
              `${role} 无有效色相，继续验证 ΔEOK`,
              undefined,
              undefined,
              space,
              [a],
            );
          else
            check(
              `${mode}.${role}.${space}.hue`,
              "Hue",
              OK_SEMANTIC_HUES[role].some(
                (v) => (hueDistance(h, v) ?? Infinity) < 1e-6,
              ),
              `${role} OKLCH 语义色相家族`,
              undefined,
              undefined,
              space,
              [a],
            );
          for (const other of SEMANTIC_ROLES.slice(i + 1)) {
            const b = resolveToken(tokens, `feedback.${other}.base`),
              y = colorOutput(b, space).rendered;
            const d = deltaEOK(x.oklab, y.oklab),
              hue =
                x.oklch.c < OK_BRAND_EPSILON || y.oklch.c < OK_BRAND_EPSILON
                  ? null
                  : hueDistance(x.oklch.h, y.oklch.h);
            const legacy = deltaE2000(x.lab, y.lab);
            const status =
              d < fail || legacy < legacyFail || (hue !== null && hue < hueFail)
                ? "FAIL"
                : d < warn ||
                    legacy < legacyWarn ||
                    hue === null ||
                    hue < hueWarn
                  ? "WARN"
                  : "PASS";
            const r = add(
              `${mode}.${role}/${other}.${space}`,
              "Semantic",
              status,
              `${mode} ${role} / ${other} ΔEOK + Hue Separation`,
              d,
              fail,
              space,
              [a, b],
            );
            r.metrics = {
              contrast: outputPair(a, b, space).contrast,
              deltaL: Math.abs(x.lab.l - y.lab.l),
              deltaE: deltaE2000(x.lab, y.lab),
              deltaE00: deltaE2000(x.lab, y.lab),
              deltaEOK: d,
              deltaLOK: Math.abs(x.oklab.l - y.oklab.l),
              hueDistance: hue,
            };
            // V2.5 §54：语义撞色归入码表词 SEMANTIC_COLOR_COLLISION。
            if (status !== "PASS") r.code = "SEMANTIC_COLOR_COLLISION";
          }
          const anchor = tokens.primitive["primary.brand"],
            d = deltaEOK(colorOutput(anchor, space).rendered.oklab, x.oklab);
          if (d < fail)
            add(
              `${mode}.brand/${role}.${space}`,
              "Semantic",
              "WARN",
              `品牌色接近 ${role}，请结合图标和文案`,
              d,
              fail,
              space,
              [anchor, a],
            );
        } catch (error) {
          invalid(`${mode}.${role}.${space}.invalid`, "Semantic", error, space);
        }
      }
    }
  }
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  results.forEach((r) => counts[r.status]++);
  // V2.4 §35：色域合规摘要。
  const gamutResults = results.filter((r) => r.category === "Gamut");
  const srgbOk = !gamutResults
    .filter((r) => r.targetSpace === "srgb")
    .some((r) => r.status === "FAIL");
  const p3Ok = !gamutResults
    .filter((r) => r.targetSpace === "display-p3")
    .some((r) => r.status === "FAIL");
  return {
    status: counts.FAIL ? "FAIL" : counts.WARN ? "WARN" : "PASS",
    counts,
    results,
    gamut: { srgb: srgbOk, displayP3: p3Ok },
  };
}
