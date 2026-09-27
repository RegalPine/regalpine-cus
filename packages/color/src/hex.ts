import { ColorError, type RGBA } from "@cus/core";
import { assertFinite, clamp } from "./utils";

export function parseHex(hex: string): RGBA {
  if (
    typeof hex !== "string" ||
    !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)
  ) {
    throw new ColorError(
      "INVALID_INPUT",
      "请输入有效的 #RGB、#RGBA、#RRGGBB 或 #RRGGBBAA",
    );
  }
  const raw = hex.slice(1);
  const value = raw.length <= 4 ? [...raw].map((c) => c + c).join("") : raw;
  const rgb: RGBA = {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
    space: "srgb",
  };
  if (value.length === 8) rgb.alpha = parseInt(value.slice(6, 8), 16) / 255;
  return rgb;
}

export function toHex(rgb: RGBA): string {
  assertFinite(rgb.r, rgb.g, rgb.b, rgb.alpha ?? 1);
  const byte = (v: number) =>
    Math.round(clamp(v) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(rgb.r)}${byte(rgb.g)}${byte(rgb.b)}${rgb.alpha === undefined ? "" : byte(rgb.alpha)}`.toUpperCase();
}

export const hexToRgb = parseHex;
export const rgbToHex = toHex;
