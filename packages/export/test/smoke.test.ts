/** CUS-IMPLEMENTATION-02 §4：export 包测试入口。 */
import { describe, expect, it } from "vitest";
import { exportCSS, toCssVariables, cssVariable } from "@cus/export";

describe("@cus/export 包导出", () => {
  it("exportCSS 可用", () => {
    expect(typeof exportCSS).toBe("function");
  });

  it("toCssVariables 可用", () => {
    expect(typeof toCssVariables).toBe("function");
  });

  it("cssVariable 生成正确变量名", () => {
    expect(cssVariable("primary.500")).toBe("--cus-color-primary-500");
  });
});
