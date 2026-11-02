"use client";

import React, { useRef } from "react";
import { Trash2 } from "lucide-react";
import { useCVStore } from "@/lib/store/cv-store";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { TextInput } from "@/components/ui/TextInput";
import { Toggle } from "@/components/ui/Toggle";
import type { SectionProps } from "./types";
import { ADD_ITEM, EmptySlot, ItemPill, LinesBlock, SectionTitle, SlotButton, focusAfterChange, plural } from "./parts";

// Courses and activities. Courses always print; activities print only when "Show on CV" is on.
export function ActivitiesSection({ onOpenHelper, onSoftDelete }: Pick<SectionProps, "onOpenHelper" | "onSoftDelete">) {
  const coursework = useCVStore((s) => s.cvData.coursework) || [];
  const extracurriculars = useCVStore((s) => s.cvData.extracurriculars) || [];
  const showExtracurriculars = useCVStore((s) => s.cvData.showExtracurriculars);
  const setShowExtracurriculars = useCVStore((s) => s.setShowExtracurriculars);
  const addCourseworkItem = useCVStore((s) => s.addCourseworkItem);
  const updateCourseworkItem = useCVStore((s) => s.updateCourseworkItem);
  const removeCourseworkItem = useCVStore((s) => s.removeCourseworkItem);
  const addExtracurricularItem = useCVStore((s) => s.addExtracurricularItem);
  const updateExtracurricularItem = useCVStore((s) => s.updateExtracurricularItem);
  const removeExtracurricularItem = useCVStore((s) => s.removeExtracurricularItem);
  // Store actions never change, so they are read once instead of subscribed to
  const { addExtracurricularBullet: addLine, updateExtracurricularBullet: setLine, removeExtracurricularBullet: dropLine } = useCVStore.getState();
  const coursesRef = useRef<HTMLElement>(null);
  const activitiesRef = useRef<HTMLElement>(null);

  const shown = showExtracurriculars !== false;
  const courses = plural(coursework.length, "course", "courses");
  const count = shown
    ? `${courses} and ${plural(extracurriculars.length, "activity", "activities")} on your CV.`
    : `${courses} on your CV. Activities are hidden.`;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle id="ACTIVITIES" count={count} />

      <section ref={coursesRef} aria-labelledby="courses-title" className="flex flex-col gap-3">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:min-h-8">
          <h2 id="courses-title" className="text-app-md font-medium text-ink">Courses and certificates</h2>
          <span className="text-app-sm text-muted">Always on your CV</span>
        </div>
        {coursework.length === 0 ? (
          <EmptySlot>Add a course or certificate you finished, if you have one.</EmptySlot>
        ) : (
          <div className="flex flex-col gap-2">
            {coursework.map((cw, cwIdx) => (
              <div key={cw.id} className="flex items-start gap-1">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
                  <TextInput type="text" aria-label="Course or certificate name" value={cw.title} placeholder="Course or certificate name"
                    onChange={(e) => updateCourseworkItem(cw.id, { title: e.target.value })} />
                  <TextInput type="text" aria-label="Date" value={cw.date} placeholder="e.g. May 2024"
                    onChange={(e) => updateCourseworkItem(cw.id, { date: e.target.value })} />
                </div>
                <div className="flex h-11 items-center sm:h-10">
                  <IconButton label="Remove course" onClick={() => {
                    removeCourseworkItem(cw.id);
                    focusAfterChange(coursesRef.current, 'button[aria-label="Remove course"]', cwIdx, ADD_ITEM);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
        <SlotButton onClick={() => addCourseworkItem({ title: "", date: "", institution: "" })}>Add a course</SlotButton>
      </section>

      <section ref={activitiesRef} aria-labelledby="activities-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="activities-title" className="text-app-md font-medium text-ink">Activities</h2>
          <Toggle checked={shown} onChange={setShowExtracurriculars} label="Show on CV" />
        </div>

        {!shown ? (
          <EmptySlot>Activities are hidden from your CV. Turn on Show on CV to add a club or group.</EmptySlot>
        ) : (
          <>
            {extracurriculars.map((act, actIdx) => (
              <div key={act.id} id={`item-${act.id}`} className="scroll-mt-6 rounded-card border border-edge bg-paper">
                <div className="flex min-h-12 items-center gap-3 pl-4 pr-2">
                  <h3 className="min-w-0 flex-1 truncate text-app-md font-medium text-ink">
                    {act.role || act.organization || "New activity"}
                    {act.role && act.organization && <span className="ml-2 hidden text-app font-normal text-muted sm:inline">{act.organization}</span>}
                  </h3>
                  <ItemPill lines={act.bulletPoints} />
                  <IconButton label="Remove activity" onClick={() => {
                    removeExtracurricularItem(act.id);
                    onSoftDelete?.({
                      id: act.id,
                      type: "activity",
                      label: act.role ? `${act.role} at ${act.organization}` : act.organization || "Activity",
                      item: act,
                      index: actIdx,
                    });
                    focusAfterChange(activitiesRef.current, 'button[aria-label="Remove activity"]', actIdx, ADD_ITEM);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
                <div className="flex flex-col gap-6 border-t border-rule px-4 pb-4 pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id={`act-${act.id}-org`} label="Club or group">
                      {(a11y) => (
                        <TextInput {...a11y} aria-label="Club or group" type="text" value={act.organization} placeholder="e.g. Coding club"
                          onChange={(e) => updateExtracurricularItem(act.id, { organization: e.target.value })} />
                      )}
                    </Field>
                    <Field id={`act-${act.id}-role`} label="Your role">
                      {(a11y) => (
                        <TextInput {...a11y} aria-label="Your role" type="text" value={act.role} placeholder="e.g. Peer helper"
                          onChange={(e) => updateExtracurricularItem(act.id, { role: e.target.value })} />
                      )}
                    </Field>
                  </div>
                  <LinesBlock
                    itemId={act.id}
                    kind="activity"
                    lines={act.bulletPoints}
                    onOpenHelper={onOpenHelper}
                    onAdd={() => addLine(act.id, "")}
                    onChangeLine={(i, v) => setLine(act.id, i, v)}
                    onDeleteLine={(i) => dropLine(act.id, i)}
                    onSetLines={(lines) => updateExtracurricularItem(act.id, { bulletPoints: lines })}
                  />
                </div>
              </div>
            ))}
            <SlotButton
              onClick={() =>
                addExtracurricularItem({ organization: "", role: "", startDate: "", endDate: "", isCurrent: false, bulletPoints: [] })
              }
            >
              Add an activity
            </SlotButton>
          </>
        )}
      </section>
    </div>
  );
}
