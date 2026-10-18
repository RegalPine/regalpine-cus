import { useState } from "react";
import type { V2Color, GeneratedTheme, ColorContext, ColorRole } from "@cus/core";
import {
  colorDesign,
  colorOutput,
  deltaEOK,
  deltaE2000,
  gamutStatus,
  oklchToOklab,
  oklabToXyz,
  xyzToLab,
  labToLch,
  outputPair,
  renderColor,
} from "@cus/color";
import { resolveToken } from "@cus/theme";
import { validateColorQuality } from "@cus/validation";
import { usePreviewSpace } from "./PreviewSpace";
import { useT } from "../i18n";

const values = (value: object, naText: string) =>
  Object.values(value)
    .map((v) => (typeof v === "number" ? v.toFixed(6) : naText))
    .join(" / ");
export function ColorInspector({
  color,
  result,
}: {
  color: V2Color;
  result: GeneratedTheme;
}) {
  const t = useT();
  const space = usePreviewSpace();
  const [background, setBackground] = useState("surface.default");
  const mode = color.provenance?.mode ?? "light";
  const tokens = result.theme[mode] ?? result.theme.light ?? result.theme.dark!;
  const out = colorOutput(color, space),
    design = colorDesign(color),
    oklab = oklchToOklab(design),
    xyz = oklabToXyz(oklab),
    lab = xyzToLab(xyz);
  const designValues = { oklch: design, oklab, xyz, lab, lch: labToLch(lab) };
  const bg = resolveToken(tokens, background);
  let contrast: string;
  try {
    contrast = outputPair(
      color,
      bg,
      space,
      resolveToken(tokens, "surface.default"),
    ).contrast.toFixed(3);
  } catch {
    contrast = t("inspector.naCanvas");
  }
  return (
    <div className="color-inspector">
      <div className="inspector-hero">
        <div
          className="inspected-color"
          style={{ background: renderColor(color, space) }}
        />
        <div className="inspector-hero-info">
          <div className="inspector-hex-row">
            <code className="inspector-hex">{color.hex}</code>
            <span className="inspector-space-tag">{space}</span>
          </div>
          <p className="inspector-css">
            <code>{out.css}</code>
          </p>
          <p className="inspector-alpha">
            Alpha <output>{out.calculation.alpha}</output>
          </p>
        </div>
      </div>
      <div className="token-table">
        <table className="metrics-table">
          <thead>
            <tr>
              <th>{t("inspector.space")}</th>
              <th>{t("inspector.designSrc")}</th>
              <th>{t("inspector.mappedVal")}</th>
              <th>{t("inspector.renderedVal")}</th>
            </tr>
          </thead>
          <tbody>
            {(["oklch", "oklab", "xyz", "lab", "lch"] as const).map((key) => (
              <tr key={key}>
                <th>{key}</th>
                <td>{values(designValues[key], t("inspector.na"))}</td>
                <td>{values(out.calculation[key], t("inspector.na"))}</td>
                <td>{values(out.rendered[key], t("inspector.na"))}</td>
              </tr>
            ))}
            <tr>
              <th>RGB ({space})</th>
              <td>{t("inspector.na")}</td>
              <td>{values(out.calculation.rgb, t("inspector.na"))}</td>
              <td>{values(out.rendered.rgb, t("inspector.na"))}</td>
            </tr>
            <tr>
              <th>Alpha</th>
              <td>{out.calculation.alpha}</td>
              <td>{out.calculation.alpha}</td>
              <td>{out.rendered.alpha}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="inspector-outputs">
        {(["srgb", "display-p3"] as const).map((target) => {
          const output = colorOutput(color, target);
          // §12：三态实时色域状态（含接近边界）。
          const status = gamutStatus(design, target);
          return (
            <section key={target}>
              <h4>{target}</h4>
              <p>
                {status === "IN_GAMUT"
                  ? t("inspector.inGamut")
                  : status === "NEAR_GAMUT_BOUNDARY"
                    ? t("inspector.nearBoundary")
                    : t("inspector.outOfGamut")}{" "}
                · {t("inspector.chromaCompress")} {(output.chromaReduction * 100).toFixed(3)}%
              </p>
              <p>
                ΔEOK {deltaEOK(oklab, output.rendered.oklab).toFixed(6)} · ΔE00{" "}
                {deltaE2000(lab, output.rendered.lab).toFixed(4)}
              </p>
            </section>
          );
        })}
      </div>
      <label>
        {t("inspector.contrastBg")}{" "}
        <select
          aria-label={t("inspector.ariaBg")}
          value={background}
          onChange={(e) => setBackground(e.target.value)}
        >
          {[
            "surface.default",
            "surface.raised",
            "surface.sunken",
            "action.primary",
          ].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <p>
        {t("inspector.compositeContrast")}：{contrast} · {t("inspector.compositeNote")}
      </p>
      <details>
        <summary>{t("inspector.qualityDiag")}</summary>
        <QualityDiagnostics color={color} />
      </details>
      <details>
        <summary>{t("inspector.provenance")}</summary>
        <pre className="inspector-css">
          {JSON.stringify(color.provenance, null, 2)}
        </pre>
        <ul>
          {result.validation.results
            .filter((r) => r.colorIds?.includes(color.provenance?.id ?? ""))
            .map((r) => (
              <li key={r.id}>
                {r.status} · {r.message}
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}

function QualityDiagnostics({ color }: { color: V2Color }) {
  const t = useT();
  const design = colorDesign(color);
  // 从 provenance.id 推断 role（如 "primary.500" → "primary"）
  const idParts = color.provenance?.id?.split(".") ?? [];
  const role = (idParts[0] ?? "primary") as ColorRole;
  const theme = color.provenance?.mode ?? "light";
  
  let qualityResult;
  try {
    const ctx: ColorContext = {
      color: design,
      role,
      theme,
    };
    qualityResult = validateColorQuality(ctx);
  } catch {
    return <p>{t("inspector.qualityUnavailable")}</p>;
  }
  
  const metrics = [
    { name: t("inspector.hueStability"), metric: qualityResult.hueStability },
    { name: t("inspector.chromaAdequacy"), metric: qualityResult.chromaAdequacy },
    { name: t("inspector.lightnessAdequacy"), metric: qualityResult.lightnessAdequacy },
    { name: t("inspector.gamutEfficiency"), metric: qualityResult.gamutEfficiency },
    { name: t("inspector.perceptualSeparation"), metric: qualityResult.perceptualSeparation },
    { name: t("inspector.contextCompat"), metric: qualityResult.contextCompatibility },
  ];
  
  return (
    <div className="quality-diagnostics">
      <p>
        <strong>{t("inspector.overallStatus")}</strong>{" "}
        <span className={`quality-status-${qualityResult.valid ? "pass" : "fail"}`}>
          {qualityResult.valid ? t("inspector.pass") : t("inspector.fail")}
        </span>
      </p>
      <table className="metrics-table">
        <thead>
          <tr>
            <th>{t("inspector.metric")}</th>
            <th>{t("inspector.statusCol")}</th>
            <th>{t("inspector.valueCol")}</th>
            <th>{t("inspector.reasonCol")}</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(({ name, metric }) => (
            <tr key={name}>
              <th>{name}</th>
              <td>
                <span className={`quality-status-${metric.status}`}>
                  {metric.status === "pass" ? "✓" : metric.status === "warning" ? "⚠" : "✗"}
                </span>
              </td>
              <td>{metric.value !== undefined ? metric.value.toFixed(4) : "—"}</td>
              <td>{metric.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
