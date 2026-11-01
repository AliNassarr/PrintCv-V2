"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink } from "lucide-react";
import { useCVStore } from "@/lib/store/cv-store";
import {
  buildBulletPrompt as buildPrompt,
  guideFor,
  hasEnoughAnswers,
  helperQuestions,
  HelperAnswer,
  HelperAnswers,
  HelperTarget,
  parseBulletsFromAI as parseReply,
} from "@/lib/bullet-helper";
import {
  LINE_HINTS,
  MAX_BULLET_LENGTH,
  hasNumber,
  hasPronoun,
  isSampleLine,
  looksLikeOldTemplate,
  startsWithActionVerb,
  startsWithWeakWord,
} from "@/lib/line-checks";
import { cx } from "@/lib/cx";
import { DialogFrame } from "@/components/ui/DialogFrame";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { TextArea } from "@/components/ui/TextArea";

const AI_LINKS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
];

const STEPS = ["Answer", "Copy", "Paste"];

interface BulletHelperProps {
  target: HelperTarget;
  onClose: () => void;
  onApply: (bullets: string[], mode: "replace" | "add") => void;
}

const NO_ANSWERS: HelperAnswers = {};

// The pills and warnings for one line the AI wrote, with the same words as the line card.
// Inside this window the shared-line warning is the short form: the long one points back to this button.
function parsedLineChecks(line: string) {
  const sample = isSampleLine(line);
  return {
    goodStart: startsWithActionVerb(line),
    number: hasNumber(line),
    tooLong: line.length > MAX_BULLET_LENGTH,
    warnings: [
      sample && LINE_HINTS.sample,
      !sample && looksLikeOldTemplate(line) && LINE_HINTS.shared,
      startsWithWeakWord(line) && LINE_HINTS.weakStart,
      hasPronoun(line) && LINE_HINTS.pronoun,
      line.length > MAX_BULLET_LENGTH && LINE_HINTS.tooLong,
    ].filter(Boolean) as string[],
  };
}

// An answer chip: 44px on phones, 32px from 640px. Picked: raised with an ink edge, like the option cards.
const chip = (selected: boolean) =>
  cx(
    "inline-flex h-11 items-center rounded-control border px-3 text-app transition-colors duration-150 sm:h-8",
    selected ? "border-ink bg-raised font-medium text-ink" : "border-control bg-paper text-ink hover:bg-raised",
  );

