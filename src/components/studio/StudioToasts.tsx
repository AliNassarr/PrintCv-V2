"use client";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import type { StudioToastsProps } from "@/lib/toast";
import { ToastRegion } from "@/components/ui/ToastRegion";

const INFO_MS = 4000;
const UNDO_MS: number | null = null;   // D2 (a): null, undo stays. D2 (b): 10000.

// Owns the toast timers. Every timer pauses while the mouse is on a toast or a toast has focus,
// so a message never vanishes under the pointer or from under the keyboard. A resumed timer starts
// again from the full time: that only ever gives more time.
export function StudioToasts({ toasts, onClose }: StudioToastsProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const wrap = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<HTMLElement | null>(null);   // where focus was before it entered a toast
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    for (const [id, h] of timers.current) {
      if (paused || !toasts.some((t) => t.id === id)) { clearTimeout(h); timers.current.delete(id); }
    }
    if (paused) return;
    for (const t of toasts) {
      const ms = t.kind === "info" ? INFO_MS : UNDO_MS;
      if (ms === null || timers.current.has(t.id)) continue;
      timers.current.set(t.id, setTimeout(() => { timers.current.delete(t.id); onClose(t.id); }, ms));
    }
  }, [toasts, paused, onClose]);

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  // The toasts changed. If focus is no longer in a toast (Undo, Close or a timer removed the one that
  // had it), stop the focus pause, even when we do not know where focus came from (a mouse click with
  // nothing focused before). Then put focus back where it was, but only when the browser dropped it to
  // the page: if something else already took focus (Undo focuses the item it brought back), that wins.
  useEffect(() => {
    const active = document.activeElement;
    if (active && wrap.current?.contains(active)) return;
    const back = cameFrom.current;
    cameFrom.current = null;
    setFocused(false);
    if (back?.isConnected && (active === document.body || active === null)) back.focus({ preventScroll: true });
  }, [toasts]);

  const onFocus = (e: FocusEvent) => {
    const from = e.relatedTarget as HTMLElement | null;
    if (!wrap.current?.contains(from)) cameFrom.current = from;
    setFocused(true);
  };
  const onBlur = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (wrap.current?.contains(to)) return;   // moving between toast buttons
    if (!to) {
      // Chromium blurs a focused button while it removes it, with no new target. Keep cameFrom for the
      // effect above. If the button is still on the page next frame, it was a click on the page: stop.
      const from = e.target as HTMLElement;
      requestAnimationFrame(() => {
        if (!from.isConnected) return;
        cameFrom.current = null;
        setFocused(false);
      });
      return;
    }
    setFocused(false);
    cameFrom.current = null;
  };

  return (
    <div ref={wrap} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={onFocus} onBlur={onBlur}>
      <ToastRegion toasts={toasts} onClose={onClose} />
    </div>
  );
}
