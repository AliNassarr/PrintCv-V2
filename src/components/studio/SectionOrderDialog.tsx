"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useCVStore } from "@/lib/store/cv-store";
import { SectionId, DEFAULT_SECTION_ORDER } from "@/types/resume";
import { DR_WISSAM_SECTION_ORDER } from "@/lib/template-constants";
import { cx } from "@/lib/cx";
import { DialogFrame } from "@/components/ui/DialogFrame";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

// Plain names for the section order dialog
const SECTION_ORDER_LABELS: Record<SectionId, string> = {
  education: "Education",
  experience: "Work experience",
  projects: "Projects",
  skills: "Skills",
  coursework: "Courses",
  extracurriculars: "Activities",
};

type Dir = "up" | "down";

// The order of the parts on the CV (§7.6). Each row has Move up and Move down; at the ends they stay
// in place but do nothing, so focus never jumps away from the row you just moved.
export function SectionOrderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sectionOrder = useCVStore((s) => s.cvData.sectionOrder);
  const moveSection = useCVStore((s) => s.moveSection);
  const setSectionOrder = useCVStore((s) => s.setSectionOrder);
  const order = sectionOrder || DEFAULT_SECTION_ORDER;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [moved, setMoved] = useState<{ id: SectionId; dir: Dir } | null>(null);
  const [said, setSaid] = useState("");

  // After a move, put focus back on the same button of the row that moved
  useLayoutEffect(() => {
    if (moved) buttons.current.get(`${moved.id}-${moved.dir}`)?.focus();
  }, [moved, order]);

  const move = (id: SectionId, idx: number, dir: Dir) => {
    const to = dir === "up" ? idx - 1 : idx + 1;
    if (to < 0 || to >= order.length) return;
    moveSection(idx, to);
    setMoved({ id, dir });
    setSaid(`${SECTION_ORDER_LABELS[id] ?? id} is now number ${to + 1} of ${order.length}.`);
  };

  const close = () => {
    setMoved(null);
    setSaid("");
    onClose();
  };

  return (
    <DialogFrame open={open} onClose={close} title="Change section order" titleId="section-order-title" width={440}
      closeLabel="Close the order window"
      description="Choose which part of your CV comes first. You see the change right away."
      footer={
        <div className="flex w-full items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSectionOrder([...DR_WISSAM_SECTION_ORDER]);
              setMoved(null);
              setSaid("Section order reset to Dr. Wissam Template.");
            }}
          >
            Reset to Template
          </Button>
          <Button variant="primary" size="sm" onClick={close}>
            Done
          </Button>
        </div>
      }>
      <ol className="rounded-card border border-edge">
        {order.map((secId, idx) => {
          const label = SECTION_ORDER_LABELS[secId] ?? secId;
          const ends = { up: idx === 0, down: idx === order.length - 1 };
          return (
            <li key={secId} className="flex min-h-12 items-center gap-2 border-b border-rule pl-4 pr-2 last:border-b-0">
              <span className="min-w-0 flex-1 text-app text-ink">{label}</span>
              {(["up", "down"] as const).map((dir) => (
                <IconButton key={dir} label={`Move ${label} ${dir}`}
                  ref={(el) => { if (el) buttons.current.set(`${secId}-${dir}`, el); else buttons.current.delete(`${secId}-${dir}`); }}
                  aria-disabled={ends[dir] || undefined}
                  onClick={() => move(secId, idx, dir)}
                  className={cx(ends[dir] && "cursor-default !text-control hover:!bg-transparent")}>
                  {dir === "up" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </IconButton>
              ))}
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sr-only">{said}</p>
    </DialogFrame>
  );
}
