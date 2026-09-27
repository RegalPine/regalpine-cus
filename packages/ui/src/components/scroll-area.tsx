/**
 * CUS-IMPLEMENTATION-03 §5：CusScrollArea — Radix ScrollArea 的 CUS 风格封装。
 */
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import type { ComponentProps } from "react";

export function CusScrollArea({
  className = "relative overflow-hidden",
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root className={className} {...props}>
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {props.children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className = "flex touch-none select-none transition-colors",
  orientation = "vertical",
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      orientation={orientation}
      className={
        orientation === "vertical"
          ? `${className} h-full w-2.5 border-l border-l-transparent p-[1px]`
          : `${className} h-2.5 flex-col border-t border-t-transparent p-[1px]`
      }
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-cus-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}
