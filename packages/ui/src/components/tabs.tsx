/**
 * CUS-IMPLEMENTATION-03 §5：CusTabs — Radix Tabs 的 CUS 风格封装。
 */
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";

export const CusTabs = TabsPrimitive.Root;

export function CusTabsList({
  className = "inline-flex h-9 items-center justify-center rounded-lg bg-cus-muted p-1 text-cus-muted",
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={className} {...props} />;
}

export function CusTabsTrigger({
  className = "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-cus-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cus-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-cus-background data-[state=active]:text-cus-foreground data-[state=active]:shadow",
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={className} {...props} />;
}

export function CusTabsContent({
  className = "mt-2 ring-offset-cus-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cus-focus focus-visible:ring-offset-2",
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={className} {...props} />;
}
