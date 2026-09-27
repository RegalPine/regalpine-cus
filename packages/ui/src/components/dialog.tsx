/**
 * CUS-IMPLEMENTATION-03 §5：CusDialog — Radix Dialog 的 CUS 风格封装。
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";

export const CusDialog = DialogPrimitive.Root;
export const CusDialogTrigger = DialogPrimitive.Trigger;
export const CusDialogClose = DialogPrimitive.Close;
export const CusDialogPortal = DialogPrimitive.Portal;

export function CusDialogOverlay({
  className = "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={className} {...props} />;
}

export function CusDialogContent({
  className = "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-cus-border bg-cus-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Content className={className} {...props} />;
}

export function CusDialogHeader({
  className = "flex flex-col space-y-1.5 text-center sm:text-left",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props} />;
}

export function CusDialogFooter({
  className = "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props} />;
}

export function CusDialogTitle({
  className = "text-lg font-semibold leading-none tracking-tight",
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={className} {...props} />;
}

export function CusDialogDescription({
  className = "text-sm text-cus-muted",
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={className} {...props} />;
}
