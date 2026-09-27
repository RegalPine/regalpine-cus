/**
 * CUS-IMPLEMENTATION-03 §5：CusTooltip — Radix Tooltip 的 CUS 风格封装。
 */
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";

export const CusTooltipProvider = TooltipPrimitive.Provider;
export const CusTooltip = TooltipPrimitive.Root;
export const CusTooltipTrigger = TooltipPrimitive.Trigger;

export function CusTooltipContent({
  className = "z-50 overflow-hidden rounded-md bg-cus-foreground px-3 py-1.5 text-xs text-cus-background border border-cus-border shadow-md animate-in fade-in-0 zoom-in-95",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content className={className} sideOffset={sideOffset} {...props} />
    </TooltipPrimitive.Portal>
  );
}
