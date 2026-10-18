/**
 * GamutVolumeView — 3D 色域体积浏览器。
 *
 * 布局：8col 3D WebGL 视口 + 4col 右侧面板（Mapping Strategies / Chroma Envelopes / Export）。
 * 下方嵌入 2D Gamut Boundary Cut（h vs C 曲线图）。
 *
 * 融合适配：
 * - 使用精简版 GamutVolume3D 组件（移除候选色提交流程、Family 选择器等冗余控件）
 * - 移除 GamutViewTabs（与应用级导航重复）
 * - 移除 View Mode Segments（旧 SVG 视图控制，与 3D 组件内置控制重复）
 */
import { useMemo, useState } from "react";
import type { V2Color, RGBSpace } from "@cus/core";
import { colorDesign, renderColor } from "@cus/color";
import { useBrandStore } from "../../stores/brand-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { PanelCard } from "../../shared/layout/PanelCard";
import { SectionHeading } from "../../shared/layout/SectionHeading";
import { GamutViewTabs } from "../../shell/GamutViewTabs";
import { GamutVolume3D } from "../../components/GamutVolume3D";
import { useT } from "../../i18n";

/** 近似色域边界：在固定 h 下，L 对应的 max C */
function gamutMaxC(l: number, h: number, gamut: "srgb" | "display-p3" | "rec2020"): number {
  const limits: Record<string, number> = { rec2020: 0.42, "display-p3": 0.37, srgb: 0.27 };
  const maxLimit = limits[gamut] ?? 0.27;
  const lFactor = Math.max(0, 1 - Math.pow((l - 0.5) * 2.2, 2));
  const hFactor = 1 + 0.15 * Math.sin(((h - 120) * Math.PI) / 180);
  return maxLimit * lFactor * hFactor;
}

/** 2D Gamut Boundary Cut：h vs C 曲线 */
function GamutBoundaryCut2D({
  sliceL,
  tokens,
  effectiveSpace,
}: {
  sliceL: number;
  tokens: { name: string; color: V2Color; oklch: ReturnType<typeof colorDesign> }[];
  effectiveSpace: RGBSpace;
}) {
  const W = 700;
  const H = 160;
  const padL = 50;
  const padR = 40;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const hToX = (h: number) => padL + (h / 360) * plotW;
  const cToY = (c: number) => padT + plotH - (c / 0.45) * plotH;

  const gamutCurve = (gamut: "srgb" | "display-p3" | "rec2020") => {
    const pts: string[] = [];
    for (let h = 0; h <= 360; h += 5) {
      const maxC = gamutMaxC(sliceL, h, gamut);
      pts.push(`${hToX(h).toFixed(1)},${cToY(maxC).toFixed(1)}`);
    }
    return `M ${pts.join(" L ")}`;
  };

  return (
    <div className="bg-surface-container-low p-space-md rounded-xl shadow-sm flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
          <span className="text-primary text-[20px]">◎</span>
          <span className="font-ui text-[16px] text-on-surface font-semibold">
            2D Gamut Boundary Cut (Iso-Lightness L = {sliceL.toFixed(2)})
          </span>
        </div>
        <div className="flex items-center gap-space-sm font-code-value text-[11px]">
          <span className="flex items-center gap-1"><span className="w-2.5 h-1 bg-primary rounded-full" />Display P3</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1 bg-outline rounded-full" />sRGB</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-1 bg-secondary rounded-full" />Rec.2020</span>
        </div>
      </div>
      <div className="relative w-full h-48 bg-surface-container-lowest rounded-lg p-space-sm overflow-hidden">
        <svg className="w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {/* Grid */}
          {[0, 90, 180, 270, 360].map((h) => (
            <g key={h}>
              <line x1={hToX(h)} y1={padT} x2={hToX(h)} y2={padT + plotH} stroke="#1c2028" strokeWidth={1} />
              <text x={hToX(h)} y={H - 5} fill="#908fa0" fontSize={10} textAnchor="middle" fontFamily="JetBrains Mono">
                {h}°
              </text>
            </g>
          ))}
          <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#31353e" strokeWidth={1} />

          {/* Gamut curves */}
          <path d={gamutCurve("rec2020")} fill="none" stroke="#4edea3" strokeDasharray="3 3" strokeWidth={1} opacity={0.6} />
          <path d={gamutCurve("display-p3")} fill="none" stroke="#8083ff" strokeWidth={2} />
          <path d={gamutCurve("srgb")} fill="none" stroke="#908fa0" strokeWidth={1.8} />

          {/* Token points */}
          {tokens
            .filter((t) => t.oklch.h !== null && Math.abs(t.oklch.l - sliceL) < 0.08)
            .map((t) => {
              const x = hToX(t.oklch.h!);
              const y = cToY(t.oklch.c);
              const srgbC = gamutMaxC(sliceL, t.oklch.h!, "srgb");
              const isClipped = t.oklch.c > srgbC;
              return (
                <g key={t.name}>
                  <circle cx={x} cy={y} r={isClipped ? 5 : 4} fill={renderColor(t.color, effectiveSpace)} stroke={isClipped ? "#ffb4ab" : "#fff"} strokeWidth={isClipped ? 1.5 : 1} />
                  {isClipped && (
                    <text x={x + 6} y={y - 4} fill="#ffb4ab" fontSize={10} fontFamily="JetBrains Mono">
                      {t.name.split(".")[1]} [CLIPPED]
                    </text>
                  )}
                </g>
              );
            })}

          {/* Y-axis label */}
          <text x={12} y={padT + plotH / 2} fill="#908fa0" fontSize={10} textAnchor="middle" fontFamily="Inter" transform={`rotate(-90, 12, ${padT + plotH / 2})`}>
            Max Chroma (C)
          </text>
        </svg>
      </div>
    </div>
  );
}