// "Help me write" (§7.7): answer a few questions, copy a message for any AI chat, paste its answer back
export function BulletHelper({ target, onClose, onApply }: BulletHelperProps) {
  const cvData = useCVStore((s) => s.cvData);
  const answers = useCVStore((s) => s.helperAnswers[target.item.id]) ?? NO_ANSWERS;
  const setHelperAnswer = useCVStore((s) => s.setHelperAnswer);

  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();

  const questions = useMemo(() => helperQuestions(target), [target]);
  const guide = guideFor(target);
  const enough = hasEnoughAnswers(target, answers);
  const prompt = useMemo(() => buildPrompt({ target, answers, cv: cvData }), [target, answers, cvData]);
  const parsed = useMemo(() => parseReply(reply), [reply]);
  const hasLines = target.item.bulletPoints.some((b) => b.trim());

  const name =
    target.kind === "project"
      ? target.item.name || "this project"
      : target.kind === "experience"
        ? target.item.role || target.item.company || "this job"
        : target.item.role || target.item.organization || "this activity";

  // Move focus to the first field when a step opens, and start the step at the top
  useEffect(() => {
    const body = bodyRef.current?.parentElement;
    if (body) body.scrollTop = 0;
    bodyRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [step]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const setAnswer = (id: string, value: HelperAnswer) => setHelperAnswer(target.item.id, id, value);

  const toggleOption = (id: string, option: string) => {
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    setAnswer(id, current.includes(option) ? current.filter((o) => o !== option) : [...current, option]);
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      promptRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  };

  const apply = (mode: "replace" | "add") => {
    if (parsed.length === 0) return;
    onApply(parsed, mode);
    onClose();
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Only when there is a hint, so an empty box never pushes the buttons onto a second row */}
      {step === 0 && !enough && (
        <p id="helper-hint" className="min-w-0 flex-1 basis-48 text-app-sm text-muted">
          Answer a few questions to go on. The more you write, the better.
        </p>
      )}
      {/* Below 640px the buttons use 12px sides, so Back, Add below mine and Replace my lines fit on one row at 390px */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {step > 0 && <Button variant="secondary" className="max-sm:px-3" onClick={() => setStep(step - 1)}>Back</Button>}
        {step < 2 && (
          <Button variant="primary" disabled={step === 0 && !enough} aria-describedby={step === 0 && !enough ? "helper-hint" : undefined}
            onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
        {step === 2 && hasLines && (
          <Button variant="secondary" className="max-sm:px-3" disabled={parsed.length === 0} onClick={() => apply("add")}>Add below mine</Button>
        )}
        {step === 2 && (
          <Button variant="primary" className="max-sm:px-3" disabled={parsed.length === 0} onClick={() => apply(hasLines ? "replace" : "add")}>
            {hasLines ? "Replace my lines" : "Add to my CV"}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <DialogFrame open onClose={onClose} titleId="bullet-helper-title" title={`Write lines for ${name}`} closeLabel="Close Help me write"
      footer={footer}>
      <div ref={bodyRef} className="flex flex-col gap-5">
        {/* Three steps in a row; the open one is marked for screen readers too */}
        <ol aria-label="Steps" className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined}
              className={cx(
                "-mb-px flex h-9 items-center gap-1.5 border-b-2 text-app",
                i === step ? "border-ink font-medium text-ink" : "border-transparent text-muted",
              )}>
              {i < step && <Check aria-hidden="true" className="h-3.5 w-3.5 text-data" strokeWidth={3} />}
              {label}
              {i < step && <span className="sr-only">, done</span>}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <>
            <p className="text-app text-ink">
              Answer in your own words. Your answers make the lines about you, not the same ones every student has.
            </p>
            {guide && (
              <p className="rounded-card bg-ground px-4 py-3 text-app text-muted">
                <span className="font-medium text-ink">{guide.name}:</span> {guide.about}
              </p>
            )}
            {questions.map((q, qIdx) => {
              const value = answers[q.id];
              const fieldId = `q-${q.id}`;
              if (q.type === "text") {
                return (
                  <div key={q.id} className="flex flex-col gap-2">
                    <label htmlFor={fieldId} className="text-app font-medium text-ink">{q.question}</label>
                    <TextArea
                      id={fieldId}
                      data-autofocus={qIdx === 0 ? true : undefined}
                      rows={2}
                      minHeight={64}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      placeholder={q.placeholder}
                    />
                  </div>
                );
              }
              const multi = q.type === "checkbox";
              return (
                <fieldset key={q.id} className="flex flex-col gap-2">
                  <legend className="mb-2 text-app font-medium text-ink">
                    {q.question}
                    {multi && <span className="font-normal text-muted"> (pick all that apply)</span>}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(q.options || []).map((option, oIdx) => {
                      const selected = multi ? Array.isArray(value) && value.includes(option) : value === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          data-autofocus={qIdx === 0 && oIdx === 0 ? true : undefined}
                          aria-pressed={selected}
                          onClick={() => (multi ? toggleOption(q.id, option) : setAnswer(q.id, selected ? "" : option))}
                          className={chip(selected)}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-app text-ink">
              Copy this message and paste it into any AI chat. It only uses what you told us, and it asks the AI not to make
              anything up.
            </p>
            <TextArea
              ref={promptRef}
              readOnly
              aria-label="Message for the AI"
              value={prompt}
              rows={10}
              minHeight={220}
              onFocus={(e) => e.currentTarget.select()}
              className="max-h-[40vh] overflow-y-auto"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant="primary" data-autofocus onClick={copyPrompt}>
                {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                {copied ? "Copied" : "Copy the message"}
              </Button>
              <p className="min-w-0 flex-1 basis-48 text-app-sm text-muted" role="status" aria-live="polite">
                {copied ? "Copied. Now paste it into the chat and send it." : "Then paste it into any free AI chat."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {AI_LINKS.map((ai) => (
                <a key={ai.name} href={ai.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-control border border-control bg-paper px-3 text-app font-medium text-ink transition-colors duration-150 hover:bg-raised sm:h-10">
                  Open {ai.name}
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex flex-col gap-2">
              <label htmlFor="ai-reply" className="text-app font-medium text-ink">Paste what the AI wrote</label>
              <TextArea
                id="ai-reply"
                data-autofocus
                rows={5}
                minHeight={120}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={"- Built ...\n- Fixed ...\n- Tested ..."}
              />
            </div>

            {parsed.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-app text-muted">
                  We found {parsed.length} {parsed.length === 1 ? "line" : "lines"}. Read each one. If something is not true, fix it after
                  you add it.
                </p>
                <ul className="flex flex-col gap-2">
                  {parsed.map((line, i) => {
                    const c = parsedLineChecks(line);
                    return (
                      <li key={i} className="rounded-card border border-edge px-4 py-3">
                        <p className="text-app text-ink">{line}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {c.goodStart && <Pill tone="positive">Strong start</Pill>}
                          {c.number && <Pill tone="neutral">Has a number</Pill>}
                          <span className={cx("ml-auto text-app-sm tabular-nums", c.tooLong ? "font-medium text-warn" : "text-muted")}>
                            {line.length}/{MAX_BULLET_LENGTH}
                          </span>
                        </div>
                        {c.warnings.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1">
                            {c.warnings.map((w) => (
                              <li key={w} className="flex items-start gap-1.5 text-[13px] leading-[18px] text-warn">
                                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {reply.trim() !== "" && parsed.length === 0 && (
              <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-[18px] text-warn">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>We could not find any lines. Paste the list the AI wrote.</span>
              </p>
            )}
          </>
        )}
      </div>
    </DialogFrame>
  );
}
