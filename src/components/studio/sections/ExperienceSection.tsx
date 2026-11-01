"use client";

import React, { useRef } from "react";
import { useCVStore } from "@/lib/store/cv-store";
import type { ExperienceItem } from "@/types/resume";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Toggle } from "@/components/ui/Toggle";
import type { SectionProps } from "./types";
import { ADD_ITEM, CARD_TOGGLE, ItemCard, LinesBlock, SectionTitle, SlotButton, focusAfterChange, plural, refocusCardButton } from "./parts";

// Work experience: hidden by default so projects get more room; one card per job when shown
export function ExperienceSection({
  collapsedItems,
  onToggleCollapse,
  onSoftDelete,
  onOpenHelper,
}: Pick<SectionProps, "collapsedItems" | "onToggleCollapse" | "onSoftDelete" | "onOpenHelper">) {
  const experience = useCVStore((s) => s.cvData.experience);
  const showExperience = useCVStore((s) => s.cvData.showExperience);
  const setShowExperience = useCVStore((s) => s.setShowExperience);
  const addExperienceItem = useCVStore((s) => s.addExperienceItem);
  const updateExperienceItem = useCVStore((s) => s.updateExperienceItem);
  const removeExperienceItem = useCVStore((s) => s.removeExperienceItem);
  const moveExperience = useCVStore((s) => s.moveExperience);
  const rootRef = useRef<HTMLDivElement>(null);

  const shown = !!showExperience;
  const setLines = (exp: ExperienceItem, next: string[]) => updateExperienceItem(exp.id, { bulletPoints: next });

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <SectionTitle
        id="EXPERIENCE"
        count={shown ? `${plural(experience.length, "job", "jobs")} on your CV.` : "Hidden from your CV."}
      >
        <Toggle checked={shown} onChange={setShowExperience} label="Show on CV" />
      </SectionTitle>

      {!shown ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-field px-4 py-4">
          <p className="text-app text-muted">
            Work experience is hidden, so your projects get more room on the page. You can turn it back on anytime.
          </p>
          <Button size="sm" variant="secondary" data-add="show" onClick={() => setShowExperience(true)}>
            Show work experience
          </Button>
        </div>
      ) : (
        <>
          {experience.length > 0 && (
            <div className="flex flex-col gap-3">
              {experience.map((exp, expIdx) => {
                const collapsed = collapsedItems[exp.id] ?? false;
                const lines = exp.bulletPoints;
                const move = (dir: "up" | "down") => {
                  moveExperience(expIdx, dir);
                  refocusCardButton(exp.id, dir === "up" ? "Move job up" : "Move job down", dir === "up" ? "Move job down" : "Move job up");
                };
                return (
                  <ItemCard
                    key={exp.id}
                    id={exp.id}
                    name={exp.role || "New job"}
                    tools={exp.company ? `at ${exp.company}` : undefined}
                    lines={lines}
                    collapsed={collapsed}
                    onToggle={() => onToggleCollapse(exp.id)}
                    moveUp={expIdx > 0 ? { label: "Move job up", onClick: () => move("up") } : undefined}
                    moveDown={expIdx < experience.length - 1 ? { label: "Move job down", onClick: () => move("down") } : undefined}
                    remove={{
                      label: "Remove job",
                      onClick: () => {
                        removeExperienceItem(exp.id);
                        onSoftDelete({
                          id: exp.id,
                          type: "experience",
                          label: exp.role ? `${exp.role} at ${exp.company}` : "Job",
                          item: exp,
                          index: expIdx,
                        });
                        // Removing the last job hides the section, so then focus goes to "Show work experience"
                        focusAfterChange(rootRef.current, CARD_TOGGLE, expIdx, ADD_ITEM, 'button[data-add="show"]');
                      },
                    }}
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Field id={`exp-${exp.id}-role`} label="Job title *">
                        {(a11y) => (
                          <TextInput {...a11y} type="text" value={exp.role} placeholder="e.g. Software Engineer Intern"
                            onChange={(e) => updateExperienceItem(exp.id, { role: e.target.value })} />
                        )}
                      </Field>
                      <Field id={`exp-${exp.id}-company`} label="Company *">
                        {(a11y) => (
                          <TextInput {...a11y} type="text" value={exp.company} placeholder="e.g. Company name"
                            onChange={(e) => updateExperienceItem(exp.id, { company: e.target.value })} />
                        )}
                      </Field>
                      <Field id={`exp-${exp.id}-location`} label="City">
                        {(a11y) => (
                          <TextInput {...a11y} type="text" value={exp.location} placeholder="e.g. Dublin, Ireland or Remote"
                            onChange={(e) => updateExperienceItem(exp.id, { location: e.target.value })} />
                        )}
                      </Field>
                      <Field id={`exp-${exp.id}-start`} label="Start date">
                        {(a11y) => (
                          <TextInput {...a11y} type="text" value={exp.startDate} placeholder="e.g. June 2024"
                            onChange={(e) => updateExperienceItem(exp.id, { startDate: e.target.value })} />
                        )}
                      </Field>
                      <Field id={`exp-${exp.id}-end`} label="End date">
                        {(a11y) => (
                          <TextInput {...a11y} type="text" disabled={exp.isCurrent} value={exp.isCurrent ? "Present" : exp.endDate}
                            placeholder="e.g. August 2024" className="disabled:bg-active disabled:text-muted"
                            onChange={(e) => updateExperienceItem(exp.id, { endDate: e.target.value })} />
                        )}
                      </Field>
                      <div className="flex items-end">
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-app text-ink sm:min-h-10">
                          <input
                            type="checkbox"
                            checked={exp.isCurrent}
                            onChange={(e) =>
                              updateExperienceItem(exp.id, {
                                isCurrent: e.target.checked,
                                // Unticked: clear the "Present" we wrote, so the field is empty
                                endDate: e.target.checked
                                  ? "Present"
                                  : exp.endDate?.trim().toLowerCase() === "present"
                                  ? ""
                                  : exp.endDate,
                              })
                            }
                            className="h-4 w-4 cursor-pointer accent-ink"
                          />
                          I still work here
                        </label>
                      </div>
                    </div>

                    <LinesBlock
                      itemId={exp.id}
                      kind="experience"
                      lines={lines}
                      onOpenHelper={onOpenHelper}
                      onAdd={() => setLines(exp, [...lines, ""])}
                      onChangeLine={(i, v) => setLines(exp, lines.map((l, j) => (j === i ? v : l)))}
                      onDeleteLine={(i) => setLines(exp, lines.filter((_, j) => j !== i))}
                      onSetLines={(lines) => setLines(exp, lines)}
                    />
                  </ItemCard>
                );
              })}
            </div>
          )}

          <SlotButton
            onClick={() =>
              addExperienceItem({ company: "", role: "", location: "", startDate: "", endDate: "", isCurrent: false, bulletPoints: [] })
            }
          >
            Add a job
          </SlotButton>
        </>
      )}
    </div>
  );
}
