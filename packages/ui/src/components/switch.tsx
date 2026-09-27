/**
 * CUS-IMPLEMENTATION-03 §5：CusSwitch — Radix Switch 的 CUS 风格封装。
 * 使用显式 CSS 类（.cus-switch-root / .cus-switch-thumb）确保跨设备可靠渲染，
 * 不依赖 Tailwind JIT 对 data-[state=*] 变体的生成。
 */
import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

export function CusSwitch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={`cus-switch-root${className ? ` ${className}` : ""}`}
      {...props}
    >
      <SwitchPrimitive.Thumb className="cus-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
