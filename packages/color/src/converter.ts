import { hexToRgb, rgbToHex } from "./hex";
import { rgbToXyz, xyzToRgb, displayP3ToXyz, xyzToDisplayP3 } from "./xyz";
import { xyzToLab, labToXyz } from "./lab";
import { labToLch, lchToLab } from "./lch";
import { hexToLch } from "./conversion";
import { lchToHexSafe } from "./gamut";
import {
  xyzToOklab,
  oklabToXyz,
  oklabToOklch,
  oklchToOklab,
  hexToOklch,
  oklchToRgb,
  rgbToOklch,
} from "./oklab";
import { createOklchColor, mapOklchToGamut } from "./okgamut";

export const ColorConverter = {
  xyzToOklab,
  oklabToXyz,
  oklabToOklch,
  oklchToOklab,
  hexToOklch,
  oklchToRgb,
  rgbToOklch,
  createOklchColor,
  mapOklchToGamut,
  hexToRgb,
  rgbToXyz,
  displayP3ToXyz,
  xyzToDisplayP3,
  xyzToLab,
  labToLch,
  lchToLab,
  labToXyz,
  xyzToRgb,
  rgbToHex,
  hexToLch,
  lchToHexSafe,
};
