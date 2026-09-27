import { useMemo, useState } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import {
  SEMANTIC_ROLES,
  type V2Color,
  type GeneratedTheme,
  type OutputOptions,
  type ThemeMode,
  type ValidationReport,
} from "@cus/core";
import { exportTheme, type ExportFormat } from "@cus/export";
import { Modal } from "../components/Modal";
import { usePreviewSpace } from "../components/PreviewSpace";
import { renderColor, colorDesign, deltaEOK, oklchToOklab } from "@cus/color";
import { resolveToken } from "@cus/theme";
import { ColorSwatch } from "@cus/ui";

function ModeDifference({ light, dark }: { light?: V2Color; dark?: V2Color }) {
  const space = usePreviewSpace();
  if (!light || !dark) return <span>不适用：主题未生成</span>;
  const a = colorDesign(light),
    b = colorDesign(dark);
  const h =
    a.h === null || b.h === null ? null : ((b.h - a.h + 540) % 360) - 180;
  return (
    <span className="mode-difference">
      <i style={{ background: renderColor(light, space) }} /> Light{" "}
      <i style={{ background: renderColor(dark, space) }} /> Dark
      <br />
      ΔL {(b.l - a.l).toFixed(4)} · ΔC {(b.c - a.c).toFixed(4)} · ΔH{" "}
      {h === null ? "不适用" : h.toFixed(2) + "°"} · ΔEOK{" "}
      {deltaEOK(oklchToOklab(a), oklchToOklab(b)).toFixed(4)}
    </span>
  );
}

