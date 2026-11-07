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

/**
 * Strict parser for 42 student level.
 * Accepts:
 *   - Finite positive numbers > 0 (e.g. 11.45, 3.5, 2)
 *   - Strictly numeric strings with optional decimal point (e.g. "11.45", " 3.5 ", "2")
 * Rejects:
 *   - Zero, negative numbers (0, -1, "-5.4")
 *   - Partially numeric / malformed strings ("11.45abc", "5.4.2", "abc", "")
 *   - Special numeric values (NaN, Infinity, -Infinity, "Infinity")
 *   - Booleans, null, undefined, objects, arrays
 * Returns the parsed number rounded to 2 decimal places, or null if invalid.
 */
export function parseStrict42Level(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val !== "number" && typeof val !== "string") return null;

  let n: number;
  if (typeof val === "number") {
    n = val;
  } else {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // Strictly numeric: integer or decimal, no trailing garbage characters
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
    n = Number(trimmed);
  }

  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Formats a 42 level to up to two decimal places without unnecessary trailing zeros.
 * Invalid, non-positive, or non-numeric values return "".
 *
 * Examples:
 *   11.45   -> "11.45"
 *   3.5     -> "3.5"
 *   5.01    -> "5.01"
 *   2       -> "2"
 *   "11.45" -> "11.45"
 *   "2.0"   -> "2"
 *   0       -> ""
 *   -1      -> ""
 *   "11.45abc" -> ""
 *   "5.4.2"    -> ""
 *   "Infinity" -> ""
 *   null / undefined -> ""
 */
export function format42Level(level: unknown): string {
  const parsed = parseStrict42Level(level);
  if (parsed === null) return "";
  return String(Number(parsed.toFixed(2)));
}

/**
 * Returns "Level <formatted>" or "" if level is absent, zero, or invalid.
 */
export function format42LevelLabel(level: unknown): string {
  const formatted = format42Level(level);
  return formatted ? `Level ${formatted}` : "";
}

/**
 * Formats the CV subtitle according to Dr. Wissam's template:
 * "<Headline> – Level <X.XX>" (or just "<Headline>" if no valid level).
 *
 * Preserves custom target roles including those containing "Level" (e.g. "Entry-Level Developer"),
 * while stripping any accidental or duplicate trailing "– Level X" suffix from the role.
 */
export function formatCVSubtitle(targetRole?: string, level?: unknown): string {
  const rawRole = (targetRole || "").trim();
  let cleanHeadline = rawRole;
  if (cleanHeadline) {
    cleanHeadline = cleanHeadline.replace(/\s*[–—\-]\s*Level\s+\d+(\.\d+)?\s*$/i, "").trim();
    if (/^Level\s+\d+(\.\d+)?\s*$/i.test(cleanHeadline)) {
      cleanHeadline = "";
    }
  }
  const baseHeadline = cleanHeadline || DR_WISSAM_DEFAULT_HEADLINE;
  const levelLabel = format42LevelLabel(level);
  return levelLabel ? `${baseHeadline} – ${levelLabel}` : baseHeadline;
}

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
