/**
 * CUS-IMPLEMENTATION-03 §5：CusSlider — Radix Slider 的 CUS 风格封装。
 */
import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentProps } from "react";

export function CusSlider({
  className = "relative flex w-full touch-none select-none items-center",
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={className} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-cus-muted">
        <SliderPrimitive.Range className="absolute h-full bg-cus-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-cus-primary bg-white shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cus-focus disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  );
}
