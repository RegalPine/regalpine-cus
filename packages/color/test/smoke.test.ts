/** CUS-IMPLEMENTATION-02 §4：color 包测试入口。 */
import { describe, expect, it } from "vitest";
import { parseHex, toHex, hexToOklch, ColorEngine, gamutEngine, maxChroma, dirtyZoneEngine } from "@cus/color";

describe("@cus/color 包导出", () => {
  it("核心转换函数可用", () => {
    const rgb = parseHex("#FF0000");
    expect(rgb.r).toBeCloseTo(1, 5);
    expect(toHex(rgb)).toBe("#FF0000");
  });

  it("OKLCH 转换可用", () => {
    const oklch = hexToOklch("#2457C5");
    expect(oklch.l).toBeGreaterThan(0);
    expect(oklch.c).toBeGreaterThan(0);
  });

  it("ColorEngine facade 可用", () => {
    const color = ColorEngine.parse("#FF0000");
    expect(color.hex).toBe("#FF0000");
  });

  it("gamutEngine 可用", () => {
    expect(typeof gamutEngine.isInGamut).toBe("function");
    expect(typeof gamutEngine.maxChroma).toBe("function");
    expect(typeof gamutEngine.mapToGamut).toBe("function");
  });

  it("maxChroma 返回有限正值", () => {
    const mc = maxChroma(0.5, 0, "srgb");
    expect(Number.isFinite(mc)).toBe(true);
    expect(mc).toBeGreaterThan(0);
  });

  it("dirtyZoneEngine 可用", () => {
    const result = dirtyZoneEngine.evaluate({ l: 0.5, c: 0.1, h: 180 });
    expect(["CLEAR", "WARNING", "DIRTY"]).toContain(result.status);
  });
});
