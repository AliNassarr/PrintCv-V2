"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useCVStore } from "@/lib/store/cv-store";
import { HeightBudget, TemplateSectionId } from "@/components/templates/CleanTemplate";
import { CanvasPreviewViewport } from "./CanvasPreviewViewport";
import { ScoreEngineModal } from "./ScoreEngineModal";
import { BulletHelper } from "./BulletHelper";
import { StudioTopBar } from "./StudioTopBar";
import { SectionRail, SECTION_PANEL_ID, sectionTabId } from "./SectionRail";
import { NextStep } from "./NextStep";
import { StudioNotice } from "./StudioNotice";
import { BottomBar, type StudioPane } from "./BottomBar";
import { ContactSection } from "./sections/ContactSection";
import { ExperienceSection } from "./sections/ExperienceSection";
import { ProjectsSection } from "./sections/ProjectsSection";
import { EducationSection } from "./sections/EducationSection";
import { SkillsSection } from "./sections/SkillsSection";
import { ActivitiesSection } from "./sections/ActivitiesSection";
import { SectionOrderDialog } from "./SectionOrderDialog";
import { StudioToasts } from "./StudioToasts";
import { useToasts } from "@/lib/toast";
import type { UndoBufferItem } from "./sections/types";
import { CARD_TOGGLE, focusAfterChange } from "./sections/parts";
import { scoreCV } from "@/lib/cv-score";
import { sectionProgress, nextStep, linesToFix } from "@/lib/progress";
import { projectsFromIntra } from "@/lib/intra/cv-from-intra";
import type { HelperTarget } from "@/lib/bullet-helper";
import type { StudioSection } from "@/lib/studio-sections";
import { cx } from "@/lib/cx";

export type { StudioSection } from "@/lib/studio-sections";

