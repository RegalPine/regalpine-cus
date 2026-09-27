import { useRef, type CSSProperties, type ReactNode } from "react";
import {
  CusDialog,
  CusDialogPortal,
  CusDialogOverlay,
  CusDialogContent,
  CusDialogTitle,
  CusDialogClose,
} from "@cus/ui";
import type { ThemeTokens } from "@cus/core";
import { themeVariables } from "@cus/export";
import { usePreviewSpace } from "./PreviewSpace";

export function Modal({
  title,
  children,
  onClose,
  className = "",
  tokens,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  tokens?: ThemeTokens;
}) {
  const space = usePreviewSpace();
  const style = tokens
    ? (themeVariables(tokens, space) as CSSProperties)
    : undefined;
  const trigger = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <CusDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <CusDialogPortal>
        <CusDialogOverlay
          className={`modal-overlay${tokens ? " preview-modal-overlay" : ""}`}
          style={style}
        />
        <CusDialogContent
          className={`modal ${className}`}
          style={style}
          data-theme={tokens?.mode}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <div className="modal-inner">
            <header className="modal-heading">
              <div>
                <span className="eyebrow">CUS DESIGNER</span>
                <CusDialogTitle className="">{title}</CusDialogTitle>
              </div>
              <CusDialogClose asChild>
                <button className="icon-button" aria-label="关闭对话框">
                  ×
                </button>
              </CusDialogClose>
            </header>
            {children}
          </div>
        </CusDialogContent>
      </CusDialogPortal>
    </CusDialog>
  );
}
