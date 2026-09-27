import {
  type OKLCH,
  type Oklab,
  type Lab,
  type RGBSpace,
  type ColorGamutStatus,
  type GamutEngine,
  type Gamut,
} from "@cus/core";
import { hexToOklch, oklchToOklab, deltaEOK } from "./oklab";
import { createOklchColor, mapOklchToGamut, maxChroma } from "./okgamut";
import { isInGamut as isInGamutRgb } from "./gamut";
import { oklchToRgb } from "./oklab";
import { deltaE76, deltaE94, deltaE2000 } from "./metrics";

/**
 * V1.1 §31：ColorEngine —— 统一色彩处理入口。
 * 将分散在 color 包各模块的 parse / convert / analyze / distance /
 * checkGamut / gamutMap 聚合为规范定义的逻辑接口。
 */
export const ColorEngine = {
  /**
   * 解析颜色输入为 UIColor（V2 设计对象）。
   * 接受 HEX 字符串或 OKLCH 坐标。
   */
  parse(value: string | OKLCH) {
    if (typeof value === "string") {
      const oklch = hexToOklch(value);
      return createOklchColor(oklch, 1, {
        id: `hex:${value}`,
        source: value,
      });
    }
    return createOklchColor(value, 1, {
      id: `oklch:${value.l}:${value.c}:${value.h}`,
      source: JSON.stringify(value),
    });
  },

  /**
   * 将 OKLCH 颜色转换到目标 RGB 空间的 CSS 表示。
   */
  convert(color: OKLCH, target: RGBSpace): string {
    const uiColor = createOklchColor(color);
    return target === "srgb"
      ? uiColor.outputs.srgb.css
      : uiColor.outputs.displayP3.css;
  },

  /**
   * 感知分析：返回 OKLCH/OKLab 坐标、色域状态与感知锚点标记。
   */
  analyze(color: OKLCH): {
    oklch: OKLCH;
    oklab: Oklab;
    gamut: ColorGamutStatus;
    anchor: boolean;
  } {
    const uiColor = createOklchColor(color);
    return {
      oklch: uiColor.design,
      oklab: oklchToOklab(uiColor.design),
      gamut: uiColor.gamut!,
      anchor: true,
    };
  },

  /**
   * 感知距离计算。按任务选择模型（§5）：
   * - `oklab`：OKLab 欧氏距离（主链路推荐），输入 OKLCH
   * - `cie76` / `cie94` / `cie2000`：CIE Lab 系列，输入 Lab
   */
  distance(
    a: OKLCH | Lab,
    b: OKLCH | Lab,
    model: "oklab" | "cie76" | "cie94" | "cie2000" = "oklab",
  ): number {
    switch (model) {
      case "oklab": {
        const oa = oklchToOklab(a as OKLCH);
        const ob = oklchToOklab(b as OKLCH);
        return deltaEOK(oa, ob);
      }
      case "cie76":
        return deltaE76(a as Lab, b as Lab);
      case "cie94":
        return deltaE94(a as Lab, b as Lab, "graphic-arts");
      case "cie2000":
        return deltaE2000(a as Lab, b as Lab);
    }
  },

  /**
   * 色域检查：判断给定 OKLCH 颜色是否在目标 RGB 空间内。
   */
  checkGamut(color: OKLCH, gamut: RGBSpace = "srgb") {
    const uiColor = createOklchColor(color);
    const output =
      gamut === "srgb" ? uiColor.outputs.srgb : uiColor.outputs.displayP3;
    return { inGamut: output.inGamut, chromaReduction: output.chromaReduction };
  },

  /**
   * 色域映射：保持 OKLCH 明度/色相，降低色度至目标色域内（§17–§18）。
   */
  gamutMap(
    color: OKLCH,
    gamut: RGBSpace = "srgb",
    _strategy: "chroma-reduction" = "chroma-reduction",
  ): OKLCH {
    return mapOklchToGamut(color, gamut);
  },
} as const;

/**
 * CUS-IMPLEMENTATION-02 §23：GamutEngine 规范接口实现。
 */
export const gamutEngine: GamutEngine = {
  isInGamut(color: OKLCH, gamut: Gamut): boolean {
    return isInGamutRgb(oklchToRgb(color, gamut));
  },
  maxChroma,
  mapToGamut(color: OKLCH, gamut: Gamut): OKLCH {
    return mapOklchToGamut(color, gamut);
  },
};