export function PalettePanel({
  result,
  onSelect,
}: {
  result: GeneratedTheme;
  onSelect: (name: string, color: V2Color) => void;
}) {
  const space = usePreviewSpace();
  const labels = {
    primary: ["品牌色阶", "PRIMARY"],
    secondary: ["次级色阶", "SECONDARY"],
    accent: ["强调色阶", "ACCENT"],
    neutral: ["中性色阶", "NEUTRAL"],
  } as const;
  // Neutral 最多 13 阶，作为统一列数基准；11 阶家族每色块跨 13/11≈1.18 列
  // 实际用 CSS grid + span 实现：11 阶中前 7 个占 1 列、后 4 个占 2 列 → 7+8=15 > 13
  // 改用 flexbox + 固定宽度方案更简洁
  return (
    <div className="palette-panel">
      {(["primary", "secondary", "accent", "neutral"] as const).map((name) => {
        const entries = Object.entries(result.palette[name]);
        return (
          <div className="palette-row" key={name}>
            <div className="palette-label">
              <strong>{labels[name][0]}</strong>
              <span>{labels[name][1]}</span>
            </div>
            <div className="color-scale-flex">
              {entries.map(([step, color]) => (
                <button
                  key={step}
                  className="swatch"
                  aria-label={`${name}.${step} ${color.hex}`}
                  title={`${color.hex} · OKLCH ${Object.values(colorDesign(color)).join(" / ")}`}
                  onClick={() => onSelect(`${name}.${step}`, color)}
                >
                  <ColorSwatch color={color} step={Number(step)} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="semantic-strip">
        <span>语义色</span>
        {SEMANTIC_ROLES.map((role) => (
          <button
            key={role}
            onClick={() =>
              onSelect(`${role}.base`, result.palette.semantic[role].base)
            }
          >
            <i
              style={{
                background: renderColor(
                  result.palette.semantic[role].base,
                  space,
                ),
              }}
            />
            {role}
          </button>
        ))}
        <span className="strip-note">点击色块查看色度数据 ↗</span>
      </div>
    </div>
  );
}
export function PaletteDetails({
  result,
  mode,
  onSelect,
}: {
  result: GeneratedTheme;
  mode: "light" | "dark" | "split";
  onSelect: (name: string, color: V2Color) => void;
}) {
  const space = usePreviewSpace();
  const isSplit = mode === "split" && result.theme.light && result.theme.dark;
  const activeMode: ThemeMode = isSplit
    ? "light"
    : result.theme[mode as ThemeMode]
      ? (mode as ThemeMode)
      : result.theme.light
        ? "light"
        : "dark";
  const palette = result.palettes?.[activeMode] ?? result.palette;
  const darkPalette = isSplit
    ? (result.palettes?.dark ?? result.palette)
    : null;
  const groups = {
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    neutral: palette.neutral,
    ...palette.feedback,
  };
  const darkGroups = darkPalette
    ? {
        primary: darkPalette.primary,
        secondary: darkPalette.secondary,
        accent: darkPalette.accent,
        neutral: darkPalette.neutral,
        ...darkPalette.feedback,
      }
    : null;
  return (
    <div className="palette-details">
      {Object.entries(groups).map(([group, colors]) => (
        <section key={group}>
          <div className="section-heading">
            <h3>{group}</h3>
            <span>OKLCH · D65 · {space}</span>
          </div>
          <div className={`detail-grid${isSplit ? " detail-grid-split" : ""}`}>
            {Object.entries(colors).map(([name, color]) => {
              const darkColor = (darkGroups?.[group as keyof typeof darkGroups] as Record<string, V2Color> | undefined)?.[name];
              return (
                <button
                  className={`color-detail${isSplit ? " color-detail-split" : ""}`}
                  key={name}
                  aria-label={`${group}.${name} ${color.hex}`}
                  onClick={() => onSelect(`${group}.${name}`, color)}
                >
                  {isSplit && darkColor ? (
                    <div className="split-swatch">
                      <i
                        className="split-half split-light"
                        style={{ background: renderColor(color, space) }}
                      />
                      <i
                        className="split-half split-dark"
                        style={{ background: renderColor(darkColor, space) }}
                      />
                    </div>
                  ) : (
                    <i style={{ background: renderColor(color, space) }} />
                  )}
                  <div className="detail-name-row">
                    <b>{name}</b>
                    <code className="detail-hex">{color.hex}</code>
                  </div>
                  <div className="oklch-values">
                    <span>L {colorDesign(color).l.toFixed(3)}</span>
                    <span>C {colorDesign(color).c.toFixed(3)}</span>
                    <span>H {colorDesign(color).h?.toFixed(1) ?? "—"}</span>
                  </div>
                  {isSplit && darkColor && (
                    <div className="oklch-values oklch-dark">
                      <span>L {colorDesign(darkColor).l.toFixed(3)}</span>
                      <span>C {colorDesign(darkColor).c.toFixed(3)}</span>
                      <span>H {colorDesign(darkColor).h?.toFixed(1) ?? "—"}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
export function TokenPanel({
  result,
  mode,
  onSelect,
}: {
  result: GeneratedTheme;
  mode: ThemeMode;
  onSelect: (name: string, color: V2Color) => void;
}) {
  const space = usePreviewSpace();
  const [query, setQuery] = useState("");
  const tokens = result.theme[mode] ?? result.theme.light ?? result.theme.dark!;
  return (
    <section className="token-panel">
      <div className="section-heading">
        <h3>Token 引用关系</h3>
      </div>
      <input
        className="search-input"
        aria-label="搜索 Token"
        placeholder="搜索 Token，例如 button、surface…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="token-table">
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>引用</th>
              <th>渲染值</th>
              <th>Light → Dark 设计差异</th>
            </tr>
          </thead>
          <tbody>
            {(["semantic", "component"] as const).flatMap((layer) =>
              Object.entries(tokens[layer])
                .filter(([key]) =>
                  key.toLowerCase().includes(query.toLowerCase()),
                )
                .map(([key, token]) => {
                  const primitive =
                    layer === "semantic"
                      ? token.ref
                      : tokens.semantic[token.ref].ref;
                  const color = tokens.primitive[primitive];
                  return (
                    <tr key={`${layer}.${key}`}>
                      <td>
                        <small>{layer}</small>
                        <code>{key}</code>
                      </td>
                      <td>
                        <code>↳ {token.ref}</code>
                      </td>
                      <td>
                        <i
                          className="token-dot"
                          style={{ background: renderColor(color, space) }}
                        />
                        <button
                          onClick={() =>
                            onSelect(`${tokens.mode}.${key}`, color)
                          }
                        >
                          <code>{renderColor(color, space)}</code>
                        </button>
                      </td>
                      <td>
                        <ModeDifference
                          light={
                            result.theme.light
                              ? resolveToken(result.theme.light, key, layer)
                              : undefined
                          }
                          dark={
                            result.theme.dark
                              ? resolveToken(result.theme.dark, key, layer)
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  );
                }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function ValidationPanel({ report }: { report: ValidationReport }) {
  const hasIssues = report.counts.FAIL > 0 || report.counts.WARN > 0;
  const [expanded, setExpanded] = useState(hasIssues);
  const [filter, setFilter] = useState("issues");
  const categories = [
    "Color",
    "Gamut",
    "Palette",
    "Semantic",
    "Contrast",
    "Theme",
    "Component",
    "Hue",
  ];
  const results = report.results.filter(
    (r) =>
      filter === "all" ||
      (filter === "issues" ? r.status !== "PASS" : r.category === filter),
  );
  return (
    <section className="validation-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">VALIDATION</span>
          <h3>质量验证</h3>
        </div>
        <button
          className="text-button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "收起报告 ↑" : "查看报告 ↗"}
        </button>
      </div>
      <div className="validation-categories">
        {categories.map((category) => {
          const values = report.results.filter((r) => r.category === category);
          const status = values.some((r) => r.status === "FAIL")
            ? "FAIL"
            : values.some((r) => r.status === "WARN")
              ? "WARN"
              : "PASS";
          return (
            <button
              className={`check-chip ${status.toLowerCase()}`}
              key={category}
              onClick={() => {
                setExpanded(true);
                setFilter(category);
              }}
            >
              <span>
                {status === "PASS" ? "✓" : status === "WARN" ? "△" : "×"}
              </span>
              {category}
            </button>
          );
        })}
      </div>
      <div className="validation-summary">
        <span>
          <b>{report.counts.PASS}</b> 项通过 · <b>{report.counts.WARN}</b>{" "}
          项提示 · <b>{report.counts.FAIL}</b> 项失败
        </span>
        <span>ΔEOK · ΔE00 · sRGB / P3（P3 非完整 WCAG 认证）</span>
      </div>
      {expanded && (
        <div className="validation-report">
          <div className="report-toolbar">
            <label>
              筛选{" "}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="issues">仅提示与失败</option>
                <option value="all">全部检查</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <span>{results.length} 项检查</span>
          </div>
          <ul>
            {results.length ? (
              results.map((r) => (
                <li key={r.id}>
                  <span className={`status-label ${r.status.toLowerCase()}`}>
                    {r.status}
                  </span>
                  <span>{r.message}</span>
                  {r.value !== undefined && (
                    <code>
                      {r.value.toFixed(2)}
                      {r.threshold !== undefined ? ` / ${r.threshold}` : ""}
                    </code>
                  )}
                </li>
              ))
            ) : (
              <li>没有提示或失败。</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
export function ExportPanel({
  result,
  onClose,
  notify,
  onOutputChange,
}: {
  result: GeneratedTheme;
  onClose: () => void;
  notify: (message: string) => void;
  onOutputChange: (output: OutputOptions) => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("css");
  const [modes, setModes] = useState<ThemeMode[]>(
    (["light", "dark"] as const).filter((m) => !!result.theme[m]),
  );
  const output = result.options?.output ?? { srgb: true, displayP3: true };
  const source = useMemo(
    () => exportTheme(result, format, { modes, output }),
    [result, format, modes, output],
  );
  function download() {
    const blob = new Blob([source], {
      type: format === "json" ? "application/json" : "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cus-theme.${format}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`已下载 ${format.toUpperCase()} 主题`);
  }
  return (
    <Modal
      title="导出主题"
      onClose={onClose}
      className="export-modal"
    >
      <p className="muted">
        导出保留 Primitive → Semantic → Component 三层引用关系。
      </p>
      <div className="export-toolbar">
        <ToggleGroup.Root
          type="single"
          className="segmented"
          aria-label="导出格式"
          value={format}
          onValueChange={(value) => {
            if (value === "css" || value === "json" || value === "ts")
              setFormat(value);
          }}
        >
          {(["css", "json", "ts"] as const).map((f) => (
            <ToggleGroup.Item key={f} value={f}>
              {f === "ts" ? "TypeScript" : f.toUpperCase()}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <div className="export-modes">
          {(["light", "dark"] as const).map((m) => (
            <label key={m}>
              <Checkbox.Root
                className="cus-checkbox"
                aria-label={m === "light" ? "浅色" : "深色"}
                checked={modes.includes(m)}
                disabled={
                  !result.theme[m] || (modes.length === 1 && modes.includes(m))
                }
                onCheckedChange={(checked) =>
                  setModes(
                    checked === true
                      ? [...modes, m]
                      : modes.filter((v) => v !== m),
                  )
                }
              >
                <Checkbox.Indicator aria-hidden="true">✓</Checkbox.Indicator>
              </Checkbox.Root>
              {m === "light" ? "浅色" : "深色"}
            </label>
          ))}
        </div>
      </div>
      <div className="space-controls">
        {(["srgb", "displayP3"] as const).map((target) => (
          <label key={target}>
            <input
              type="checkbox"
              checked={output[target]}
              disabled={
                output[target] &&
                Object.values(output).filter(Boolean).length === 1
              }
              onChange={(e) =>
                onOutputChange({ ...output, [target]: e.target.checked })
              }
            />
            {target}
          </label>
        ))}
        <span>sRGB 回退始终保留</span>
      </div>
      <textarea
        className="export-source"
        aria-label="导出代码"
        readOnly
        value={source}
        spellCheck={false}
      />
      <p className="export-note">
        {result.validation.counts.FAIL
          ? `注意：仍有 ${result.validation.counts.FAIL} 项验证失败，请检查后使用。`
          : `验证：${result.validation.counts.PASS} 项通过，${result.validation.counts.WARN} 项提示。`}{" "}
        JSON 可作为配置重新导入。
      </p>
      <div className="dialog-actions">
        <button
          className="outline-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(source);
              notify("代码已复制");
            } catch {
              notify("无法访问剪贴板，请选择代码手动复制");
            }
          }}
        >
          复制代码
        </button>
        <button className="primary-button" onClick={download}>
          ↓ 下载主题
        </button>
      </div>
    </Modal>
  );
}
