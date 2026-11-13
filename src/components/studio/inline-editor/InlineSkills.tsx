"use client";

import React, { useState, useRef, useEffect, useId } from "react";
import { parseSkillsCommaList } from "@/lib/sanitizer";

export interface InlineSkillsProps {
  id: string;
  categoryKey: "languages" | "developerTools" | "technologiesFrameworks" | "projectManagementTools";
  categoryLabel: string;
  skills: string[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onSave: (skills: string[]) => void;
  children?: React.ReactNode;
}

export function InlineSkills({
  id,
  categoryKey,
  categoryLabel,
  skills,
  placeholder = "e.g. C, Python, Docker",
  className = "",
  style,
  onSave,
  children,
}: InlineSkillsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => skills.join(", "));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const displayRef = useRef<HTMLSpanElement>(null);
  const isCommittingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const inputId = useId();

  useEffect(() => {
    if (!isEditing) {
      setDraft(skills.join(", "));
    }
  }, [skills, isEditing]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    } else if (!isEditing && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      displayRef.current?.focus();
    }
  }, [isEditing]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const commit = (val?: string) => {
    if (isCommittingRef.current || isCancelledRef.current) return;
    isCommittingRef.current = true;
    const textToCommit =
      val !== undefined
        ? val
        : textareaRef.current
        ? textareaRef.current.value
        : draft;
    const list = parseSkillsCommaList(textToCommit);
    onSave(list);
    setIsEditing(false);
    setTimeout(() => {
      isCommittingRef.current = false;
    }, 50);
  };

  const cancel = () => {
    isCancelledRef.current = true;
    setDraft(skills.join(", "));
    setIsEditing(false);
    setTimeout(() => {
      isCancelledRef.current = false;
    }, 50);
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

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!isCancelledRef.current && !isCommittingRef.current) {
      commit(e.currentTarget.value);
    }
  };

  // DISPLAY MODE
  if (!isEditing) {
    const isBlank = skills.length === 0;
    return (
      <span
        ref={displayRef}
        tabIndex={0}
        role="button"
        aria-label={`Edit ${categoryLabel} skills list`}
        aria-labelledby={`${inputId}-display ${inputId}-action`}
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
        title="Click to edit skills"
        className={`group/skills relative inline cursor-text rounded px-1 -mx-1 transition-colors hover:bg-amber-100/60 hover:outline hover:outline-1 hover:outline-amber-400 focus-visible:outline-2 focus-visible:outline-amber-500 print:hover:bg-transparent print:hover:outline-none ${
          isBlank ? "text-gray-600 italic font-normal" : ""
        } ${className}`}
        style={style}
      >
        <span id={`${inputId}-display`} className="inline">
          {isBlank ? (
            <span className="italic text-gray-600 select-none">{placeholder}</span>
          ) : (
            children || skills.join(", ")
          )}
        </span>
        <span id={`${inputId}-action`} className="sr-only">Edit {categoryLabel} skills list</span>
        <span
          className="ml-1 hidden group-hover/skills:inline-flex text-[10px] font-sans font-medium text-amber-800 bg-amber-100 px-1 py-0.2 rounded border border-amber-300 pointer-events-none print:hidden align-middle select-none"
          aria-hidden="true"
        >
          Edit
        </span>
      </span>
    );
  }

  // EDIT MODE (Inline multi-line auto-resizing textarea)
  return (
    <div
      className="inline-block w-[calc(100%-8rem)] min-w-[200px] align-top relative z-20 my-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        id={inputId}
        value={draft}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-label={`Edit ${categoryLabel} skills (comma-separated)`}
        rows={1}
        className="w-full resize-none rounded border border-amber-400 bg-amber-50/70 p-1 text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-500 leading-snug"
        style={{
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: "normal",
          color: "inherit",
          boxSizing: "border-box",
          ...style,
        }}
      />
    </div>
  );
}
