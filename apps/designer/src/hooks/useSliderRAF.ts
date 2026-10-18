/**
 * useSliderRAF — 滑杆 requestAnimationFrame 节流。
 * 从 App.tsx L263-316 提取。
 *
 * §41：连续拖动时滑杆 onValueChange 以 rAF 合并到每帧一次；
 * 键盘/单次点击等离散交互立即应用，松开指针时冲刷未决帧。
 */
import { useCallback, useEffect, useRef } from "react";
import type { OKLCH } from "@cus/core";

export interface SliderRAF {
  /** 拖拽中标记（供 Slider onPointerDown/Up 绑定） */
  draggingRef: React.MutableRefObject<boolean>;
  /** 调度一次 OKLCH 更新：离散立即执行，拖拽中合并到下一帧 */
  scheduleLch: (next: OKLCH) => void;
  /** 冲刷未决帧（拖拽结束时调用） */
  flushLch: () => void;
}

export function useSliderRAF(
  applyLch: (next: OKLCH) => void,
): SliderRAF {
  const rafRef = useRef<number | null>(null);
  const pendingLchRef = useRef<OKLCH | null>(null);
  const draggingRef = useRef(false);

  const flushLch = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const target = pendingLchRef.current;
    pendingLchRef.current = null;
    if (target) applyLch(target);
  }, [applyLch]);

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

  // 卸载时清理
  useEffect(
    () => () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return { draggingRef, scheduleLch, flushLch };
}
