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

const values = (value: object) =>
  Object.values(value)
    .map((v) => (typeof v === "number" ? v.toFixed(6) : "不适用"))
    .join(" / ");
export function ColorInspector({
  color,
  result,
}: {
  color: V2Color;
  result: GeneratedTheme;
}) {
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
    contrast = "不适用：缺少不透明画布";
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
              <th>空间</th>
              <th>设计源</th>
              <th>映射计算值</th>
              <th>实际渲染值</th>
            </tr>
          </thead>
          <tbody>
            {(["oklch", "oklab", "xyz", "lab", "lch"] as const).map((key) => (
              <tr key={key}>
                <th>{key}</th>
                <td>{values(designValues[key])}</td>
                <td>{values(out.calculation[key])}</td>
                <td>{values(out.rendered[key])}</td>
              </tr>
            ))}
            <tr>
              <th>RGB ({space})</th>
              <td>不适用</td>
              <td>{values(out.calculation.rgb)}</td>
              <td>{values(out.rendered.rgb)}</td>
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
                  ? "设计色域内"
                  : status === "NEAR_GAMUT_BOUNDARY"
                    ? "接近色域边界"
                    : "设计色域外，已映射"}{" "}
                · 色度压缩 {(output.chromaReduction * 100).toFixed(3)}%
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
        对比背景{" "}
        <select
          aria-label="检查器背景"
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
        实际合成对比度：{contrast} · 编码 RGB Alpha 合成；P3 指标不等同完整 WCAG
        认证。
      </p>
      <details>
        <summary>V2.5 Quality 诊断</summary>
        <QualityDiagnostics color={color} />
      </details>
      <details>
        <summary>来源与真实验证</summary>
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
    return <p>Quality 诊断不可用：颜色坐标无效</p>;
  }
  
  const metrics = [
    { name: "Hue Stability", metric: qualityResult.hueStability },
    { name: "Chroma Adequacy", metric: qualityResult.chromaAdequacy },
    { name: "Lightness Adequacy", metric: qualityResult.lightnessAdequacy },
    { name: "Gamut Efficiency", metric: qualityResult.gamutEfficiency },
    { name: "Perceptual Separation", metric: qualityResult.perceptualSeparation },
    { name: "Context Compatibility", metric: qualityResult.contextCompatibility },
  ];
  
  return (
    <div className="quality-diagnostics">
      <p>
        <strong>整体状态：</strong>{" "}
        <span className={`quality-status-${qualityResult.valid ? "pass" : "fail"}`}>
          {qualityResult.valid ? "✓ 通过" : "✗ 失败"}
        </span>
      </p>
      <table className="metrics-table">
        <thead>
          <tr>
            <th>指标</th>
            <th>状态</th>
            <th>值</th>
            <th>原因</th>
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
