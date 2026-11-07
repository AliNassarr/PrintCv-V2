"use client";

import React, { useState } from "react";
import { Check, AlertTriangle, Trash2, CheckSquare, Square, CornerDownLeft, RefreshCw, Info } from "lucide-react";
import {
  MAX_BULLET_LENGTH,
  startsWithActionVerb,
  startsWithWeakWord,
  hasPronoun,
  hasNumber,
  LINE_HINTS,
} from "@/lib/line-checks";
import { TextArea } from "@/components/ui/TextArea";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/lib/cx";

export interface BulletCandidateItem {
  id: string;
  text: string;
  selected: boolean;
}

interface BulletReviewStudioProps {
  candidates: BulletCandidateItem[];
  onCandidateTextChange: (id: string, text: string) => void;
  onCandidateToggle: (id: string) => void;
  onCandidateRemove: (id: string) => void;
  onApply: (bullets: string[], mode: "replace" | "add") => void;
  hasExistingBullets: boolean;
  existingBulletCount: number;
  missingInformationPrompt?: string | null;
}

function evaluateCandidateChecks(line: string) {
  const trimmed = line.trim();
  const isEmpty = trimmed.length === 0;
  const goodStart = !isEmpty && startsWithActionVerb(trimmed);
  const weakStart = !isEmpty && startsWithWeakWord(trimmed);
  const pronoun = !isEmpty && hasPronoun(trimmed);
  const number = !isEmpty && hasNumber(trimmed);
  const tooLong = trimmed.length > MAX_BULLET_LENGTH;

  const warnings: string[] = [];
  if (isEmpty) warnings.push("Bullet text cannot be empty (will be excluded upon insertion).");
  if (tooLong) warnings.push(LINE_HINTS.tooLong);
  if (weakStart) warnings.push(LINE_HINTS.weakStart);
  if (pronoun) warnings.push(LINE_HINTS.pronoun);

  return { isEmpty, goodStart, weakStart, pronoun, number, tooLong, warnings };
}

export function BulletReviewStudio({
  candidates,
  onCandidateTextChange,
  onCandidateToggle,
  onCandidateRemove,
  onApply,
  hasExistingBullets,
  existingBulletCount,
  missingInformationPrompt,
}: BulletReviewStudioProps) {
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  const selectedCandidates = candidates.filter((c) => c.selected && c.text.trim().length > 0);
  const selectedCount = selectedCandidates.length;

  const handleApply = (mode: "replace" | "add") => {
    if (selectedCount === 0) return;
    const seen = new Set<string>();
    const bulletsToInsert: string[] = [];
    for (const c of selectedCandidates) {
      const clean = c.text.trim();
      if (clean.length > 0 && !seen.has(clean)) {
        seen.add(clean);
        bulletsToInsert.push(clean);
      }
    }
    if (bulletsToInsert.length === 0) return;
    onApply(bulletsToInsert, mode);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Studio Header & Instructions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <div>
          <h3 className="text-app font-medium text-ink">Candidate Bullet Studio</h3>
          <p className="text-app-sm text-muted">
            Edit text directly, check guidelines, and select which bullets to add to your CV.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-app-sm text-muted">
            {selectedCount} of {candidates.length} selected
          </span>
        </div>
      </div>

      {/* AI Context Feedback / Missing Information Notice */}
      {missingInformationPrompt && (
        <div role="status" className="flex items-start gap-2 rounded-card border border-edge bg-ground p-3 text-app-sm text-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium text-ink">AI Note on Technical Evidence:</p>
            <p className="mt-0.5 text-xs text-muted leading-relaxed">{missingInformationPrompt}</p>
          </div>
        </div>
      )}

      {/* Candidates List */}
      <div className="flex flex-col gap-3">
        {candidates.map((c, idx) => {
          const checks = evaluateCandidateChecks(c.text);

          return (
            <div
              key={c.id}
              className={cx(
                "flex flex-col gap-2 rounded-card border p-3.5 transition-colors sm:p-4",
                c.selected ? "border-ink bg-paper shadow-sm" : "border-edge bg-ground opacity-75"
              )}
            >
              {/* Candidate Card Header */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onCandidateToggle(c.id)}
                  aria-label={c.selected ? `Deselect bullet ${idx + 1}` : `Select bullet ${idx + 1}`}
                  className="flex items-center gap-2 text-app font-medium text-ink hover:opacity-80"
                >
                  {c.selected ? (
                    <CheckSquare className="h-4 w-4 text-ink" aria-hidden="true" />
                  ) : (
                    <Square className="h-4 w-4 text-muted" aria-hidden="true" />
                  )}
                  <span>Candidate {idx + 1}</span>
                </button>

                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      "text-app-sm tabular-nums",
                      checks.tooLong ? "font-medium text-warn" : "text-muted"
                    )}
                  >
                    {c.text.length}/{MAX_BULLET_LENGTH}
                  </span>

                  <button
                    type="button"
                    onClick={() => onCandidateRemove(c.id)}
                    aria-label={`Discard candidate ${idx + 1}`}
                    title="Discard bullet"
                    className="p-1 text-muted hover:text-warn rounded-control"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Editable Text Area */}
              <TextArea
                rows={2}
                minHeight={64}
                value={c.text}
                onChange={(e) => onCandidateTextChange(c.id, e.target.value)}
                placeholder="Bullet text starting with an action verb..."
                className="mt-1"
              />

              {/* Quality Indicators & Warnings */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {checks.isEmpty && <Pill tone="warning">Empty bullet</Pill>}
                {checks.goodStart && <Pill tone="positive">Strong action start</Pill>}
                {checks.number && <Pill tone="neutral">Has metrics/numbers</Pill>}
                {checks.tooLong && <Pill tone="warning">Exceeds 220 chars</Pill>}
              </div>

              {checks.warnings.length > 0 && (
                <ul className="flex flex-col gap-1 pt-1 text-xs text-warn">
                  {checks.warnings.map((w, wIdx) => (
                    <li key={wIdx} className="flex items-start gap-1">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation Banner for Destructive Replacement */}
      {confirmReplaceOpen && (
        <div role="alert" className="flex flex-col gap-2 rounded-card border border-warn bg-ground p-3.5 text-app-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" aria-hidden="true" />
            <p className="font-medium text-ink">
              Replace {existingBulletCount} existing bullet(s) with {selectedCount} selected bullet(s)?
            </p>
          </div>
          <p className="text-muted text-xs">
            This will overwrite the current bullet points for this item. You can also choose &quot;Add Below Mine&quot; to preserve both.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setConfirmReplaceOpen(false);
                handleApply("replace");
              }}
              className="h-8 px-3"
            >
              Confirm Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmReplaceOpen(false)}
              className="h-8 px-2 text-muted"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Insertion Actions Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
        <p className="text-app-sm text-muted">
          {hasExistingBullets
            ? `Your CV currently has ${existingBulletCount} bullet point(s) for this item.`
            : "No bullets currently on CV for this item."}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {hasExistingBullets && (
            <Button
              variant="secondary"
              onClick={() => handleApply("add")}
              disabled={selectedCount === 0}
              className="h-10 px-3.5"
            >
              <CornerDownLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add Below Mine ({selectedCount})
            </Button>
          )}

          <Button
            variant="primary"
            onClick={() => {
              if (hasExistingBullets) {
                setConfirmReplaceOpen(true);
              } else {
                handleApply("replace");
              }
            }}
            disabled={selectedCount === 0}
            className="h-10 px-4"
          >
            {hasExistingBullets ? (
              <>
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Replace My Bullets ({selectedCount})
              </>
            ) : (
              <>
                <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add to My CV ({selectedCount})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
