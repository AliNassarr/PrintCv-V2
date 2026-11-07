"use client";

import React, { useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Edit3, Check, RotateCcw, HelpCircle } from "lucide-react";
import { GuideQuestion, ProjectArchetype } from "@/lib/project-guide";
import { HelperAnswer, HelperAnswers } from "@/lib/bullet-helper";
import { TextArea } from "@/components/ui/TextArea";
import { TextInput } from "@/components/ui/TextInput";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/lib/cx";

export interface EditableQuestionItem extends GuideQuestion {
  isCustom?: boolean;
}

interface DynamicQuestionListProps {
  questions: EditableQuestionItem[];
  answers: HelperAnswers;
  onAnswerChange: (id: string, value: HelperAnswer) => void;
  onQuestionEdit: (id: string, newText: string) => void;
  onQuestionAdd: (questionText: string) => void;
  onQuestionRemove: (id: string) => void;
  onQuestionMove: (index: number, direction: "up" | "down") => void;
  onRestoreDefaults: () => void;
  archetypeOverride?: ProjectArchetype;
  onArchetypeChange?: (archetype: ProjectArchetype | undefined) => void;
  isProject: boolean;
  guideInfo?: {
    name: string;
    about: string;
    category?: string;
  };
}

const ARCHETYPE_OPTIONS: Array<{ value: ProjectArchetype | "auto"; label: string }> = [
  { value: "auto", label: "Auto (Recommended)" },
  { value: "personal", label: "Personal Project" },
  { value: "freelance", label: "Freelance / Client" },
  { value: "hackathon", label: "Hackathon" },
  { value: "open-source", label: "Open Source" },
];

