/**
 * CUS-IMPLEMENTATION-01 §14：ColorConverter 多态转换接口。
 *
 * 提供规范定义的多态颜色转换 facade：接收 `Color { space, coordinates }`，
 * 根据 `space` 字段分发到对应的底层转换函数。
 */
import type {
  Color,
  ColorSpace,
  OklchColor,
  XYZ,
  Lab,
  LCh,
  Oklab,
  OKLCH,
  RGB,
} from "@cus/core";
import { rgbToXyz, xyzToRgb } from "./xyz";
import { xyzToLab, labToXyz } from "./lab";
import { labToLch, lchToLab } from "./lch";
import {
  xyzToOklab,
  oklabToXyz,
  oklabToOklch,
  oklchToOklab,
  oklchToRgb,
} from "./oklab";

/**
 * 规范 §14 多态转换接口。
 * 每个方法接收规范 Color 类型并按 space 字段分发。
 */
export interface ColorConverterFacade {
  toXYZ(color: Color): XYZ;
  toLab(color: Color): Lab;
  toLch(color: Color): LCh;
  toOklab(color: Color): Oklab;
  toOklch(color: Color): OKLCH;
  fromOklch(color: OklchColor, target: ColorSpace): Color;
}

// ─── 内部辅助：从 Color 提取各空间坐标 ──────────────────────────────────────

function colorToRgb(color: Color): RGB {
  switch (color.space) {
    case "srgb":
    case "display-p3":
      return { r: color.coordinates[0], g: color.coordinates[1], b: color.coordinates[2] };
    case "xyz-d65":
      return xyzToRgb({ x: color.coordinates[0], y: color.coordinates[1], z: color.coordinates[2] });
    case "lab": {
      const xyz = labToXyz({ l: color.coordinates[0], a: color.coordinates[1], b: color.coordinates[2] });
      return xyzToRgb(xyz);
    }
    case "lch": {
      const lab = lchToLab({ l: color.coordinates[0], c: color.coordinates[1], h: color.coordinates[2] });
      return xyzToRgb(labToXyz(lab));
    }
    case "oklab": {
      const xyz = oklabToXyz({ l: color.coordinates[0], a: color.coordinates[1], b: color.coordinates[2] });
      return xyzToRgb(xyz);
    }
    case "oklch": {
      const rgb = oklchToRgb({ l: color.coordinates[0], c: color.coordinates[1], h: color.coordinates[2] });
      return rgb;
    }
    default:
      throw new Error(`Unsupported color space: ${color.space}`);
  }
}

function colorToXyz(color: Color): XYZ {
  const rgb = colorToRgb(color);
  return rgbToXyz(rgb);
}

function colorToLab(color: Color): Lab {
  return xyzToLab(colorToXyz(color));
}

function colorToLch(color: Color): LCh {
  return labToLch(colorToLab(color));
}

function colorToOklab(color: Color): Oklab {
  return xyzToOklab(colorToXyz(color));
}

function colorToOklch(color: Color): OKLCH {
  return oklabToOklch(colorToOklab(color));
}

// ─── fromOklch：从 OklchColor 转换到目标空间 ────────────────────────────────

function fromOklch(color: OklchColor, target: ColorSpace): Color {
  const oklch: OKLCH = { l: color.l, c: color.c, h: color.h };
  switch (target) {
    case "oklch":
      return { space: "oklch", coordinates: [oklch.l, oklch.c, oklch.h ?? 0] };
    case "oklab": {
      const oklab = oklchToOklab(oklch);
      return { space: "oklab", coordinates: [oklab.l, oklab.a, oklab.b] };
    }
    case "xyz-d65": {
      const xyz = oklabToXyz(oklchToOklab(oklch));
      return { space: "xyz-d65", coordinates: [xyz.x, xyz.y, xyz.z] };
    }
    case "lab": {
      const lab = xyzToLab(oklabToXyz(oklchToOklab(oklch)));
      return { space: "lab", coordinates: [lab.l, lab.a, lab.b] };
    }
    case "lch": {
      const lch = labToLch(xyzToLab(oklabToXyz(oklchToOklab(oklch))));
      return { space: "lch", coordinates: [lch.l, lch.c, lch.h ?? 0] };
    }
    case "srgb":
    case "display-p3": {
      const rgb = oklchToRgb(oklch, target);
      return { space: target, coordinates: [rgb.r, rgb.g, rgb.b] };
    }
    default:
      throw new Error(`Unsupported target space: ${target}`);
  }
}

// ─── 工厂函数 ────────────────────────────────────────────────────────────────

/**
 * 创建规范 §14 定义的多态颜色转换器。
 */
export function createColorConverter(): ColorConverterFacade {
  return {
    toXYZ: colorToXyz,
    toLab: colorToLab,
    toLch: colorToLch,
    toOklab: colorToOklab,
    toOklch: colorToOklch,
    fromOklch,
  };
}
