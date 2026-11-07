"use client";

import React, { forwardRef, useRef, useEffect, useState } from "react";
import { CVData } from "@/types/resume";
import {
  CVSheet,
  type HeightBudget,
  type TemplateSectionId,
  type EditableFieldDescriptor,
} from "./CVSheet";
import { useCVStore } from "@/lib/store/cv-store";
import { normalizeGitHub, normalizeLinkedIn } from "@/lib/sanitizer";
import { parseDateRange } from "@/lib/date-parser";
import { InlineBullet } from "@/components/studio/inline-editor/InlineBullet";
import { InlineText } from "@/components/studio/inline-editor/InlineText";
import { InlineSkills } from "@/components/studio/inline-editor/InlineSkills";
import { CanvasSectionInserter } from "@/components/studio/inline-editor/CanvasSectionInserter";

export type { HeightBudget, TemplateSectionId } from "./CVSheet";

interface CleanTemplateProps {
  data: CVData;
  scale?: number;
  onHeightBudgetChange?: (budget: HeightBudget) => void;
  onSectionClick?: (section: TemplateSectionId) => void;
  forceOverflowIndicator?: boolean;
  nameAs?: "h1" | "p";
  dataUi?: boolean;
  editable?: boolean;
}

// Client wrapper around CVSheet: accurately measures printable CV height to know if it fits on 1 page.
export const CleanTemplate = forwardRef<HTMLDivElement, CleanTemplateProps>(
  (
    {
      data,
      scale = 1,
      onHeightBudgetChange,
      onSectionClick,
      forceOverflowIndicator,
      nameAs,
      dataUi,
      editable = false,
    },
    ref
  ) => {
    const printableMeasurementRef = useRef<HTMLDivElement>(null);
    const innerContentRef = useRef<HTMLDivElement>(null);
    const onHeightBudgetChangeRef = useRef(onHeightBudgetChange);
    onHeightBudgetChangeRef.current = onHeightBudgetChange;

    const [isInternalOverflow, setIsInternalOverflow] = useState(false);

    // Dynamic budget: compact mode has 20mm vertical padding (1,045px inner); standard mode has 24mm (1,030px inner)
    const isCompact = data.styleDensity === "compact";
    const printableBudget = isCompact ? 1045 : 1030;

    // Temporary in-canvas draft states (zero premature writes to store)
    const [isAddingProject, setIsAddingProject] = useState(false);
    const [projectDraft, setProjectDraft] = useState({ name: "", techStack: "", bullet: "" });

    const [activeBulletDraft, setActiveBulletDraft] = useState<{ projectId: string; text: string } | null>(null);

    const [isAddingCoursework, setIsAddingCoursework] = useState(false);
    const [courseworkDraft, setCourseworkDraft] = useState({ title: "", date: "" });

    const [isAddingExperience, setIsAddingExperience] = useState(false);
    const [experienceDraft, setExperienceDraft] = useState({ company: "", role: "", dates: "", location: "" });

    const [isAddingExtracurricular, setIsAddingExtracurricular] = useState(false);
    const [extracurricularDraft, setExtracurricularDraft] = useState({ organization: "", role: "", dates: "" });

    // Measure the actual printable CV height as it changes, to know if it fits on 1 page
    useEffect(() => {
      const targetEl = editable ? printableMeasurementRef.current : innerContentRef.current;
      if (!targetEl) return;

      const calculateBudget = () => {
        const el = editable ? printableMeasurementRef.current : innerContentRef.current;
        if (!el) return;
        const height = el.scrollHeight;
        const percentage = Math.round((height / printableBudget) * 100);
        const isOverflow = height > printableBudget;
        setIsInternalOverflow(isOverflow);

        if (onHeightBudgetChangeRef.current) {
          onHeightBudgetChangeRef.current({
            height,
            printableBudget,
            percentage,
            isOverflow,
          });
        }
      };

      calculateBudget();

      const observer = new ResizeObserver(() => {
        calculateBudget();
      });

      observer.observe(targetEl);
      return () => observer.disconnect();
    }, [data, editable, printableBudget]);

    const isOverflow = forceOverflowIndicator ?? isInternalOverflow;

    const lastDeletedBullet = useCVStore((s) => s.lastDeletedBullet);
    const undoLastBulletDeletion = useCVStore((s) => s.undoLastBulletDeletion);

    // Keyboard shortcut: Ctrl+Z / Cmd+Z to undo bullet deletion outside input/textarea
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
          const activeTag = document.activeElement?.tagName?.toLowerCase();
          if (activeTag !== "input" && activeTag !== "textarea") {
            if (useCVStore.getState().lastDeletedBullet) {
              e.preventDefault();
              useCVStore.getState().undoLastBulletDeletion();
            }
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const updateContact = useCVStore((s) => s.updateContact);
    const updateTargetRole = useCVStore((s) => s.updateTargetRole);
    const updateEducationItem = useCVStore((s) => s.updateEducationItem);
    const updateProject = useCVStore((s) => s.updateProject);
    const addProjectToCV = useCVStore((s) => s.addProjectToCV);
    const addProjectBullet = useCVStore((s) => s.addProjectBullet);
    const updateSkillCategory = useCVStore((s) => s.updateSkillCategory);
    const updateCourseworkItem = useCVStore((s) => s.updateCourseworkItem);
    const addCourseworkItem = useCVStore((s) => s.addCourseworkItem);
    const setShowExperience = useCVStore((s) => s.setShowExperience);
    const setShowExtracurriculars = useCVStore((s) => s.setShowExtracurriculars);
    const addExperienceItem = useCVStore((s) => s.addExperienceItem);
    const addExtracurricularItem = useCVStore((s) => s.addExtracurricularItem);

    // Handlers for Project Temporary Draft
    const handleSaveProject = () => {
      const name = projectDraft.name.trim();
      if (!name) return;
      addProjectToCV({
        name,
        techStack: projectDraft.techStack.trim() || undefined,
        bulletPoints: projectDraft.bullet.trim() ? [projectDraft.bullet.trim()] : [],
      });
      setIsAddingProject(false);
      setProjectDraft({ name: "", techStack: "", bullet: "" });
    };

    const handleCancelProject = () => {
      setIsAddingProject(false);
      setProjectDraft({ name: "", techStack: "", bullet: "" });
    };

    // Handlers for Bullet Temporary Draft
    const handleSaveBullet = (projectId: string) => {
      if (!activeBulletDraft || activeBulletDraft.projectId !== projectId) return;
      const text = activeBulletDraft.text.trim();
      if (text) {
        addProjectBullet(projectId, text);
      }
      setActiveBulletDraft(null);
    };

    const handleCancelBullet = () => {
      setActiveBulletDraft(null);
    };

    // Handlers for Coursework Temporary Draft
    const handleSaveCoursework = () => {
      const title = courseworkDraft.title.trim();
      if (!title) return;
      addCourseworkItem({
        title,
        date: courseworkDraft.date.trim() || undefined,
      });
      setIsAddingCoursework(false);
      setCourseworkDraft({ title: "", date: "" });
    };

    const handleCancelCoursework = () => {
      setIsAddingCoursework(false);
      setCourseworkDraft({ title: "", date: "" });
    };

    // Handlers for Experience Temporary Draft
    const handleSaveExperience = () => {
      const company = experienceDraft.company.trim();
      if (!company) return;
      const parsedDates = parseDateRange(experienceDraft.dates);
      addExperienceItem({
        company,
        role: experienceDraft.role.trim() || undefined,
        startDate: parsedDates.startDate,
        endDate: parsedDates.endDate,
        isCurrent: parsedDates.isCurrent,
        location: experienceDraft.location.trim() || undefined,
        bulletPoints: [],
      });
      setIsAddingExperience(false);
      setExperienceDraft({ company: "", role: "", dates: "", location: "" });
    };

    const handleCancelExperience = () => {
      setIsAddingExperience(false);
      setExperienceDraft({ company: "", role: "", dates: "", location: "" });
    };

    // Handlers for Extracurricular Temporary Draft
    const handleSaveExtracurricular = () => {
      const organization = extracurricularDraft.organization.trim();
      if (!organization) return;
      const parsedDates = parseDateRange(extracurricularDraft.dates);
      addExtracurricularItem({
        organization,
        role: extracurricularDraft.role.trim() || undefined,
        startDate: parsedDates.startDate,
        endDate: parsedDates.endDate,
        isCurrent: parsedDates.isCurrent,
        bulletPoints: [],
      });
      setIsAddingExtracurricular(false);
      setExtracurricularDraft({ organization: "", role: "", dates: "" });
    };

    const handleCancelExtracurricular = () => {
      setIsAddingExtracurricular(false);
      setExtracurricularDraft({ organization: "", role: "", dates: "" });
    };

    const renderField = editable
      ? (desc: EditableFieldDescriptor, defaultNode: React.ReactNode) => {
          // 1. Action Slots with Temporary In-Place Drafts
          if (desc.type === "action") {
            const action = desc.meta?.action;

            // 1.1 Project Bullet Action & In-Place Draft
            if (action === "addFirstBullet" || action === "addBullet") {
              const projectId = String(desc.meta?.projectId);
              const isDrafting = activeBulletDraft?.projectId === projectId;

              if (isDrafting) {
                return (
                  <div
                    className="relative z-20 my-1 rounded border border-amber-400 bg-white shadow-sm p-2 print:hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <textarea
                      autoFocus
                      rows={2}
                      value={activeBulletDraft.text}
                      onChange={(e) =>
                        setActiveBulletDraft({ projectId, text: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveBullet(projectId);
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          handleCancelBullet();
                        }
                      }}
                      placeholder="Describe what you built and the outcome..."
                      aria-label="New bullet point text"
                      className="w-full resize-none border-0 bg-transparent text-xs text-gray-800 focus:outline-none focus:ring-0 leading-snug"
                    />
                    <div className="flex items-center justify-between border-t border-gray-200 pt-1 text-xs">
                      <span className="text-[11px] text-gray-400">Press Enter to save, Esc to cancel</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleCancelBullet}
                          className="px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                          aria-label="Cancel new bullet"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveBullet(projectId)}
                          disabled={!activeBulletDraft.text.trim()}
                          className="px-2.5 py-0.5 text-[11px] font-medium text-white bg-ink hover:bg-ink/90 rounded transition-colors cursor-pointer disabled:opacity-40"
                          aria-label="Save new bullet"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (action === "addFirstBullet") {
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveBulletDraft({ projectId, text: "" });
                    }}
                    className="w-full text-left border border-dashed border-gray-300 hover:border-ink hover:bg-gray-50 text-gray-500 hover:text-ink text-[9pt] py-1.5 px-3 rounded transition-colors cursor-pointer print:hidden"
                    aria-label="Add first bullet point"
                  >
                    <span className="font-semibold text-ink mr-1">+</span> Add your first bullet point
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveBulletDraft({ projectId, text: "" });
                  }}
                  className="group/btn inline-flex items-center text-[8.5pt] text-gray-400 hover:text-ink transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-gray-100 print:hidden"
                  aria-label="Add bullet point"
                >
                  <span className="mr-1 opacity-70 group-hover/btn:opacity-100 font-bold">+</span> Add bullet
                </button>
              );
            }

            // 1.2 Add Project Action & In-Place Draft
            if (action === "addProject") {
              if (isAddingProject) {
                return (
                  <div
                    className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50/50 p-3 my-2 text-left shadow-xs transition-all print:hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">
                      New Project Draft
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label htmlFor="draft-project-name" className="block text-[11px] font-medium text-gray-700 mb-0.5">
                          Project Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="draft-project-name"
                          autoFocus
                          type="text"
                          value={projectDraft.name}
                          onChange={(e) => setProjectDraft((prev) => ({ ...prev, name: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveProject();
                            if (e.key === "Escape") handleCancelProject();
                          }}
                          placeholder="e.g. Minishell, Web Server, Portfolio"
                          className="w-full text-xs rounded border border-gray-300 bg-white px-2.5 py-1.5 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                        />
                      </div>
                      <div>
                        <label htmlFor="draft-project-tech" className="block text-[11px] font-medium text-gray-700 mb-0.5">
                          Technologies / Frameworks (Optional)
                        </label>
                        <input
                          id="draft-project-tech"
                          type="text"
                          value={projectDraft.techStack}
                          onChange={(e) => setProjectDraft((prev) => ({ ...prev, techStack: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveProject();
                            if (e.key === "Escape") handleCancelProject();
                          }}
                          placeholder="e.g. TypeScript, React, Docker, C++"
                          className="w-full text-xs rounded border border-gray-300 bg-white px-2.5 py-1.5 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                        />
                      </div>
                      <div>
                        <label htmlFor="draft-project-bullet" className="block text-[11px] font-medium text-gray-700 mb-0.5">
                          Initial Bullet Point (Optional)
                        </label>
                        <textarea
                          id="draft-project-bullet"
                          rows={2}
                          value={projectDraft.bullet}
                          onChange={(e) => setProjectDraft((prev) => ({ ...prev, bullet: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSaveProject();
                            if (e.key === "Escape") handleCancelProject();
                          }}
                          placeholder="Describe what you built and measurable outcomes..."
                          className="w-full text-xs rounded border border-gray-300 bg-white px-2.5 py-1.5 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink leading-snug"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCancelProject}
                          className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                          aria-label="Cancel new project"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveProject}
                          disabled={!projectDraft.name.trim()}
                          className="px-3 py-1 text-xs font-medium text-white bg-ink hover:bg-ink/90 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Save new project"
                        >
                          Save Project
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddingProject(true);
                    setProjectDraft({ name: "", techStack: "", bullet: "" });
                  }}
                  className="w-full text-center border-2 border-dashed border-gray-300 hover:border-ink hover:bg-gray-50 text-gray-600 hover:text-ink text-[9.5pt] font-medium py-2 px-4 rounded transition-colors cursor-pointer print:hidden"
                  aria-label="Add Project"
                >
                  <span className="font-bold mr-1">+</span> Add Project
                </button>
              );
            }

            // 1.3 Add Coursework Action & In-Place Draft
            if (action === "addCoursework") {
              if (isAddingCoursework) {
                return (
                  <div
                    className="rounded border border-dashed border-amber-400 bg-amber-50/50 p-2.5 my-1.5 text-left print:hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                      <input
                        autoFocus
                        type="text"
                        value={courseworkDraft.title}
                        onChange={(e) => setCourseworkDraft((prev) => ({ ...prev, title: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveCoursework();
                          if (e.key === "Escape") handleCancelCoursework();
                        }}
                        placeholder="Course or Workshop Title *"
                        className="text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                      />
                      <input
                        type="text"
                        value={courseworkDraft.date}
                        onChange={(e) => setCourseworkDraft((prev) => ({ ...prev, date: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveCoursework();
                          if (e.key === "Escape") handleCancelCoursework();
                        }}
                        placeholder="Date (e.g. May 2024)"
                        className="text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={handleCancelCoursework}
                        className="px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
                        aria-label="Cancel new coursework"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCoursework}
                        disabled={!courseworkDraft.title.trim()}
                        className="px-2.5 py-0.5 text-xs text-white bg-ink rounded disabled:opacity-40"
                        aria-label="Save new coursework"
                      >
                        Save Coursework
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddingCoursework(true);
                    setCourseworkDraft({ title: "", date: "" });
                  }}
                  className="inline-flex items-center text-[8.5pt] text-gray-500 hover:text-ink border border-dashed border-gray-300 hover:border-ink hover:bg-gray-50 px-2 py-0.5 rounded transition-colors cursor-pointer print:hidden"
                  aria-label="Add Coursework"
                >
                  <span className="font-bold mr-1">+</span> Add course or workshop
                </button>
              );
            }

            // 1.4 Add Experience Action & In-Place Draft
            if (action === "addExperience") {
              if (isAddingExperience) {
                return (
                  <div
                    className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50/50 p-3 my-2 text-left shadow-xs transition-all print:hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">
                      New Experience Position
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                            Company Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            autoFocus
                            type="text"
                            value={experienceDraft.company}
                            onChange={(e) => setExperienceDraft((prev) => ({ ...prev, company: e.target.value }))}
                            placeholder="e.g. Acme Corp"
                            className="w-full text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                            Role / Job Title
                          </label>
                          <input
                            type="text"
                            value={experienceDraft.role}
                            onChange={(e) => setExperienceDraft((prev) => ({ ...prev, role: e.target.value }))}
                            placeholder="e.g. Software Engineer Intern"
                            className="w-full text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                            Dates (e.g. Jun 2023 – Aug 2023)
                          </label>
                          <input
                            type="text"
                            value={experienceDraft.dates}
                            onChange={(e) => setExperienceDraft((prev) => ({ ...prev, dates: e.target.value }))}
                            placeholder="Jun 2023 – Aug 2023"
                            className="w-full text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                            Location (Optional)
                          </label>
                          <input
                            type="text"
                            value={experienceDraft.location}
                            onChange={(e) => setExperienceDraft((prev) => ({ ...prev, location: e.target.value }))}
                            placeholder="e.g. Abu Dhabi, UAE"
                            className="w-full text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCancelExperience}
                          className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                          aria-label="Cancel new experience"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveExperience}
                          disabled={!experienceDraft.company.trim()}
                          className="px-3 py-1 text-xs font-medium text-white bg-ink hover:bg-ink/90 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Save new experience"
                        >
                          Save Position
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddingExperience(true);
                    setExperienceDraft({ company: "", role: "", dates: "", location: "" });
                  }}
                  className="w-full text-center border border-dashed border-gray-300 hover:border-ink hover:bg-gray-50 text-gray-600 hover:text-ink text-[9pt] font-medium py-1.5 px-3 rounded transition-colors cursor-pointer print:hidden"
                  aria-label="Add Position"
                >
                  <span className="font-bold mr-1">+</span> Add position
                </button>
              );
            }

            // 1.5 Add Extracurricular Action & In-Place Draft
            if (action === "addExtracurricular") {
              if (isAddingExtracurricular) {
                return (
                  <div
                    className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50/50 p-3 my-2 text-left shadow-xs transition-all print:hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">
                      New Extracurricular Activity
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                            Organization / Club <span className="text-red-500">*</span>
                          </label>
                          <input
                            autoFocus
                            type="text"
                            value={extracurricularDraft.organization}
                            onChange={(e) => setExtracurricularDraft((prev) => ({ ...prev, organization: e.target.value }))}
                            placeholder="e.g. 42 Robotics Club"
                            className="w-full text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                            Role / Title
                          </label>
                          <input
                            type="text"
                            value={extracurricularDraft.role}
                            onChange={(e) => setExtracurricularDraft((prev) => ({ ...prev, role: e.target.value }))}
                            placeholder="e.g. Lead Organizer"
                            className="w-full text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-0.5">
                          Dates (e.g. 2023 – 2024)
                        </label>
                        <input
                          type="text"
                          value={extracurricularDraft.dates}
                          onChange={(e) => setExtracurricularDraft((prev) => ({ ...prev, dates: e.target.value }))}
                          placeholder="2023 – 2024"
                          className="w-full text-xs rounded border border-gray-300 bg-white px-2 py-1 focus:border-ink focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleCancelExtracurricular}
                          className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 rounded border border-gray-300 bg-white hover:bg-gray-50 transition-colors cursor-pointer"
                          aria-label="Cancel new activity"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveExtracurricular}
                          disabled={!extracurricularDraft.organization.trim()}
                          className="px-3 py-1 text-xs font-medium text-white bg-ink hover:bg-ink/90 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Save new activity"
                        >
                          Save Activity
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddingExtracurricular(true);
                    setExtracurricularDraft({ organization: "", role: "", dates: "" });
                  }}
                  className="w-full text-center border border-dashed border-gray-300 hover:border-ink hover:bg-gray-50 text-gray-600 hover:text-ink text-[9pt] font-medium py-1.5 px-3 rounded transition-colors cursor-pointer print:hidden"
                  aria-label="Add Activity"
                >
                  <span className="font-bold mr-1">+</span> Add activity
                </button>
              );
            }

            return null;
          }

          // 2. Textarea (Project Bullets)
          if (
            desc.type === "textarea" &&
            desc.meta?.projectId !== undefined &&
            desc.meta?.bulletIndex !== undefined
          ) {
            return (
              <InlineBullet
                projectId={String(desc.meta.projectId)}
                bulletIndex={Number(desc.meta.bulletIndex)}
                initialValue={desc.value}
                placeholder={desc.placeholder}
              >
                {defaultNode}
              </InlineBullet>
            );
          }

          // 3. Comma-separated Skills List
          if (desc.type === "comma-list" && desc.meta?.categoryKey) {
            const catKey = desc.meta.categoryKey as any;
            const catLabel = String(desc.meta.categoryLabel || "Skills");
            const skillsList = data.skills?.[catKey as keyof typeof data.skills] || [];
            return (
              <InlineSkills
                id={desc.id}
                categoryKey={catKey}
                categoryLabel={catLabel}
                skills={skillsList}
                placeholder={desc.placeholder}
                onSave={(list) => updateSkillCategory(catKey, list)}
              >
                {defaultNode}
              </InlineSkills>
            );
          }

          // 4. Single-line Text Fields
          return (
            <InlineText
              id={desc.id}
              initialValue={desc.value}
              placeholder={desc.placeholder}
              className={desc.className}
              style={desc.style}
              ariaLabel={desc.meta?.ariaLabel as string | undefined}
              type={desc.type === "email" ? "email" : desc.type === "tel" ? "tel" : "text"}
              onSave={(val) => {
                if (desc.id === "contact.fullName") {
                  updateContact({ fullName: val });
                } else if (desc.id === "contact.targetRole") {
                  updateTargetRole(val);
                } else if (desc.id === "contact.email") {
                  updateContact({ email: val });
                } else if (desc.id === "contact.phoneNumber") {
                  updateContact({ phoneNumber: val });
                } else if (desc.id === "contact.githubUrl") {
                  updateContact({ githubUrl: normalizeGitHub(val) });
                } else if (desc.id === "contact.linkedinUrl") {
                  updateContact({ linkedinUrl: normalizeLinkedIn(val) });
                } else if (desc.meta?.eduId) {
                  const eduId = String(desc.meta.eduId);
                  const field = String(desc.meta.field);
                  if (field === "dates") {
                    const parsed = parseDateRange(val);
                    updateEducationItem(eduId, parsed);
                  } else {
                    updateEducationItem(eduId, { [field]: val });
                  }
                } else if (desc.meta?.projectId) {
                  const projId = String(desc.meta.projectId);
                  const field = String(desc.meta.field);
                  updateProject(projId, { [field]: val });
                } else if (desc.meta?.courseworkId) {
                  const cwId = String(desc.meta.courseworkId);
                  const field = String(desc.meta.field);
                  updateCourseworkItem(cwId, { [field]: val });
                }
              }}
            >
              {defaultNode}
            </InlineText>
          );
        }
      : undefined;

    return (
      <div className="relative">
        {/* Off-screen canonical printable representation for exact A4 height budgeting */}
        {editable && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              visibility: "hidden",
              left: -99999,
              top: 0,
              width: "210mm",
              pointerEvents: "none",
            }}
          >
            <CVSheet
              data={data}
              contentRef={printableMeasurementRef}
              renderField={undefined}
              nameAs={nameAs}
              dataUi={dataUi}
            />
          </div>
        )}

        {/* Undo Toast Notification */}
        {editable && lastDeletedBullet && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-50 bg-ink text-paper px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150 print:hidden"
          >
            <span>Bullet point deleted.</span>
            <button
              type="button"
              onClick={() => undoLastBulletDeletion()}
              className="font-bold underline hover:text-gray-300 cursor-pointer focus:outline-none"
              aria-label="Undo bullet deletion"
            >
              Undo
            </button>
          </div>
        )}

        <CVSheet
          data={data}
          scale={scale}
          isOverflow={isOverflow}
          onSectionClick={onSectionClick}
          nameAs={nameAs}
          dataUi={dataUi}
          sheetRef={ref}
          contentRef={innerContentRef}
          renderField={renderField}
        />

        {/* Optional Section Inserter at canvas bottom */}
        {editable && (!data.showExperience || !data.showExtracurriculars) && (
          <CanvasSectionInserter
            showExperience={Boolean(data.showExperience)}
            showExtracurriculars={Boolean(data.showExtracurriculars)}
            onEnableExperience={() => setShowExperience(true)}
            onEnableExtracurriculars={() => setShowExtracurriculars(true)}
          />
        )}
      </div>
    );
  }
);

CleanTemplate.displayName = "CleanTemplate";
