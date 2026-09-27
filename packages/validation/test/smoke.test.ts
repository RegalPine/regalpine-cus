/** CUS-IMPLEMENTATION-02 §4：validation 包测试入口。 */
import { describe, expect, it } from "vitest";
import { validateTheme } from "@cus/validation";

describe("@cus/validation 包导出", () => {
  it("validateTheme 可用", () => {
    expect(typeof validateTheme).toBe("function");
  });
});
