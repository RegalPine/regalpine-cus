/**
 * OKLCHPicker — 感知均匀的 OKLCH 2D 选色器。
 *
 * 主区域：色相 h（X 水平）× 色度 C（Y 垂直），固定明度 L。
 * 右侧窄条：明度 L 滑杆（垂直）。
 * 底部：色相 h 滑杆（水平）。
 * 右侧：色度 C 滑杆（垂直）。
 * Canvas 渲染网格，DOM 准星覆盖层确保滑块即时反馈。
 */
import { useRef, useEffect, useCallback, useState } from "react";
import { oklchToRgb, toHex, mapOklchToGamut } from "@cus/color";
import type { OKLCH } from "@cus/core";
import { useT } from "../i18n";

/** OKLCH → 裁剪到 sRGB 的 hex（安全版本，不抛异常） */
function oklchToHexSafe(l: number, c: number, h: number): string {
  try {
    const mapped = mapOklchToGamut({ l, c, h }, "srgb");
    const rgb = oklchToRgb(mapped, "srgb");
    return toHex({ ...rgb, alpha: 1 });
  } catch {
    try {
      const rgb = oklchToRgb({ l, c, h }, "srgb");
      return toHex({ ...rgb, alpha: 1 });
    } catch {
      const gray = Math.round(Math.max(0, Math.min(1, l)) * 255);
      return `#${gray.toString(16).padStart(2, "0").repeat(3)}`;
    }
  }
}

const HUE_STEPS = 72;
const CHROMA_STEPS = 40;
const MAX_C = 0.40;

interface OKLCHPickerProps {
  value: OKLCH;
  onChange: (oklch: OKLCH) => void;
  width?: number;
  height?: number;
}

