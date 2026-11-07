"use client";

import React, { useState, useRef, useEffect, useId, useMemo } from "react";
import { Check, X, AlertTriangle, Trash2 } from "lucide-react";
import { useCVStore } from "@/lib/store/cv-store";
import { checkLine, lineWarnings } from "@/components/studio/BulletEditorRow";
import { MAX_BULLET_LENGTH } from "@/lib/line-checks";
import { Pill } from "@/components/ui/Pill";

export interface InlineBulletProps {
  projectId: string;
  bulletIndex: number;
  initialValue: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onDelete?: () => void;
  isNew?: boolean;
}

export function InlineBullet({
  projectId,
  bulletIndex,
  initialValue,
  placeholder = "Describe what you built and the outcome...",
  className = "",
  style,
  children,
  onDelete,
  isNew = false,
}: InlineBulletProps) {
  const [isEditing, setIsEditing] = useState(isNew || false);
  const [draft, setDraft] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLSpanElement>(null);
  const isCommittingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);

  const updateProjectBullet = useCVStore((s) => s.updateProjectBullet);
  const removeProjectBullet = useCVStore((s) => s.removeProjectBullet);

  // Sync draft if initialValue changes externally while not editing
  useEffect(() => {
    if (!isEditing) {
      setDraft(initialValue);
    }
  }, [initialValue, isEditing]);

  // Auto-resize and focus textarea when entering edit mode; restore focus on exit
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      // Place cursor at the end of the text
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    } else if (!isEditing && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      displayRef.current?.focus();
    }
  }, [isEditing]);

  // Adjust height as user types
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const commit = (committedValue?: string) => {
    if (isCommittingRef.current || isCancelledRef.current) return;
    isCommittingRef.current = true;
    const textToCommit = committedValue !== undefined ? committedValue : (textareaRef.current ? textareaRef.current.value : draft);
    const trimmed = textToCommit.trim();

    if (trimmed === "") {
      // Empty text: remove bullet to prevent blank bullet records in store
      if (onDelete) {
        onDelete();
      } else {
        removeProjectBullet(projectId, bulletIndex);
      }
    } else if (trimmed !== initialValue) {
      updateProjectBullet(projectId, bulletIndex, trimmed);
    }
    setIsEditing(false);
    setTimeout(() => {
      isCommittingRef.current = false;
    }, 50);
  };

  const cancel = () => {
    isCancelledRef.current = true;
    if (initialValue === "") {
      // If cancelling an empty new bullet, discard it completely
      if (onDelete) {
        onDelete();
      } else {
        removeProjectBullet(projectId, bulletIndex);
      }
    } else {
      setDraft(initialValue);
    }
    setIsEditing(false);
    setTimeout(() => {
      isCancelledRef.current = false;
    }, 50);
  };

  const handleDelete = () => {
    isCancelledRef.current = true;
    if (onDelete) {
      onDelete();
    } else {
      removeProjectBullet(projectId, bulletIndex);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      shouldRestoreFocusRef.current = true;
      commit(e.currentTarget.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      shouldRestoreFocusRef.current = true;
      cancel();
    }
  };

  const check = useMemo(() => checkLine(draft), [draft]);
  const warnings = useMemo(() => lineWarnings(check), [check]);
  const warnId = useId();

  if (!isEditing) {
    const isBlank = !initialValue || initialValue.trim() === "";
    return (
      <span
        ref={displayRef}
        tabIndex={0}
        role="button"
        aria-label={`Edit project bullet point ${bulletIndex + 1}`}
        onClick={(e) => {
          e.stopPropagation();
          isCancelledRef.current = false;
          isCommittingRef.current = false;
          setIsEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setIsEditing(true);
          }
        }}
        title="Click to edit bullet directly"
        className={`group/bullet relative inline-block cursor-text rounded px-1 -mx-1 transition-colors hover:bg-amber-100/60 hover:outline hover:outline-1 hover:outline-amber-400 focus-visible:outline-2 focus-visible:outline-amber-500 print:hover:bg-transparent print:hover:outline-none ${
          isBlank ? "text-gray-400 italic" : ""
        } ${className}`}
        style={style}
      >
        {isBlank ? (
          <span className="italic text-gray-400 select-none">{placeholder}</span>
        ) : (
          children || draft
        )}
        <span
          className="ml-1.5 hidden group-hover/bullet:inline-flex text-[10px] font-sans font-medium text-amber-800 bg-amber-100 px-1 py-0.2 rounded border border-amber-300 pointer-events-none print:hidden align-middle select-none"
          aria-hidden="true"
        >
          Edit
        </span>
      </span>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="relative z-20 my-0.5 outline-none"
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        // Container blur check: only commit if focus truly leaves the complete container
        if (containerRef.current?.contains(e.relatedTarget as Node)) {
          return;
        }
        if (!isCancelledRef.current && !isCommittingRef.current) {
          commit(textareaRef.current?.value ?? draft);
        }
      }}
    >
      <div className="relative rounded border border-amber-400 bg-paper shadow-sm">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={`Edit project bullet point ${bulletIndex + 1}`}
          aria-describedby={warnings.length ? warnId : undefined}
          rows={1}
          className="w-full resize-none border-0 bg-transparent p-1.5 text-gray-800 focus:outline-none focus:ring-0 leading-snug"
          style={{
            fontFamily: "inherit",
            fontSize: "inherit",
            ...style,
          }}
        />

        {/* Floating Advisory Validation & Action Toolbar */}
        <div
          className="flex flex-wrap items-center justify-between gap-1.5 border-t border-edge bg-subtle px-2 py-1 text-xs select-none print:hidden"
          onMouseDown={(e) => e.preventDefault()} // Prevent textarea blur on toolbar click
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {check.goodStart && <Pill tone="positive">Strong start</Pill>}
            {check.weakStart && <Pill tone="warning">Weak start</Pill>}
            {check.number && <Pill tone="neutral">Has number</Pill>}
            <span
              className={`tabular-nums text-[11px] ${
                check.tooLong ? "font-bold text-warn" : "text-muted"
              }`}
            >
              {check.length}/{MAX_BULLET_LENGTH}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 hover:text-red-900 transition-colors"
              title="Delete bullet point"
              aria-label="Delete bullet point"
            >
              <Trash2 className="h-3 w-3" />
              <span>Delete</span>
            </button>
            <button
              type="button"
              onClick={() => {
                shouldRestoreFocusRef.current = true;
                cancel();
              }}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted hover:bg-raised hover:text-ink transition-colors"
              title="Cancel (Esc)"
              aria-label="Cancel editing"
            >
              <X className="h-3 w-3" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              onClick={() => {
                shouldRestoreFocusRef.current = true;
                commit();
              }}
              className="inline-flex items-center gap-0.5 rounded bg-ink px-2 py-0.5 text-[11px] font-medium text-paper hover:bg-ink/90 transition-colors"
              title="Save changes (Enter)"
              aria-label="Save bullet point"
            >
              <Check className="h-3 w-3" />
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Warnings List */}
        {warnings.length > 0 && (
          <ul
            id={warnId}
            className="flex flex-col gap-0.5 border-t border-edge bg-amber-50/60 px-2 py-1 text-[11px] text-warn print:hidden"
          >
            {warnings.map((w, i) => (
              <li key={i} className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
