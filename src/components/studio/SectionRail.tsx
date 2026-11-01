import React from "react";
import { Check } from "lucide-react";
import { STUDIO_SECTIONS, type StudioSection } from "@/lib/studio-sections";
import type { Progress, SectionStatus } from "@/lib/progress";
import { cx } from "@/lib/cx";
import { Pill } from "@/components/ui/Pill";

const STATUS_WORDS: Record<SectionStatus, string> = { done: "done", started: "started", todo: "to do", off: "hidden", optional: "optional" };

export type IssueCounts = Record<StudioSection, number>;

// The section tabs and the editor content they open (the tabpanel in ReziStudioLayout)
export const sectionTabId = (section: StudioSection) => `section-tab-${section.toLowerCase()}`;
export const SECTION_PANEL_ID = "section-panel";

// The 16px mark of a step: done, started, to do, optional, hidden, or "{n} to fix".
// The tab's name comes from its text, so the words a user sees are in the name a screen reader hears
// (WCAG 2.5.3): the label, a hidden comma, then the mark, for example "Projects, 2 lines to fix" or "Skills, done".
function SectionMark({ status, issues }: { status: SectionStatus; issues: number }) {
  if (issues > 0) {
    return (
      <Pill tone="warning">
        <span>{issues}<span className="sr-only"> {issues === 1 ? "line" : "lines"}</span> to fix</span>
      </Pill>
    );
  }
  if (status === "off") return <span className="shrink-0 text-app-sm text-muted">Hidden</span>;
  const word = <span className="sr-only">{STATUS_WORDS[status]}</span>;
  if (status === "done") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-data">
        <Check aria-hidden="true" className="h-3 w-3 text-paper" strokeWidth={3} />
        {word}
      </span>
    );
  }
  return (
    <span
      className={cx(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-field",
        status === "optional" && "border-dashed",
      )}
    >
      {status === "started" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-data" />}
      {word}
    </span>
  );
}

interface SectionRailProps {
  activeSection: StudioSection;
  onSelect: (section: StudioSection) => void;
  progress: Progress;
  issues: IssueCounts;
}

// The section tabs: one tab row for every width, so there is one set of ids.
// Below 1024px it is a 44px row that scrolls sideways: the label, then the mark.
// From 1024px it is a step bar of six columns: the mark on top, the label centred under it, and a thin line
// joining the marks. Each column is as wide as its label allows, so "Courses and activities" gets more room
// than "Skills" and the labels wrap less. The labels are 12px there, and all of them are medium weight, so the
// columns do not shift when another step opens. The DOM order stays label then mark, so the spoken name
// stays "Projects, to do"; only the look puts the mark first.
export function SectionRail({ activeSection, onSelect, progress, issues }: SectionRailProps) {
  // Arrow keys, Home and End move between tabs (and open them), as in any tab row
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const ids = STUDIO_SECTIONS.map((s) => s.id);
    const at = ids.indexOf(activeSection);
    const to =
      e.key === "ArrowRight" ? (at + 1) % ids.length
      : e.key === "ArrowLeft" ? (at - 1 + ids.length) % ids.length
      : e.key === "Home" ? 0
      : e.key === "End" ? ids.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    onSelect(ids[to]);
    const tab = e.currentTarget.querySelector<HTMLButtonElement>(`[data-section="${ids[to]}"]`);
    tab?.focus();
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  // Below 1024px the row sits inside the 16px page margin, so a tab cut off by the scroll never touches the screen
  // edge. It fades over 12px at both ends so it is clear it scrolls; each tab's 12px side padding covers the fade.
  // The focus ring sits inside each tab, because the scrolling row would cut off a ring drawn outside it.
  // Each tab is "relative" so its hidden screen-reader words stay inside the row and do not widen the page.
  return (
    <div role="tablist" aria-label="Sections" onKeyDown={onKeyDown}
      className="no-scrollbar mx-4 flex h-11 shrink-0 items-stretch overflow-x-auto scroll-px-3 [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-12px),transparent)] lg:mx-0 lg:grid lg:h-auto lg:grid-cols-[repeat(6,auto)] lg:overflow-visible lg:px-1 lg:[mask-image:none] print:hidden" /* taste-skill-ignore: a fade mask on the scrolling row, not a gradient fill */>
      {STUDIO_SECTIONS.map((s, i) => {
        const active = s.id === activeSection;
        return (
          <button key={s.id} type="button" role="tab" id={sectionTabId(s.id)} data-section={s.id} aria-selected={active}
            aria-controls={active ? SECTION_PANEL_ID : undefined} tabIndex={active ? 0 : -1} onClick={() => onSelect(s.id)}
            className={cx(
              "relative isolate flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-app focus-visible:outline-offset-[-2px]",
              "lg:flex-col lg:justify-start lg:gap-1.5 lg:whitespace-normal lg:px-1 lg:pb-3 lg:pt-3 lg:text-center lg:text-app-sm lg:font-medium",
              active ? "font-medium text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink" : "text-muted hover:text-ink",
            )}>
            {/* The line between the marks, from the middle of this step to the middle of the next (1024px and up) */}
            <span aria-hidden="true"
              className={cx("absolute top-[22px] hidden h-px bg-edge lg:block", i === 0 ? "left-1/2" : "left-0", i === STUDIO_SECTIONS.length - 1 ? "right-1/2" : "right-0")} />
            <span>{s.label}<span className="sr-only">,</span></span>
            {/* From 1024px the mark sits first, on a paper strip that cuts the line around it. "order" would paint it
                under the line, so z-[1] lifts it; the tab's "isolate" keeps that inside the tab. */}
            <span className="relative z-[1] flex h-5 shrink-0 items-center lg:order-first lg:bg-paper lg:px-1.5">
              <SectionMark status={progress[s.id]} issues={issues[s.id]} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
