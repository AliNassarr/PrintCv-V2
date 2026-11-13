"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Check, Copy, ExternalLink, Sparkles, FileText, HelpCircle, MessageSquareText, AlertTriangle } from "lucide-react";
import { useCVStore } from "@/lib/store/cv-store";
import { getSessionController } from "@/lib/draft-session";
import {
  buildBulletPrompt as buildPrompt,
  guideFor,
  hasEnoughAnswers,
  helperQuestions,
  HelperAnswer,
  HelperAnswers,
  HelperTarget,
  usedOpeningWords,
  parseBulletsFromAI as parseReply,
  prepareGeneratedCandidates,
} from "@/lib/bullet-helper";
import { ProjectArchetype } from "@/lib/project-guide";
import { ReadmeParseResult, extractReadmeSections } from "@/lib/readme-parser";
import { DialogFrame } from "@/components/ui/DialogFrame";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { cx } from "@/lib/cx";

import { ReadmeUploadZone, ReadmeFileSummary } from "./help-me-write/ReadmeUploadZone";
import { DynamicQuestionList, EditableQuestionItem } from "./help-me-write/DynamicQuestionList";
import { GenerationActionBar } from "./help-me-write/GenerationActionBar";
import { BulletReviewStudio, BulletCandidateItem } from "./help-me-write/BulletReviewStudio";

interface BulletHelperProps {
  target: HelperTarget;
  onClose: () => void;
  onApply: (bullets: string[], mode: "replace" | "add") => void;
}

const NO_ANSWERS: HelperAnswers = {};
const TABS = [
  { id: 0, label: "1. Questions & README", shortLabel: "1. Setup", icon: HelpCircle },
  { id: 1, label: "2. Generate Bullets", shortLabel: "2. Generate", icon: Sparkles },
  { id: 2, label: "3. Review Studio", shortLabel: "3. Review", icon: FileText },
];

