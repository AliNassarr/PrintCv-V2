"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { CVData } from "@/types/resume";
import type { StudioSection } from "@/lib/studio-sections";
import { matchJobKeywords, scoreCV, scoreLabel } from "@/lib/cv-score";
import { linesToFixList, nextStep } from "@/lib/progress";
import { cx } from "@/lib/cx";
import { DialogFrame } from "@/components/ui/DialogFrame";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { TextArea } from "@/components/ui/TextArea";

interface ScoreEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  cvData: CVData;
  heightBudget: { height: number; isOverflow: boolean; percentage: number };
  targetJobDescription: string;
  onTargetJobDescriptionChange: (jd: string) => void;
  onJumpToSection?: (section: StudioSection, itemId?: string, lineText?: string) => void;
  initialTab?: "overview" | "matcher" | "issues";
}

type Tab = "overview" | "matcher" | "issues";

// The ticks on the bar are the points where the label above the score changes (scoreLabel)
const TICKS = [
  { at: 30, label: "Good start" },
  { at: 60, label: "Almost there" },
  { at: 85, label: "Ready to send" },
];

// The done mark from the section steps: a filled circle with a check, or an empty ring
function CheckMark({ done }: { done: boolean }) {
  return done ? (
    <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-data">
      <Check aria-hidden="true" className="h-3 w-3 text-paper" strokeWidth={3} />
      <span className="sr-only">Done.</span>
    </span>
  ) : (
    <span className="mt-[3px] h-4 w-4 shrink-0 rounded-full border-[1.5px] border-field">
      <span className="sr-only">To do.</span>
    </span>
  );
}

