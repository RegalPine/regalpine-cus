import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import * as Slider from "@radix-ui/react-slider";
import * as Tabs from "@radix-ui/react-tabs";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type {
  BrandInput,
  V2Color,
  ColorAnchor,
  OKLCH,
  RGBSpace,
  ThemeOptions,
} from "@cus/core";
import { parseThemeOptions } from "@cus/core";
import {
  CusSelect,
  CusSelectTrigger,
  CusSelectContent,
  CusSelectItem,
  CusCheckbox,
  CusTooltip,
  CusTooltipTrigger,
  CusTooltipContent,
} from "@cus/ui";
import {
  contrastRatio,
  createBrandProfile,
  createOklchColor,
  hexToOklch,
  mapOklchToGamut,
  parseHex,
  rgbToOklch,
} from "@cus/color";
import { parseThemeConfig, CONFIG_MAX_BYTES } from "@cus/export";
import { createTheme } from "@cus/theme";
import { generateValidatedTheme } from "@cus/validation";
import { ThemePreview } from "./components/ThemePreview";
import { Modal } from "./components/Modal";
import { PreviewSpace } from "./components/PreviewSpace";
import { ColorInspector } from "./components/ColorInspector";
import { ColorSpaceView } from "./components/ColorSpaceView";
import {
  ExportPanel,
  PaletteDetails,
  TokenPanel,
  ValidationPanel,
} from "./panels/Panels";