export function BulletHelper({ target, onClose, onApply }: BulletHelperProps) {
  const cvData = useCVStore((s) => s.cvData);
  const setHelperAnswer = useCVStore((s) => s.setHelperAnswer);
  const globalAnswers = useCVStore((s) => s.helperAnswers[target.item.id]) ?? NO_ANSWERS;

  // Active step / tab in the studio dialog
  const [activeTab, setActiveTab] = useState(0);

  // 1. Temporary README state (strictly in-memory, never stored in Zustand/localStorage)
  const [readmeFile, setReadmeFile] = useState<ReadmeFileSummary | null>(null);
  const [readmeContent, setReadmeContent] = useState<string>("");
  const [readmeParsed, setReadmeParsed] = useState<ReadmeParseResult | null>(null);

  // 2. Questions state (initialized from target guide/archetype, editable by user)
  const [customQuestions, setCustomQuestions] = useState<EditableQuestionItem[]>(() => {
    return helperQuestions(target).map((q) => ({ ...q }));
  });
  const [archetypeOverride, setArchetypeOverride] = useState<ProjectArchetype | undefined>(
    target.kind === "project" ? target.item.archetypeOverride : undefined
  );

  // 3. AI Generation request state
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);
  const [missingInfoPrompt, setMissingInfoPrompt] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<BulletCandidateItem[]>([]);

  // 4. Offline Copy Prompt & manual paste fallback state
  const [copied, setCopied] = useState(false);
  const [manualReplyText, setManualReplyText] = useState("");
  const [useManualPaste, setUseManualPaste] = useState(false);
  const [confirmManualReplaceOpen, setConfirmManualReplaceOpen] = useState(false);

  const activeTargetIdRef = useRef(target.item.id);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{slug:string;name:string;text:string}>).detail;
      if (!detail || target.kind !== "project" || target.item.slug !== detail.slug) return;
      const parsed = extractReadmeSections(detail.text);
      setReadmeFile({ name: `${detail.name} README.md`, size: detail.text.length });
      setReadmeContent(detail.text);
      setReadmeParsed(parsed);
      setActiveTab(0);
    };
    window.addEventListener("printcv:github-readme", receive);
    return () => window.removeEventListener("printcv:github-readme", receive);
  }, [target]);

  // Reset temporary state if target changes
  useEffect(() => {
    if (activeTargetIdRef.current !== target.item.id) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      activeTargetIdRef.current = target.item.id;
      setIsGenerating(false);
      setReadmeFile(null);
      setReadmeContent("");
      setReadmeParsed(null);
      setCandidates([]);
      setErrorMessage(null);
      setRetryAfterSeconds(null);
      setMissingInfoPrompt(null);
      setActiveTab(0);
      setCustomQuestions(helperQuestions(target).map((q) => ({ ...q })));
    }
  }, [target]);

  // Clean up timers and in-flight fetch requests on unmount
  useEffect(() => {
    return () => {
      clearTimeout(copiedTimer.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Update questions if archetype override changes
  const handleArchetypeChange = useCallback(
    (newArchetype: ProjectArchetype | undefined) => {
      setArchetypeOverride(newArchetype);
      const updatedTarget: HelperTarget =
        target.kind === "project"
          ? {
              ...target,
              item: { ...target.item, archetypeOverride: newArchetype },
            }
          : target;
      setCustomQuestions(helperQuestions(updatedTarget).map((q) => ({ ...q })));
    },
    [target]
  );

  const guide = guideFor(target);
  const answers = globalAnswers;

  const itemName =
    target.kind === "project"
      ? target.item.name || "this project"
      : target.kind === "experience"
      ? target.item.role || target.item.company || "this job"
      : target.item.role || target.item.organization || "this activity";

  const targetTitle =
    target.kind === "project"
      ? `Write bullets for ${itemName}`
      : target.kind === "experience"
      ? `Write bullets for ${itemName}`
      : `Write bullets for ${itemName}`;

  // Build prompt for Copy Prompt action
  const prompt = useMemo(() => {
    const rawPrompt = buildPrompt({ target, answers, cv: cvData });
    if (readmeParsed && readmeParsed.excerpt) {
      return `${rawPrompt}\n\nTechnical README Architecture Context:\n${readmeParsed.excerpt}`;
    }
    return rawPrompt;
  }, [target, answers, cvData, readmeParsed]);

  const existingBullets = target.item.bulletPoints.filter((b) => b.trim());
  const hasExistingBullets = existingBullets.length > 0;

  // Answer handler
  const handleAnswerChange = (id: string, value: HelperAnswer) => {
    setHelperAnswer(target.item.id, id, value);
  };

  // Question customization handlers
  const handleQuestionEdit = (id: string, newText: string) => {
    setCustomQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, question: newText } : q))
    );
  };

  const handleQuestionAdd = (questionText: string) => {
    const newId = `custom-q-${Date.now()}`;
    const newQ: EditableQuestionItem = {
      id: newId,
      type: "text",
      question: questionText,
      placeholder: "Describe specific engineering details...",
      isCustom: true,
    };
    setCustomQuestions((prev) => [...prev, newQ]);
  };

  const handleQuestionRemove = (id: string) => {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleQuestionMove = (index: number, direction: "up" | "down") => {
    setCustomQuestions((prev) => {
      const next = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleRestoreDefaults = () => {
    setCustomQuestions(helperQuestions(target).map((q) => ({ ...q })));
  };

  // README handlers
  const handleReadmeLoaded = (fileInfo: ReadmeFileSummary, rawText: string, parseResult: ReadmeParseResult) => {
    setReadmeFile(fileInfo);
    setReadmeContent(rawText);
    setReadmeParsed(parseResult);
  };

  const handleReadmeRemoved = () => {
    setReadmeFile(null);
    setReadmeContent("");
    setReadmeParsed(null);
  };

  // Copy prompt action with resilient fallback for sandboxed/headless environments
  const handleCopyPrompt = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await Promise.race([
          navigator.clipboard.writeText(prompt),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 400)),
        ]);
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      try {
        promptRef.current?.select();
        document.execCommand("copy");
      } catch {
        // Fallback: visual confirmation always triggered
      }
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  };

  // Generate with AI action
  const handleGenerateAI = async () => {
    if (isGenerating) return;

    const sessionController = getSessionController();
    const currentOwner = sessionController.getCurrentOwner();
    if (currentOwner.kind !== "account") {
      setErrorMessage("In-app AI generation requires a verified 42 student account. In guest mode, please use the offline Copy Prompt and paste your bullets below.");
      return;
    }

    const targetIdAtStart = target.item.id;
    const genAtStart = sessionController.getGeneration();

    setIsGenerating(true);
    setErrorMessage(null);
    setRetryAfterSeconds(null);
    setMissingInfoPrompt(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Collect facts from answered questions
    const facts = customQuestions
      .map((q) => {
        const rawAns = answers[q.id];
        const answer = Array.isArray(rawAns) ? rawAns.filter(Boolean).join(", ") : (rawAns || "").trim();
        return { question: q.question, answer };
      })
      .filter((f) => f.answer.length > 0);

    const usedVerbs = usedOpeningWords(cvData, target.item.id);

    const payload = {
      projectName: itemName,
      projectSlug: target.kind === "project" ? target.item.slug : undefined,
      techStack: target.kind === "project" ? target.item.techStack || guide?.techStack || "" : "",
      targetRole: cvData.targetRole || "",
      facts,
      readmeContent: readmeContent || undefined,
      usedActionVerbs: usedVerbs,
    };

    try {
      const res = await fetch("/api/ai/generate-bullets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // Stale request check: ignore if aborted, target changed, or session generation changed
      if (controller.signal.aborted || activeTargetIdRef.current !== targetIdAtStart || sessionController.getGeneration() !== genAtStart) {
        return;
      }

      // Safe JSON parsing with malformed JSON detection
      let data: any = null;
      let parseFailed = false;
      try {
        const rawText = await res.text();
        if (controller.signal.aborted || activeTargetIdRef.current !== targetIdAtStart) {
          return;
        }
        if (rawText && rawText.trim()) {
          data = JSON.parse(rawText);
        } else {
          data = null;
        }
      } catch {
        parseFailed = true;
      }

      // Check stale request after body read
      if (controller.signal.aborted || activeTargetIdRef.current !== targetIdAtStart || sessionController.getGeneration() !== genAtStart) {
        return;
      }

      // Handle malformed JSON on an otherwise successful HTTP 200
      if (parseFailed && res.ok) {
        setErrorMessage("Received malformed or unparseable response from server. Please use the offline Copy Prompt.");
        return;
      }

      // Parse Retry-After header or data payload
      const headerRetryAfter = res.headers.get("Retry-After");
      const parsedHeaderRetry = headerRetryAfter ? parseInt(headerRetryAfter, 10) : NaN;
      const retrySec = !isNaN(parsedHeaderRetry) && parsedHeaderRetry > 0
        ? parsedHeaderRetry
        : (typeof data?.retryAfterSeconds === "number" && data.retryAfterSeconds > 0
            ? data.retryAfterSeconds
            : 10);

      // Handle non-OK HTTP status codes explicitly
      if (!res.ok || !data?.ok) {
        switch (res.status) {
          case 401:
            setErrorMessage(
              data?.error ||
              "Authentication required. Please log in with your 42 student account to use in-app AI generation, or use the offline Copy Prompt."
            );
            break;

          case 413:
            setErrorMessage(
              data?.error ||
              "Request payload too large (exceeds 32 KB limit). Shorten your answers or README excerpt, or use the offline Copy Prompt."
            );
            break;

          case 422:
            setErrorMessage(
              data?.error ||
              "Invalid request input. Please check the project details and answers, or use the offline Copy Prompt."
            );
            break;

          case 429:
            setRetryAfterSeconds(retrySec);
            setErrorMessage(
              data?.error ||
              `Generation rate limit reached. Please wait ${retrySec}s before retrying, or use the offline Copy Prompt.`
            );
            break;

          case 502:
            setErrorMessage(
              data?.error ||
              "AI upstream service is temporarily unreachable (502 Bad Gateway). Please retry shortly or use the offline Copy Prompt."
            );
            break;

          case 503:
            setErrorMessage(
              data?.error ||
              "AI generation service is temporarily unavailable or not configured on this server. Please use the offline Copy Prompt."
            );
            break;

          case 504:
            setErrorMessage(
              data?.error ||
              "AI generation request timed out (504 Gateway Timeout). Please retry or use the offline Copy Prompt."
            );
            break;

          default:
            setErrorMessage(
              data?.error ||
              `Generation request failed (HTTP ${res.status}). You can use the offline Copy Prompt below.`
            );
            break;
        }
        return;
      }

      // Handle HTTP 200 responses
      if (res.status === 200 && data?.ok) {
        // Check for sufficient evidence note
        if (data.hasSufficientEvidence === false && data.missingInformationPrompt) {
          setMissingInfoPrompt(data.missingInformationPrompt);
        }

        const returnedBullets: string[] = Array.isArray(data.bullets) ? data.bullets : [];
        const returnedCandidates: Array<{ text?: string; unverifiedMetric?: boolean }> = Array.isArray(data.candidates) ? data.candidates : [];

        // Explicit empty response handling
        if (returnedBullets.length === 0) {
          setErrorMessage(
            "AI returned no bullet suggestions. Try adding more specific technical details to your answers, or use the offline Copy Prompt."
          );
          return;
        }

        // Success: populate candidate bullets and transition to Review Studio tab
        const newCandidates: BulletCandidateItem[] = prepareGeneratedCandidates(
          returnedBullets,
          returnedCandidates,
          data.hasSufficientEvidence !== false,
        );
        setCandidates(newCandidates);
        setActiveTab(2); // Automatically advance to Candidate Review Studio
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || activeTargetIdRef.current !== targetIdAtStart) {
        return;
      }
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setErrorMessage("Network connection failed. Check your internet connection or use the offline Copy Prompt.");
    } finally {
      if (activeTargetIdRef.current === targetIdAtStart) {
        setIsGenerating(false);
      }
    }
  };

  // Candidate review handlers
  const handleCandidateTextChange = (id: string, newText: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, text: newText } : c))
    );
  };

  const handleCandidateToggle = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const handleCandidateRemove = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  // Manual paste handler (for students who copied prompt to ChatGPT/Claude and pasted back)
  const parsedManualBullets = useMemo(() => parseReply(manualReplyText), [manualReplyText]);

  const handleApplyManual = (mode: "replace" | "add") => {
    if (parsedManualBullets.length === 0) return;
    onApply(parsedManualBullets, mode);
    onClose();
  };

  const handleApplyCandidates = (bullets: string[], mode: "replace" | "add") => {
    if (bullets.length === 0) return;
    onApply(bullets, mode);
    onClose();
  };

  // Move scroll to top when tab changes
  useEffect(() => {
    const body = bodyRef.current?.parentElement;
    if (body) body.scrollTop = 0;
  }, [activeTab]);

  return (
    <DialogFrame
      open
      onClose={onClose}
      titleId="help-me-write-v2-title"
      title={targetTitle}
      closeLabel="Close Help Me Write"
      width={740}
    >
      <div ref={bodyRef} className="flex flex-col gap-5">
        {/* Navigation Tabs Header */}
        <nav aria-label="Help Me Write Steps" className="flex border-b border-rule">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cx(
                  "-mb-px flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 text-app-sm font-medium transition-colors",
                  isActive
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:border-edge hover:text-ink"
                )}
                aria-current={isActive ? "step" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
                {tab.id === 2 && candidates.length > 0 && (
                  <span className="rounded-full bg-raised px-1.5 py-0.2 text-[11px] font-semibold text-ink">
                    {candidates.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab 0: Questions & README */}
        {activeTab === 0 && (
          <div className="flex flex-col gap-5">
            {/* Optional README Upload Component */}
            <div className="flex flex-col gap-1.5">
              <h3 className="text-app font-medium text-ink">Optional Project README</h3>
              <ReadmeUploadZone
                currentFile={readmeFile}
                parsedResult={readmeParsed}
                onFileLoaded={handleReadmeLoaded}
                onFileRemoved={handleReadmeRemoved}
                disabled={isGenerating}
              />
            </div>

            {/* Dynamic Question List */}
            <DynamicQuestionList
              questions={customQuestions}
              answers={answers}
              onAnswerChange={handleAnswerChange}
              onQuestionEdit={handleQuestionEdit}
              onQuestionAdd={handleQuestionAdd}
              onQuestionRemove={handleQuestionRemove}
              onQuestionMove={handleQuestionMove}
              onRestoreDefaults={handleRestoreDefaults}
              archetypeOverride={archetypeOverride}
              onArchetypeChange={handleArchetypeChange}
              isProject={target.kind === "project"}
              guideInfo={guide ? { name: guide.name, about: guide.about, category: guide.category } : undefined}
            />

            {/* Forward navigation button */}
            <div className="flex justify-end pt-2 border-t border-rule">
              <Button variant="primary" onClick={() => setActiveTab(1)} className="h-10 px-5">
                Next: Generate Bullets
              </Button>
            </div>
          </div>
        )}

        {/* Tab 1: Generate & Action Bar */}
        {activeTab === 1 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <h3 className="text-app font-medium text-ink">AI Bullet Generation</h3>
              <p className="text-app-sm text-muted">
                Generate tailored, past-tense CV bullet points adhering strictly to Dr. Wissam writing rules, or copy the prompt into any external AI chat.
              </p>
            </div>

            {/* AI Generation Action Bar */}
            <GenerationActionBar
              onGenerate={handleGenerateAI}
              onCopyPrompt={handleCopyPrompt}
              isGenerating={isGenerating}
              copied={copied}
              errorMessage={errorMessage}
              retryAfterSeconds={retryAfterSeconds}
              missingInformationPrompt={missingInfoPrompt}
            />

            {/* Collapsible / Read-only Prompt Preview */}
            <div className="flex flex-col gap-2 rounded-card border border-edge bg-ground p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-app-sm font-medium text-ink">Prompt Preview (Payload Sent to AI)</span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 text-xs text-ink hover:underline font-medium"
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[12px] text-muted">
                This preview shows the exact engineering context compiled from your answers and technical README. No passwords, tokens, or unrelated personal data are included.
              </p>
              <TextArea
                ref={promptRef}
                readOnly
                aria-label="Prompt text for AI generation"
                value={prompt}
                rows={5}
                minHeight={110}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs max-h-48 overflow-y-auto"
              />
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-rule">
              <Button variant="secondary" onClick={() => setActiveTab(0)}>
                Back to Questions
              </Button>
              {candidates.length > 0 && (
                <Button variant="primary" onClick={() => setActiveTab(2)}>
                  View Suggestions ({candidates.length})
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Review Studio & Manual Paste Fallback */}
        {activeTab === 2 && (
          <div className="flex flex-col gap-5">
            {/* Toggle between AI Candidates Studio and Manual External Paste */}
            <div className="flex items-center justify-between border-b border-rule pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseManualPaste(false)}
                  className={cx(
                    "rounded-control px-3 py-1.5 text-app-sm font-medium transition-colors",
                    !useManualPaste ? "bg-raised text-ink font-semibold" : "text-muted hover:text-ink"
                  )}
                >
                  Generated Candidates ({candidates.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUseManualPaste(true)}
                  className={cx(
                    "rounded-control px-3 py-1.5 text-app-sm font-medium transition-colors",
                    useManualPaste ? "bg-raised text-ink font-semibold" : "text-muted hover:text-ink"
                  )}
                >
                  Paste External AI Reply
                </button>
              </div>
            </div>

            {!useManualPaste ? (
              candidates.length > 0 ? (
                <BulletReviewStudio
                  candidates={candidates}
                  onCandidateTextChange={handleCandidateTextChange}
                  onCandidateToggle={handleCandidateToggle}
                  onCandidateRemove={handleCandidateRemove}
                  onApply={handleApplyCandidates}
                  hasExistingBullets={hasExistingBullets}
                  existingBulletCount={existingBullets.length}
                  missingInformationPrompt={missingInfoPrompt}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-edge p-8 text-center">
                  <Sparkles className="h-8 w-8 text-muted" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <p className="text-app font-medium text-ink">No Generated Suggestions Yet</p>
                    <p className="text-app-sm text-muted">
                      Click &quot;Generate with AI&quot; on step 2, or paste a reply from ChatGPT/Claude.
                    </p>
                  </div>
                  <Button variant="primary" onClick={() => setActiveTab(1)} className="mt-2">
                    Go to Generation Step
                  </Button>
                </div>
              )
            ) : (
              /* Manual External Paste Fallback */
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="manual-ai-reply" className="text-app font-medium text-ink">
                    Paste the response from ChatGPT, Claude, or Gemini:
                  </label>
                  <TextArea
                    id="manual-ai-reply"
                    rows={6}
                    minHeight={140}
                    value={manualReplyText}
                    onChange={(e) => setManualReplyText(e.target.value)}
                    placeholder={"- Engineered an RFC-compliant HTTP web server in C++...\n- Built non-blocking poll() sockets..."}
                  />
                </div>

                {parsedManualBullets.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-card bg-ground p-3.5">
                    <p className="text-app-sm font-medium text-ink">
                      Parsed {parsedManualBullets.length} bullet point(s):
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {parsedManualBullets.map((bullet, i) => (
                        <li key={i} className="text-app-sm text-ink flex items-start gap-2">
                          <Check className="h-4 w-4 text-data shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Confirmation Banner for Destructive Replacement (Manual Paste) */}
                {confirmManualReplaceOpen && (
                  <div role="alert" className="flex flex-col gap-2 rounded-card border border-warn bg-ground p-3.5 text-app-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" aria-hidden="true" />
                      <p className="font-medium text-ink">
                        Replace {existingBullets.length} existing bullet(s) with {parsedManualBullets.length} pasted bullet(s)?
                      </p>
                    </div>
                    <p className="text-muted text-xs">
                      This will overwrite the current bullet points for this item. You can also choose &quot;Add Below Mine&quot; to preserve both.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setConfirmManualReplaceOpen(false);
                          handleApplyManual("replace");
                        }}
                        className="h-8 px-3"
                      >
                        Confirm Replace
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmManualReplaceOpen(false)}
                        className="h-8 px-2 text-muted"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-rule">
                  <Button variant="secondary" onClick={() => setActiveTab(1)}>
                    Back to Generation
                  </Button>
                  <div className="flex items-center gap-2">
                    {hasExistingBullets && (
                      <Button
                        variant="secondary"
                        onClick={() => handleApplyManual("add")}
                        disabled={parsedManualBullets.length === 0}
                      >
                        Add Below Mine
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (hasExistingBullets) {
                          setConfirmManualReplaceOpen(true);
                        } else {
                          handleApplyManual("replace");
                        }
                      }}
                      disabled={parsedManualBullets.length === 0}
                    >
                      {hasExistingBullets ? "Replace My Lines" : "Add to My CV"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DialogFrame>
  );
}
