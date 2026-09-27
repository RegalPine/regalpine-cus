/** CUS-IMPLEMENTATION-02 §4：semantic 包测试入口。 */
import { describe, expect, it } from "vitest";
import { generateSemanticPalette, createSemanticPalette } from "@cus/semantic";

describe("@cus/semantic 包导出", () => {
  it("generateSemanticPalette 可用", () => {
    expect(typeof generateSemanticPalette).toBe("function");
  });

  it("createSemanticPalette 可用", () => {
    expect(typeof createSemanticPalette).toBe("function");
  });
});
