/**
 * CUS-IMPLEMENTATION-03 §5：CusPopover — Radix Popover 的 CUS 风格封装。
 */
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";

export const CusPopover = PopoverPrimitive.Root;
export const CusPopoverTrigger = PopoverPrimitive.Trigger;
export const CusPopoverAnchor = PopoverPrimitive.Anchor;
export const CusPopoverClose = PopoverPrimitive.Close;

export function CusPopoverContent({
  className = "z-50 w-72 rounded-md border border-cus-border bg-cus-background p-4 text-cus-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  align = "center",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        className={className}
        align={align}
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
