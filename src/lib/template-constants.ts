// Central source of truth for the Dr. Wissam CV Template formatting,
// curriculum program titles, skills category labels, and section layout.

import type { EducationState, SectionId } from "@/types/resume";

export const DR_WISSAM_EDUCATION_PROGRAMS: Record<EducationState, string> = {
  STATE_A_CORE: "42 Core Curriculum - Architecture of Digital Technologies Program",
  STATE_B_SPECIALIZATION: "Completed the 42 Core Curriculum - Architecture of Digital Technologies Program",
  STATE_C_ALUMNUS: "Completed the 42 Core Curriculum - Architecture of Digital Technologies Program",
};

export const DR_WISSAM_SPECIALIZATION_PREFIX = "Advanced Curriculum - ";
export const DR_WISSAM_SPECIALIZATION_SUFFIX = " Specialization Track";

export function formatSpecializationTrack(track?: string): string {
  const t = (track || "").trim();
  if (!t) return "";
  let clean = t;
  if (clean.toLowerCase().startsWith("advanced curriculum -")) {
    clean = clean.slice("advanced curriculum -".length).trim();
  }
  if (clean.toLowerCase().endsWith("specialization track")) {
    clean = clean.slice(0, -"specialization track".length).trim();
  } else if (clean.toLowerCase().endsWith("track")) {
    clean = clean.slice(0, -"track".length).trim();
  }
  return `${DR_WISSAM_SPECIALIZATION_PREFIX}${clean}${DR_WISSAM_SPECIALIZATION_SUFFIX}`;
}

export const DR_WISSAM_DEFAULT_HEADLINE = "42 Student";

// Exact category labels defined by Dr. Wissam's template
export const DR_WISSAM_SKILL_LABELS = {
  languages: "Languages",
  developerTools: "Developer Tools",
  technologiesFrameworks: "Technologies/Frameworks",
  projectManagementTools: "Project Management tools",
} as const;

// Strict section order according to Dr. Wissam's template
export const DR_WISSAM_SECTION_ORDER: SectionId[] = [
  "education",
  "experience",
  "projects",
  "skills",
  "coursework",
  "extracurriculars",
];
