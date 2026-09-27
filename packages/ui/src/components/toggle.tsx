/**
 * CUS-IMPLEMENTATION-03 §5：CusToggle — Radix Toggle 的 CUS 风格封装。
 */
import * as TogglePrimitive from "@radix-ui/react-toggle";
import type { ComponentProps } from "react";

export function CusToggle({
  className = "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-cus-background transition-colors hover:bg-cus-muted hover:text-cus-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cus-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-cus-muted data-[state=on]:text-cus-foreground",
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<typeof TogglePrimitive.Root> & {
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
}) {
  const variantClass =
    variant === "outline"
      ? "border border-cus-border bg-transparent hover:bg-cus-muted"
      : "";
  const sizeClass =
    size === "sm" ? "h-8 px-2.5" : size === "lg" ? "h-10 px-5" : "h-9 px-3";

  return (
    <TogglePrimitive.Root
      className={`${className} ${variantClass} ${sizeClass}`}
      {...props}
    />
  );
}
