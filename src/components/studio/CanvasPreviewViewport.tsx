"use client";

import React, { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { CleanTemplate, HeightBudget, TemplateSectionId } from "@/components/templates/CleanTemplate";
import { CVData } from "@/types/resume";
import { cx } from "@/lib/cx";
import { inertOutside } from "@/lib/use-dialog";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Pill } from "@/components/ui/Pill";

interface CanvasPreviewViewportProps {
  cvData: CVData;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onSectionClick?: (section: TemplateSectionId) => void;
  onHeightBudgetChange?: (budget: HeightBudget) => void;
  onAutoFit?: () => void;
  onOpenOrder: () => void;
}

// A4 at 96 DPI (210 x 297 mm)
const A4_W = 793.7;
const A4_H = 1122.5;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.4;

// "width": fill the width of the zone (the default; the zone scrolls down). "page": the whole page at once.
// A number: a zoom the user picked.
type Zoom = "width" | "page" | number;

const isBlank = (s?: string | null) => !s || !s.trim();

// Nothing typed yet: no details, no school name, no items and no skills
function isEmptyCV(cv: CVData) {
  const c = cv.contact;
  return (
    [c.fullName, c.email, c.phoneNumber, c.githubUrl, c.linkedinUrl, c.location, cv.targetRole].every(isBlank) &&
    !cv.education.some((e) => !isBlank(e.institution)) &&
    cv.projects.length === 0 &&
    cv.experience.length === 0 &&
    cv.coursework.length === 0 &&
    cv.extracurriculars.length === 0 &&
    !Object.values(cv.skills || {}).some((list) => list?.some((s: string) => !isBlank(s)))
  );
}

