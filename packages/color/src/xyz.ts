import { ColorError, type RGB, type RGBSpace, type XYZ } from "@cus/core";
import { linearToSrgb, srgbToLinear } from "./srgb";
import { assertFinite, assertNumerical } from "./utils";

function checkSpace(space: RGBSpace): void {
  if (space !== "srgb" && space !== "display-p3")
    throw new ColorError(
      "UNSUPPORTED_COLOR_SPACE",
      `不支持的 RGB 空间：${space}`,
    );
}

export function rgbToXyz(rgb: RGB, space: RGBSpace = "srgb"): XYZ {
  checkSpace(space);
  const r = srgbToLinear(rgb.r),
    g = srgbToLinear(rgb.g),
    b = srgbToLinear(rgb.b);
  const xyz =
    space === "display-p3"
      ? {
          x: 0.4865709 * r + 0.2656677 * g + 0.1982173 * b,
          y: 0.2289746 * r + 0.6917385 * g + 0.0792869 * b,
          z: 0.0451134 * g + 1.0439444 * b,
        }
      : {
          x: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
          y: 0.2126729 * r + 0.7151522 * g + 0.072175 * b,
          z: 0.0193339 * r + 0.119192 * g + 0.9503041 * b,
        };
  assertNumerical(xyz.x, xyz.y, xyz.z);
  return xyz;
}

export function xyzToRgb(xyz: XYZ, space: RGBSpace = "srgb"): RGB {
  checkSpace(space);
  assertFinite(xyz.x, xyz.y, xyz.z);
  const linear =
    space === "display-p3"
      ? {
          r: 2.4934969 * xyz.x - 0.9313836 * xyz.y - 0.4027108 * xyz.z,
          g: -0.829489 * xyz.x + 1.762664 * xyz.y + 0.0236247 * xyz.z,
          b: 0.0358458 * xyz.x - 0.0761724 * xyz.y + 0.9568845 * xyz.z,
        }
      : {
          r: 3.2404542 * xyz.x - 1.5371385 * xyz.y - 0.4985314 * xyz.z,
          g: -0.969266 * xyz.x + 1.8760108 * xyz.y + 0.041556 * xyz.z,
          b: 0.0556434 * xyz.x - 0.2040259 * xyz.y + 1.0572252 * xyz.z,
        };
  assertNumerical(linear.r, linear.g, linear.b);
  return {
    r: linearToSrgb(linear.r),
    g: linearToSrgb(linear.g),
    b: linearToSrgb(linear.b),
    space,
  };
}

export const displayP3ToXyz = (rgb: RGB): XYZ => rgbToXyz(rgb, "display-p3");
export const xyzToDisplayP3 = (xyz: XYZ): RGB => xyzToRgb(xyz, "display-p3");
