/**
 * useGamutSupport — Display P3 / sRGB 色域能力检测。
 * 从 App.tsx L156-167 提取。
 */
import { useEffect, useState } from "react";
import type { RGBSpace } from "@cus/core";

export interface GamutSupport {
  /** 用户选择的色域空间 */
  space: RGBSpace;
  /** 浏览器是否真正支持 P3 渲染 */
  p3Supported: boolean;
  /** 实际生效的色域（P3 不支持时回退 sRGB） */
  effectiveSpace: RGBSpace;
  /** 更新用户选择的色域 */
  setSpace: (space: RGBSpace) => void;
}

export function useGamutSupport(initialSpace: RGBSpace = "srgb"): GamutSupport {
  const [space, setSpace] = useState<RGBSpace>(initialSpace);
  const [p3Supported, setP3Supported] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(color-gamut: p3)");
    const update = () =>
      setP3Supported(
        CSS.supports("color", "color(display-p3 1 0 0)") && media.matches,
      );
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const effectiveSpace: RGBSpace =
    space === "display-p3" && p3Supported ? space : "srgb";

  return { space, p3Supported, effectiveSpace, setSpace };
}
