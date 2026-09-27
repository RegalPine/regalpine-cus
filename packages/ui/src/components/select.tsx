/**
 * CUS-IMPLEMENTATION-03 §5：CusSelect — Radix Select 的 CUS 风格封装。
 */
import * as SelectPrimitive from "@radix-ui/react-select";
import type { ComponentProps } from "react";

export const CusSelect = SelectPrimitive.Root;
export const CusSelectGroup = SelectPrimitive.Group;
export const CusSelectValue = SelectPrimitive.Value;

export function CusSelectTrigger({
  className = "inline-flex h-9 items-center justify-between rounded-md border border-cus-border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-cus-muted focus:outline-none focus:ring-2 focus:ring-cus-focus disabled:cursor-not-allowed disabled:opacity-50",
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger className={className} {...props} />;
}

export function CusSelectContent({
  className = "relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-cus-border bg-cus-background text-cus-foreground shadow-md animate-in fade-in-0 zoom-in-95",
  position = "popper",
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Content className={className} position={position} {...props} />
  );
}

export function CusSelectItem({
  className = "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-cus-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item className={className} {...props} />;
}
