import { useMemo, useState } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import {
  SEMANTIC_ROLES,
  type V2Color,
  type GeneratedTheme,
  type OutputOptions,
  type ThemeMode,
} from "@cus/core";
import { exportTheme, type ExportFormat } from "@cus/export";
import { Modal } from "../components/Modal";
import { usePreviewSpace } from "../components/PreviewSpace";
import { renderColor, colorDesign, deltaEOK, oklchToOklab } from "@cus/color";
import { resolveToken } from "@cus/theme";
import { ColorSwatch } from "@cus/ui";
import { useT } from "../i18n";

function ModeDifference({ light, dark }: { light?: V2Color; dark?: V2Color }) {
  const space = usePreviewSpace();
  const t = useT();
  if (!light || !dark) return <span>{t("panel.notApplicable")}</span>;
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
      {h === null ? t("panel.notApplicableShort") : h.toFixed(2) + "°"} · ΔEOK{" "}
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
  const t = useT();
  const labels = {
    primary: [t("panel.primary"), "PRIMARY"],
    secondary: [t("panel.secondary"), "SECONDARY"],
    accent: [t("panel.accent"), "ACCENT"],
    neutral: [t("panel.neutral"), "NEUTRAL"],
  } as const;
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
        <span>{t("panel.semantic")}</span>
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
        <span className="strip-note">{t("panel.clickHint")}</span>
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
  const t = useT();
  return (
    <section className="token-panel">
      <div className="section-heading">
        <h3>{t("panel.tokenRef")}</h3>
      </div>
      <input
        className="search-input"
        aria-label={t("panel.searchToken")}
        placeholder={t("panel.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="token-table">
        <table>
          <thead>
            <tr>
              <th>{t("panel.tokenCol")}</th>
              <th>{t("panel.refCol")}</th>
              <th>{t("panel.renderCol")}</th>
              <th>{t("panel.diffCol")}</th>
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
  const t = useT();
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
    notify(`${t("export.downloaded")} ${format.toUpperCase()} ${t("export.themeSuffix")}`);
  }
  return (
    <Modal
      title={t("export.title")}
      onClose={onClose}
      className="export-modal"
    >
      <p className="muted">
        {t("export.desc")}
      </p>
      <div className="export-toolbar">
        <ToggleGroup.Root
          type="single"
          className="segmented"
          aria-label={t("export.formatLabel")}
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
                aria-label={m === "light" ? t("export.light") : t("export.dark")}
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
              {m === "light" ? t("export.light") : t("export.dark")}
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
        <span>{t("export.srgbFallback")}</span>
      </div>
      <textarea
        className="export-source"
        aria-label={t("export.codeLabel")}
        readOnly
        value={source}
        spellCheck={false}
      />
      <p className="export-note">
        {result.validation.counts.FAIL
          ? `${t("export.warning")}${result.validation.counts.FAIL}${t("export.failSuffix")}`
          : `${t("export.passInfo")}${result.validation.counts.PASS}${t("export.passSuffix")}${result.validation.counts.WARN}${t("export.warnSuffix")}`}{" "}
        {t("export.jsonHint")}
      </p>
      <div className="dialog-actions">
        <button
          className="outline-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(source);
              notify(t("export.copied"));
            } catch {
              notify(t("export.clipboardFail"));
            }
          }}
        >
          {t("export.copyCode")}
        </button>
        <button className="primary-button" onClick={download}>
          {t("export.download")}
        </button>
      </div>
    </Modal>
  );
}
