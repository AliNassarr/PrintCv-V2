"use client";
import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDialog } from "@/lib/use-dialog";
import { cx } from "@/lib/cx";
import { IconButton } from "./IconButton";

// The shared popup window (§7.5): grey scrim, white sheet, title, Close, then the body.
// The title row and the optional footer stay put; only the body scrolls.
// Below 640px it fills the screen, so Close is always in view.
export function DialogFrame({ open, onClose, title, titleId, description, closeLabel, width = 640, fixedHeight, testId, footer, children }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleId: string;
  description?: ReactNode;
  closeLabel: string;   // a name of its own, for example "Close the score window"
  width?: number;
  fixedHeight?: boolean;   // keep one height on wide screens, so switching tabs does not make the window jump
  testId?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, open, onClose);
  if (!open) return null;
  const descId = description ? `${titleId}-desc` : undefined;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(35,35,35,0.4)] sm:items-center sm:p-4 print:hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} tabIndex={-1} data-test-id={testId}
        style={{ maxWidth: width }}
        className={cx("motion-safe:animate-fade flex h-[100dvh] w-full flex-col overflow-hidden overscroll-contain bg-paper shadow-overlay outline-none sm:max-h-[92vh] sm:rounded-sheet sm:border sm:border-edge", fixedHeight ? "sm:h-[860px]" : "sm:h-auto")}>
        <div className="flex shrink-0 items-start justify-between gap-4 pb-4 pl-4 pr-0.5 pt-4 sm:pl-6 sm:pr-4 sm:pt-5">
          <div className="min-w-0 pt-2.5 sm:pt-1">
            <h2 id={titleId} className="text-[18px] font-medium leading-6 text-ink">{title}</h2>
            {description && <p id={descId} className="mt-1 text-app text-muted">{description}</p>}
          </div>
          <IconButton label={closeLabel} onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-rule px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
