"use client";

import React, { useEffect, useState } from "react";
import { useCVStore } from "@/lib/store/cv-store";
import type { SkillsData } from "@/types/resume";
import { TextInput } from "@/components/ui/TextInput";
import { SectionTitle, plural } from "./parts";

const GROUPS: { key: keyof SkillsData; id: string; label: string; placeholder: string }[] = [
  { key: "languages", id: "skills-languages", label: "Programming languages", placeholder: "e.g. C, C++, Python" },
  { key: "developerTools", id: "skills-tools", label: "Tools", placeholder: "e.g. Git, Docker, Valgrind" },
  { key: "technologiesFrameworks", id: "skills-frameworks", label: "Frameworks and libraries", placeholder: "e.g. React, Node.js" },
  { key: "projectManagementTools", id: "skills-teamwork", label: "Teamwork tools", placeholder: "e.g. GitHub, Jira, Notion" },
];

const toList = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// One comma list. The box keeps what the student types (so a comma or space does not vanish),
// and the store gets the clean list. A change from outside (42 import, undo) replaces the text.
function SkillField({ id, label, placeholder, value, onChange }: {
  id: string; label: string; placeholder: string; value: string[]; onChange: (list: string[]) => void;
}) {
  const [text, setText] = useState(() => value.join(", "));
  useEffect(() => {
    setText((t) => (sameList(toList(t), value) ? t : value.join(", ")));
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-app font-medium text-ink">{label}</label>
        <span className="text-app-sm tabular-nums text-muted">{value.length} added</span>
      </div>
      <TextInput id={id} type="text" value={text} placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); onChange(toList(e.target.value)); }} />
    </div>
  );
}

// Skills: four comma lists
export function SkillsSection() {
  const skills = useCVStore((s) => s.cvData.skills);
  const updateSkills = useCVStore((s) => s.updateSkills);
  const total = GROUPS.reduce((n, g) => n + (skills?.[g.key]?.length || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle id="SKILLS" count={`${plural(total, "skill", "skills")} added. Separate them with commas.`} />
      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => (
          <SkillField key={g.key} id={g.id} label={g.label} placeholder={g.placeholder}
            value={skills?.[g.key] || []} onChange={(list) => updateSkills({ [g.key]: list })} />
        ))}
      </div>
    </div>
  );
}
