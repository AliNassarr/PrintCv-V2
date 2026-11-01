"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Everything outside the popup gets `inert`: no clicks, no focus, and screen readers skip it.
// Walks up from the popup and marks the siblings at each level. Returns the undo.
export function inertOutside(el: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from<Element>(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      sibling.inert = true;
      changed.push(sibling);
    }
  }
  return () => changed.forEach((s) => (s.inert = false));
}

// Keyboard rules for a popup window: focus moves in when it opens, Tab stays inside,
// Escape closes it, and focus goes back to the button that opened it.
// While it is open the page behind it cannot be used or scrolled.
export function useDialog(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  // Keep the latest onClose without running the effect again on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const undoInert = ref.current ? inertOutside(ref.current) : () => {};
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      const dialog = ref.current;
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Give the page back first: an inert button cannot take focus
      undoInert();
      html.style.overflow = overflow;
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
