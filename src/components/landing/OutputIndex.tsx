"use client";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// A tab bar above one stage. The open tab is a solid ink block; the others are white with a thin line.
export function OutputIndex({ names, panels }: { names: string[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => { const n = (i + names.length) % names.length; setActive(n); tabs.current[n]?.focus(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); move(active + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); move(active - 1); }
    if (e.key === "Home") { e.preventDefault(); move(0); }
    if (e.key === "End") { e.preventDefault(); move(names.length - 1); }
  };
  return (
    <div>
      {/* Three equal tabs across a phone; from 768 up each tab is as wide as its name */}
      <div role="tablist" aria-label="What you get" onKeyDown={onKey} className="grid grid-cols-3 gap-1 md:inline-flex">
        {names.map((n, i) => (
          <button key={n} ref={(el) => { tabs.current[i] = el; }} role="tab" id={`out-tab-${i}`} aria-controls={`out-panel-${i}`}
            aria-selected={i === active} tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)}
            className={`min-h-12 rounded-landing px-2 text-step-small font-medium transition-colors duration-150 md:px-6 md:text-step-body ${i === active ? "border border-ink bg-ink text-paper" : "border border-line bg-paper text-ink hover:bg-stage"}`}>
            {n}
          </button>
        ))}
      </div>
      {/* The stage: the soft panel tone with a thin line. It grows to fit the open panel, so the whole PDF page and
          the whole AI message show. It is a size container, so the PDF panel can fit the sheet to its
          width. The open panel sits in the middle; the closed ones get the hidden class too, because flex would beat
          the hidden attribute. The panel takes focus, since the PDF and the score card hold no control of their own. */}
      <div className="relative mt-2 overflow-hidden rounded-xl border border-line bg-stage [container-type:inline-size]">
        {panels.map((p, i) => (
          <div key={i} role="tabpanel" id={`out-panel-${i}`} aria-labelledby={`out-tab-${i}`} hidden={i !== active} tabIndex={0}
            className={`${i === active ? "flex" : "hidden"} justify-center px-4 py-6 motion-safe:animate-fade-slow md:px-8 md:py-12`}>{p}</div>
        ))}
      </div>
    </div>
  );
}
