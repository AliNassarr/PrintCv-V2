"use client";
import { forwardRef, useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
import { inputClass } from "./TextInput";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { minHeight?: number; bare?: boolean }
// Fits the height to the text (the height only changes when the text needs a different one)
function fitHeight(el: HTMLTextAreaElement, minHeight: number) {
  if (el.scrollHeight > el.clientHeight) {
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
    return;
  }
  const currentHeight = el.style.height;
  el.style.height = "auto";
  const targetHeight = `${Math.max(minHeight, el.scrollHeight)}px`;
  if (currentHeight !== targetHeight) {
    el.style.height = targetHeight;
  }
}

// Grows with its text, and fits again when its size changes (turning a phone changes the width and padding).
// "bare" drops the edge when the parent card draws it (the line card).
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ className, minHeight = 68, bare, value, ...props }, ref) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current; if (el) fitHeight(el, minHeight);
  }, [value, minHeight]);
  useEffect(() => {
    const el = inner.current; if (!el || typeof ResizeObserver === "undefined") return;
    // Next frame, so setting the height never loops inside the observer
    let frame = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => fitHeight(el, minHeight)); });
    ro.observe(el);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [minHeight]);
  return (
    <textarea
      ref={(el) => { inner.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
      value={value}
      className={cx(bare ? "w-full resize-none bg-transparent text-app-md text-ink placeholder:text-muted focus:outline-none" : cx(inputClass, "resize-none py-2"), className)}
      {...props}
    />
  );
});
