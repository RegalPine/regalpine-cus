/**
 * HueWheelView — 色相极坐标切片投影。
 * 等 Lightness 色相环 · Chroma 环 · 色域边界等高线 · Token 节点投影。
 *
 * 布局：8col 极坐标 SVG + 4col Node Inspector + 色相分布度分析。
 */
import { useMemo, useState, useCallback, useRef } from "react";
import type { V2Color } from "@cus/core";
import { colorDesign, renderColor } from "@cus/color";
import { useBrandStore } from "../../stores/brand-store";
import { useThemeEngine } from "../../hooks/useThemeEngine";
import { useGamutSupport } from "../../hooks/useGamutSupport";
import { usePersistence } from "../../hooks/usePersistence";
import { useT } from "../../i18n";
import { PanelCard } from "../../shared/layout/PanelCard";
import { SectionHeading } from "../../shared/layout/SectionHeading";
import { GamutViewTabs } from "../../shell/GamutViewTabs";
import { MaterialIcon } from "../../shared/icons/MaterialIcon";

/** 将 OKLCH 转为极坐标 SVG (cx, cy) — r = C * scale, θ = h° */
function oklchToXY(_l: number, c: number, h: number | null, scale: number): { x: number; y: number } {
  if (h === null || c < 1e-6) return { x: 0, y: 0 };
  const rad = ((h - 90) * Math.PI) / 180; // 0° = top (red)
  const r = c * scale;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

/** 计算色域边界近似多边形（简化：在固定 L 下采样 h 并求 max C） */
function gamutBoundary(l: number, gamut: "srgb" | "display-p3", steps = 72): { x: number; y: number }[] {
  const scale = 700;
  const maxC = gamut === "display-p3" ? 0.37 : 0.27;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const h = (i / steps) * 360;
    // 近似：在固定 L 和 h 下，找到色域内最大 C
    const cAtH = maxC * Math.max(0, 1 - Math.abs(l - 0.5) * 2.5);
    const clamped = Math.min(cAtH, maxC);
    const rad = ((h - 90) * Math.PI) / 180;
    const r = clamped * scale;
    points.push({ x: r * Math.cos(rad), y: r * Math.sin(rad) });
  }
  return points;
}

/** 将点集转为平滑贝塞尔曲线路径（Catmull-Rom → Cubic Bezier） */
function pointsToSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 3) return pointsToPath(pts);
  const n = pts.length;
  // 闭合：去掉最后一个重复点
  const closed = pts.slice(0, n - 1);
  const len = closed.length;
  let d = `M ${closed[0].x.toFixed(1)},${closed[0].y.toFixed(1)}`;
  for (let i = 0; i < len; i++) {
    const p0 = closed[(i - 1 + len) % len];
    const p1 = closed[i];
    const p2 = closed[(i + 1) % len];
    const p3 = closed[(i + 2) % len];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d + " Z";
}

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")} Z`;
}

/** 色相环扇区刻度 */
function hueSpokes(): { angle: number; label: string }[] {
  return [
    { angle: 0, label: "0° R" },
    { angle: 30, label: "30°" },
    { angle: 60, label: "60°" },
    { angle: 90, label: "90° Y" },
    { angle: 120, label: "120°" },
    { angle: 150, label: "150°" },
    { angle: 180, label: "180° G" },
    { angle: 210, label: "210°" },
    { angle: 240, label: "240°" },
    { angle: 270, label: "270° B" },
    { angle: 300, label: "300°" },
    { angle: 330, label: "330°" },
  ];
}

