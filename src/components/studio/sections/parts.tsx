"use client";

import React, { useEffect, useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { sectionLabel, type StudioSection } from "@/lib/studio-sections";
import type { HelperTarget } from "@/lib/bullet-helper";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Pill } from "@/components/ui/Pill";
import { BulletEditorRow, checkLine, lineWarnings } from "../BulletEditorRow";
import { HelpMeWriteButton } from "./HelpMeWriteButton";
import type { SectionProps } from "./types";

// Shared pieces of the six sections (§7.3): the title row, the project/job card, the "What you did" lines and empty slots.

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// h1, the subline (a count) and real controls on the right. The next step is not repeated here: it shows just above,
// under the section steps. The h1 can take focus from script (tabIndex -1): focusAfterChange falls back to it.
export function SectionTitle({ id, count, children }: { id: StudioSection; count: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-64">
        <h1 tabIndex={-1} className="text-app-title">{sectionLabel(id)}</h1>
        <p className="mt-1 text-app text-muted">{count}</p>
      </div>
      {children && <div className="flex shrink-0 items-center">{children}</div>}
    </div>
  );
}

// One sentence in a dashed 38px box: an empty list
export function EmptySlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[38px] items-center rounded-card border border-dashed border-field px-4 py-2 text-app text-muted">
      {children}
    </div>
  );
}

// A dashed box that is itself the button: "Add a project yourself", "Add a job"
export function SlotButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-add="item"
      className="flex min-h-11 w-full items-center gap-2 rounded-card border border-dashed border-field px-4 text-left text-app font-medium text-ink transition-colors duration-150 hover:bg-raised sm:min-h-[38px]">
      <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
      {children}
    </button>
  );
}

// Keeps keyboard focus in place after a list changes (a line, project, job, school, course or activity
// was removed or brought back). On the next frame, when the store update has been drawn, it focuses the
// item now at `index` (the one after the removed one), else the last one (the one before it), else the
// first fallback that exists. Selectors are looked up inside `root`.
export function focusAfterChange(root: ParentNode | null | undefined, itemSelector: string, index: number, ...fallbacks: string[]) {
  requestAnimationFrame(() => {
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(itemSelector));
    const el = items[Math.min(index, items.length - 1)] ?? fallbacks.map((f) => root.querySelector<HTMLElement>(f)).find(Boolean);
    el?.focus();
  });
}

// The selectors the sections pass to focusAfterChange
export const CARD_TOGGLE = '[data-test-id="item-header"] button[aria-expanded]';
export const ADD_ITEM = 'button[data-add="item"]';

// Keeps the Remove button in the same place on every card when Move up or Move down is not offered
const Gap = () => <span aria-hidden="true" className="h-11 w-11 shrink-0 sm:h-8 sm:w-8" />;

// The card pill: lines to fix first, then too few lines, then the count
export function ItemPill({ lines }: { lines: string[] }) {
  const written = lines.filter((l) => l.trim());
  const toFix = written.filter((l) => lineWarnings(checkLine(l)).length > 0).length;
  if (toFix > 0) return <Pill tone="warning">{plural(toFix, "line", "lines")} to fix</Pill>;
  if (written.length < 2) return <Pill tone="warning">Needs 2 lines</Pill>;
  return <Pill tone="neutral">{plural(written.length, "line", "lines")}</Pill>;
}