export function OKLCHPicker({ value, onChange, width = 260, height = 200 }: OKLCHPickerProps) {
  const gridRef = useRef<HTMLCanvasElement>(null);
  const lightBarRef = useRef<HTMLCanvasElement>(null);
  const chromaBarRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<"plane" | "light" | "chroma" | null>(null);
  const t = useT();

  // 本地状态：确保滑块拖动时即时视觉反馈
  const [localC, setLocalC] = useState(value.c);
  const [localH, setLocalH] = useState(value.h ?? 0);
  const currentL = value.l;

  // 同步外部 value 变化到本地状态
  useEffect(() => {
    setLocalC(value.c);
    setLocalH(value.h ?? 0);
  }, [value.c, value.h]);

  const currentC = localC;
  const currentH = localH;

  // 准星位置（百分比）
  const crossX = (currentH / 360) * 100;
  const crossY = ((MAX_C - currentC) / MAX_C) * 100;

  // ── 渲染网格（仅 L 变化时重绘） ──
  const renderGrid = useCallback(() => {
    const canvas = gridRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cellW = w / HUE_STEPS;
    const cellH = h / CHROMA_STEPS;

    for (let xi = 0; xi < HUE_STEPS; xi++) {
      const hue = (xi / HUE_STEPS) * 360;
      for (let yi = 0; yi < CHROMA_STEPS; yi++) {
        const chroma = ((CHROMA_STEPS - yi) / CHROMA_STEPS) * MAX_C;
        const hex = oklchToHexSafe(currentL, chroma, hue);
        ctx.fillStyle = hex;
        ctx.fillRect(xi * cellW, yi * cellH, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }
  }, [currentL]);

  // ── 渲染明度条（垂直） ──
  const renderLightBar = useCallback(() => {
    const canvas = lightBarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const barW = 24;
    const x0 = (w - barW) / 2;

    for (let y = 0; y < h; y++) {
      const l = 1 - y / h;
      const hex = oklchToHexSafe(l, currentC, currentH);
      ctx.fillStyle = hex;
      ctx.fillRect(x0, y, barW, 1);
    }

    const indicatorY = (1 - currentL) * h;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 2, indicatorY);
    ctx.lineTo(x0 + barW + 2, indicatorY);
    ctx.stroke();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 1, indicatorY - 4, barW + 2, 8);
  }, [currentL, currentC, currentH]);

  // ── 渲染色度条（垂直） ──
  const renderChromaBar = useCallback(() => {
    const canvas = chromaBarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const barW = 24;
    const x0 = (w - barW) / 2;

    for (let y = 0; y < h; y++) {
      const c = ((h - y) / h) * MAX_C;
      const hex = oklchToHexSafe(currentL, c, currentH);
      ctx.fillStyle = hex;
      ctx.fillRect(x0, y, barW, 1);
    }

    const indicatorY = ((MAX_C - currentC) / MAX_C) * h;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 2, indicatorY);
    ctx.lineTo(x0 + barW + 2, indicatorY);
    ctx.stroke();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 1, indicatorY - 4, barW + 2, 8);
  }, [currentL, currentC, currentH]);

  useEffect(() => { renderGrid(); }, [renderGrid]);
  useEffect(() => { renderLightBar(); }, [renderLightBar]);
  useEffect(() => { renderChromaBar(); }, [renderChromaBar]);

  // ── 滑块变更处理：更新本地状态 + 通知父组件 ──
  const handleHChange = useCallback((newH: number) => {
    setLocalH(newH);
    onChange({ l: currentL, c: currentC, h: newH });
  }, [currentL, currentC, onChange]);

  // ── 主区域交互 ──
  const handlePlane = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = gridRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    const h = Math.max(0, Math.min(359.9, x * 360));
    const c = Math.max(0, Math.min(MAX_C, (1 - y) * MAX_C));
    setLocalC(c);
    setLocalH(h);
    onChange({ l: currentL, c, h });
  }, [currentL, onChange]);

  const handleLightBar = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = lightBarRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const y = (clientY - rect.top) / rect.height;
    const l = Math.max(0.05, Math.min(0.95, 1 - y));
    onChange({ l, c: currentC, h: currentH });
  }, [currentC, currentH, onChange]);

  const handleChromaBar = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = chromaBarRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const y = (clientY - rect.top) / rect.height;
    const c = Math.max(0, Math.min(MAX_C, (1 - y) * MAX_C));
    setLocalC(c);
    onChange({ l: currentL, c, h: currentH });
  }, [currentL, currentH, onChange]);

  // ── 拖拽生命周期 ──
  const onPointerDown = useCallback((target: "plane" | "light" | "chroma") => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    draggingRef.current = target;
    if (target === "plane") handlePlane(e);
    else if (target === "light") handleLightBar(e);
    else handleChromaBar(e);

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!draggingRef.current) return;
      const canvas = draggingRef.current === "plane" ? gridRef.current :
                     draggingRef.current === "light" ? lightBarRef.current : chromaBarRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = "touches" in ev ? ev.touches[0].clientX : ev.clientX;
      const clientY = "touches" in ev ? ev.touches[0].clientY : ev.clientY;

      if (draggingRef.current === "plane") {
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const h = Math.max(0, Math.min(359.9, x * 360));
        const c = Math.max(0, Math.min(MAX_C, (1 - y) * MAX_C));
        setLocalC(c);
        setLocalH(h);
        onChange({ l: currentL, c, h });
      } else if (draggingRef.current === "light") {
        const y = (clientY - rect.top) / rect.height;
        const l = Math.max(0.05, Math.min(0.95, 1 - y));
        onChange({ l, c: currentC, h: currentH });
      } else {
        const y = (clientY - rect.top) / rect.height;
        const c = Math.max(0, Math.min(MAX_C, (1 - y) * MAX_C));
        setLocalC(c);
        onChange({ l: currentL, c, h: currentH });
      }
    };

    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  }, [handlePlane, handleLightBar, handleChromaBar, currentL, currentC, currentH, onChange]);

  // ── 当前色预览 ──
  const previewHex = oklchToHexSafe(currentL, currentC, currentH);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider flex-1">OKLCH 选色器</span>
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded shadow-sm border border-outline-variant/30" style={{ background: previewHex }} />
          <span className="font-code-value text-[10px] text-on-surface-variant uppercase">{previewHex}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* 主体行：2D 网格 + C 垂直滑杆 + L 垂直滑杆 */}
        <div className="flex items-stretch gap-1.5">
          {/* 左侧：2D 网格 + 底部 h 水平滑杆 */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <div
              className="relative rounded-lg overflow-hidden shadow-inner border border-outline-variant/20 cursor-crosshair w-full"
              style={{ height }}
              onMouseDown={onPointerDown("plane")}
              onTouchStart={onPointerDown("plane")}
            >
              {/* 底层：色域网格 canvas（仅 L 变化时重绘） */}
              <canvas
                ref={gridRef}
                width={width}
                height={height}
                className="block w-full"
                style={{ height }}
              />

              {/* 十字参考线 */}
              <div
                className="absolute top-0 bottom-0 w-px pointer-events-none"
                style={{ left: `${crossX}%`, background: "rgba(255,255,255,0.45)" }}
              />
              <div
                className="absolute left-0 right-0 h-px pointer-events-none"
                style={{ top: `${crossY}%`, background: "rgba(255,255,255,0.45)" }}
              />

              {/* 准星圆环 */}
              <div
                className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_#000,0_1px_4px_rgba(0,0,0,0.3)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${crossX}%`, top: `${crossY}%` }}
              />

              {/* 轴标签 */}
              <span className="absolute bottom-0.5 left-1 font-code-value text-[8px] text-white/70 mix-blend-difference pointer-events-none">0°</span>
              <span className="absolute bottom-0.5 right-1 font-code-value text-[8px] text-white/70 mix-blend-difference pointer-events-none">360°</span>
              <span className="absolute top-0.5 left-1 font-code-value text-[8px] text-white/70 mix-blend-difference pointer-events-none">C:{MAX_C.toFixed(2)}</span>
            </div>

            {/* 底部：色相 h 滑杆（水平） */}
            <div className="flex items-center gap-2 px-1">
              <span className="font-code-value text-[10px] text-outline w-3">h</span>
              <input
                type="range"
                aria-label={t("picker.ariaHue")}
                min={0}
                max={360}
                step={0.1}
                value={currentH}
                onChange={(e) => handleHChange(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${oklchToHexSafe(currentL, currentC, 0)}, ${oklchToHexSafe(currentL, currentC, 60)}, ${oklchToHexSafe(currentL, currentC, 120)}, ${oklchToHexSafe(currentL, currentC, 180)}, ${oklchToHexSafe(currentL, currentC, 240)}, ${oklchToHexSafe(currentL, currentC, 300)}, ${oklchToHexSafe(currentL, currentC, 360)})`,
                }}
              />
              <span className="font-code-value text-[10px] text-on-surface w-10 text-right">{currentH.toFixed(1)}°</span>
            </div>
          </div>

          {/* 中间：色度 C 滑杆（垂直） */}
          <div className="relative rounded-lg overflow-hidden shadow-inner border border-outline-variant/20" style={{ width: 36, height }}>
            <canvas
              ref={chromaBarRef}
              width={36}
              height={height}
              className="block cursor-row-resize"
              style={{ width: 36, height }}
              onMouseDown={onPointerDown("chroma")}
              onTouchStart={onPointerDown("chroma")}
            />
            <span className="absolute top-0.5 left-1/2 -translate-x-1/2 font-code-value text-[7px] text-white/70 mix-blend-difference pointer-events-none">C</span>
          </div>

          {/* 右侧：明度 L 滑杆（垂直） */}
          <div className="relative rounded-lg overflow-hidden shadow-inner border border-outline-variant/20" style={{ width: 36, height }}>
            <canvas
              ref={lightBarRef}
              width={36}
              height={height}
              className="block cursor-row-resize"
              style={{ width: 36, height }}
              onMouseDown={onPointerDown("light")}
              onTouchStart={onPointerDown("light")}
            />
            <span className="absolute top-0.5 left-1/2 -translate-x-1/2 font-code-value text-[7px] text-white/70 mix-blend-difference pointer-events-none">L</span>
          </div>
        </div>

        {/* 数值显示 */}
        <div className="flex items-center justify-between px-1 font-code-value text-[10px] text-outline">
          <span>L: <b className="text-on-surface">{currentL.toFixed(2)}</b></span>
          <span>C: <b className="text-on-surface">{currentC.toFixed(3)}</b></span>
          <span>h: <b className="text-on-surface">{currentH.toFixed(1)}°</b></span>
        </div>
      </div>
    </div>
  );
}
