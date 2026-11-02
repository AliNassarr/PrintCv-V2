"use client";

import React, { useId, useMemo } from "react";
import { Trash2, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import {
  LINE_HINTS,
  MAX_BULLET_LENGTH,
  hasNumber,
  hasPronoun,
  isSampleLine,
  looksLikeOldTemplate,
  startsWithActionVerb,
  startsWithWeakWord,
} from "@/lib/line-checks";
import { TextArea } from "@/components/ui/TextArea";
import { IconButton } from "@/components/ui/IconButton";
import { Pill } from "@/components/ui/Pill";

export interface BulletEditorRowProps {
  text: string;
  index: number;
  onChange: (newVal: string) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

// The quick checks for one line. The card pill ("1 line to fix") counts lines with at least one warning.
export function checkLine(bullet: string) {
  const text = bullet.trim();
  return {
    goodStart: startsWithActionVerb(text),
    number: hasNumber(text),
    sample: isSampleLine(text),
    template: looksLikeOldTemplate(text),
    weakStart: startsWithWeakWord(text),
    pronoun: hasPronoun(text),
    length: text.length,
    tooLong: text.length > MAX_BULLET_LENGTH,
  };
}

export function lineWarnings(check: ReturnType<typeof checkLine>): string[] {
  return [
    check.sample && LINE_HINTS.sample,
    !check.sample && check.template && LINE_HINTS.template,
    check.weakStart && LINE_HINTS.weakStart,
    check.pronoun && LINE_HINTS.pronoun,
    check.tooLong && LINE_HINTS.tooLong,
  ].filter(Boolean) as string[];
}

// Keeps the icons in the same place on every line when Move up or Move down is not offered
const Gap = () => <span aria-hidden="true" className="h-11 w-11 shrink-0 sm:h-8 sm:w-8" />;

// One CV line: the text, its pills and count, Move and Delete, then the warnings under the box (§7.3)
export function BulletEditorRow({ text, index, onChange, onDelete, onMoveUp, onMoveDown }: BulletEditorRowProps) {
  const check = useMemo(() => checkLine(text), [text]);
  const warnings = lineWarnings(check);
  const warnId = useId();

  return (
    <div>
      {/* Below 640px the box's top padding moves into the textarea, so a one-line textarea is still a 44px tap target */}
      <div className="rounded-card border border-field bg-paper px-4 pb-2 pt-0.5 transition-colors duration-150 focus-within:border-ink sm:pt-3">
        <TextArea
          bare
          minHeight={24}
          rows={1}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Line ${index + 1}`}
          aria-describedby={warnings.length ? warnId : undefined}
          placeholder="What did you do, and what came out of it? Start with a verb like Built or Fixed."
          className="block py-2.5 sm:py-0"
        />
        {/* The pills wrap inside their own box, so the count and the icons stay on the first row, even at 390px */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
            {check.goodStart && <Pill tone="positive">Strong start</Pill>}
            {check.number && <Pill tone="neutral">Has a number</Pill>}
          </div>
          <div className="-mr-1 flex shrink-0 items-center sm:-mr-2">
            <span className={`mr-2 text-app-sm tabular-nums ${check.tooLong ? "font-medium text-warn" : "text-muted"}`}>
              {check.length}/{MAX_BULLET_LENGTH}
            </span>
            {onMoveUp ? (
              <IconButton label="Move line up" onClick={onMoveUp}><ArrowUp className="h-4 w-4" /></IconButton>
            ) : <Gap />}
            {onMoveDown ? (
              <IconButton label="Move line down" onClick={onMoveDown}><ArrowDown className="h-4 w-4" /></IconButton>
            ) : <Gap />}
            <IconButton label="Delete line" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul id={warnId} className="mt-2 flex flex-col gap-1 px-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-[13px] leading-[18px] text-warn">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