export function ReziStudioLayout({ notice, onCloseNotice }: { notice?: string | null; onCloseNotice?: () => void }) {
  const {
    cvData,
    setCVData,
    updateExperienceItem,
    updateExtracurricularItem,
    restoreProjectAt,
    restoreExperienceAt,
    restoreEducationAt,
    restoreExtracurricularAt,
    setStyleDensity,
    setShowExtracurriculars,
    studentProfile,
    setStudentProfile,
    sampleDataRemovedNotice,
    dismissSampleDataRemovedNotice,
  } = useCVStore();

  // Active section
  const [activeSection, setActiveSection] = useState<StudioSection>("PROJECTS");

  // Below 1024px one pane shows at a time: the editor or the preview. From 1024px both show.
  const [pane, setPane] = useState<StudioPane>("edit");
  const [isFullScreenPaper, setIsFullScreenPaper] = useState(false);

  // Expanded items in accordion lists (empty object or set of collapsed ids)
  const [collapsedItems, setCollapsedItems] = useState<Record<string, boolean>>({});

  const toggleItemCollapse = (id: string) => {
    setCollapsedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Below 1024px, if the open section's tab is cut off or under the faded edge, scroll the tab row so it starts at the row's left padding.
  // From 1024px every step shows and the row does not scroll.
  useEffect(() => {
    const tab = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Sections"] [aria-selected="true"]');
    const row = tab?.parentElement;
    if (!tab || !row || !row.clientWidth || row.scrollWidth <= row.clientWidth) return;
    const t = tab.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const pad = getComputedStyle(row);
    const padLeft = parseFloat(pad.paddingLeft);
    if (t.left < r.left + padLeft || t.right > r.right - parseFloat(pad.paddingRight)) row.scrollLeft += t.left - r.left - padLeft;
  }, [activeSection]);

  const selectSection = (section: StudioSection) => {
    setActiveSection(section);
    setPane("edit");
  };

  // Open the right section, unfold the item, scroll to it and put the cursor in the line to fix
  const jumpToItem = (section: StudioSection, itemId?: string, lineText?: string) => {
    selectSection(section);
    if (!itemId) return;
    setCollapsedItems((prev) => ({ ...prev, [itemId]: false }));
    setTimeout(() => {
      const card = document.getElementById(`item-${itemId}`);
      card?.scrollIntoView({ behavior: "smooth", block: "start" });
      const areas = Array.from(card?.querySelectorAll<HTMLTextAreaElement>("textarea[aria-label^='Line ']") ?? []);
      (areas.find((a) => a.value.trim() === lineText?.trim()) ?? areas[0])?.focus({ preventScroll: true });
    }, 60);
  };

  // Dialogs
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isSectionOrderModalOpen, setIsSectionOrderModalOpen] = useState(false);

  // Target Job Description (shared with ScoreEngineModal)
  const [targetJobDescription, setTargetJobDescription] = useState("");

  // Page height info from the preview
  const [heightBudget, setHeightBudget] = useState<HeightBudget>({
    height: 820,
    printableBudget: 1027,
    percentage: 80,
    isOverflow: false,
  });

  // Toasts (shared contract in src/lib/toast.ts). Undo stays until Undo, Close or the next removal (D2 a).
  const { toasts, pushToast, closeToast } = useToasts();
  // Sections keep calling showToast({ title, desc })
  const showToast = useCallback(
    ({ title, desc }: { title: string; desc: string }) => pushToast({ kind: "info", text: title, detail: desc }),
    [pushToast]
  );

  // Export state
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // "Help me write" dialog: which project / job / activity it is open for
  const [helperFor, setHelperFor] = useState<{ kind: HelperTarget["kind"]; id: string } | null>(null);
  const helperTarget = useMemo<HelperTarget | null>(() => {
    if (!helperFor) return null;
    if (helperFor.kind === "project") {
      const item = cvData.projects.find((p) => p.id === helperFor.id);
      return item ? { kind: "project", item } : null;
    }
    if (helperFor.kind === "experience") {
      const item = cvData.experience.find((e) => e.id === helperFor.id);
      return item ? { kind: "experience", item } : null;
    }
    const item = cvData.extracurriculars.find((a) => a.id === helperFor.id);
    return item ? { kind: "activity", item } : null;
  }, [helperFor, cvData]);

  const applyHelperBullets = (bullets: string[], mode: "replace" | "add") => {
    if (!helperTarget) return;
    const merge = (current: string[]) =>
      mode === "add" ? [...current.filter((b) => b.trim()), ...bullets] : bullets;
    const { id, bulletPoints } = helperTarget.item;
    if (helperTarget.kind === "project") {
      setCVData({
        ...cvData,
        projects: cvData.projects.map((p) => (p.id === id ? { ...p, bulletPoints: merge(p.bulletPoints) } : p)),
      });
    } else if (helperTarget.kind === "experience") {
      updateExperienceItem(id, { bulletPoints: merge(bulletPoints) });
    } else {
      updateExtracurricularItem(id, { bulletPoints: merge(bulletPoints) });
    }
    showToast({ title: "Lines added", desc: "Read them once more and fix anything that is not true." });
  };

  const openHelper = (kind: HelperTarget["kind"], id: string) => setHelperFor({ kind, id });

  // Put a removed project or job back where it was
  const handleUndo = (buffer: UndoBufferItem) => {
    if (buffer.type === "project") {
      restoreProjectAt(buffer.item, buffer.index);
    } else if (buffer.type === "experience") {
      restoreExperienceAt(buffer.item, buffer.index);
    } else if (buffer.type === "education") {
      restoreEducationAt(buffer.item, buffer.index);
    } else if (buffer.type === "activity") {
      restoreExtracurricularAt(buffer.item, buffer.index);
    }
    // The toast with the Undo button is gone, so put focus on the card that came back,
    // or on the section title when that card's section is not the open one
    focusAfterChange(document, `[id="item-${buffer.id}"] ${CARD_TOGGLE}`, 0, "#studio-sheet h1");
    showToast({
      title: "Brought back",
      desc: `"${buffer.label}" is back on your CV.`,
    });
  };

  // A project or job was removed: offer Undo. The removed item travels with its own toast,
  // so Undo always brings back the right one. A newer removal replaces the older toast.
  const triggerSoftDelete = (buffer: UndoBufferItem) => {
    const id = pushToast({
      kind: "undo",
      text: `Removed "${buffer.label}"`,
      action: {
        label: "Undo",
        onClick: () => {
          handleUndo(buffer);
          closeToast(id);
        },
      },
    });
  };

  // Passed 42 projects that are not on the CV yet
  const otherIntraProjects = useMemo(() => {
    if (!studentProfile) return [];
    const onCV = new Set(cvData.projects.map((p) => p.slug));
    return projectsFromIntra(studentProfile, Infinity).filter((p) => !onCV.has(p.slug));
  }, [studentProfile, cvData.projects]);

  // CV score (same numbers as the score window)
  const cvScore = useMemo(
    () => scoreCV(cvData, { fitsOnePage: !heightBudget.isOverflow }),
    [cvData, heightBudget.isOverflow]
  );

  // Section marks, line problems per section and the next step
  const progress = useMemo(() => sectionProgress(cvData, cvScore), [cvData, cvScore]);
  const next = useMemo(() => nextStep(cvData, cvScore), [cvData, cvScore]);
  // Lines to fix per section, counted like the card pills (a line with two problems counts once)
  const issueCounts = useMemo(() => linesToFix(cvData, cvScore), [cvData, cvScore]);

  // First run: no name and no lines yet. "Log in with 42" is then the one ink button.
  const firstRun = !cvData.contact.fullName?.trim() && cvScore.lineCount === 0;

  // Download PDF through the browser print window
  const handlePrintPDF = () => {
    showToast({
      title: "Save as PDF",
      desc: 'In the print window, choose "Save as PDF" as the printer.',
    });
    window.print();
  };

  // Export Word (.docx)
  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const { generateCvDocx } = await import("@/lib/docx-generator");
      const blob = await generateCvDocx(cvData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(cvData.contact.fullName || "Resume").replace(/\s+/g, "_")}_CV.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Wait a moment so the download can start first
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      showToast({
        title: "Word file downloaded",
        desc: "You can open it in Word or Google Docs.",
      });
    } catch (err) {
      // Only the message, never the CV
      console.error("DOCX generation error:", err instanceof Error ? err.message : "unknown");
      showToast({
        title: "Could not make the Word file",
        desc: "Something went wrong. Please try again.",
      });
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Make the CV fit on 1 page
  const handleAutoFit = () => {
    setStyleDensity("compact");
    if (cvData.extracurriculars.length === 0) {
      setShowExtracurriculars(false);
    }
    showToast({
      title: "Spacing made smaller",
      desc: "We made the spacing smaller so your CV fits on 1 page.",
    });
  };

  // Log out of 42 but keep the CV as it is
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setStudentProfile(null);
      showToast({
        title: "Logged out",
        desc: "You are logged out. Your CV is still here.",
      });
    }
  };

  // Clicking a section in the preview opens it in the editor
  const handleCanvasSectionClick = (sectionId: TemplateSectionId) => {
    switch (sectionId) {
      case "contact":
        selectSection("CONTACT");
        break;
      case "education":
        selectSection("EDUCATION");
        break;
      case "experience":
        selectSection("EXPERIENCE");
        break;
      case "projects":
        selectSection("PROJECTS");
        break;
      case "skills":
        selectSection("SKILLS");
        break;
      case "coursework":
      case "extracurriculars":
        selectSection("ACTIVITIES");
        break;
    }
  };

  const openOrder = () => setIsSectionOrderModalOpen(true);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ground text-ink lg:grid lg:grid-cols-[clamp(480px,42vw,640px)_1fr] lg:grid-rows-[48px_1fr]">
      <StudioTopBar
        cvName={cvData.contact.fullName?.trim() || "Your CV"}
        score={cvScore.total}
        onOpenScore={() => setIsScoreModalOpen(true)}
        firstRun={firstRun}
        isExportingDocx={isExportingDocx}
        onExportDocx={handleExportDocx}
        onPrintPDF={handlePrintPDF}
        account={studentProfile}
        onOpenOrder={openOrder}
        onLogout={handleLogout}
      />

      {/* The editor column. Below 1024px its parts sit straight in the page column; from 1024px it is one white card. */}
      <div className="contents lg:col-start-1 lg:row-start-2 lg:mb-2 lg:ml-2 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-sheet lg:border lg:border-edge lg:bg-paper">
        {/* The section steps and the next step. Below 1024px they show in the Edit and the Preview pane.
            A nav landmark, so screen reader users can jump to the steps like any other part of the page. */}
        <nav aria-label="Steps" className="shrink-0 lg:border-b lg:border-edge print:hidden">
          <SectionRail activeSection={activeSection} onSelect={selectSection} progress={progress} issues={issueCounts} />
          <NextStep next={next} onFix={() => next && jumpToItem(next.section, next.itemId, next.lineText)} />
        </nav>

        {/* The editor sheet */}
        <main
          id="studio-sheet"
          className={cx(
            "min-h-0 flex-1 overflow-y-auto bg-paper pb-[calc(56px+env(safe-area-inset-bottom))] scroll-pb-[120px] lg:pb-0",
            pane === "preview" && "hidden lg:block",
          )}
        >
          <div className="px-4 py-6 sm:px-6">
            {notice && <StudioNotice message={notice} onClose={() => onCloseNotice?.()} />}
            {sampleDataRemovedNotice && (
              <StudioNotice
                tone="warn"
                message="We removed the example CV that was filled in for you before. Your own changes are kept."
                onClose={dismissSampleDataRemovedNotice}
              />
            )}

            {/* The open section: the panel of the section tabs, which name it */}
            <div role="tabpanel" id={SECTION_PANEL_ID} aria-labelledby={sectionTabId(activeSection)} className="flex flex-col gap-6">
              {activeSection === "CONTACT" && <ContactSection score={cvScore} />}

              {activeSection === "EXPERIENCE" && (
                <ExperienceSection
                  collapsedItems={collapsedItems}
                  onToggleCollapse={toggleItemCollapse}
                  onSoftDelete={triggerSoftDelete}
                  onOpenHelper={openHelper}
                />
              )}

              {activeSection === "PROJECTS" && (
                <ProjectsSection
                  collapsedItems={collapsedItems}
                  onToggleCollapse={toggleItemCollapse}
                  onSoftDelete={triggerSoftDelete}
                  onOpenHelper={openHelper}
                  otherIntraProjects={otherIntraProjects}
                />
              )}

              {activeSection === "EDUCATION" && <EducationSection onSoftDelete={triggerSoftDelete} />}

              {activeSection === "SKILLS" && <SkillsSection />}

              {activeSection === "ACTIVITIES" && <ActivitiesSection onOpenHelper={openHelper} onSoftDelete={triggerSoftDelete} />}
            </div>
          </div>
        </main>
      </div>

      {/* The preview. Below 1024px in the edit pane it stays rendered but invisible, so the page is still measured. */}
      <section
        aria-label="Preview"
        className={cx(
          "flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(56px+env(safe-area-inset-bottom))] lg:col-start-2 lg:row-start-2 lg:pb-0 print:hidden",
          pane === "edit" && "max-lg:invisible max-lg:fixed max-lg:left-0 max-lg:top-0 max-lg:h-px max-lg:w-px max-lg:overflow-hidden",
        )}
      >
        <CanvasPreviewViewport
          cvData={cvData}
          isFullScreen={isFullScreenPaper}
          onToggleFullScreen={() => setIsFullScreenPaper((v) => !v)}
          onSectionClick={handleCanvasSectionClick}
          onHeightBudgetChange={setHeightBudget}
          onAutoFit={handleAutoFit}
          onOpenOrder={openOrder}
        />
      </section>

      <BottomBar pane={pane} onPane={setPane} overflowPercent={heightBudget.isOverflow ? heightBudget.percentage : null} />

      {/* Announces only when the page flips between fitting and not fitting */}
      <span role="status" aria-live="polite" className="sr-only">{heightBudget.isOverflow ? "Longer than 1 page" : "Fits on 1 page"}</span>

      <StudioToasts toasts={toasts} onClose={closeToast} />

      {/* Help me write dialog */}
      {helperTarget && (
        <BulletHelper target={helperTarget} onClose={() => setHelperFor(null)} onApply={applyHelperBullets} />
      )}

      {/* Section order dialog */}
      <SectionOrderDialog open={isSectionOrderModalOpen} onClose={() => setIsSectionOrderModalOpen(false)} />

      {/* Score dialog */}
      <ScoreEngineModal
        isOpen={isScoreModalOpen}
        onClose={() => setIsScoreModalOpen(false)}
        cvData={cvData}
        heightBudget={heightBudget}
        targetJobDescription={targetJobDescription}
        onTargetJobDescriptionChange={setTargetJobDescription}
        onJumpToSection={(sec, itemId, lineText?: string) => {
          setIsScoreModalOpen(false);
          jumpToItem(sec, itemId, lineText);
          // "Fix" on a whole check: after the dialog gives focus back, move it to the opened section's title
          if (!itemId) setTimeout(() => document.querySelector<HTMLElement>("#studio-sheet h1")?.focus(), 60);
        }}
        initialTab="overview"
      />
    </div>
  );
}