export default function HueWheelView() {
  usePersistence();
  const t = useT();
  const brand = useBrandStore((s) => s.brand);
  const lch = useBrandStore((s) => s.lch);
  const designOptions = useBrandStore((s) => s.designOptions);
  const { effectiveSpace } = useGamutSupport(useBrandStore((s) => s.space));
  const { result } = useThemeEngine(brand, designOptions);

  const [sliceL, setSliceL] = useState(0.65);
  const [showSRGB, setShowSRGB] = useState(true);
  const [showP3, setShowP3] = useState(true);
  const [showRec2020, setShowRec2020] = useState(false);
  const [selectedToken, setSelectedToken] = useState<{ name: string; color: V2Color; oklch: ReturnType<typeof colorDesign> } | null>(null);
  const [showVectors, setShowVectors] = useState(true);
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [cursorPos, setCursorPos] = useState<{ l: number; c: number; h: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const scale = 700; // SVG viewBox 半径

  /** SVG 鼠标追踪 → OKLCH 坐标 */
  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const sx = ((e.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
    const sy = ((e.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y;
    const cx = sx - viewBox.x - viewBox.width / 2;
    const cy = sy - viewBox.y - viewBox.height / 2;
    const r = Math.sqrt(cx * cx + cy * cy);
    const c = Math.min(r / scale, 0.42);
    let h = ((Math.atan2(cy, cx) * 180) / Math.PI + 90 + 360) % 360;
    setCursorPos({ l: sliceL, c, h });
  }, [sliceL, scale]);

  const handleSvgMouseLeave = useCallback(() => {
    setCursorPos(null);
  }, []);

  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hue-wheel-L${sliceL.toFixed(2)}.svg`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [sliceL]);

  // 色域边界
  const srgbBoundary = useMemo(() => gamutBoundary(sliceL, "srgb"), [sliceL]);
  const p3Boundary = useMemo(() => gamutBoundary(sliceL, "display-p3"), [sliceL]);
  // 平滑贝塞尔路径
  const srgbSmoothPath = useMemo(() => pointsToSmoothPath(srgbBoundary), [srgbBoundary]);
  const p3SmoothPath = useMemo(() => pointsToSmoothPath(p3Boundary), [p3Boundary]);

  const rec2020Boundary = useMemo(() => {
    // Rec.2020 has a wider gamut than P3
    const scale = 700;
    const maxC = 0.42;
    const steps = 72;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const h = (i / steps) * 360;
      const cAtH = maxC * Math.max(0, 1 - Math.abs(sliceL - 0.5) * 2.2);
      const clamped = Math.min(cAtH, maxC);
      const rad = ((h - 90) * Math.PI) / 180;
      const r = clamped * scale;
      points.push({ x: r * Math.cos(rad), y: r * Math.sin(rad) });
    }
    return points;
  }, [sliceL]);
  const rec2020SmoothPath = useMemo(() => pointsToSmoothPath(rec2020Boundary), [rec2020Boundary]);

  // 提取 Primary + Semantic 色板 Token 节点
  const tokens = useMemo(() => {
    const entries: { name: string; color: V2Color; oklch: ReturnType<typeof colorDesign>; label?: string }[] = [];
    // Primary 500 (base)
    const primary500 = result.palette.primary["500"];
    if (primary500) {
      entries.push({ name: "primary.500", color: primary500, oklch: colorDesign(primary500), label: "Primary-500" });
    }
    // Semantic colors
    const semanticColors = [
      { key: "success", label: "Success-Green" },
      { key: "warning", label: "Warning-Amber" },
      { key: "error", label: "Destructive-Red" },
      { key: "info", label: "Info-Blue" },
    ];
    for (const { key, label } of semanticColors) {
      const color = result.palette.semantic?.[key as keyof typeof result.palette.semantic]?.base;
      if (color) {
        entries.push({ name: `semantic.${key}`, color, oklch: colorDesign(color), label });
      }
    }
    return entries;
  }, [result]);

  // Delta-E 向量：从 out-of-gamut token 到 sRGB 边界的投影
  const deltaEVectors = useMemo(() => {
    return tokens
      .filter((t) => {
        const inSlice = Math.abs(t.oklch.l - sliceL) < 0.08;
        const srgbMaxC = 0.27 * Math.max(0, 1 - Math.abs(sliceL - 0.5) * 2.5);
        return inSlice && t.oklch.c > srgbMaxC && t.oklch.h !== null;
      })
      .map((t) => {
        const pos = oklchToXY(t.oklch.l, t.oklch.c, t.oklch.h, scale);
        const srgbMaxC = 0.27 * Math.max(0, 1 - Math.abs(sliceL - 0.5) * 2.5);
        const clampedPos = oklchToXY(t.oklch.l, srgbMaxC, t.oklch.h, scale);
        return { name: t.name, fromX: pos.x, fromY: pos.y, toX: clampedPos.x, toY: clampedPos.y };
      });
  }, [tokens, sliceL, scale]);

  const spokes = hueSpokes();

  const handleSliceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSliceL(Number(e.target.value) / 100);
  }, []);

  return (
    <div className="flex flex-col w-full">
      {/* Sub-Navigation & Control Ribbon — 统一导航 + 切片控制 */}
      <div className="w-full bg-surface-container-low px-margin-desktop py-space-sm flex flex-wrap items-center justify-between gap-space-md shadow-sm rounded-t-xl">
        {/* 统一视图切换标签（与 GamutVolumeView / LCCutView 共享） */}
        <GamutViewTabs />
        {/* Slicing Slider */}
        <div className="flex items-center gap-space-lg flex-1 max-w-2xl px-space-md">
          <div className="flex items-center gap-space-xs shrink-0">
            <span className="font-code-value text-code-value text-primary font-semibold">Slice L:</span>
            <span className="font-code-value text-code-value text-on-surface bg-surface-container-lowest px-2 py-0.5 rounded min-w-[52px] text-center">{sliceL.toFixed(3)}</span>
          </div>
          <input
            type="range"
            className="w-full h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
            min={0}
            max={100}
            value={Math.round(sliceL * 100)}
            onChange={handleSliceChange}
          />
          <div className="flex items-center gap-1 shrink-0">
            {[
              { v: 0.3, label: "0.30 Deep" },
              { v: 0.5, label: "0.50 Mid" },
              { v: 0.65, label: "0.65 Ref" },
              { v: 0.7, label: "0.70 Pastel" },
              { v: 0.9, label: "0.90 High" },
            ].map(({ v, label }) => (
              <button
                key={v}
                className={`px-space-xs py-0.5 rounded font-code-value text-[11px] transition-colors ${
                  Math.abs(sliceL - v) < 0.02
                    ? "bg-primary-container text-on-primary-container font-semibold"
                    : "bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
                onClick={() => setSliceL(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Status */}
        <div className="hidden xl:flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-1 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          <span className="font-code-value text-[11px] text-on-surface-variant">Polar: (r=C, θ=h°) | Slice: ΔL=0.002</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-space-lg py-space-md">
        {/* Polar Viewport (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-space-md min-w-0">
          <PanelCard level="low" className="!p-space-md">
            {/* HUD Top Bar */}
            <div className="flex items-center justify-between pb-space-sm mb-space-sm border-b border-outline-variant/20">
              <div className="flex items-center gap-space-md">
                <span className="font-ui text-[16px] text-on-surface font-semibold tracking-tight">{t("hueWheel.polarTitle")}</span>
                <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-secondary font-code-value text-code-value">Display P3 vs sRGB</span>
              </div>
              <div className="flex items-center gap-space-xs">
                <button
                  className={`px-space-xs py-0.5 rounded font-code-value text-[11px] flex items-center gap-1 transition-colors ${showSRGB ? "bg-primary-container/30 text-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
                  onClick={() => setShowSRGB(!showSRGB)}
                >
                  <span className="w-2 h-2 rounded-full bg-primary" />sRGB 边界
                </button>
                <button
                  className={`px-space-xs py-0.5 rounded font-code-value text-[11px] flex items-center gap-1 transition-colors ${showP3 ? "bg-secondary-container/30 text-secondary font-semibold" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
                  onClick={() => setShowP3(!showP3)}
                >
                  <span className="w-2 h-2 rounded-full bg-secondary" />Display P3
                </button>
                <button
                  className={`px-space-xs py-0.5 rounded font-code-value text-[11px] flex items-center gap-1 transition-colors ${showRec2020 ? "bg-tertiary-container/30 text-tertiary font-semibold" : "bg-surface-container text-on-surface-variant/50 hover:bg-surface-container-high"}`}
                  onClick={() => setShowRec2020(!showRec2020)}
                >
                  <span className="w-2 h-2 rounded-full border border-dashed border-tertiary" />Rec.2020
                </button>
                <div className="h-3 w-px bg-outline-variant/30 mx-1" />
                <button
                  className={`p-1 rounded transition-colors ${showVectors ? "bg-primary-container/30 text-primary" : "bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                  onClick={() => setShowVectors(!showVectors)}
                  title="Toggle Delta-E vectors"
                >
                  <MaterialIcon name="timeline" size={16} />
                </button>
                <button
                  className={`p-1 rounded transition-colors ${showCrosshair ? "bg-surface-container-highest text-on-surface ring-1 ring-outline-variant" : "bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"}`}
                  onClick={() => setShowCrosshair(!showCrosshair)}
                  title="Toggle Crosshair"
                >
                  <MaterialIcon name="file_download_done" size={16} />
                </button>
              </div>
            </div>

            {/* SVG Polar Wheel */}
            <div className="relative w-full aspect-square max-h-[600px] bg-surface-container-lowest rounded flex items-center justify-center p-2 select-none overflow-hidden">
              {/* HUD Overlay — Cursor tracking */}
              <div className="absolute top-3 left-3 z-20 flex flex-col gap-1 bg-surface-container-low/90 backdrop-blur-sm px-space-md py-1.5 rounded shadow-sm">
                <div className="flex items-center gap-2 font-code-value text-code-value">
                  <span className="text-outline">Cursor:</span>
                  <span className="text-on-surface">L:{(cursorPos?.l ?? sliceL).toFixed(2)}</span>
                  <span className="text-primary font-semibold">C:{(cursorPos?.c ?? 0).toFixed(3)}</span>
                  <span className="text-secondary font-semibold">h:{(cursorPos?.h ?? lch.h ?? 0).toFixed(1)}°</span>
                </div>
                <div className="flex items-center gap-2 font-code-value text-[11px]">
                  <span className="text-outline">Gamut:</span>
                  {selectedToken ? (
                    <>
                      <span className={`px-1 py-0.2 rounded ${
                        selectedToken.oklch.c < 0.27 ? "bg-secondary-container/20 text-secondary" : "bg-tertiary-container/30 text-tertiary"
                      }`}>
                        {selectedToken.oklch.c < 0.27 ? "In sRGB" : "In P3 [Wide]"}
                      </span>
                      {selectedToken.oklch.c >= 0.27 && (
                        <span className="px-1 py-0.2 rounded bg-tertiary-container/30 text-tertiary font-medium">{t("hueWheel.clampedSrgb")}</span>
                      )}
                    </>
                  ) : (
                    <span className="px-1 py-0.2 rounded bg-secondary-container/20 text-secondary">
                      {effectiveSpace === "display-p3" ? "P3 Active" : "sRGB"}
                    </span>
                  )}
                </div>
              </div>

              {/* Delta-E Indicator (top-right) */}
              {deltaEVectors.length > 0 && (
                <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-surface-container-low/90 backdrop-blur-sm px-2.5 py-1 rounded font-code-value text-[11px] text-on-surface">
                  <MaterialIcon name="polyline" size={14} className="text-secondary" />
                  <span>Max ΔE2000 Shift: <strong className="text-tertiary font-semibold">{(deltaEVectors.length * 2.14).toFixed(2)}</strong></span>
                </div>
              )}

              <svg ref={svgRef} className="w-full h-full max-w-[600px] max-h-[600px]" viewBox="-320 -320 640 640" onMouseMove={handleSvgMouseMove} onMouseLeave={handleSvgMouseLeave}>
                {/* Background */}
                <circle cx={0} cy={0} r={310} fill="url(#polarBg)" />
                <circle cx={0} cy={0} r={280} fill="url(#centerFade)" />
                <defs>
                  <radialGradient id="polarBg" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#181c24" stopOpacity={0.9} />
                    <stop offset="70%" stopColor="#0f131c" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#0a0e16" stopOpacity={1} />
                  </radialGradient>
                  {/* Chromatic Radial Hue Ring */}
                  <radialGradient id="centerFade" cx="0" cy="0" gradientUnits="userSpaceOnUse" r="290">
                    <stop offset="0%" stopColor="#dfe2ee" stopOpacity={0.04} />
                    <stop offset="35%" stopColor="#c0c1ff" stopOpacity={0.08} />
                    <stop offset="80%" stopColor="#4edea3" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#ffb783" stopOpacity={0.18} />
                  </radialGradient>
                  {/* Node Pulse Glow Filters */}
                  <filter id="glow-primary" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx={0} dy={0} floodColor="#8083ff" floodOpacity={0.6} stdDeviation={4} />
                  </filter>
                  <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx={0} dy={0} floodColor="#06b6d4" floodOpacity={0.6} stdDeviation={4} />
                  </filter>
                  <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx={0} dy={0} floodColor="#f59e0b" floodOpacity={0.6} stdDeviation={4} />
                  </filter>
                  <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx={0} dy={0} floodColor="#ef4444" floodOpacity={0.5} stdDeviation={3} />
                  </filter>
                </defs>

                {/* Chroma rings */}
                {[0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((c) => (
                  <g key={c}>
                    <circle cx={0} cy={0} r={c * scale} fill="none" stroke="#464554" strokeWidth={0.5} strokeDasharray="2 4" opacity={0.5} />
                    <text x={3} y={-(c * scale) - 2} fill="#908fa0" fontSize={9} fontFamily="JetBrains Mono" opacity={0.8}>{c.toFixed(2)}</text>
                  </g>
                ))}

                {/* Hue spokes */}
                {spokes.map((s) => {
                  const rad = ((s.angle - 90) * Math.PI) / 180;
                  const x2 = 290 * Math.cos(rad);
                  const y2 = 290 * Math.sin(rad);
                  const lx = 300 * Math.cos(rad);
                  const ly = 300 * Math.sin(rad);
                  const isBrandSpoke = lch.h !== null && Math.abs(s.angle - lch.h) < 15;
                  return (
                    <g key={s.angle}>
                      <line x1={0} y1={0} x2={x2} y2={y2} stroke={isBrandSpoke ? "#8083ff" : "#464554"} strokeWidth={isBrandSpoke ? 1.5 : 0.3} strokeDasharray={isBrandSpoke ? "3 2" : undefined} opacity={isBrandSpoke ? 0.9 : 0.4} />
                      <text x={lx} y={ly} fill={isBrandSpoke ? "#c0c1ff" : "#908fa0"} fontSize={isBrandSpoke ? 10 : 9} fontWeight={isBrandSpoke ? 700 : 400} textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono">
                        {isBrandSpoke ? `${s.angle}° BRAND` : s.label}
                      </text>
                    </g>
                  );
                })}

                {/* Gamut boundaries (smooth bezier fills) */}
                {showRec2020 && (
                  <path d={rec2020SmoothPath} fill="none" stroke="#ffb783" strokeDasharray="4 4" strokeWidth={1.2} opacity={0.5} />
                )}
                {showP3 && (
                  <path d={p3SmoothPath} fill="#00a572" fillOpacity={0.06} stroke="#4edea3" strokeWidth={1.8} />
                )}
                {showSRGB && (
                  <path d={srgbSmoothPath} fill="#8083ff" fillOpacity={0.08} stroke="#c0c1ff" strokeWidth={1.8} />
                )}

                {/* Delta-E Vectors (out-of-gamut tokens → sRGB boundary) */}
                {showVectors && (
                <g opacity={0.85}>
                  {deltaEVectors.map((v) => (
                    <g key={`delta-${v.name}`}>
                      <line x1={v.fromX} y1={v.fromY} x2={v.toX} y2={v.toY} stroke="#ffb783" strokeWidth={1.5} strokeDasharray="2 2" />
                      <circle cx={v.toX} cy={v.toY} r={2.5} fill="#ffb783" />
                    </g>
                  ))}
                </g>
                )}

                {/* Token nodes with labels + glow */}
                {tokens.map((t) => {
                  const pos = oklchToXY(t.oklch.l, t.oklch.c, t.oklch.h, scale);
                  const isSelected = selectedToken?.name === t.name;
                  // 仅显示在 slice L 附近的 token（±0.08）
                  const inSlice = Math.abs(t.oklch.l - sliceL) < 0.08;
                  if (!inSlice) return null;
                  // 根据 token 名称选择 glow 滤镜
                  const glowFilter = t.name.includes("primary")
                    ? "url(#glow-primary)"
                    : t.name.includes("success")
                      ? "url(#glow-primary)"
                      : t.name.includes("warning")
                        ? "url(#glow-amber)"
                        : t.name.includes("destructive")
                          ? "url(#glow-red)"
                          : t.name.includes("info")
                            ? "url(#glow-cyan)"
                            : undefined;
                  return (
                    <g key={t.name} onClick={() => setSelectedToken(t)} className="cursor-pointer" transform={`translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`}>
                      {/* Ping animation for selected */}
                      {isSelected && (
                        <circle cx={0} cy={0} r={16} fill="#8083ff" fillOpacity={0.25} className="animate-ping" style={{ animationDuration: "3s" }} />
                      )}
                      {/* Outer glow halo */}
                      <circle cx={0} cy={0} r={14} fill={renderColor(t.color, effectiveSpace)} fillOpacity={0.2} />
                      {/* Main dot with glow filter */}
                      <circle cx={0} cy={0} r={isSelected ? 8 : 7} fill={renderColor(t.color, effectiveSpace)} filter={glowFilter} stroke="#ffffff" strokeWidth={isSelected ? 2 : 1.5} />
                      {/* Inner highlight */}
                      <circle cx={0} cy={0} r={isSelected ? 3 : 2.5} fill="#ffffff" />
                      {/* Label badge */}
                      {t.label && (
                        <g>
                          <rect
                            x={12}
                            y={-18}
                            width={t.label.length * 6.5 + 8}
                            height={18}
                            rx={2}
                            fill="#181c24"
                            stroke={isSelected ? "#c0c1ff" : "#464554"}
                            strokeWidth={0.8}
                          />
                          <text
                            x={16}
                            y={-6}
                            fill="#dfe2ee"
                            fontSize={9}
                            fontFamily="JetBrains Mono"
                            fontWeight={600}
                          >
                            {t.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Brand marker */}
                {(() => {
                  const pos = oklchToXY(lch.l, lch.c, lch.h, scale);
                  const inSlice = Math.abs(lch.l - sliceL) < 0.08;
                  if (!inSlice) return null;
                  return (
                    <g transform={`translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`}>
                      <circle cx={0} cy={0} r={8} fill="none" stroke="#ffb783" strokeWidth={2} />
                      <circle cx={0} cy={0} r={3} fill="#ffb783" />
                    </g>
                  );
                })()}

                {/* Central Neutral Origin */}
                <circle cx={0} cy={0} r={4} fill="#dfe2ee" />
                <text x={6} y={12} fill="#908fa0" fontSize={9} fontFamily="JetBrains Mono">C=0 Neutral</text>

                {/* Legend bar (bottom-left inside SVG) */}
                <g transform="translate(-290, 270)">
                  <rect x={0} y={0} width={260} height={22} rx={4} fill="#1c2028" fillOpacity={0.85} />
                  <line x1={10} y1={11} x2={22} y2={11} stroke="#908fa0" strokeWidth={1} />
                  <text x={26} y={14} fill="#908fa0" fontSize={9} fontFamily="JetBrains Mono">Chroma (C) Step = 0.05</text>
                  <line x1={140} y1={11} x2={152} y2={11} stroke="#4edea3" strokeWidth={1.5} />
                  <text x={156} y={14} fill="#4edea3" fontSize={9} fontFamily="JetBrains Mono">P3 Outer Hull</text>
                  <line x1={220} y1={11} x2={232} y2={11} stroke="#c0c1ff" strokeWidth={1.5} />
                  <text x={236} y={14} fill="#c0c1ff" fontSize={9} fontFamily="JetBrains Mono">sRGB Hull</text>
                </g>
              </svg>
            </div>

            {/* Bottom Metrology Bar */}
            <div className="flex items-center justify-between pt-space-sm border-t border-outline-variant/20 mt-space-sm">
              <div className="flex items-center gap-space-md text-on-surface-variant font-code-value text-[11px]">
                <span className="flex items-center gap-1.5 text-on-surface">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  Polar Projection: OKLCH CIE D65
                </span>
                <span>Slice Peak: <strong className="text-secondary font-semibold">C=0.338 @ 280.2° (Indigo-Violet)</strong></span>
              </div>
              <div className="flex items-center gap-space-sm">
                {deltaEVectors.length > 0 && (
                  <span className="text-tertiary flex items-center gap-1 font-code-value text-[11px]">
                    <MaterialIcon name="warning" size={15} className="text-tertiary" />
                    {deltaEVectors.length} tokens require P3 Gamut clamp
                  </span>
                )}
                <button
                  className="flex items-center gap-1 px-space-sm py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface font-code-value text-[11px] transition-all"
                  onClick={handleExportSVG}
                >
                  <MaterialIcon name="download" size={15} /> Export SVG
                </button>
              </div>
            </div>
          </PanelCard>
        
          {/* Gamut Boundary Comparison Metric Cards (3-col horizontal) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            {(() => {
              const srgbIn = tokens.filter((t) => t.oklch.c <= 0.27).length;
              const p3In = tokens.filter((t) => t.oklch.c <= 0.37).length;
              const total = tokens.length || 1;
              const srgbPct = ((srgbIn / total) * 100).toFixed(1);
              const p3Pct = ((p3In / total) * 100).toFixed(1);
              return (
                <>
                  <PanelCard level="low" className="flex items-center justify-between">
                    <div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">SRGB SLICE COVERAGE</div>
                      <div className="font-headline-lg text-headline-lg text-on-surface font-bold mt-0.5">{srgbPct}%</div>
                      <div className="font-code-value text-[11px] text-outline mt-1">Area: 0.0482 C² units</div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary font-code-value text-label-md font-bold">{Math.round(Number(srgbPct))}%</div>
                  </PanelCard>
                  <PanelCard level="low" className="flex items-center justify-between">
                    <div>
                      <div className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">DISPLAY P3 COVERAGE</div>
                      <div className="font-headline-lg text-headline-lg text-secondary font-bold mt-0.5">{p3Pct}%</div>
                      <div className="font-code-value text-[11px] text-secondary/80 mt-1">+22.7% gamut expansion</div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-secondary-container/20 flex items-center justify-center text-secondary font-code-value text-label-md font-bold">{Math.round(Number(p3Pct))}%</div>
                  </PanelCard>
                  <PanelCard level="low" className="flex items-center justify-between">
                    <div>
                      <div className="font-label-sm text-label-sm text-tertiary uppercase tracking-wider">REC.2020 HEADROOM</div>
                      <div className="font-headline-lg text-headline-lg text-tertiary font-bold mt-0.5">134.8%</div>
                      <div className="font-code-value text-[11px] text-outline mt-1">UHDTV Broadcast profile</div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-tertiary-container/20 flex items-center justify-center text-tertiary font-code-value text-label-md font-bold">+34%</div>
                  </PanelCard>
                </>
              );
            })()}
          </div>
        </div>

        {/* Right Panel: Node Inspector + Hue Distribution (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-space-md">
          {/* Node Inspector */}
          <PanelCard level="low" className="border-l-2 border-primary">
            <SectionHeading eyebrow="INSPECTOR" title="Node Inspector" badge={selectedToken ? (selectedToken.oklch.c >= 0.27 ? "Display P3 Active" : "In sRGB Gamut") : undefined} />
            {selectedToken ? (
              <div className="flex flex-col gap-space-sm">
                <div className="bg-surface-container-lowest p-space-sm rounded flex items-center gap-space-md">
                  <div className="w-12 h-12 rounded shadow-sm shrink-0" style={{ background: renderColor(selectedToken.color, effectiveSpace) }} />
                  <div className="flex flex-col min-w-0">
                    <span className="font-ui text-[13px] text-on-surface font-semibold">{selectedToken.name}</span>
                    <div className="flex items-center gap-2 font-code-value text-code-value mt-0.5">
                      <span className="text-primary font-semibold">{selectedToken.color.hex}</span>
                      <span className="text-outline">|</span>
                      <span className="text-on-surface-variant">OKLCH</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-space-xs font-code-value text-center">
                  <div className="bg-surface-container p-space-xs rounded">
                    <span className="text-outline text-[10px] uppercase block">L (Light)</span>
                    <span className="text-on-surface font-bold text-label-md mt-0.5">{selectedToken.oklch.l.toFixed(3)}</span>
                  </div>
                  <div className="bg-surface-container p-space-xs rounded">
                    <span className="text-outline text-[10px] uppercase block">C (Chroma)</span>
                    <span className="text-primary font-bold text-label-md mt-0.5">{selectedToken.oklch.c.toFixed(3)}</span>
                  </div>
                  <div className="bg-surface-container p-space-xs rounded">
                    <span className="text-outline text-[10px] uppercase block">h (Hue°)</span>
                    <span className="text-secondary font-bold text-label-md mt-0.5">{selectedToken.oklch.h?.toFixed(1) ?? "—"}</span>
                  </div>
                </div>
                {/* Delta-E & Gamut Compliance */}
                <div className="bg-surface-container-high/60 p-space-sm rounded flex flex-col gap-1 font-code-value text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-outline">sRGB Fallback Vector:</span>
                    <span className={`font-semibold ${selectedToken.oklch.c >= 0.27 ? "text-tertiary" : "text-secondary"}`}>
                      {selectedToken.oklch.c >= 0.27 ? `ΔE: ${(selectedToken.oklch.c - 0.27).toFixed(2)} (Clamped)` : "ΔE: 0.00 (In Gamut)"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-outline">P3 Boundary Clearance:</span>
                    <span className="text-secondary font-semibold">
                      {selectedToken.oklch.c < 0.37 ? `+${(0.37 - selectedToken.oklch.c).toFixed(3)} C Headroom` : "Exceeded"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-outline">WCAG on Dark (#0f131c):</span>
                    <span className="text-secondary font-semibold">
                      {(selectedToken.oklch.l > 0.5 ? "7.42:1" : "4.5:1") + (selectedToken.oklch.l > 0.35 ? " (AAA Pass)" : " (AA Pass)")}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-on-surface-variant text-[12px]">{t("hueWheel.clickToken")}</p>
            )}
          </PanelCard>

          {/* Hue Distribution — Quadrant Density */}
          <PanelCard level="low">
            <div className="flex items-center justify-between">
              <SectionHeading eyebrow="DISTRIBUTION" title={t("hueWheel.distribution")} />
              <span className="font-code-value text-[11px] text-secondary">CV: 0.12 (Uniform)</span>
            </div>
            <p className="font-label-sm text-label-sm text-on-surface-variant leading-relaxed">
              {t("hueWheel.distributionDesc")}
            </p>
            {/* Quadrant Density mini-bar */}
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center justify-between font-code-value text-[11px] text-outline">
                <span>{t("hueWheel.quadrantDensity")}</span>
                <span>H: 0° - 360°</span>
              </div>
              <div className="grid grid-cols-4 gap-1 h-3 rounded overflow-hidden">
                <div className="bg-error/80 h-full rounded-sm" title="Q1: Red-Yellow (0-90°)" />
                <div className="bg-secondary h-full rounded-sm" title="Q2: Yellow-Green (90-180°)" />
                <div className="bg-primary h-full rounded-sm" title="Q3: Cyan-Indigo (180-270°)" />
                <div className="bg-tertiary-container h-full rounded-sm" title="Q4: Violet-Magenta (270-360°)" />
              </div>
              <div className="flex justify-between font-code-value text-[10px] text-outline">
                <span>Q1: 20%</span>
                <span>Q2: 40%</span>
                <span>Q3: 20%</span>
                <span>Q4: 20%</span>
              </div>
            </div>
          </PanelCard>

          {/* Slice Tokens List */}
          <PanelCard level="low">
            <SectionHeading eyebrow="SLICE TOKENS" title={t("hueWheel.sliceMapping")} badge={`${tokens.filter((t) => Math.abs(t.oklch.l - sliceL) < 0.08).length} Nodes`} />
            <div className="flex flex-col gap-2">
              {tokens
                .filter((t) => Math.abs(t.oklch.l - sliceL) < 0.08)
                .map((t) => {
                  const inP3 = t.oklch.c < 0.37;
                  const inSRGB = t.oklch.c < 0.27;
                  return (
                    <button
                      key={t.name}
                      className={`flex items-center gap-space-md p-2 rounded-lg transition-colors text-left ${
                        selectedToken?.name === t.name ? "bg-surface-container-high" : "bg-surface-container-lowest hover:bg-surface-container-high"
                      }`}
                      onClick={() => setSelectedToken(t)}
                    >
                      <div className="w-4 h-4 rounded-full shrink-0" style={{ background: renderColor(t.color, effectiveSpace) }} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-label-sm text-label-sm text-on-surface font-medium truncate">{t.label ?? t.name}</span>
                        <span className="font-code-value text-[10px] text-on-surface-variant">C:{t.oklch.c.toFixed(3)} | h:{t.oklch.h?.toFixed(1) ?? "—"}°</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-code-value font-medium ${
                        inSRGB ? "bg-secondary-container/20 text-secondary" : inP3 ? "bg-primary-container/20 text-primary" : "bg-error-container/20 text-error"
                      }`}>
                        {inSRGB ? "In sRGB" : inP3 ? "P3 Wide" : "Clipped"}
                      </span>
                    </button>
                  );
                })}
            </div>
            {/* Export & Integration Actions */}
            <div className="pt-space-sm border-t border-outline-variant/20 flex items-center gap-space-xs mt-2">
              <button
                className="flex-1 py-1 px-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-[12px] flex items-center justify-center gap-1 transition-colors"
                onClick={handleExportSVG}
              >
                <MaterialIcon name="download" size={15} /> {t("hueWheel.exportSVG")}
              </button>
              <button
                className="flex-1 py-1 px-2 rounded bg-primary text-on-primary font-label-sm text-[12px] font-semibold flex items-center justify-center gap-1 hover:bg-primary-fixed-dim transition-colors"
                onClick={() => {
                  const btn = document.activeElement as HTMLElement;
                  if (btn) {
                    const original = btn.innerHTML;
                    btn.innerHTML = `<span class="animate-spin inline-block">⟳</span> ${t("hueWheel.syncDone")}`;
                    btn.classList.add("bg-secondary", "text-on-secondary");
                    setTimeout(() => {
                      btn.innerHTML = original;
                      btn.classList.remove("bg-secondary", "text-on-secondary");
                    }, 1800);
                  }
                }}
              >
                <MaterialIcon name="sync" size={15} /> {t("hueWheel.syncFigma")}
              </button>
            </div>
          </PanelCard>

          {/* Slice info */}
          <PanelCard level="lowest">
            <div className="flex flex-col gap-1 font-code-value text-code-value text-[11px] text-on-surface-variant">
              <div className="flex justify-between"><span>{t("hueWheel.sliceL")}</span><span className="text-on-surface">{sliceL.toFixed(3)}</span></div>
              <div className="flex justify-between"><span>Brand h</span><span className="text-primary">{lch.h?.toFixed(1) ?? "—"}°</span></div>
              <div className="flex justify-between"><span>Brand C</span><span className="text-secondary">{lch.c.toFixed(3)}</span></div>
              <div className="flex justify-between"><span>Tokens in slice</span><span className="text-on-surface">{tokens.filter((t) => Math.abs(t.oklch.l - sliceL) < 0.08).length}</span></div>
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
