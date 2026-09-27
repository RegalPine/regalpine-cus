/** CUS-IMPLEMENTATION-02 §4：palette 包测试入口。 */
import { describe, expect, it } from "vitest";
import { generateOklchPalette } from "@cus/palette";

describe("@cus/palette 包导出", () => {
  it("generateOklchPalette 可用", () => {
    expect(typeof generateOklchPalette).toBe("function");
  });
});
