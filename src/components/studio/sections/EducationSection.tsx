"use client";

import React, { useRef } from "react";
import { Trash2 } from "lucide-react";
import { useCVStore } from "@/lib/store/cv-store";
import type { EducationState } from "@/types/resume";
import { cx } from "@/lib/cx";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { TextInput } from "@/components/ui/TextInput";
import { ADD_ITEM, SectionTitle, SlotButton, focusAfterChange, plural } from "./parts";

const STAGES: { id: EducationState; label: string; desc: string }[] = [
  { id: "STATE_A_CORE", label: "Common core", desc: "You are doing the common core" },
  { id: "STATE_B_SPECIALIZATION", label: "Advanced track", desc: "You finished the core and chose a track" },
  { id: "STATE_C_ALUMNUS", label: "Finished 42", desc: "You have finished 42" },
];

// Education: where the student is at 42, then one card per school
export function EducationSection() {
  const cvData = useCVStore((s) => s.cvData);
  const setCVData = useCVStore((s) => s.setCVData);
  const setEducationState = useCVStore((s) => s.setEducationState);
  const addEducationItem = useCVStore((s) => s.addEducationItem);
  const updateEducationItem = useCVStore((s) => s.updateEducationItem);
  const removeEducationItem = useCVStore((s) => s.removeEducationItem);
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <SectionTitle id="EDUCATION" count={`${plural(cvData.education.length, "school", "schools")} on your CV.`} />

      <div className="flex flex-col gap-2">
        <p id="edu-state-label" className="text-app font-medium text-ink">Where are you at 42?</p>
        <div role="group" aria-labelledby="edu-state-label" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STAGES.map((item) => {
            const on = cvData.educationState === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setEducationState(item.id)}
                aria-pressed={on}
                className={cx(
                  "flex min-h-11 flex-col items-start rounded-card border px-3 py-2.5 text-left transition-colors duration-150",
                  on ? "border-ink bg-raised" : "border-control bg-paper hover:bg-raised"
                )}
              >
                <span className="text-app font-medium text-ink">{item.label}</span>
                <span className="text-app-sm text-muted">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {cvData.educationState === "STATE_B_SPECIALIZATION" && (
        <Field id="edu-track" label="Track name">
          {(a11y) => (
            <TextInput {...a11y} type="text" value={cvData.specializationTrack || ""} placeholder="e.g. Security"
              onChange={(e) => setCVData({ ...cvData, specializationTrack: e.target.value })} />
          )}
        </Field>
      )}

      <div className="flex flex-col gap-3">
        {cvData.education.map((edu, eduIdx) => (
          <div key={edu.id} className="rounded-card border border-edge bg-paper">
            <div className="flex min-h-12 items-center gap-1 pl-4 pr-2">
              <h2 className="min-w-0 flex-1 truncate text-app-md font-medium text-ink">{edu.institution || "New school"}</h2>
              {cvData.education.length > 1 && (
                <IconButton label="Remove school" onClick={() => {
                  removeEducationItem(edu.id);
                  // With one school left there is no Remove button, so focus goes to its School box
                  focusAfterChange(rootRef.current, 'button[aria-label="Remove school"]', eduIdx, 'input[id$="-inst"]', ADD_ITEM);
                }}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 border-t border-rule px-4 pb-4 pt-4 sm:grid-cols-2">
              <Field id={`edu-${edu.id}-inst`} label="School">
                {(a11y) => (
                  <TextInput {...a11y} type="text" value={edu.institution} placeholder="e.g. 42"
                    onChange={(e) => updateEducationItem(edu.id, { institution: e.target.value })} />
                )}
              </Field>
              <Field id={`edu-${edu.id}-program`} label="Program or degree">
                {(a11y) => (
                  <TextInput {...a11y} type="text" value={edu.program} placeholder="e.g. Common core"
                    onChange={(e) => updateEducationItem(edu.id, { program: e.target.value })} />
                )}
              </Field>
              <Field id={`edu-${edu.id}-start`} label="Start date">
                {(a11y) => (
                  <TextInput {...a11y} type="text" value={edu.startDate} placeholder="e.g. 2023"
                    onChange={(e) => updateEducationItem(edu.id, { startDate: e.target.value })} />
                )}
              </Field>
              <Field id={`edu-${edu.id}-end`} label="End date">
                {(a11y) => (
                  <TextInput {...a11y} type="text" value={edu.endDate || ""} placeholder="e.g. Present or 2025"
                    onChange={(e) => updateEducationItem(edu.id, { endDate: e.target.value })} />
                )}
              </Field>
            </div>
          </div>
        ))}

        <SlotButton
          onClick={() => addEducationItem({ institution: "", degree: "", program: "", startDate: "", endDate: "", isCurrent: false })}
        >
          Add a school
        </SlotButton>
      </div>
    </div>
  );
}
