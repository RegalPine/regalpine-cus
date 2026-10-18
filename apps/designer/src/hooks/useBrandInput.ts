/**
 * useBrandInput — 品牌色输入管理（HEX / OKLCH / RGB / 候选色）。
 * 从 App.tsx L251-380 提取。
 *
 * 职责：
 * - HEX 输入解析与校验
 * - OKLCH 滑杆更新（通过 useSliderRAF 节流）
 * - RGB 数值输入
 * - Alpha 通道更新
 * - 候选主色提交（含色域映射）
 */
import { useCallback, useRef } from "react";
import type { OKLCH } from "@cus/core";
import {
  createOklchColor,
  hexToOklch,
  mapOklchToGamut,
  parseHex,
  rgbToOklch,
} from "@cus/color";
import { useBrandStore } from "../stores/brand-store";
import { useUIStore } from "../stores/ui-store";
import { useSliderRAF } from "./useSliderRAF";

/** 数值输入显示格式：固定精度并去除尾随零。 */
export function fmtValue(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(digits)));
}

export interface BrandInputActions {
  /** 更新品牌 HEX 输入 */
  updateBrand: (value: string) => void;
  /** 更新 OKLCH 单通道（支持离散/连续两种模式） */
  updateLch: (key: keyof OKLCH, value: number, immediate?: boolean) => void;
  /** 更新 RGB 单通道（0-255 整数输入） */
  updateRgb: (channel: "r" | "g" | "b", raw: string) => void;
  /** 更新 Alpha（0-1） */
  updateAlpha: (raw: string) => void;
  /** 提交候选主色（可选先映射到 sRGB） */
  commitCandidate: (mapFirst: boolean) => void;
  /** 直接应用 OKLCH（供外部组件如色相轮调用） */
  applyLch: (next: OKLCH) => void;
  /** 拖拽中标记（供 Slider onPointerDown/Up 绑定） */
  draggingRef: React.MutableRefObject<boolean>;
  /** 冲刷未决帧（拖拽结束时调用） */
  flushLch: () => void;
}

export function useBrandInput(currentAlpha: number): BrandInputActions {
  const notify = useUIStore((s) => s.setToast);
  const alphaRef = useRef(currentAlpha);
  alphaRef.current = currentAlpha;

  // Store selectors
  const setBrand = useBrandStore((s) => s.setBrand);
  const setDraft = useBrandStore((s) => s.setDraft);
  const setCanonicalInput = useBrandStore((s) => s.setCanonicalInput);
  const setLch = useBrandStore((s) => s.setLch);
  const setError = useBrandStore((s) => s.setError);
  const setCandidate = useUIStore((s) => s.setCandidate);

  // 核心 apply：将 OKLCH 坐标写入 store
  const applyLch = useCallback(
    (next: OKLCH) => {
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
    },
    [setCanonicalInput, setLch, setBrand, setDraft, setError],
  );

  // rAF 节流
  const { draggingRef, scheduleLch, flushLch } = useSliderRAF(applyLch);

  // HEX 输入
  const updateBrand = useCallback(
    (value: string) => {
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
    },
    [setDraft, setBrand, setCanonicalInput, setLch, setError],
  );

  // OKLCH 滑杆
  const lchRef = useRef(useBrandStore.getState().lch);
  // 保持 lchRef 同步（每次渲染更新）
  lchRef.current = useBrandStore.getState().lch;

  const updateLch = useCallback(
    (key: keyof OKLCH, value: number, immediate = false) => {
      const next = { ...lchRef.current, [key]: value };
      if (next.h === null && next.c >= 1e-7) {
        setError("无彩色没有色相，请先选择色相再增加色度。");
        return;
      }
      if (immediate) applyLch(next);
      else scheduleLch(next);
    },
    [applyLch, scheduleLch, setError],
  );

  // RGB 输入
  const updateRgb = useCallback(
    (channel: "r" | "g" | "b", raw: string) => {
      if (raw === "") return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      const currentBrand = useBrandStore.getState().brand;
      // 需要当前 result.brand.rgb，从 store 无法直接获取，通过 hex 反算
      try {
        const currentOklch = hexToOklch(currentBrand);
        const currentRgb = { r: 0, g: 0, b: 0 }; // 通过 createOklchColor 间接获取
        const color0 = createOklchColor(currentOklch, alphaRef.current);
        Object.assign(currentRgb, color0.rgb);
        const rgb = {
          ...currentRgb,
          [channel]: Math.min(1, Math.max(0, value / 255)),
        };
        const color = createOklchColor(
          rgbToOklch(rgb, "srgb"),
          alphaRef.current,
        );
        setCanonicalInput({ oklch: color.design, alpha: alphaRef.current });
        setLch(color.design);
        setBrand(color.hex);
        setDraft(color.hex);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "RGB 输入无效");
      }
    },
    [setCanonicalInput, setLch, setBrand, setDraft, setError],
  );

  // Alpha 输入
  const updateAlpha = useCallback(
    (raw: string) => {
      if (raw === "") return;
      const alpha = Number(raw);
      try {
        const currentLch = useBrandStore.getState().lch;
        const c = createOklchColor(currentLch, alpha);
        setCanonicalInput({ oklch: c.design, alpha });
        setBrand(c.hex);
        setDraft(c.hex);
        setError("");
      } catch {
        setError("Alpha 必须在 0–1 之间");
      }
    },
    [setCanonicalInput, setBrand, setDraft, setError],
  );

  // 候选色提交
  const commitCandidate = useCallback(
    (mapFirst: boolean) => {
      const candidate = useUIStore.getState().candidate;
      if (!candidate) return;
      let next: OKLCH = { l: candidate.l, c: candidate.c, h: candidate.h };
      if (mapFirst) {
        try {
          next = mapOklchToGamut(next, "srgb");
        } catch {
          /* 映射失败保持原坐标 */
        }
      }
      try {
        const color = createOklchColor(next, alphaRef.current);
        setCanonicalInput({ oklch: color.design, alpha: alphaRef.current });
        setLch(color.design);
        setBrand(color.hex);
        setDraft(color.hex);
        setError("");
        setCandidate(null);
        notify(
          mapFirst && candidate.c > next.c + 1e-9
            ? "候选已映射到 sRGB 色域后提交"
            : "候选主色已提交",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "候选提交失败");
      }
    },
    [
      notify,
      setCanonicalInput,
      setLch,
      setBrand,
      setDraft,
      setError,
      setCandidate,
    ],
  );

  return {
    updateBrand,
    updateLch,
    updateRgb,
    updateAlpha,
    commitCandidate,
    applyLch,
    draggingRef,
    flushLch,
  };
}
