"use client";
import { X } from "lucide-react";
import type { StudioToastsProps } from "@/lib/toast";
import { IconButton } from "./IconButton";

// Always mounted, so screen readers hear new messages, and only the new ones (aria-atomic false).
// Hidden in print. The undo message stacks above the info message (useToasts sorts it first).
export function ToastRegion({ toasts, onClose }: StudioToastsProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions text"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex flex-col gap-2 lg:inset-x-auto lg:bottom-6 lg:left-[260px] lg:max-w-[400px] print:hidden">
      {toasts.map((t) => (
        <div key={t.id}
          className="motion-safe:animate-fade pointer-events-auto flex items-center gap-2 rounded-card border border-edge bg-paper py-2 pl-4 pr-2 text-app text-ink shadow-overlay">
          <p className="min-w-0 flex-1 break-words py-1">
            {t.text}
            {t.detail && <span className="block text-app-sm text-muted">{t.detail}</span>}
          </p>
          {t.action && (
            <button type="button" onClick={t.action.onClick}
              className="h-11 shrink-0 rounded-control px-3 font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:bg-raised sm:h-8">
              {t.action.label}
            </button>
          )}
          {/* Two messages can show at once, so each Close has its own name */}
          <IconButton label={t.kind === "undo" ? "Close the undo message" : "Close message"} onClick={() => onClose(t.id)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
