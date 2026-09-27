/** CUS-IMPLEMENTATION-02 §4：theme 包测试入口。 */
import { describe, expect, it } from "vitest";
import { generateTheme, resolvedTokens, resolveToken } from "@cus/theme";

describe("@cus/theme 包导出", () => {
  it("generateTheme 可用", () => {
    expect(typeof generateTheme).toBe("function");
  });

  it("resolvedTokens 可用", () => {
    expect(typeof resolvedTokens).toBe("function");
  });

  it("resolveToken 可用", () => {
    expect(typeof resolveToken).toBe("function");
  });
});