// A project or job card. The header row holds the toggle (the only button[aria-expanded]) and,
// beside it, the Move up, Move down and Remove buttons.
export function ItemCard({
  id, name, tools, lines, collapsed, onToggle, moveUp, moveDown, remove, children,
}: {
  id: string;
  name: string;
  tools?: string;
  lines: string[];
  collapsed: boolean;
  onToggle: () => void;
  moveUp?: { label: string; onClick: () => void };
  moveDown?: { label: string; onClick: () => void };
  remove: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  const bodyId = `item-${id}-body`;
  return (
    <div id={`item-${id}`} className="scroll-mt-6 rounded-card border border-edge bg-paper">
      <div data-test-id="item-header" className="flex min-h-12 items-center gap-1 pl-4 pr-2">
        <button type="button" aria-expanded={!collapsed} aria-controls={collapsed ? undefined : bodyId} onClick={onToggle}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-control py-2 text-left">
          {/* Below 640px the pill drops under the name, so the name keeps its room beside the buttons */}
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="block w-full min-w-0 truncate sm:w-auto sm:flex-1">
              <span className="text-app-md font-medium text-ink">{name}</span>
              {/* The space keeps the name and the tools apart in the button's spoken name */}
              {tools && <>{" "}<span className="ml-1 hidden text-app text-muted sm:inline">{tools}</span></>}
            </span>
            <ItemPill lines={lines} />
          </span>
          <ChevronDown aria-hidden="true" className={cx("h-4 w-4 shrink-0 text-muted transition-transform duration-150", !collapsed && "rotate-180")} />
        </button>
        {moveUp ? <IconButton label={moveUp.label} onClick={moveUp.onClick}><ArrowUp className="h-4 w-4" /></IconButton> : <Gap />}
        {moveDown ? <IconButton label={moveDown.label} onClick={moveDown.onClick}><ArrowDown className="h-4 w-4" /></IconButton> : <Gap />}
        <IconButton label={remove.label} onClick={remove.onClick}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
      {!collapsed && (
        <div id={bodyId} className="flex flex-col gap-6 border-t border-rule px-4 pb-4 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// Swaps two lines and returns the new list
export const swapLines = (lines: string[], a: number, b: number) => {
  const next = [...lines];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
};

// "What you did": the lines of one project, job or activity, with Add a line and Help me write
export function LinesBlock({
  itemId, kind, lines, onOpenHelper, helperTestId, onAdd, onChangeLine, onDeleteLine, onSetLines,
}: {
  itemId: string;
  kind: HelperTarget["kind"];
  lines: string[];
  onOpenHelper: SectionProps["onOpenHelper"];
  helperTestId?: string;
  onAdd: () => void;
  onChangeLine: (index: number, text: string) => void;
  onDeleteLine: (index: number) => void;
  onSetLines: (lines: string[]) => void;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const added = useRef(false);
  const labelId = `item-${itemId}-lines`;

  // After a move, keep focus on the moved line's button (or the other arrow at the ends)
  const move = (from: number, to: number) => {
    onSetLines(swapLines(lines, from, to));
    requestAnimationFrame(() => {
      const row = listRef.current?.children[to];
      const want = to < from ? "Move line up" : "Move line down";
      const other = to < from ? "Move line down" : "Move line up";
      (row?.querySelector<HTMLButtonElement>(`button[aria-label="${want}"]`) ?? row?.querySelector<HTMLButtonElement>(`button[aria-label="${other}"]`))?.focus();
    });
  };

  // After a delete, put the cursor in the next line (or the one before it), or on "Add a line" when none is left
  const remove = (i: number) => {
    onDeleteLine(i);
    focusAfterChange(groupRef.current, "textarea[aria-label^='Line ']", i, 'button[data-add="line"]');
  };

  // After "Add a line", put the cursor in the new line
  useEffect(() => {
    if (!added.current) return;
    added.current = false;
    const areas = listRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea");
    areas?.[areas.length - 1]?.focus();
  }, [lines.length]);

  return (
    <div ref={groupRef} role="group" aria-labelledby={labelId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p id={labelId} className="w-full text-app font-medium text-ink sm:mr-auto sm:w-auto">What you did</p>
        <Button size="sm" variant="ghost" data-add="line" onClick={() => { added.current = true; onAdd(); }}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add a line
        </Button>
        <HelpMeWriteButton kind={kind} id={itemId} onOpenHelper={onOpenHelper} testId={helperTestId} />
      </div>
      {lines.length === 0 ? (
        <EmptySlot>Write 2 to 4 lines about what you did.</EmptySlot>
      ) : (
        <div ref={listRef} className="flex flex-col gap-3">
          {lines.map((text, i) => (
            <BulletEditorRow
              key={`${itemId}-line-${i}`}
              text={text}
              index={i}
              onChange={(v) => onChangeLine(i, v)}
              onDelete={() => remove(i)}
              onMoveUp={i > 0 ? () => move(i, i - 1) : undefined}
              onMoveDown={i < lines.length - 1 ? () => move(i, i + 1) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// After a card moves, keep focus on its Move button (or the other arrow when it reached an end)
export function refocusCardButton(itemId: string, want: string, other: string) {
  requestAnimationFrame(() => {
    const card = document.getElementById(`item-${itemId}`);
    (card?.querySelector<HTMLButtonElement>(`[data-test-id="item-header"] button[aria-label="${want}"]`) ??
      card?.querySelector<HTMLButtonElement>(`[data-test-id="item-header"] button[aria-label="${other}"]`))?.focus();
  });
}