export function CanvasPreviewViewport({
  cvData,
  isFullScreen = false,
  onToggleFullScreen,
  onSectionClick,
  onHeightBudgetChange,
  onAutoFit,
  onOpenOrder,
}: CanvasPreviewViewportProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const fullScreenButtonRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ width: 0.5, page: 0.5 });
  const [zoom, setZoom] = useState<Zoom>("width");
  const [sheetHeight, setSheetHeight] = useState(A4_H);
  const [scrolls, setScrolls] = useState(true);
  const [budget, setBudget] = useState<HeightBudget>({
    height: 820,
    printableBudget: 1027,
    percentage: 80,
    isOverflow: false,
  });
  const scale = zoom === "width" ? fit.width : zoom === "page" ? fit.page : zoom;

  // The two fitted sizes (§7.2): the zone's width inside its padding (never above real size), and the whole page
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      const PAD = window.innerWidth >= 640 ? 24 : 16;
      const byWidth = (body.clientWidth - 2 * PAD) / A4_W;
      const byHeight = (body.clientHeight - 2 * PAD) / A4_H;
      // A hidden zone (edit pane on small screens) measures about 0: keep the last good values
      if (byWidth > 0.05 && byHeight > 0.05) setFit({ width: Math.min(1, byWidth), page: Math.min(byWidth, byHeight) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  // The real height of the sheet: it grows past one A4 when the CV is too long
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const measure = () => setSheetHeight(Math.max(A4_H, sheet.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);

  // Escape leaves full screen (unless a dialog is open; the dialog takes that Escape)
  useEffect(() => {
    if (!isFullScreen || !onToggleFullScreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      onToggleFullScreen();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isFullScreen, onToggleFullScreen]);

  // While full screen covers the page, the editor behind it cannot be reached with Tab or a screen reader.
  // On the way out the page comes back first, then focus goes to the Full screen button.
  useEffect(() => {
    if (!isFullScreen || !zoneRef.current) return;
    const undoInert = inertOutside(zoneRef.current);
    // The same button stays mounted in and out of full screen; only its label changes
    const button = fullScreenButtonRef.current;
    return () => {
      undoInert();
      if (button && document.contains(button)) button.focus({ preventScroll: true });
    };
  }, [isFullScreen]);

  const handleBudgetChange = (b: HeightBudget) => {
    setBudget(b);
    onHeightBudgetChange?.(b);
  };

  const handleZoom = (delta: number) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((scale + delta).toFixed(2)))));

  // The size buttons: the one in use looks pressed
  const sizeButton = (pressed: boolean) => (pressed ? "!px-2 bg-active" : "!px-2");

  const a4Width = A4_W * scale;

  // The body takes keyboard focus only when there is something to scroll (not with "Whole page").
  // "fit" is a new object on every resize the observer sees, so this runs again after each one.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) setScrolls(body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1);
  }, [scale, sheetHeight, fit]);

  return (
    <div
      ref={zoneRef}
      data-test-id="preview-zone"
      className={cx(
        "flex min-h-0 min-w-0 flex-col overflow-hidden bg-ground",
        isFullScreen ? "fixed inset-0 z-50" : "h-full w-full",
      )}
    >
      {/* Toolbar (§7.4). The page status shows only when the CV is longer than 1 page (below 1024px it is in the bottom bar).
          Below 1024px Order is in the More menu (in full screen, which covers that menu, it stays here), and below
          640px "100%" is left out, so the toolbar fits a phone. */}
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5">
        {budget.isOverflow && (
          <Pill tone="negative" className="hidden lg:inline-flex">Longer than 1 page · {budget.percentage}%</Pill>
        )}
        {budget.isOverflow && onAutoFit && (
          <Button size="sm" onClick={onAutoFit} title="Make the spacing smaller so it fits on 1 page">
            Make it fit
          </Button>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <Button size="sm" testId="order-button" aria-label="Change section order" onClick={onOpenOrder}
            className={isFullScreen ? undefined : "hidden lg:inline-flex"}>
            Order
          </Button>
          <div role="group" aria-label="Zoom" className="flex items-center">
            <IconButton label="Zoom out" onClick={() => handleZoom(-0.05)}>
              <Minus className="h-4 w-4" />
            </IconButton>
            <span className="min-w-[5ch] text-center text-app-sm tabular-nums text-ink">{Math.round(scale * 100)}%</span>
            <IconButton label="Zoom in" onClick={() => handleZoom(0.05)}>
              <Plus className="h-4 w-4" />
            </IconButton>
            <Button size="sm" variant="ghost" aria-pressed={zoom === "width"} title="Fill the width of the preview" onClick={() => setZoom("width")}
              className={sizeButton(zoom === "width")}>
              Fit width
            </Button>
            <Button size="sm" variant="ghost" aria-pressed={zoom === "page"} title="Show the whole page at once" onClick={() => setZoom("page")}
              className={sizeButton(zoom === "page")}>
              Whole page
            </Button>
            <Button size="sm" variant="ghost" aria-pressed={zoom === 1} title="Show at real size" onClick={() => setZoom(1)}
              className={cx("hidden sm:inline-flex", sizeButton(zoom === 1))}>
              100%
            </Button>
          </div>
          {onToggleFullScreen && (
            <IconButton ref={fullScreenButtonRef} label={isFullScreen ? "Exit full screen" : "Full screen"} onClick={onToggleFullScreen}>
              {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </IconButton>
          )}
        </div>
      </div>

      {/* Zone body: 24px on every side (16px on phones). "Fit width" makes the page taller than the zone, so the
          body takes keyboard focus (with a name) and the arrow keys scroll it. The scrollbar's room is kept even
          when there is nothing to scroll, so "Fit width" does not jump as the scrollbar comes and goes. */}
      <div ref={bodyRef} role="group" aria-label="Page preview" tabIndex={scrolls ? 0 : undefined}
        className="min-h-0 flex-1 overflow-auto p-4 [scrollbar-gutter:stable] focus-visible:outline-offset-[-2px] sm:p-6">
        {/* The A4, centred. Past page 1 the sheet draws its own "End of page 1" line. */}
        <div
          data-test-id="preview-a4"
          className="relative mx-auto border border-edge bg-paper"
          style={{ width: a4Width, height: sheetHeight * scale }}
        >
          <div className="absolute inset-0 overflow-hidden">
            {/* Scaled page */}
            <div
              id="resume-preview"
              ref={sheetRef}
              className="absolute left-0 top-0 origin-top-left select-text"
              style={{ transform: `scale(${scale})`, width: A4_W }}
            >
              <CleanTemplate
                data={cvData}
                scale={1}
                onHeightBudgetChange={handleBudgetChange}
                onSectionClick={onSectionClick}
                forceOverflowIndicator={true}
                nameAs="p"
                dataUi
              />
            </div>
          </div>
          {isEmptyCV(cvData) && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-app text-muted">
              Your CV appears here as you type.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
