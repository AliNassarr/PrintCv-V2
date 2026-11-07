"use client";

import React, { useState, useRef, useEffect, useId } from "react";

export interface InlineTextProps {
  id: string;
  initialValue: string;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  type?: "text" | "email" | "tel" | "url";
  onSave: (value: string) => void;
  children?: React.ReactNode;
}

export function InlineText({
  id,
  initialValue,
  placeholder = "Click to edit...",
  className = "",
  style,
  ariaLabel,
  type = "text",
  onSave,
  children,
}: InlineTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const displayRef = useRef<HTMLSpanElement>(null);
  const isCommittingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const inputId = useId();

  // Sync draft if initialValue changes externally while not editing
  useEffect(() => {
    if (!isEditing) {
      setDraft(initialValue);
    }
  }, [initialValue, isEditing]);

  // Focus and select cursor when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      // Capability check: WHATWG HTML5 disallows setSelectionRange on 'email' and 'number'
      if (type !== "email" && typeof el.setSelectionRange === "function") {
        try {
          el.setSelectionRange(el.value.length, el.value.length);
        } catch {
          // Safely catch if browser disallows selection on custom input types
        }
      }
    } else if (!isEditing && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      displayRef.current?.focus();
    }
  }, [isEditing, type]);

  const commit = (val?: string) => {
    if (isCommittingRef.current || isCancelledRef.current) return;
    isCommittingRef.current = true;
    const textToCommit =
      val !== undefined
        ? val
        : inputRef.current
        ? inputRef.current.value
        : draft;
    const trimmed = textToCommit.trim();
    if (trimmed !== initialValue) {
      onSave(trimmed);
    }
    setIsEditing(false);
    setTimeout(() => {
      isCommittingRef.current = false;
    }, 50);
  };

  const cancel = () => {
    isCancelledRef.current = true;
    setDraft(initialValue);
    setIsEditing(false);
    setTimeout(() => {
      isCancelledRef.current = false;
    }, 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      shouldRestoreFocusRef.current = true;
      commit(e.currentTarget.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      shouldRestoreFocusRef.current = true;
      cancel();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!isCancelledRef.current && !isCommittingRef.current) {
      commit(e.currentTarget.value);
    }
  };

  // DISPLAY MODE
  if (!isEditing) {
    const isBlank = !initialValue || initialValue.trim() === "";
    return (
      <span
        ref={displayRef}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel || `Edit ${placeholder}`}
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
        title="Click to edit"
        className={`group/field relative inline-block cursor-text rounded px-1 -mx-1 transition-colors hover:bg-amber-100/60 hover:outline hover:outline-1 hover:outline-amber-400 focus-visible:outline-2 focus-visible:outline-amber-500 print:hover:bg-transparent print:hover:outline-none ${
          isBlank ? "text-gray-400 italic font-normal" : ""
        } ${className}`}
        style={style}
      >
        {isBlank ? (
          <span className="italic text-gray-400 select-none">{placeholder}</span>
        ) : (
          children || draft
        )}
        <span
          className="ml-1 hidden group-hover/field:inline-flex text-[10px] font-sans font-medium text-amber-800 bg-amber-100 px-1 py-0.2 rounded border border-amber-300 pointer-events-none print:hidden align-middle select-none"
          aria-hidden="true"
        >
          Edit
        </span>
      </span>
    );
  }

  // EDIT MODE (Zero layout-shift CSS Grid overlay)
  return (
    <span
      className="inline-grid items-baseline relative z-20"
      style={{ gridTemplateColumns: "1fr" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Ghost sizer defines the exact width based on draft/placeholder */}
      <span
        aria-hidden="true"
        className={`invisible col-start-1 row-start-1 whitespace-pre px-1 ${className}`}
        style={{
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          letterSpacing: "inherit",
          lineHeight: "inherit",
          minWidth: "2ch",
          ...style,
        }}
      >
        {draft || placeholder || "W"}
      </span>

      {/* Actual interactive input directly over the ghost */}
      <input
        ref={inputRef}
        id={inputId}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={`col-start-1 row-start-1 w-full rounded border border-amber-400 bg-amber-50/70 px-1 text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-500 leading-normal ${className}`}
        style={{
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          letterSpacing: "inherit",
          lineHeight: "inherit",
          color: "inherit",
          margin: 0,
          boxSizing: "border-box",
          ...style,
        }}
      />
    </span>
  );
}
