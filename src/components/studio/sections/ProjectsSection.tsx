"use client";

import React, { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useCVStore } from "@/lib/store/cv-store";
import type { ProjectItem } from "@/types/resume";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import type { SectionProps } from "./types";
import { LOGIN_URL } from "@/lib/auth-urls";
import { ADD_ITEM, CARD_TOGGLE, ItemCard, LinesBlock, SectionTitle, SlotButton, focusAfterChange, plural, refocusCardButton } from "./parts";
import { GitHubProjectPicker } from "@/components/studio/GitHubProjectPicker";

const PICKER_FIRST = 12;

// Projects, then the picker for passed 42 projects that are not on the CV yet, then "Add a project yourself"
export function ProjectsSection({
  collapsedItems,
  onToggleCollapse,
  onSoftDelete,
  onOpenHelper,
  otherIntraProjects,
}: Pick<SectionProps, "collapsedItems" | "onToggleCollapse" | "onSoftDelete" | "onOpenHelper"> & {
  otherIntraProjects: ProjectItem[];
}) {
  const cvData = useCVStore((s) => s.cvData);
  const setCVData = useCVStore((s) => s.setCVData);
  const studentProfile = useCVStore((s) => s.studentProfile);
  const addProjectToCV = useCVStore((s) => s.addProjectToCV);
  const removeProjectFromCV = useCVStore((s) => s.removeProjectFromCV);
  const moveProject = useCVStore((s) => s.moveProject);
  // Store actions never change, so they are read once instead of subscribed to
  const { addProjectBullet: addLine, updateProjectBullet: setLine, removeProjectBullet: dropLine, updateProject } = useCVStore.getState();
  const rootRef = useRef<HTMLDivElement>(null);
  const [showAllPicker, setShowAllPicker] = useState(false);

  const projects = cvData.projects;
  const picker = showAllPicker ? otherIntraProjects : otherIntraProjects.slice(0, PICKER_FIRST);

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <SectionTitle id="PROJECTS" count={`${plural(projects.length, "project", "projects")} on your CV.`} />

      {projects.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-field px-4 py-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-app-md font-medium text-ink">
              {studentProfile ? "Pick your projects" : "Start with your 42 projects"}
            </h2>
            <p className="text-app text-muted">
              {!studentProfile
                ? "Log in with 42 and we will add the projects you passed. You can also add a project yourself."
                : otherIntraProjects.length > 0
                ? "Choose 2 to 4 projects from the list below, or add one yourself."
                : "We did not find passed projects on your 42 profile yet. Add a project yourself below."}
            </p>
          </div>
          {!studentProfile && (
            // The ink button below 1024px; from 1024px the top bar holds "Log in with 42" (ink on a first run), so this one is secondary
            <a href={LOGIN_URL}
              className="inline-flex h-11 items-center rounded-control bg-ink px-4 text-app font-medium text-paper transition-colors duration-150 hover:bg-[#444444] sm:h-10 lg:h-8 lg:border lg:border-control lg:bg-paper lg:px-3 lg:text-ink lg:hover:bg-raised">
              Log in with 42
            </a>
          )}
        </div>
      )}

      {projects.length > 0 && (
        <div className="flex flex-col gap-3">
          {projects.map((proj, projIdx) => {
            const collapsed = collapsedItems[proj.id] ?? false;
            const move = (dir: "up" | "down") => {
              moveProject(projIdx, dir);
              refocusCardButton(proj.id, dir === "up" ? "Move project up" : "Move project down", dir === "up" ? "Move project down" : "Move project up");
            };
            return (
              <ItemCard
                key={proj.id}
                id={proj.id}
                name={proj.name || "New project"}
                tools={proj.techStack}
                lines={proj.bulletPoints}
                collapsed={collapsed}
                onToggle={() => onToggleCollapse(proj.id)}
                moveUp={projIdx > 0 ? { label: "Move project up", onClick: () => move("up") } : undefined}
                moveDown={projIdx < projects.length - 1 ? { label: "Move project down", onClick: () => move("down") } : undefined}
                remove={{
                  label: "Remove project",
                  onClick: () => {
                    removeProjectFromCV(proj.id);
                    onSoftDelete({ id: proj.id, type: "project", label: proj.name || "Project", item: proj, index: projIdx });
                    focusAfterChange(rootRef.current, CARD_TOGGLE, projIdx, ADD_ITEM);
                  },
                }}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <Field id={`proj-${proj.id}-name`} label="Project name *">
                      {(a11y) => (
                        <TextInput {...a11y} type="text" value={proj.name} placeholder="e.g. Minishell"
                          onChange={(e) => updateProject(proj.id, { name: e.target.value })} />
                      )}
                    </Field>
                  </div>
                  <Field id={`proj-${proj.id}-tools`} label="Tools you used *">
                    {(a11y) => (
                      <TextInput {...a11y} type="text" value={proj.techStack} placeholder="e.g. C, Make, Valgrind"
                        onChange={(e) => updateProject(proj.id, { techStack: e.target.value })} />
                    )}
                  </Field>
                  <Field id={`proj-${proj.id}-date`} label="Date *">
                    {(a11y) => (
                      <TextInput {...a11y} type="text" value={proj.date} placeholder="e.g. January 2025"
                        onChange={(e) => updateProject(proj.id, { date: e.target.value })} />
                    )}
                  </Field>
                </div>

                <LinesBlock
                  itemId={proj.id}
                  kind="project"
                  lines={proj.bulletPoints}
                  onOpenHelper={onOpenHelper}
                  helperTestId={projIdx === 0 ? "helper-button" : undefined}
                  onAdd={() => addLine(proj.id, "")}
                  onChangeLine={(i, v) => setLine(proj.id, i, v)}
                  onDeleteLine={(i) => dropLine(proj.id, i)}
                  onSetLines={(lines) => updateProject(proj.id, { bulletPoints: lines })}
                />
              </ItemCard>
            );
          })}
        </div>
      )}

      {otherIntraProjects.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-app-md font-medium text-ink">Your other 42 projects</h2>
            <span className="text-app-sm tabular-nums text-muted">{otherIntraProjects.length} to pick from</span>
          </div>
          <p className="-mt-2 text-app text-muted">You passed these on 42. Pick one to add it.</p>
          <div className="flex flex-wrap gap-2">
            {picker.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() =>
                  addProjectToCV({ name: p.name, slug: p.slug, is42Project: true, techStack: p.techStack, date: p.date, bulletPoints: [] })
                }
                aria-label={`Add ${p.name} to your CV`}
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-control bg-paper pl-2.5 pr-3 text-app text-ink transition-colors duration-150 hover:bg-raised sm:h-8"
              >
                <Plus aria-hidden="true" className="h-4 w-4 text-muted" />
                <span>{p.name}</span>
              </button>
            ))}
            {otherIntraProjects.length > PICKER_FIRST && !showAllPicker && (
              <button type="button" onClick={() => setShowAllPicker(true)}
                className="inline-flex h-11 items-center rounded-full px-3 text-app font-medium text-ink underline underline-offset-4 hover:bg-active sm:h-8">
                Show all {otherIntraProjects.length}
              </button>
            )}
          </div>
        </div>
      )}

      <GitHubProjectPicker onOpenHelper={(id) => onOpenHelper("project", id)} />

      <SlotButton onClick={() => addProjectToCV({ name: "", techStack: "", date: "", is42Project: false, bulletPoints: [] })}>
        Add a project yourself
      </SlotButton>
    </div>
  );
}
