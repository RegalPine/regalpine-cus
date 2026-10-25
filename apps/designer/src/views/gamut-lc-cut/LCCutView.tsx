/**
 * LCCutView — 明度-色度笛卡尔剖面。
 * 固定色相切面 · L-C 平面 · 色域边界叠加 · Token 轨迹 · 光线追踪向量。
 *
 * 布局：8col L-C 笛卡尔 SVG + 4col 色域映射模拟器 + 明度轨迹火花图。
 */
import { useMemo, useState, useCallback } from "react";
import type { V2Color } from "@cus/core";
import { colorDesign, renderColor } from "@cus/color";
import { useBrandStore } from "../../stores/brand-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { useTokenList } from "../../hooks/useTokenList";
import { PanelCard } from "../../shared/layout/PanelCard";
import { SectionHeading } from "../../shared/layout/SectionHeading";
import { GamutViewTabs } from "../../shell/GamutViewTabs";
import { useT } from "../../i18n";
import { gamutMaxC } from "../../lib/gamut-utils";

/** 生成色域边界路径（X=Chroma, Y=Lightness） */
function gamutCutPath(h: number, gamut: "srgb" | "display-p3" | "rec2020", steps = 50): string {
  const W = 700;
  const H = 440;
  const padX = 50;
  const padY = 30;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  // 从 L=0 到 L=1 采样边界点
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const l = i / steps;
    const maxC = gamutMaxC(l, h, gamut);
    const x = padX + (maxC / 0.45) * plotW;
    const y = padY + plotH - l * plotH;
    pts.push({ x, y });
  }
  // 闭合路径：沿 achromatic 轴（x=padX）从 L=1 回到 L=0
  const parts = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  return `M ${padX},${padY + plotH} L ${parts.join(" L ")} L ${padX},${padY} Z`;
}