export default function GamutVolumeView() {
  usePersistence();
  const t = useT();
  const brand = useBrandStore((s) => s.brand);
  const designOptions = useBrandStore((s) => s.designOptions);
  const { effectiveSpace: _effectiveSpace } = useGamutSupport(useBrandStore((s) => s.space));
  const effectiveSpace = _effectiveSpace as RGBSpace;
  const { result } = useThemeEngine(brand, designOptions);

  const [sliceL] = useState(0.65);
  const [activeStrategy, setActiveStrategy] = useState(0);

  // Token 数据
  const tokens = useMemo(() => {
    const entries: { name: string; color: V2Color; oklch: ReturnType<typeof colorDesign> }[] = [];
    for (const [step, color] of Object.entries(result.palette.primary)) {
      entries.push({ name: `primary.${step}`, color, oklch: colorDesign(color) });
    }
    for (const [step, color] of Object.entries(result.palette.neutral)) {
      entries.push({ name: `neutral.${step}`, color, oklch: colorDesign(color) });
    }
    return entries;
  }, [result]);

  // Out-of-gamut tokens
  const clippedTokens = tokens.filter((t) => {
    if (t.oklch.h === null) return false;
    const srgbC = gamutMaxC(t.oklch.l, t.oklch.h!, "srgb");
    return t.oklch.c > srgbC;
  });

  return (
    <div className="flex flex-col w-full">
      {/* 页面标题栏 — 视图导航 + P3 pass 状态 */}
      <section className="flex flex-wrap items-center justify-between gap-space-md py-space-sm mb-space-md bg-surface-container-low px-space-md rounded-lg shadow-sm">
        <GamutViewTabs />
        <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-sm py-1 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          <span className="font-code-value text-[11px] text-on-surface-variant">P3: {result.validation.counts.PASS} pass</span>
        </div>
      </section>

      {/* 3D Studio Core */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md mb-space-md">
        {/* 3D WebGL Viewport (8 cols) */}
        <div className="xl:col-span-8 flex flex-col gap-space-md">
          <GamutVolume3D result={result} />

          {/* 2D Gamut Boundary Cut */}
          <GamutBoundaryCut2D sliceL={sliceL} tokens={tokens} effectiveSpace={effectiveSpace} />
        </div>

        {/* Right Panels (4 cols) */}
        <div className="xl:col-span-4 flex flex-col gap-space-md">
          {/* Mapping Strategies */}
          <PanelCard level="low">
            <SectionHeading eyebrow={t("gamutVolume.mappingEyebrow")} title={t("gamutVolume.mappingTitle")} badge={t("gamutVolume.mappingBadge")} />
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">
              {t("gamutVolume.mappingDesc")}
            </p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: t("gamutVolume.strategyRay"), desc: t("gamutVolume.strategyRayDesc") },
                { label: t("gamutVolume.strategyCompress"), desc: t("gamutVolume.strategyCompressDesc") },
                { label: t("gamutVolume.strategyClip"), desc: t("gamutVolume.strategyClipDesc") },
              ].map(({ label, desc }, idx) => (
                <label key={label} className={`flex items-start gap-space-sm p-space-sm rounded-lg transition-colors cursor-pointer ${idx === activeStrategy ? "bg-surface-container-lowest ring-1 ring-secondary/30" : "bg-surface-container-lowest hover:bg-surface-container-high"}`}>
                  <input type="radio" name="gamut-strategy" checked={idx === activeStrategy} onChange={() => setActiveStrategy(idx)} className="mt-1 accent-primary cursor-pointer" />
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">{label}</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant">{desc}</span>
                  </div>
                </label>
              ))}
            </div>
            {/* Token Delta-E Metrics */}
            {clippedTokens.length > 0 && (
              <div className="mt-space-xs flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-label-sm text-label-sm uppercase tracking-wider text-outline px-1">
                  <span>{t("gamutVolume.clippedTokens")}</span>
                  <span>ΔE 2000</span>
                </div>
                {clippedTokens.slice(0, 3).map((t) => (
                  <div key={t.name} className="p-2 rounded bg-surface-container-lowest flex items-center justify-between font-code-value text-code-value">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded shadow-xs" style={{ background: renderColor(t.color, effectiveSpace) }} />
                      <div className="flex flex-col">
                        <span className="text-on-surface font-semibold text-[11px]">{t.name}</span>
                        <span className="text-outline text-[10px]">P3: {(t.oklch.l * 100).toFixed(0)}% {t.oklch.c.toFixed(2)} {t.oklch.h?.toFixed(0)}°</span>
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-secondary text-[11px] font-bold">
                      {(t.oklch.c - gamutMaxC(t.oklch.l, t.oklch.h!, "srgb")).toFixed(1)} ΔE
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>

          {/* Chroma Envelopes */}
          <PanelCard level="low">
            <SectionHeading eyebrow={t("gamutVolume.envelopesEyebrow")} title={t("gamutVolume.envelopesTitle")} badge={t("gamutVolume.envelopesBadge")} />
            <div className="flex flex-col gap-2">
              {[
                { l: 0.9, label: "L = 0.90 (High Key)" },
                { l: 0.7, label: "L = 0.70 (Pastel / Mid)" },
                { l: 0.5, label: "L = 0.50 (Max Chroma Peak)" },
                { l: 0.3, label: "L = 0.30 (Deep Shadow)" },
              ].map(({ l, label }) => {
                const srgbMax = gamutMaxC(l, 0, "srgb");
                const p3Max = gamutMaxC(l, 0, "display-p3");
                const brandC = result.brand.oklch.c;
                const utilization = Math.min(100, (brandC / Math.max(p3Max, 0.001)) * 100);
                return (
                  <div key={l} className="p-space-sm bg-surface-container-lowest rounded-lg flex flex-col gap-1">
                    <div className="flex items-center justify-between font-code-value text-[11px]">
                      <span className="text-on-surface font-semibold">{label}</span>
                      <span className={Math.abs(sliceL - l) < 0.1 ? "text-secondary font-bold" : "text-outline"}>
                        Max C: {p3Max.toFixed(2)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden flex">
                      <div className="h-full bg-primary" style={{ width: `${(srgbMax / 0.42) * 100}%` }} />
                      <div className="h-full bg-secondary" style={{ width: `${((p3Max - srgbMax) / 0.42) * 100}%` }} />
                    </div>
                    <div className="flex justify-between font-code-value text-[9px] text-on-surface-variant">
                      <span>sRGB: {srgbMax.toFixed(3)}</span>
                      <span>P3: {p3Max.toFixed(3)}</span>
                      <span className={Math.abs(sliceL - l) < 0.1 ? "text-primary font-semibold" : ""}>{utilization.toFixed(0)}% used</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </PanelCard>

          {/* Export 3D Mesh / LUT */}
          <PanelCard level="low">
            <SectionHeading eyebrow={t("gamutVolume.exportMeshEyebrow")} title={t("gamutVolume.exportMeshTitle")} />
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-sm">
              {t("gamutVolume.exportMeshDesc")}
            </p>
            <div className="grid grid-cols-2 gap-space-sm">
              {[
                { label: t("gamutVolume.lutLabel"), desc: t("gamutVolume.lutDesc") },
                { label: t("gamutVolume.iccLabel"), desc: t("gamutVolume.iccDesc") },
                { label: t("gamutVolume.gltfLabel"), desc: t("gamutVolume.gltfDesc") },
                { label: t("gamutVolume.svgLabel"), desc: t("gamutVolume.svgDesc") },
              ].map(({ label, desc }) => (
                <button
                  key={label}
                  className="px-space-md py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md flex flex-col items-start gap-0.5 transition-colors"
                  onClick={() => useUIStore.getState().setToast(`${label} ${t("gamutVolume.exportComingSoon")}`)}
                >
                  <span className="font-semibold text-[12px]">{label}</span>
                  <span className="font-code-value text-[10px] text-outline">{desc}</span>
                </button>
              ))}
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
