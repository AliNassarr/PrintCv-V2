"use client";

import { cx } from "@/lib/cx";
import { Pill } from "@/components/ui/Pill";

export type StudioPane = "edit" | "preview";

// Below 1024px: one pane at a time. The Edit / Preview switch sits at the bottom, with a red pill only when
// the CV is longer than 1 page (overflowPercent is null when it fits).
export function BottomBar({ pane, onPane, overflowPercent }: {
  pane: StudioPane; onPane: (pane: StudioPane) => void; overflowPercent: number | null;
}) {
  const option = (value: StudioPane, label: string) => (
    <button type="button" aria-pressed={pane === value} onClick={() => onPane(value)}
      className={cx("h-11 rounded-[5px] px-4 text-app sm:h-10", pane === value ? "bg-paper font-medium text-ink" : "text-muted hover:text-ink")}>
      {label}
    </button>
  );
  // A named region, so a screen reader can jump to it like the rest of the page
  return (
    <section aria-label="Edit or preview" className="fixed inset-x-0 bottom-0 z-30 h-[calc(56px+env(safe-area-inset-bottom))] border-t border-edge bg-ground px-4 pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
      <div className="flex h-14 items-center justify-between gap-3">
        <div role="group" aria-label="Show" className="flex rounded-control bg-active p-0.5">
          {option("edit", "Edit")}
          {option("preview", "Preview")}
        </div>
        {overflowPercent !== null && <Pill tone="negative">Longer than 1 page · {overflowPercent}%</Pill>}
      </div>
    </section>
  );
}