/** 生成 Primary Scale 轨迹样条线（cubic bezier through tone nodes） */
function buildTrajectorySpline(
  tokens: { name: string; color: V2Color; oklch: ReturnType<typeof colorDesign> }[],
  lToY: (l: number) => number,
  cToX: (c: number) => number,
): string {
  const primary = tokens
    .filter((t) => t.name.startsWith("primary."))
    .sort((a, b) => parseInt(a.name.split(".")[1]) - parseInt(b.name.split(".")[1]));
  if (primary.length < 2) return "";
  const pts = primary.map((t) => ({ x: cToX(t.oklch.c), y: lToY(t.oklch.l) }));
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** 计算 sRGB 边界上对应 L 的 max C（用于光线追踪终点） */
function srgbMaxCAtL(l: number, h: number): number {
  return gamutMaxC(l, h, "srgb");
}

export default function LCCutView() {
  usePersistence();
  const t = useT();
  const brand = useBrandStore((s) => s.brand);
  const lch = useBrandStore((s) => s.lch);
  const designOptions = useBrandStore((s) => s.designOptions);
  const { effectiveSpace } = useGamutSupport(useBrandStore((s) => s.space));
  const { result } = useThemeEngine(brand, designOptions);

  const [hueAngle, setHueAngle] = useState(lch.h ?? 275.4);
  const [showComplementary, setShowComplementary] = useState(false);
  const [selectedToken, setSelectedToken] = useState<{ name: string; color: V2Color; oklch: ReturnType<typeof colorDesign> } | null>(null);

  const W = 700;
  const H = 440;
  const padX = 50;
  const padY = 30;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  // 色域边界路径
  const srgbPath = useMemo(() => gamutCutPath(hueAngle, "srgb"), [hueAngle]);
  const p3Path = useMemo(() => gamutCutPath(hueAngle, "display-p3"), [hueAngle]);
  const rec2020Path = useMemo(() => gamutCutPath(hueAngle, "rec2020"), [hueAngle]);

  // Token 在固定色相切面上的投影
  const allTokens = useTokenList(result, "primary-neutral");

  // 在固定 h 切面上的 token（色相差 < 15° 的 token 投影到此切面）
  const projectedTokens = useMemo(() => {
    const tolerance = 15;
    return allTokens.filter((t) => {
      if (t.oklch.h === null) return false;
      const dh = Math.abs(((t.oklch.h - hueAngle + 540) % 360) - 180);
      return dh < tolerance;
    });
  }, [allTokens, hueAngle]);

  // L 坐标 → SVG y（L 向上增大，SVG y 向下增大，故反转）
  const lToY = useCallback((l: number) => padY + plotH - l * plotH, [plotH]);
  // C 坐标 → SVG x（C 向右增大）
  const cToX = useCallback((c: number) => padX + (c / 0.45) * plotW, [plotW]);

  const handleHueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHueAngle(Number(e.target.value));
  }, []);

  // 明度轨迹火花图数据
  const lSparkline = useMemo(() => {
    return projectedTokens
      .filter((t) => t.oklch.h !== null)
      .sort((a, b) => {
        const aStep = parseInt(a.name.split(".")[1]);
        const bStep = parseInt(b.name.split(".")[1]);
        return aStep - bStep;
      })
      .map((t) => t.oklch.l);
  }, [projectedTokens]);

  // Primary Scale 轨迹样条线路径
  const trajectorySpline = useMemo(() => buildTrajectorySpline(allTokens, lToY, cToX), [allTokens, lToY, cToX]);

  // Out-of-gamut tokens 的光线追踪向量数据
  const rayTraceVectors = useMemo(() => {
    return projectedTokens
      .filter((t) => {
        const srgbC = srgbMaxCAtL(t.oklch.l, hueAngle);
        return t.oklch.c > srgbC;
      })
      .map((t) => {
        const tokenX = cToX(t.oklch.c);
        const tokenY = lToY(t.oklch.l);
        const srgbC = srgbMaxCAtL(t.oklch.l, hueAngle);
        const targetX = cToX(srgbC);
        const targetY = tokenY;
        return { name: t.name, tokenX, tokenY, targetX, targetY, oklch: t.oklch };
      });
  }, [projectedTokens, hueAngle, cToX, lToY]);

  return (
    <div className="flex flex-col w-full">
      {/* Sub-header & Hue Control */}
      <section className="flex flex-col gap-space-md mb-space-lg">
        {/* View Navigation — 统一导航（与 GamutVolumeView / HueWheelView 共享） */}
        <div className="flex flex-wrap items-center justify-between gap-space-md bg-surface-container-low p-space-md rounded-xl shadow-sm">
          <GamutViewTabs />
          <div className="flex items-center gap-space-md">
            <label className="flex items-center gap-2 cursor-pointer bg-surface-container-high px-space-md py-1 rounded-lg select-none">
              <input type="checkbox" className="sr-only" checked={showComplementary} onChange={() => setShowComplementary(!showComplementary)} />
              <div
                className="w-9 h-5 rounded-full p-0.5 flex items-center transition-colors relative"
                style={{
                  background: showComplementary ? "#4edea3" : "#464554",
                  justifyContent: showComplementary ? "flex-end" : "flex-start",
                }}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" />
              </div>
              <span className="font-code-value text-code-value text-on-surface">Complementary (h + 180° = {((hueAngle + 180) % 360).toFixed(1)}°)</span>
            </label>
          </div>
        </div>

        {/* Hue Angle Calibration Bar */}
        <div className="flex flex-wrap items-center justify-between gap-space-lg bg-surface-container p-space-md rounded-xl shadow-sm">
          <div className="flex items-center gap-space-md shrink-0">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Active Hue Cut (h)</span>
            <div className="flex items-center gap-1.5 bg-surface-container-lowest px-space-md py-1 rounded font-code-value text-code-value">
              <span className="text-primary font-semibold">{hueAngle.toFixed(1)}°</span>
              <span className="text-outline text-body-sm font-body-sm">OKLCH</span>
            </div>
          </div>
          <div className="flex-1 min-w-[280px] max-w-xl flex items-center gap-space-md">
            <span className="font-code-value text-code-value text-outline">0°</span>
            <input
              type="range"
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary"
              min={0}
              max={360}
              step={0.1}
              value={hueAngle}
              onChange={handleHueChange}
              style={{ background: "linear-gradient(to right, #ff0055, #ffff00, #00ff88, #00ccff, #6366f1, #ff0055)" }}
            />
            <span className="font-code-value text-code-value text-outline">360°</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 font-code-value text-code-value">
            {[
              { angle: 0, label: "0° Red" },
              { angle: 120, label: "120° Green" },
              { angle: 180, label: "180° Cyan" },
              { angle: 275.4, label: "275.4° Indigo" },
              { angle: 300, label: "300° Violet" },
            ].map((preset) => (
              <button
                key={preset.angle}
                className={`px-2 py-1 rounded transition-colors ${
                  Math.abs(hueAngle - preset.angle) < 1
                    ? "bg-primary-container text-on-primary-container font-semibold"
                    : "bg-surface-container-low hover:bg-surface-bright text-on-surface-variant hover:text-on-surface"
                }`}
                onClick={() => setHueAngle(preset.angle)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main 2-Column Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg w-full items-start">
        {/* Hero Cartesian Visualizer (8 cols) */}
        <section className="lg:col-span-8 flex flex-col gap-space-md">
          <PanelCard level="low" className="!p-space-lg">
            {/* Meta Bar */}
            <div className="flex flex-wrap items-center justify-between gap-space-sm pb-space-xs">
              <div className="flex items-center gap-space-md">
                <span className="font-ui text-[16px] text-on-surface font-semibold flex items-center gap-2">
                  L-C Plane Slice: h = {hueAngle.toFixed(1)}°
                </span>
                <span className="px-space-sm py-0.5 rounded bg-surface-container-high text-on-surface-variant font-code-value text-code-value">Perceptual Space: OKLCH</span>
              </div>
              <div className="flex items-center gap-space-md font-code-value text-code-value">
                <div className="flex items-center gap-1.5 text-on-surface-variant"><span className="w-3 h-0.5 bg-outline" />sRGB</div>
                <div className="flex items-center gap-1.5 text-secondary"><span className="w-3 h-1 bg-secondary rounded-full" />P3</div>
                <div className="flex items-center gap-1.5 text-primary"><span className="w-3 h-0.5 border-b border-dashed border-primary" />Rec.2020</div>
              </div>
            </div>

            {/* SVG Cartesian Canvas */}
            <div className="relative w-full bg-surface-container-lowest rounded-lg p-space-md overflow-hidden select-none" style={{ aspectRatio: "16/10" }}>
              <svg className="w-full h-full" fill="none" viewBox={`0 0 ${W} ${H}`}>
                <defs>
                  <linearGradient id="p3FillGrad" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#4edea3" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#8083ff" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="srgbFillGrad" x1="0" x2="1" y1="0" y2="1">
                    <stop offset="0%" stopColor="#c0c1ff" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#181c24" stopOpacity={0.3} />
                  </linearGradient>
                  {/* Raytrace Line Marker */}
                  <marker id="rayArrow" markerHeight={6} markerWidth={6} orient="auto" refX={5} refY={3}>
                    <polygon fill="#ffb783" points="0 0, 6 3, 0 6" />
                  </marker>
                </defs>

                {/* Grid lines — Y: Lightness (horizontal), X: Chroma (vertical) */}
                {Array.from({ length: 11 }, (_, i) => {
                  const l = i / 10;
                  const y = lToY(l);
                  return (
                    <g key={`hl-${i}`}>
                      <line x1={padX} y1={y} x2={padX + plotW} y2={y} stroke="#464554" strokeWidth={0.3} opacity={0.4} />
                      <text x={padX - 8} y={y + 3} fill="#908fa0" fontSize={9} textAnchor="end" fontFamily="JetBrains Mono">{l.toFixed(1)}</text>
                    </g>
                  );
                })}
                {Array.from({ length: 10 }, (_, i) => {
                  const c = (i + 1) * 0.04;
                  const x = cToX(c);
                  return (
                    <g key={`vc-${i}`}>
                      <line x1={x} y1={padY} x2={x} y2={padY + plotH} stroke="#464554" strokeWidth={0.3} opacity={0.4} />
                      <text x={x} y={padY + plotH + 16} fill="#908fa0" fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono">{c.toFixed(2)}</text>
                    </g>
                  );
                })}

                {/* Axis labels */}
                <text x={padX + plotW / 2} y={H - 2} fill="#908fa0" fontSize={10} textAnchor="middle" fontFamily="Inter">Chroma (C)</text>
                <text x={12} y={padY + plotH / 2} fill="#908fa0" fontSize={10} textAnchor="middle" fontFamily="Inter" transform={`rotate(-90, 12, ${padY + plotH / 2})`}>Lightness (L)</text>

                {/* Gamut fills */}
                <path d={rec2020Path} fill="none" stroke="#c0c1ff" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.5} />
                <path d={p3Path} fill="url(#p3FillGrad)" stroke="#4edea3" strokeWidth={1.2} opacity={0.7} />
                <path d={srgbPath} fill="url(#srgbFillGrad)" stroke="#908fa0" strokeWidth={1} opacity={0.6} />

                {/* Gamut boundary labels */}
                <text x={cToX(gamutMaxC(0.5, hueAngle, "rec2020")) + 4} y={lToY(0.5) - 6} fill="#8083ff" fontSize={10} fontFamily="JetBrains Mono" opacity={0.8}>Rec.2020</text>
                <text x={cToX(gamutMaxC(0.5, hueAngle, "display-p3")) + 4} y={lToY(0.5) + 4} fill="#4edea3" fontSize={11} fontFamily="JetBrains Mono" fontWeight={600}>Display P3</text>
                <text x={cToX(gamutMaxC(0.45, hueAngle, "srgb")) + 4} y={lToY(0.45) - 6} fill="#c7c4d7" fontSize={11} fontFamily="JetBrains Mono">sRGB</text>

                {/* Primary Scale Trajectory Spline */}
                {trajectorySpline && (
                  <path d={trajectorySpline} fill="none" stroke="#c0c1ff" strokeWidth={2.5} opacity={0.4} strokeLinecap="round" />
                )}

                {/* Gamut Mapping Ray-Trace Vectors (out-of-gamut tokens → sRGB boundary) */}
                {rayTraceVectors.map((ray) => (
                  <g key={`ray-${ray.name}`}>
                    <line
                      x1={ray.tokenX}
                      y1={ray.tokenY}
                      x2={ray.targetX}
                      y2={ray.targetY}
                      stroke="#ffb783"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      markerEnd="url(#rayArrow)"
                    />
                    <text
                      x={(ray.tokenX + ray.targetX) / 2}
                      y={ray.tokenY - 8}
                      fill="#ffb783"
                      fontSize={9}
                      fontFamily="JetBrains Mono"
                    >
                      Ray ΔE {(ray.oklch.c - srgbMaxCAtL(ray.oklch.l, hueAngle)).toFixed(2)}
                    </text>
                  </g>
                ))}

                {/* Token nodes */}
                {projectedTokens.map((t) => {
                  const x = cToX(t.oklch.c);
                  const y = lToY(t.oklch.l);
                  const isSelected = selectedToken?.name === t.name;
                  const step = t.name.split(".")[1];
                  const isBase = step === "500";
                  const srgbC = srgbMaxCAtL(t.oklch.l, hueAngle);
                  const isOutOfSrgb = t.oklch.c > srgbC;
                  return (
                    <g key={t.name} onClick={() => setSelectedToken(t)} className="cursor-pointer">
                      {/* Out-of-sRGB pulse halo for Tone 500 */}
                      {isBase && isOutOfSrgb && (
                        <circle cx={x} cy={y} r={14} fill="#4edea3" opacity={0.25} className="animate-pulse" />
                      )}
                      <circle
                        cx={x}
                        cy={y}
                        r={isBase ? 8 : isSelected ? 7 : 5}
                        fill={renderColor(t.color, effectiveSpace)}
                        stroke={isBase && isOutOfSrgb ? "#4edea3" : isSelected ? "#fff" : "rgba(255,255,255,0.3)"}
                        strokeWidth={isBase ? 2.5 : 1.5}
                      />
                      {/* Tone 500 label box */}
                      {isBase && (
                        <>
                          <rect
                            x={x + 12}
                            y={y - 14}
                            width={138}
                            height={26}
                            rx={4}
                            fill="#181c24"
                            stroke="#4edea3"
                            strokeWidth={1}
                          />
                          <text
                            x={x + 20}
                            y={y + 3}
                            fill="#4edea3"
                            fontSize={10.5}
                            fontFamily="JetBrains Mono"
                            fontWeight={600}
                          >
                            {isOutOfSrgb ? "500 BASE: P3 ONLY" : "500 BASE"}
                          </text>
                        </>
                      )}
                      {/* Regular tone label (skip for 500 which has its own box) */}
                      {!isBase && (
                        <text x={x} y={y - 10} fill="#c7c4d7" fontSize={8} textAnchor="middle" fontFamily="JetBrains Mono">
                          {step}
                        </text>
                      )}
                      {/* P3 tag for other out-of-sRGB tokens */}
                      {isOutOfSrgb && !isBase && (
                        <text x={x + 10} y={y + 4} fill="#4edea3" fontSize={10} fontFamily="JetBrains Mono">
                          {step} (P3)
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Brand marker */}
                {(() => {
                  const x = cToX(lch.c);
                  const y = lToY(lch.l);
                  return (
                    <g>
                      <circle cx={x} cy={y} r={9} fill="none" stroke="#ffb783" strokeWidth={2} />
                      <circle cx={x} cy={y} r={3} fill="#ffb783" />
                      <line x1={x} y1={y + 12} x2={x} y2={y + 24} stroke="#ffb783" strokeWidth={0.8} strokeDasharray="2 2" />
                      <text x={x} y={y + 34} fill="#ffb783" fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono">Brand</text>
                    </g>
                  );
                })()}
              </svg>
              {/* Axis Label Badges */}
              <div className="absolute bottom-2 right-4 flex items-center gap-1 font-code-value text-code-value text-outline bg-surface-container-low px-space-sm py-0.5 rounded">
                <span>Chroma (C) →</span>
              </div>
              <div className="absolute top-3 left-16 flex items-center gap-1 font-code-value text-code-value text-outline bg-surface-container-low px-space-sm py-0.5 rounded">
                <span>↑ Lightness (L)</span>
              </div>
            </div>
          </PanelCard>

          {/* 11-Step Token Trajectory Strip */}
          <PanelCard level="low">
            <div className="flex items-center justify-between mb-space-xs">
              <SectionHeading eyebrow="TRAJECTORY" title="11-Step Primary Token Trajectory" />
              <span className="font-code-value text-code-value text-secondary">
                {rayTraceVectors.length} Out-of-sRGB Node{rayTraceVectors.length !== 1 ? "s" : ""} Detected (P3 Target)
              </span>
            </div>
            <div className="flex items-end gap-0.5">
              {Object.entries(result.palette.primary).map(([step, color]) => {
                const oklch = colorDesign(color);
                const inP3 = oklch.c < gamutMaxC(oklch.l, hueAngle, "display-p3");
                const inSRGB = oklch.c < gamutMaxC(oklch.l, hueAngle, "srgb");
                const isBase = step === "500";
                return (
                  <div
                    key={step}
                    className={`flex-1 flex flex-col items-center gap-0.5 rounded transition-colors ${
                      isBase && !inSRGB
                        ? "bg-secondary/15 ring-1 ring-secondary"
                        : !inSRGB && inP3
                          ? "bg-secondary/10"
                          : ""
                    }`}
                  >
                    <div
                      className="w-full rounded-sm shadow-sm transition-transform hover:scale-110 relative"
                      style={{
                        background: renderColor(color, effectiveSpace),
                        height: `${Math.max(16, oklch.l * 48)}px`,
                      }}
                    >
                      {isBase && !inSRGB && (
                        <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-secondary" />
                      )}
                    </div>
                    <span className={`font-code-value text-[8px] ${isBase && !inSRGB ? "text-secondary font-bold" : "text-on-surface-variant"}`}>{step}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${inSRGB ? "bg-on-surface-variant" : inP3 ? "bg-secondary" : "bg-error"}`} />
                    {!inSRGB && (
                      <span className="font-code-value text-[7px] text-secondary">{isBase ? "P3" : "P3"}</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-space-md mt-space-xs font-code-value text-[9px] text-on-surface-variant">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant" />sRGB</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-secondary" />P3</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-error" />Clipped</span>
            </div>
          </PanelCard>
        </section>

        {/* Right Panel (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-space-md">
          {/* Token Inspector */}
          <PanelCard level="low">
            <SectionHeading eyebrow="SLICE INSPECTOR" title={`h = ${hueAngle.toFixed(1)}° ${t("lcCut.sliceData")}`} />
            <div className="flex flex-col gap-2 font-code-value text-code-value text-[11px]">
              <div className="flex justify-between"><span className="text-outline">{t("lcCut.tokensInCut")}</span><span className="text-on-surface">{projectedTokens.length}</span></div>
              <div className="flex justify-between"><span className="text-outline">Max C (sRGB)</span><span className="text-on-surface">{gamutMaxC(0.5, hueAngle, "srgb").toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-outline">Max C (P3)</span><span className="text-secondary">{gamutMaxC(0.5, hueAngle, "display-p3").toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-outline">P3 Expansion</span><span className="text-primary">+{((gamutMaxC(0.5, hueAngle, "display-p3") / gamutMaxC(0.5, hueAngle, "srgb") - 1) * 100).toFixed(1)}%</span></div>
            </div>
          </PanelCard>

          {/* Selected Token Detail */}
          {selectedToken && (
            <PanelCard level="default">
              <SectionHeading eyebrow="SELECTED" title={selectedToken.name} />
              <div className="flex items-center gap-space-md">
                <div className="w-10 h-10 rounded-lg shadow-sm" style={{ background: renderColor(selectedToken.color, effectiveSpace) }} />
                <div className="grid grid-cols-3 gap-2 font-code-value text-code-value text-[11px]">
                  <div><span className="text-outline block">L</span><span className="text-on-surface font-semibold">{selectedToken.oklch.l.toFixed(3)}</span></div>
                  <div><span className="text-outline block">C</span><span className="text-primary font-semibold">{selectedToken.oklch.c.toFixed(3)}</span></div>
                  <div><span className="text-outline block">h</span><span className="text-secondary font-semibold">{selectedToken.oklch.h?.toFixed(1) ?? "—"}</span></div>
                </div>
              </div>
            </PanelCard>
          )}

          {/* L-Track Sparkline */}
          <PanelCard level="low">
            <SectionHeading eyebrow="L-TRACK" title={t("lcCut.lTrack")} />
            {lSparkline.length > 1 ? (
              <svg viewBox="0 0 200 60" className="w-full h-16">
                <polyline
                  fill="none"
                  stroke="#c0c1ff"
                  strokeWidth={1.5}
                  points={lSparkline.map((l, i) => `${(i / (lSparkline.length - 1)) * 190 + 5},${55 - l * 50}`).join(" ")}
                />
                {lSparkline.map((l, i) => (
                  <circle key={i} cx={(i / (lSparkline.length - 1)) * 190 + 5} cy={55 - l * 50} r={2} fill="#c0c1ff" />
                ))}
              </svg>
            ) : (
              <p className="text-on-surface-variant text-[12px]">{t("lcCut.noTokens")}</p>
            )}
          </PanelCard>

          {/* Gamut Mapping Simulator */}
          <PanelCard level="low">
            <SectionHeading eyebrow="MAPPING" title={t("lcCut.mappingSim")} badge={effectiveSpace === "display-p3" ? "P3 Active" : "sRGB"} />
            <div className="flex flex-col gap-3">
              {/* Strategy 1: Ray-trace */}
              <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-secondary" />
                    <span className="font-label-sm text-label-sm text-on-surface font-medium">Ray-trace to Surface</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-secondary-container/20 text-secondary font-code-value text-[10px] font-semibold">ΔE 1.2 · Optimal</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant text-[11px] leading-tight">
                  {t("lcCut.rayDesc")}
                </p>
              </div>

              {/* Strategy 2: Perceptual Desaturation */}
              <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-label-sm text-label-sm text-on-surface font-medium">{t("lcCut.perceptualScaling")}</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary font-code-value text-[10px] font-semibold">ΔE 1.8 · Smooth</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant text-[11px] leading-tight">
                  {t("lcCut.compressDesc")}
                </p>
              </div>

              {/* Strategy 3: Naive RGB Clamp */}
              <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface-container-lowest border border-error/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-error" />
                    <span className="font-label-sm text-label-sm text-on-surface font-medium">{t("lcCut.naiveClamp")}</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-error-container/20 text-error font-code-value text-[10px] font-semibold">ΔE 4.8 · Severe</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant text-[11px] leading-tight">
                  {t("lcCut.clampDesc")}
                </p>
              </div>
            </div>
          </PanelCard>

          {/* Chroma Envelope Diagnostics */}
          <PanelCard level="lowest">
            <SectionHeading eyebrow="ENVELOPE" title={t("lcCut.envelope")} badge={`h: ${hueAngle.toFixed(1)}°`} />
            <div className="flex flex-col gap-2 font-code-value text-code-value text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-outline">P3 Max Achievable</span>
                <span className="text-secondary font-semibold">C_max = {gamutMaxC(0.52, hueAngle, "display-p3").toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-outline">sRGB Max Achievable</span>
                <span className="text-on-surface font-semibold">C_max = {gamutMaxC(0.46, hueAngle, "srgb").toFixed(3)}</span>
              </div>
              <div className="h-px bg-outline-variant/20 my-1" />
              <div className="flex justify-between items-center">
                <span className="text-outline">Tone 500 Gamut Utilization</span>
                <span className="text-primary font-semibold">
                  {((lch.c / gamutMaxC(lch.l, hueAngle, effectiveSpace)) * 100).toFixed(1)}% {effectiveSpace.toUpperCase()}
                </span>
              </div>
            </div>
          </PanelCard>

          {/* Formula & Code Export */}
          <FormulaExportPanel
            hueAngle={hueAngle}
            projectedTokens={projectedTokens}
            effectiveSpace={effectiveSpace}
          />
        </div>
      </div>
    </div>
  );
}

/** Formula & Code Export sub-component */
function FormulaExportPanel({
  hueAngle,
  projectedTokens,
  effectiveSpace,
}: {
  hueAngle: number;
  projectedTokens: { name: string; color: V2Color; oklch: ReturnType<typeof colorDesign> }[];
  effectiveSpace: string;
}) {
  const notify = useUIStore((s) => s.setToast);
  const t = useT();
  const [activeTab, setActiveTab] = useState<"css" | "json" | "csv">("css");

  // Generate CSS variables
  const cssCode = useMemo(() => {
    const lines = projectedTokens.map((t) => {
      const step = t.name.split(".")[1];
      return `  --color-primary-${step}: ${t.color.hex};`;
    });
    return `:root {\n  /* L-C Cut: h = ${hueAngle.toFixed(1)}° | ${effectiveSpace.toUpperCase()} */\n${lines.join("\n")}\n}`;
  }, [projectedTokens, hueAngle, effectiveSpace]);

  // Generate Slice JSON
  const jsonCode = useMemo(() => {
    return JSON.stringify({
      slice: { hue: hueAngle, gamut: effectiveSpace },
      tokens: projectedTokens.map((t) => ({
        name: t.name,
        hex: t.color.hex,
        L: t.oklch.l.toFixed(4),
        C: t.oklch.c.toFixed(4),
        h: t.oklch.h?.toFixed(2) ?? null,
      })),
    }, null, 2);
  }, [projectedTokens, hueAngle, effectiveSpace]);

  // Generate LUT CSV
  const csvCode = useMemo(() => {
    const header = "step,name,hex,L,C,h";
    const rows = projectedTokens.map((t) => {
      const step = t.name.split(".")[1];
      return `${step},${t.name},${t.color.hex},${t.oklch.l.toFixed(4)},${t.oklch.c.toFixed(4)},${t.oklch.h?.toFixed(2) ?? ""}`;
    });
    return [header, ...rows].join("\n");
  }, [projectedTokens]);

  const codeMap = { css: cssCode, json: jsonCode, csv: csvCode };

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeMap[activeTab]);
      notify(`${activeTab.toUpperCase()} ${t("lcCut.codeCopied")}`);
    } catch {
      notify(t("lcCut.clipboardFail"));
    }
  }, [activeTab, codeMap, notify]);

  return (
    <PanelCard level="low">
      <SectionHeading eyebrow="EXPORT" title="Formula & Code Export" />
      {/* Tab switcher */}
      <div className="flex items-center bg-surface-container-lowest p-0.5 rounded-lg mb-space-sm">
        {([
          { key: "css" as const, label: "CSS Variables" },
          { key: "json" as const, label: "Slice JSON" },
          { key: "csv" as const, label: "LUT.CSV" },
        ]).map(({ key, label }) => (
          <button
            key={key}
            className={`px-space-sm py-1 rounded font-code-value text-code-value text-[11px] transition-colors ${
              activeTab === key ? "bg-surface-container-high text-on-surface font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            }`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Code block */}
      <div className="bg-surface-container-lowest p-space-md rounded-lg overflow-x-auto max-h-48">
        <pre className="font-code-value text-[11px] text-on-surface-variant whitespace-pre-wrap leading-relaxed">
          {codeMap[activeTab]}
        </pre>
      </div>
      {/* Copy button */}
      <button
        className="mt-space-sm w-full flex items-center justify-center gap-1.5 px-space-md py-1.5 rounded-lg bg-primary/10 text-primary font-label-sm text-label-sm font-medium hover:bg-primary/20 transition-colors"
        onClick={handleCopy}
      >
        {t("lcCut.copyCode")} {activeTab.toUpperCase()}
      </button>
    </PanelCard>
  );
}