export function DynamicQuestionList({
  questions,
  answers,
  onAnswerChange,
  onQuestionEdit,
  onQuestionAdd,
  onQuestionRemove,
  onQuestionMove,
  onRestoreDefaults,
  archetypeOverride,
  onArchetypeChange,
  isProject,
  guideInfo,
}: DynamicQuestionListProps) {
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [newQuestionInput, setNewQuestionInput] = useState("");
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  const startEditingQuestion = (q: EditableQuestionItem) => {
    setEditingQuestionId(q.id);
    setEditingText(q.question);
  };

  const saveEditingQuestion = (id: string) => {
    if (editingText.trim()) {
      onQuestionEdit(id, editingText.trim());
    }
    setEditingQuestionId(null);
    setEditingText("");
  };

  const handleAddCustomQuestion = () => {
    if (newQuestionInput.trim()) {
      onQuestionAdd(newQuestionInput.trim());
      setNewQuestionInput("");
      setIsAddingCustom(false);
    }
  };

  const toggleOption = (id: string, option: string) => {
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    const updated = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    onAnswerChange(id, updated);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Optional Project Archetype Selector & Guide Banner */}
      {isProject && (
        <div className="flex flex-col gap-2 rounded-card bg-ground p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-app-sm font-medium text-ink">Project Type:</span>
              {guideInfo ? (
                <Pill tone="positive">
                  {guideInfo.category === "common-core-v2"
                    ? "42Next Core"
                    : guideInfo.category === "common-core-v1"
                    ? "42 Common Core"
                    : "42 Curriculum"}
                </Pill>
              ) : (
                <Pill tone="neutral">Non-42 Project</Pill>
              )}
            </div>

            {onArchetypeChange && (
              <div className="flex items-center gap-1.5">
                <label htmlFor="archetype-select" className="text-xs text-muted">
                  Category Override:
                </label>
                <select
                  id="archetype-select"
                  aria-label="Select project archetype category"
                  value={archetypeOverride || "auto"}
                  onChange={(e) => {
                    const val = e.target.value;
                    onArchetypeChange(val === "auto" ? undefined : (val as ProjectArchetype));
                  }}
                  className="h-7 rounded-control border border-control bg-paper px-2 text-xs font-medium text-ink outline-none focus:border-ink"
                >
                  {ARCHETYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {guideInfo && (
            <p className="text-app-sm text-muted">
              <span className="font-medium text-ink">{guideInfo.name}: </span>
              {guideInfo.about}
            </p>
          )}
        </div>
      )}

      {/* Questionnaire Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-app font-medium text-ink">Tailored Engineering Questions</h3>
          <p className="text-app-sm text-muted">
            All questions are optional. Edit wording, answer what you know, or remove irrelevant ones.
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRestoreDefaults}
          className="h-7 text-xs text-muted hover:text-ink"
        >
          <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
          Restore Defaults
        </Button>
      </div>

      {/* Dynamic Question Items */}
      <div className="flex flex-col gap-4">
        {questions.map((q, idx) => {
          const value = answers[q.id];
          const isEditing = editingQuestionId === q.id;

          return (
            <div
              key={q.id}
              className="group flex flex-col gap-2 rounded-card border border-edge bg-paper p-3.5 transition-colors sm:p-4"
            >
              {/* Question Header & Controls */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditingQuestion(q.id);
                          if (e.key === "Escape") setEditingQuestionId(null);
                        }}
                        autoFocus
                        className="h-8 w-full rounded-control border border-ink bg-paper px-2 text-app font-medium text-ink outline-none"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => saveEditingQuestion(q.id)}
                        className="h-8 px-2"
                        aria-label="Save question"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor={`q-${q.id}`}
                      className="text-app font-medium text-ink cursor-pointer hover:underline"
                      onClick={() => startEditingQuestion(q)}
                      title="Click to edit question text"
                    >
                      {q.question}
                      {q.type === "checkbox" && (
                        <span className="font-normal text-muted text-app-sm"> (pick all that apply)</span>
                      )}
                    </label>
                  )}
                </div>

                {/* Question Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => startEditingQuestion(q)}
                      title="Edit question text"
                      aria-label={`Edit wording of ${q.question}`}
                      className="p-1 text-muted hover:text-ink rounded-control"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => onQuestionMove(idx, "up")}
                    title="Move up"
                    aria-label={`Move question ${q.question} up`}
                    className="p-1 text-muted hover:text-ink disabled:opacity-30 rounded-control"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    disabled={idx === questions.length - 1}
                    onClick={() => onQuestionMove(idx, "down")}
                    title="Move down"
                    aria-label={`Move question ${q.question} down`}
                    className="p-1 text-muted hover:text-ink disabled:opacity-30 rounded-control"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onQuestionRemove(q.id)}
                    title="Remove question"
                    aria-label={`Remove question ${q.question}`}
                    className="p-1 text-muted hover:text-warn rounded-control"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Answer Input Controls */}
              {q.type === "text" && (
                <TextArea
                  id={`q-${q.id}`}
                  rows={2}
                  minHeight={64}
                  value={typeof value === "string" ? value : ""}
                  onChange={(e) => onAnswerChange(q.id, e.target.value)}
                  placeholder={q.placeholder || "Describe what you built or solved..."}
                  className="mt-1"
                />
              )}

              {q.type === "radio" && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {(q.options || []).map((option) => {
                    const selected = value === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onAnswerChange(q.id, selected ? "" : option)}
                        className={cx(
                          "inline-flex h-9 items-center rounded-control border px-3 text-app-sm transition-colors duration-150",
                          selected
                            ? "border-ink bg-raised font-medium text-ink"
                            : "border-control bg-paper text-ink hover:bg-raised"
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "checkbox" && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {(q.options || []).map((option) => {
                    const selected = Array.isArray(value) && value.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleOption(q.id, option)}
                        className={cx(
                          "inline-flex h-9 items-center rounded-control border px-3 text-app-sm transition-colors duration-150",
                          selected
                            ? "border-ink bg-raised font-medium text-ink"
                            : "border-control bg-paper text-ink hover:bg-raised"
                        )}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Custom Question Section */}
      {isAddingCustom ? (
        <div className="flex flex-col gap-2 rounded-card border border-ink bg-paper p-3.5">
          <label htmlFor="custom-question-input" className="text-app-sm font-medium text-ink">
            Custom Question:
          </label>
          <div className="flex items-center gap-2">
            <input
              id="custom-question-input"
              type="text"
              value={newQuestionInput}
              onChange={(e) => setNewQuestionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustomQuestion();
                if (e.key === "Escape") setIsAddingCustom(false);
              }}
              placeholder="e.g. Which database migration strategy did you implement?"
              autoFocus
              className="h-9 flex-1 rounded-control border border-control bg-paper px-3 text-app text-ink outline-none focus:border-ink"
            />
            <Button variant="primary" size="sm" onClick={handleAddCustomQuestion} className="h-9 px-3">
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsAddingCustom(false)} className="h-9 px-2 text-muted">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => setIsAddingCustom(true)}
          className="flex items-center justify-center gap-1.5 h-10 border-dashed"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add a Custom Question
        </Button>
      )}
    </div>
  );
}