type PreviewMode = "light" | "dark" | "split";
type Density = "comfortable" | "compact" | "dense";
const STORAGE_KEY = "cus-designer-v2";
const DEFAULT = "#2457C5";
/** 数值输入显示格式：固定精度并去除尾随零，避免浮点全精度溢出输入框。 */
function fmtValue(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(digits)));
}
/** §46 设计偏好控件：键 → 中文标签与取值文案（存储值保持规范枚举）。 */
const PREF_CONTROLS = [
  {
    key: "chroma",
    label: "色度基调",
    values: { muted: "柔和", balanced: "平衡", vivid: "鲜明" },
  },
  {
    key: "contrast",
    label: "对比强度",
    values: { normal: "标准", high: "高对比" },
  },
  {
    key: "neutral",
    label: "中性色",
    values: { "brand-tinted": "品牌调", pure: "纯中性" },
  },
  {
    key: "semantic",
    label: "语义色",
    values: { harmonious: "和谐", distinct: "区分" },
  },
] as const;
const PREF_DEFAULTS: Record<string, string> = {
  chroma: "balanced",
  contrast: "normal",
  neutral: "brand-tinted",
  semantic: "harmonious",
};
function loadSettings(): {
  brand: string;
  input?: BrandInput;
  mode: PreviewMode;
  recent: string[];
  options: ThemeOptions;
  space: RGBSpace;
  density: Density;
} {
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem("cus-designer-v1") ??
        "{}",
    );
    parseHex(stored.brand);
    return {
      brand: stored.brand,
      space: stored.space === "display-p3" ? "display-p3" : "srgb",
      density: (["comfortable", "compact", "dense"] as const).includes(
        stored.density,
      )
        ? stored.density
        : "comfortable",
      ...(stored.input
        ? { input: createBrandProfile(stored.input).input }
        : {}),
      mode: ["light", "dark", "split"].includes(stored.mode)
        ? stored.mode
        : "split",
      recent: Array.isArray(stored.recent)
        ? stored.recent
            .filter(
              (c: unknown) =>
                typeof c === "string" &&
                /^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(c),
            )
            .slice(0, 5)
        : [],
      options: parseThemeOptions(stored.options),
    };
  } catch {
    return {
      brand: DEFAULT,
      mode: "split",
      recent: [],
      options: {},
      space: "srgb",
      density: "comfortable",
    };
  }
}
export default function App() {
  const [initial] = useState(loadSettings);
  const [brand, setBrand] = useState(initial.brand);
  const [draft, setDraft] = useState(initial.brand);
  const [canonicalInput, setCanonicalInput] = useState<BrandInput | undefined>(
    initial.input,
  );
  const [lch, setLch] = useState<OKLCH>(
    () => createBrandProfile(initial.input ?? initial.brand).oklch,
  );
  const [space, setSpace] = useState<RGBSpace>(initial.space);
  const [p3Supported, setP3Supported] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(color-gamut: p3)");
    const update = () =>
      setP3Supported(
        CSS.supports("color", "color(display-p3 1 0 0)") && media.matches,
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const effectiveSpace = space === "display-p3" && p3Supported ? space : "srgb";
  const [error, setError] = useState("");
  const [mode, setMode] = useState<PreviewMode>(initial.mode);
  const [recent, setRecent] = useState(initial.recent);
  const [designOptions, setDesignOptions] = useState<ThemeOptions>(
    initial.options,
  );
  const [tab, setTab] = useState("preview");
  const [exporting, setExporting] = useState(false);
  const [inspected, setInspected] = useState<{
    name: string;
    color: V2Color;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const [candidate, setCandidate] = useState<ColorAnchor | null>(null);
  const [density, setDensity] = useState<Density>(initial.density);
  const fileInput = useRef<HTMLInputElement>(null);
  const interactiveInput = canonicalInput ?? brand;
  // §41 渐进验证：输入变化即时走 createTheme 快速路径（沿用最近一次
  // 验证报告），交互停止 150ms 后执行全量验证（generateValidatedTheme）。
  const [validated, setValidated] = useState({
    input: interactiveInput,
    options: designOptions,
  });
  const fullResult = useMemo(
    () => generateValidatedTheme(validated.input, validated.options),
    [validated],
  );
  useEffect(() => {
    if (
      interactiveInput === validated.input &&
      designOptions === validated.options
    )
      return;
    const timer = window.setTimeout(
      () => setValidated({ input: interactiveInput, options: designOptions }),
      150,
    );
    return () => window.clearTimeout(timer);
  }, [interactiveInput, designOptions, validated]);
  const result = useMemo(
    () =>
      interactiveInput === validated.input &&
      designOptions === validated.options
        ? fullResult
        : {
            ...createTheme(interactiveInput, designOptions),
            validation: fullResult.validation,
          },
    [interactiveInput, designOptions, validated, fullResult],
  );
  const notify = useCallback((message: string) => setToast(message), []);
  const selectColor = useCallback(
    (name: string, color: V2Color) => setInspected({ name, color }),
    [],
  );
  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          brand,
          input: canonicalInput,
          version: "2.2",
          designSpace: "oklch",
          space,
          mode,
          recent,
          options: designOptions,
          density,
        }),
      );
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, [brand, canonicalInput, mode, recent, designOptions, space, density]);
  function updateBrand(value: string) {
    setDraft(value);
    try {
      parseHex(value);
      setBrand(value);
      setCanonicalInput(undefined);
      setLch(hexToOklch(value));
      setError("");
    } catch {
      setError("请输入有效 HEX；预览保留上一个有效颜色。");
    }
  }
  const lchRef = useRef(lch);
  lchRef.current = lch;
  const alphaRef = useRef(result.brand.alpha);
  alphaRef.current = result.brand.alpha;
  const rafRef = useRef<number | null>(null);
  const pendingLchRef = useRef<OKLCH | null>(null);
  const draggingRef = useRef(false);
  const applyLch = useCallback((next: OKLCH) => {
    try {
      const color = createOklchColor(next, alphaRef.current);
      setCanonicalInput({ oklch: color.design, alpha: alphaRef.current });
      setLch(next);
      setBrand(color.hex);
      setDraft(color.hex);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OKLCH 输入无效");
    }
  }, []);
  const flushLch = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const target = pendingLchRef.current;
    pendingLchRef.current = null;
    if (target) applyLch(target);
  }, [applyLch]);
  // §41：连续拖动时滑杆 onValueChange 以 rAF 合并到每帧一次；
  // 键盘/单次点击等离散交互立即应用，松开指针时冲刷未决帧。
  const scheduleLch = useCallback(
    (next: OKLCH) => {
      if (!draggingRef.current) {
        flushLch();
        applyLch(next);
        return;
      }
      pendingLchRef.current = next;
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const target = pendingLchRef.current;
        pendingLchRef.current = null;
        if (target) applyLch(target);
      });
    },
    [applyLch, flushLch],
  );
  useEffect(
    () => () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );
  function updateLch(key: keyof OKLCH, value: number, immediate = false) {
    const next = { ...lchRef.current, [key]: value };
    if (next.h === null && next.c >= 1e-7) {
      setError("无彩色没有色相，请先选择色相再增加色度。");
      return;
    }
    if (immediate) applyLch(next);
    else scheduleLch(next);
  }
  // §16/§31：RGB 数值输入（兼容输入，最终转换为感知锚点）。
  function updateRgb(channel: "r" | "g" | "b", raw: string) {
    if (raw === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const rgb = {
      ...result.brand.rgb,
      [channel]: Math.min(1, Math.max(0, value / 255)),
    };
    try {
      const color = createOklchColor(
        rgbToOklch(rgb, "srgb"),
        result.brand.alpha,
      );
      setCanonicalInput({ oklch: color.design, alpha: result.brand.alpha });
      setLch(color.design);
      setBrand(color.hex);
      setDraft(color.hex);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "RGB 输入无效");
    }
  }
  // §20：候选主色提交流（OUT_OF_GAMUT 阻断由候选条执行；可先映射再提交）。
  const commitCandidate = useCallback(
    (mapFirst: boolean) => {
      if (!candidate) return;
      let next: OKLCH = { l: candidate.l, c: candidate.c, h: candidate.h };
      const mapped = mapFirst;
      if (mapFirst) {
        try {
          next = mapOklchToGamut(next, "srgb");
        } catch {
          /* 映射失败保持原坐标，交由 createOklchColor 校验 */
        }
      }
      try {
        const color = createOklchColor(next, result.brand.alpha);
        setCanonicalInput({ oklch: color.design, alpha: result.brand.alpha });
        setLch(color.design);
        setBrand(color.hex);
        setDraft(color.hex);
        setError("");
        setCandidate(null);
        notify(
          mapped && candidate.c > next.c + 1e-9
            ? "候选已映射到 sRGB 色域后提交"
            : "候选主色已提交",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "候选提交失败");
      }
    },
    [candidate, result.brand.alpha, notify],
  );
  // 对比参考背景：语义 surface.default 指向的中性 primitive。
  const surfaceBase = useMemo(() => {
    const tokens = result.theme.light ?? result.theme.dark;
    const ref = tokens?.semantic["surface.default"]?.ref;
    return ref ? tokens?.primitive[ref] : undefined;
  }, [result]);
  const brandInk =
    contrastRatio("#FFFFFF", result.brand.hex, "#FFFFFF") >= 4.5
      ? "#FFFFFF"
      : "#141824";
  return (
    <PreviewSpace.Provider value={effectiveSpace}>
      <div className="app-shell" data-preview-space={effectiveSpace}>
        <header className="app-header">
          <a className="wordmark" href="#main" aria-label="CUS Designer 首页">
            <span className="brand-symbol">C</span>
            <b>CUS</b>
            <span>Designer</span>
          </a>
          <div className="header-actions">
            <button
              className="outline-button"
              onClick={() => fileInput.current?.click()}
            >
              ↑ 导入配置
            </button>
            <button
              className="primary-button"
              onClick={() => setExporting(true)}
            >
              ↓ 导出主题
            </button>
          </div>
        </header>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="导入 JSON 配置"
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            try {
              if (file.size > CONFIG_MAX_BYTES)
                throw new Error("配置文件不能超过 10 MB");
              const config = parseThemeConfig(await file.text());
              updateBrand(config.brand);
              if (config.brandInput) {
                setCanonicalInput(config.brandInput);
                setLch(createBrandProfile(config.brandInput).oklch);
              }
              setDesignOptions(config.options ?? {});
              setMode(
                config.generateLight && config.generateDark
                  ? "split"
                  : config.generateLight
                    ? "light"
                    : "dark",
              );
              notify("配置已导入，主题已重新计算");
            } catch (err) {
              notify(err instanceof Error ? err.message : "配置导入失败");
            }
          }}
        />
        <div className="app-body">
          <aside className="sidebar">
            <div
              className="brand-color"
              style={
                {
                  "--brand": result.brand.hex,
                  "--brand-ink": brandInk,
                } as CSSProperties
              }
            >
              <strong>{result.brand.hex}</strong>
              <input
                aria-label="品牌拾色器"
                type="color"
                value={result.brand.hex.slice(0, 7)}
                onChange={(e) => updateBrand(e.target.value)}
              />
            </div>
            <div className="field-row">
              <label className="field-label" htmlFor="brand-hex">
                品牌颜色 <span>HEX</span>
              </label>
              <button
                type="button"
                className="text-button paste-hex"
                onClick={async () => {
                  try {
                    const text = (await navigator.clipboard.readText()).trim();
                    if (!text) return;
                    updateBrand(text.startsWith("#") ? text : `#${text}`);
                    notify("已粘贴剪贴板 HEX");
                  } catch {
                    notify("无法读取剪贴板，请手动输入 HEX");
                  }
                }}
              >
                粘贴 HEX
              </button>
            </div>
            <div className={`hex-field ${error ? "invalid" : ""}`}>
              <i style={{ background: result.brand.hex }} />
              <input
                id="brand-hex"
                value={draft}
                spellCheck={false}
                maxLength={9}
                aria-invalid={!!error}
                aria-describedby={error ? "brand-error" : undefined}
                onChange={(e) => updateBrand(e.target.value)}
              />
              <span>↵</span>
            </div>
            {error && (
              <p id="brand-error" className="input-error" role="alert">
                {error}
              </p>
            )}
            <div className="control-heading">
              <span>感知色彩调整</span>
              <span className="small-tag">OKLCH</span>
            </div>
            <div className="sliders">
              {(
                [
                  ["l", "明度", "L", 1, "明度描述色彩从暗到亮的程度"],
                  ["c", "色度", "C", 0.4, "色度描述色彩偏离中性的距离"],
                  ["h", "色相", "h°", 360, "色相描述色彩在色轮上的角度位置"],
                ] as const
              ).map(([key, name, symbol, max, tip]) => (
                <div className="slider-field" key={key}>
                  <CusTooltip>
                    <CusTooltipTrigger asChild>
                      <span>
                        {name} <small>{symbol}</small>
                        <output>
                          {key === "h" && lch.h == null
                            ? "—"
                            : `${fmtValue(lch[key], key === "h" ? 1 : 3)}${
                                key === "h" ? "°" : ""
                              }`}
                        </output>
                        {key === "h" && lch.h == null && (
                          <small className="achromatic-tag">Achromatic</small>
                        )}
                      </span>
                    </CusTooltipTrigger>
                    <CusTooltipContent side="top">{tip}</CusTooltipContent>
                  </CusTooltip>
                  <Slider.Root
                    min={0}
                    max={max}
                    step={key === "h" ? 0.1 : 0.001}
                    value={[Math.min(max, lch[key] ?? 0)]}
                    className="color-slider"
                    onValueChange={([value]) => updateLch(key, value)}
                    onPointerDown={() => {
                      draggingRef.current = true;
                    }}
                    onPointerUp={() => {
                      draggingRef.current = false;
                      flushLch();
                    }}
                    onPointerCancel={() => {
                      draggingRef.current = false;
                      flushLch();
                    }}
                  >
                    <Slider.Track className={`slider-track slider-${key}`} />
                    <Slider.Thumb className="slider-thumb" aria-label={name} />
                  </Slider.Root>
                </div>
              ))}
            </div>
            <div className="sidebar-section">
              <div className="control-heading">
                <span>数值输入</span>
                <span className="small-tag">RGB · ALPHA</span>
              </div>
              <div className="rgb-inputs">
                {(["r", "g", "b"] as const).map((channel) => (
                  <label key={channel}>
                    {channel.toUpperCase()}
                    <input
                      className="coordinate-input"
                      type="number"
                      aria-label={`${channel.toUpperCase()} 通道`}
                      min={0}
                      max={255}
                      step={1}
                      value={Math.round(result.brand.rgb[channel] * 255)}
                      onChange={(e) => updateRgb(channel, e.target.value)}
                    />
                  </label>
                ))}
              </div>
              <label className="field-label alpha-field">
                Alpha{" "}
                <input
                  className="coordinate-input"
                  aria-label="Alpha 数值"
                  type="number"
                  min={0}
                  max={1}
                  step={0.001}
                  value={fmtValue(result.brand.alpha, 3)}
                  onChange={(e) => {
                    if (e.target.value === "") return;
                    const alpha = Number(e.target.value);
                    try {
                      const c = createOklchColor(result.brand.oklch, alpha);
                      setCanonicalInput({ oklch: c.design, alpha });
                      setBrand(c.hex);
                      setDraft(c.hex);
                      setError("");
                    } catch {
                      setError("Alpha 必须在 0–1 之间");
                    }
                  }}
                />
              </label>
              <p className="control-note">
                设计源独立映射至 sRGB /
                P3，保持明度与色相并降低色度。数值框支持范围外的合法色度。
              </p>
              <label className="field-label" style={{ marginTop: 8 }}>
                <span>预览色域</span>
                <CusSelect
                  value={space}
                  onValueChange={(v) => setSpace(v as RGBSpace)}
                >
                  <CusSelectTrigger aria-label="预览色域" style={{ width: 120 }}>
                    {space === "srgb" ? "sRGB" : "Display P3"}
                  </CusSelectTrigger>
                  <CusSelectContent>
                    <CusSelectItem value="srgb">sRGB</CusSelectItem>
                    <CusSelectItem value="display-p3">
                      Display P3
                    </CusSelectItem>
                  </CusSelectContent>
                </CusSelect>
              </label>
              {space === "display-p3" && !p3Supported && (
                <span className="control-note" role="status">
                  当前环境不支持 P3 显示，已安全回退 sRGB。
                </span>
              )}
            </div>
            <div className="sidebar-section">
              <div className="control-heading">
                <span>设计偏好与输出</span>
              </div>
              <div className="sidebar-prefs">
                {PREF_CONTROLS.map(({ key, label, values }) => {
                  const currentVal =
                    (designOptions[key as keyof ThemeOptions] as string) ??
                    PREF_DEFAULTS[key];
                  return (
                    <label key={key} className="field-label">
                      <span>{label}</span>
                      <CusSelect
                        value={currentVal}
                        onValueChange={(v) =>
                          setDesignOptions(
                            parseThemeOptions({
                              ...designOptions,
                              [key]: v,
                            }),
                          )
                        }
                      >
                        <CusSelectTrigger aria-label={label} style={{ width: 120 }}>
                          {values[currentVal as keyof typeof values] ??
                            currentVal}
                        </CusSelectTrigger>
                        <CusSelectContent>
                          {Object.entries(values).map(([v, text]) => (
                            <CusSelectItem key={v} value={v}>
                              {text}
                            </CusSelectItem>
                          ))}
                        </CusSelectContent>
                      </CusSelect>
                    </label>
                  );
                })}
                <label className="field-label">
                  <CusCheckbox
                    checked={designOptions.lightMode !== false}
                    disabled={designOptions.darkMode === false}
                    onCheckedChange={(v) => {
                      setDesignOptions({
                        ...designOptions,
                        lightMode: !!v,
                      });
                      if (!v) setMode("dark");
                    }}
                  />
                  生成 Light
                </label>
                <label className="field-label">
                  <CusCheckbox
                    checked={designOptions.darkMode !== false}
                    disabled={designOptions.lightMode === false}
                    onCheckedChange={(v) => {
                      setDesignOptions({
                        ...designOptions,
                        darkMode: !!v,
                      });
                      if (!v) setMode("light");
                    }}
                  />
                  生成 Dark
                </label>
                {(["srgb", "displayP3"] as const).map((target) => {
                  const output = designOptions.output ?? {
                    srgb: true,
                    displayP3: true,
                  };
                  return (
                    <label key={target} className="field-label">
                      <CusCheckbox
                        checked={output[target]}
                        disabled={
                          output[target] &&
                          Object.values(output).filter(Boolean).length === 1
                        }
                        onCheckedChange={(v) =>
                          setDesignOptions({
                            ...designOptions,
                            output: { ...output, [target]: !!v },
                          })
                        }
                      />
                      {target === "srgb" ? "sRGB 输出" : "Display P3 输出"}
                    </label>
                  );
                })}
              </div>
            </div>
            <details className="metrics-details">
              <summary>
                实时色彩数据 <span>＋</span>
              </summary>
              <dl>
                <dt>RGB</dt>
                <dd>
                  {Object.values(result.brand.rgb)
                    .map((v) => (v * 255).toFixed(0))
                    .join(" / ")}
                </dd>
                <dt>Lab</dt>
                <dd>
                  {Object.values(result.brand.lab)
                    .map((v) => v?.toFixed(2) ?? "未定义")
                    .join(" / ")}
                </dd>
                <dt>LCh</dt>
                <dd>
                  {Object.values(result.brand.lch)
                    .map((v) => v?.toFixed(2) ?? "未定义")
                    .join(" / ")}
                </dd>
                <dt>Alpha</dt>
                <dd>{result.brand.alpha.toFixed(3)}</dd>
              </dl>
            </details>
            <div className="sidebar-section">
              <div className="control-heading">
                <span>预设品牌色</span>
                <button
                  className="text-button"
                  onClick={() => updateBrand(DEFAULT)}
                >
                  重置
                </button>
              </div>
              <div className="preset-colors">
                {[
                  "#2457C5",
                  "#7954B3",
                  "#C54B64",
                  "#C8782B",
                  "#24836A",
                  "#272B35",
                ].map((c) => (
                  <button
                    key={c}
                    style={{ background: c }}
                    aria-label={`使用品牌色 ${c}`}
                    aria-pressed={result.brand.hex === c}
                    onClick={() => updateBrand(c)}
                  >
                    {result.brand.hex === c ? "✓" : ""}
                  </button>
                ))}
              </div>
            </div>
            <div className="sidebar-section">
              <div className="control-heading">
                <span>最近主题</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setRecent(
                      [
                        result.brand.source,
                        ...recent.filter((c) => c !== result.brand.source),
                      ].slice(0, 5),
                    );
                    notify("主题已加入最近列表");
                  }}
                >
                  ＋ 保存
                </button>
              </div>
              {recent.length ? (
                recent.map((c) => (
                  <button
                    className="recent-theme"
                    key={c}
                    onClick={() => updateBrand(c)}
                  >
                    <i style={{ background: c }} />
                    <code>{c}</code>
                    <span>↗</span>
                  </button>
                ))
              ) : (
                <p className="control-note">保存喜欢的色彩，下次继续探索。</p>
              )}
            </div>
            <div className="sidebar-footer">
              <i className={storageOk ? "saved-dot" : "unsaved-dot"} />
              {storageOk ? "已保存" : "未保存"}
            </div>
          </aside>
          <main id="main">
            <header className="main-heading">
              <h1>主题工作台</h1>
              <span className="head-status">
                <i
                  className={
                    result.validation.counts.FAIL
                      ? "fail"
                      : result.validation.counts.WARN
                        ? "warn"
                        : "ok"
                  }
                />
                {result.validation.counts.PASS} 项通过 ·{" "}
                {result.validation.counts.WARN} 项提示 ·{" "}
                {result.validation.counts.FAIL} 项失败
              </span>
            </header>
            <Tabs.Root value={tab} onValueChange={setTab}>
              <div className="workspace-toolbar">
                <Tabs.List className="workspace-tabs" aria-label="工作台视图">
                  {[
                    ["preview", "◫", "界面预览"],
                    ["palette", "▦", "色板"],
                    ["space", "◎", "色彩空间"],
                    ["tokens", "⌘", "Design Tokens"],
                  ].map(([value, icon, label]) => (
                    <Tabs.Trigger key={value} value={value}>
                      <span>{icon}</span>
                      {label}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
                <div className="toolbar-actions">
                  <ToggleGroup.Root
                    type="single"
                    className="segmented"
                    aria-label="主题模式"
                    value={mode}
                    onValueChange={(value) => {
                      if (
                        value === "light" ||
                        value === "dark" ||
                        value === "split"
                      )
                        setMode(value);
                    }}
                  >
                    {(
                      [
                        ["light", "☼", "Light"],
                        ["dark", "☾", "Dark"],
                        ["split", "◫", "Split"],
                      ] as const
                    ).map(([value, icon, label]) => (
                      <ToggleGroup.Item
                        key={value}
                        value={value}
                        disabled={
                          value === "split"
                            ? !result.theme.dark || !result.theme.light
                            : !result.theme[value]
                        }
                      >
                        <span>{icon}</span>
                        {label}
                      </ToggleGroup.Item>
                    ))}
                  </ToggleGroup.Root>
                  {tab === "preview" && (
                    <span className="density-control">
                      密度
                      <CusSelect
                        value={density}
                        onValueChange={(v) => setDensity(v as Density)}
                      >
                        <CusSelectTrigger aria-label="预览密度">
                          {density === "comfortable"
                            ? "舒适"
                            : density === "compact"
                              ? "紧凑"
                              : "密集"}
                        </CusSelectTrigger>
                        <CusSelectContent>
                          <CusSelectItem value="comfortable">
                            舒适
                          </CusSelectItem>
                          <CusSelectItem value="compact">紧凑</CusSelectItem>
                          <CusSelectItem value="dense">密集</CusSelectItem>
                        </CusSelectContent>
                      </CusSelect>
                    </span>
                  )}
                </div>
              </div>
              <Tabs.Content value="preview">
                <div className={`preview-grid ${mode}`}>
                  {mode !== "dark" && result.theme.light && (
                    <ThemePreview
                      tokens={result.theme.light}
                      density={density}
                    />
                  )}
                  {mode !== "light" && result.theme.dark && (
                    <ThemePreview
                      tokens={result.theme.dark}
                      density={density}
                    />
                  )}
                </div>
              </Tabs.Content>
              <Tabs.Content value="palette">
                <PaletteDetails result={result} mode={mode} onSelect={selectColor} />
              </Tabs.Content>
              <Tabs.Content value="space">
                <ColorSpaceView
                  result={result}
                  mode={mode === "dark" ? "dark" : "light"}
                  onSelect={selectColor}
                  candidate={candidate}
                  onCandidate={setCandidate}
                  onCommit={commitCandidate}
                  background={surfaceBase}
                />
              </Tabs.Content>
              <Tabs.Content value="tokens">
                <TokenPanel result={result} mode={mode === "dark" ? "dark" : "light"} onSelect={selectColor} />
              </Tabs.Content>
            </Tabs.Root>
            <ValidationPanel report={result.validation} />

          </main>
        </div>
        {exporting && (
          <ExportPanel
            result={result}
            onClose={() => setExporting(false)}
            notify={notify}
            onOutputChange={(output) =>
              setDesignOptions((options) => ({ ...options, output }))
            }
          />
        )}
        {inspected && (
          <Modal title={inspected.name} onClose={() => setInspected(null)} className="modal-wide">
            <ColorInspector color={inspected.color} result={result} />
            <div className="inspected-hex">
              <code>{inspected.color.hex}</code>
              <button
                className="outline-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inspected.color.hex);
                    notify("HEX 已复制");
                  } catch {
                    notify("无法访问剪贴板，请手动复制 HEX");
                  }
                }}
              >
                复制 HEX
              </button>
            </div>
          </Modal>
        )}
        <div
          className={`toast ${toast ? "visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      </div>
    </PreviewSpace.Provider>
  );
}
