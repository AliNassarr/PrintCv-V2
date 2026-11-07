"use client";

import React from "react";

interface CanvasSectionInserterProps {
  showExperience: boolean;
  showExtracurriculars: boolean;
  onEnableExperience: () => void;
  onEnableExtracurriculars: () => void;
}

export function CanvasSectionInserter({
  showExperience,
  showExtracurriculars,
  onEnableExperience,
  onEnableExtracurriculars,
}: CanvasSectionInserterProps) {
  if (showExperience && showExtracurriculars) return null;

  return (
    <div
      role="region"
      aria-label="Add Optional CV Sections"
      className="mt-4 p-3 bg-ground border border-dashed border-control rounded-lg flex flex-wrap items-center justify-between gap-3 print:hidden max-w-[210mm] mx-auto shadow-sm"
    >
      <div className="text-xs text-muted font-medium">
        Optional Sections Available:
      </div>
      <div className="flex items-center gap-2">
        {!showExperience && (
          <button
            type="button"
            onClick={onEnableExperience}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink bg-paper hover:bg-raised border border-control rounded transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-ink"
            aria-label="Add Professional Experience section to CV"
          >
            <span className="text-sm leading-none font-bold">+</span> Add Professional Experience
          </button>
        )}
        {!showExtracurriculars && (
          <button
            type="button"
            onClick={onEnableExtracurriculars}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink bg-paper hover:bg-raised border border-control rounded transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-ink"
            aria-label="Add Extracurricular Activities section to CV"
          >
            <span className="text-sm leading-none font-bold">+</span> Add Extracurricular Activities
          </button>
        )}
      </div>
    </div>
  );
}