// The score window (§7.5): the score and its bar, then three tabs
export function ScoreEngineModal({
  isOpen,
  onClose,
  cvData,
  heightBudget,
  targetJobDescription,
  onTargetJobDescriptionChange,
  onJumpToSection,
  initialTab = "overview",
}: ScoreEngineModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  const score = useMemo(() => scoreCV(cvData, { fitsOnePage: !heightBudget.isOverflow }), [cvData, heightBudget.isOverflow]);
  const next = useMemo(() => nextStep(cvData, score), [cvData, score]);
  const job = useMemo(() => matchJobKeywords(cvData, targetJobDescription), [cvData, targetJobDescription]);
  const toFix = useMemo(() => linesToFixList(cvData, score), [cvData, score]);
  const total = score.total;

  const jump = (section: StudioSection, itemId?: string, lineText?: string) => {
    onJumpToSection?.(section, itemId, lineText);
    onClose();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Your score" },
    { id: "issues", label: `Fix lines (${toFix.length})` },
    { id: "matcher", label: "Compare with a job ad" },
  ];

  // Left and right arrows, Home and End move between the tabs
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.findIndex((t) => t.id === activeTab);
    const to =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    setActiveTab(tabs[to].id);
    document.getElementById(`score-tab-${tabs[to].id}`)?.focus();
  };

  const panelProps = {
    role: "tabpanel",
    id: `score-panel-${activeTab}`,
    "aria-labelledby": `score-tab-${activeTab}`,
    tabIndex: 0,
    className: "pt-4",
  } as const;

  return (
    <DialogFrame open={isOpen} onClose={onClose} title="Your CV score" titleId="score-dialog-title" testId="score-dialog"
      closeLabel="Close the score window" fixedHeight>
      {/* Lead: the score, its label and the next step */}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="flex items-baseline gap-0.5">
          <span className="text-app-kpi tabular-nums text-ink">{total}</span>
          <span className="text-app text-muted">/100</span>
        </p>
        <p className="text-app font-medium text-ink">{scoreLabel(total)}</p>
      </div>
      <p className="mt-1 text-app text-muted">
        {next ? <>Next: <span className="text-ink">{next.text}</span></> : "Your CV is ready to send."}
      </p>

      {/* Bar from 0 to 100, with a tick where the label changes */}
      <div className="mt-5 flex items-start gap-2 text-app-sm tabular-nums text-muted">
        <span aria-hidden="true" className="-mt-1">0</span>
        <div className="relative min-w-0 flex-1">
          <div role="img" aria-label={`Score ${total} out of 100`} className="relative h-2 rounded-full bg-bar">
            <div className="h-2 rounded-full bg-data" style={{ width: `${total}%` }} />
            {TICKS.map((t) => <span key={t.at} aria-hidden="true" className="absolute top-0 h-2 w-px bg-paper" style={{ left: `${t.at}%` }} />)}
          </div>
          <div aria-hidden="true" className="relative mt-1.5 h-4 whitespace-nowrap">
            {TICKS.map((t, i) => (
              <span key={t.at} style={{ left: `${t.at}%` }}
                className={cx("absolute top-0 -translate-x-1/2", i === TICKS.length - 1 && "max-sm:left-auto max-sm:right-0 max-sm:translate-x-0")}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
        <span aria-hidden="true" className="-mt-1">100</span>
      </div>

      <p className="mt-3 text-app text-muted">
        <span className={heightBudget.isOverflow ? "text-bad" : undefined}>{heightBudget.isOverflow ? "Longer than 1 page" : "Fits on 1 page"}</span>
        {" · "}
        <span className="tabular-nums">{score.lineCount}</span> {score.lineCount === 1 ? "line" : "lines"} written
      </p>

      {/* Underline tabs. The row scrolls, so the focus ring sits inside each tab (an outside ring would be cut off) */}
      <div role="tablist" aria-label="Parts of your score" className="no-scrollbar -mx-4 mt-5 flex overflow-x-auto border-b border-rule px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => {
          const selected = activeTab === t.id;
          return (
            <button key={t.id} type="button" role="tab" id={`score-tab-${t.id}`} aria-selected={selected}
              aria-controls={selected ? `score-panel-${t.id}` : undefined} tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(t.id)} onKeyDown={onTabKey}
              className={cx(
                "-mb-px flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-app first:pl-0 focus-visible:outline-offset-[-2px] sm:h-10",
                selected ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Your score: the 4 groups and every check in them */}
      {activeTab === "overview" && (
        <div {...panelProps}>
          <div className="flex flex-col gap-5">
            {score.groups.map((g) => (
              <section key={g.id} aria-labelledby={`score-group-${g.id}`}>
                <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
                  <h3 id={`score-group-${g.id}`} className="text-app font-medium text-ink">{g.title}</h3>
                  <span className="text-app tabular-nums text-ink">{g.score}/{g.max}</span>
                </div>
                <ul>
                  {g.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-3 border-b border-rule py-2.5 last:border-b-0">
                      <CheckMark done={!c.tip} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={cx("text-app", c.tip ? "text-ink" : "text-muted")}>{c.label}</p>
                          <span className="shrink-0 text-app-sm tabular-nums text-muted">{c.points}/{c.max}</span>
                        </div>
                        {c.tip && (
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            <p className="min-w-0 flex-1 basis-56 text-[13px] leading-[18px] text-muted">{c.tip}</p>
                            {onJumpToSection && (
                              <Button size="sm" variant="secondary" aria-label={`Fix: ${c.label}`} onClick={() => jump(c.section)}>Fix</Button>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Fix lines: one row for each line, with all its problems and a button that opens the line */}
      {activeTab === "issues" && (
        <div {...panelProps}>
          {toFix.length > 0 ? (
            <ul>
              {toFix.map((item, idx) => (
                <li key={`${item.itemId}-${idx}`} data-test-id="score-issue"
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-rule py-3 first:pt-0 last:border-b-0">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-app-sm text-muted">{item.label}</p>
                    <p className="mt-0.5 break-words text-app text-ink">{item.text}</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {item.issues.map((issue) => (
                        <li key={issue} className="flex items-start gap-1.5 text-[13px] leading-[18px] text-warn">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {onJumpToSection && (
                    <Button size="sm" variant="secondary" aria-label={`Fix this line in ${item.label}`}
                      onClick={() => jump(item.section, item.itemId, item.text)}>
                      Fix this line
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-[38px] items-center rounded-card border border-dashed border-field px-4 py-3 text-app text-muted">
              {score.lineCount
                ? "No problems found in your lines. Still, read each one once more and make sure it is true."
                : "No lines yet. Open a project and write what you did. The Help me write button can help."}
            </div>
          )}
        </div>
      )}

      {/* Compare with a job ad: which tools from the ad are on the CV */}
      {activeTab === "matcher" && (
        <div {...panelProps}>
          <div className="flex flex-col gap-2">
            <label htmlFor="job-post" className="text-app font-medium text-ink">Paste a job ad</label>
            <TextArea
              id="job-post"
              rows={4}
              minHeight={104}
              value={targetJobDescription}
              onChange={(e) => onTargetJobDescriptionChange(e.target.value)}
              placeholder="Paste the text of a job you want. We show which tools it asks for and which ones your CV already has."
            />
          </div>

          {targetJobDescription.trim() ? (
            job.matched.length + job.missing.length === 0 ? (
              <p className="mt-4 rounded-card border border-dashed border-field px-4 py-3 text-app text-muted">
                We did not find any tools or languages in this ad.
              </p>
            ) : (
              <div className="mt-5 flex flex-col gap-5">
                <div>
                  <h3 className="text-app font-medium text-ink">Already on your CV ({job.matched.length})</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.matched.length > 0
                      ? job.matched.map((kw) => (
                          <Pill key={kw} tone="positive"><Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />{kw}</Pill>
                        ))
                      : <span className="text-app text-muted">None yet.</span>}
                  </div>
                </div>
                <div>
                  <h3 className="text-app font-medium text-ink">Not on your CV ({job.missing.length})</h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.missing.length > 0
                      ? job.missing.map((kw) => <Pill key={kw} tone="neutral">{kw}</Pill>)
                      : <span className="text-app text-muted">Your CV has all of them.</span>}
                  </div>
                  {job.missing.length > 0 && (
                    <p className="mt-2 text-[13px] leading-[18px] text-muted">
                      Only add the ones you have really used, in your skills or in a project.
                    </p>
                  )}
                </div>
              </div>
            )
          ) : (
            <p className="mt-4 rounded-card border border-dashed border-field px-4 py-3 text-app text-muted">
              This does not change your score. It helps you fit your CV to one job.
            </p>
          )}
        </div>
      )}
    </DialogFrame>
  );
}
