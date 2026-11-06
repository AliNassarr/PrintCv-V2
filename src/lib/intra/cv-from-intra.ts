import { CVData, EducationItem, EducationState, ProjectItem, DEFAULT_SECTION_ORDER } from "@/types/resume";
import { findProjectGuide } from "@/lib/project-guide";
import { MAIN_EDUCATION_ID } from "@/lib/cv-constants";
import { DR_WISSAM_EDUCATION_PROGRAMS, DR_WISSAM_DEFAULT_HEADLINE } from "@/lib/template-constants";
import { deriveVerifiedSkillsFromProjects, safelyMergeSkills } from "@/lib/intra/skills-from-projects";

export { MAIN_EDUCATION_ID };

export interface IntraProfile {
  id: number;
  login: string;
  email: string;
  displayname: string;
  image: string;
  campusName: string;
  campusId: number;
  level: number;
  grade: string;
  poolMonth: string;
  poolYear: number | null;
  coalition: string;
  beginAt: string;
  validatedProjects: {
    id: number;
    name: string;
    slug: string;
    finalMark: number | null;
    validated: boolean;
    markedAt: string;
    date?: string;
  }[];
}

export function format42ProjectDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Most campuses are "42 <City>". A few network schools use their own name.
// Students can always edit this in the editor.
const CAMPUS_SCHOOL_NAMES: Record<string, string> = {
  amsterdam: "Codam Coding College",
  helsinki: "Hive Helsinki",
  khouribga: "1337 Khouribga",
  "ben guerir": "1337 Ben Guerir",
  benguerir: "1337 Ben Guerir",
  tetouan: "1337 Tetouan",
  "med": "1337 Med",
  rabat: "1337 Rabat",
  brussels: "19 Brussels",
};

export function schoolNameForCampus(campusName: string): string {
  const campus = (campusName || "").trim();
  if (!campus) return "";
  return CAMPUS_SCHOOL_NAMES[campus.toLowerCase()] || `42 ${campus}`;
}

export function programForState(state: EducationState): string {
  return DR_WISSAM_EDUCATION_PROGRAMS[state];
}

// Program titles older versions of the app filled in by default (app text, not personal data)
const OLD_DEFAULT_PROGRAMS = [
  "Core Systems Curriculum - Software & Systems Engineering",
  "Completed the Core Systems Curriculum - Software & Systems Engineering",
  "Core Systems Curriculum – Architecture of Digital Technologies Program",
  "Completed the Core Systems Curriculum – Architecture of Digital Technologies Program",
  "Core Curriculum – Architecture of Digital Technologies",
  "Completed the Core Curriculum – Architecture of Digital Technologies",
];

/** True when the program is empty or is text the app filled in, not something the student wrote. */
export function isDefaultProgram(program?: string): boolean {
  const text = (program || "").trim();
  return (
    !text ||
    text === DR_WISSAM_EDUCATION_PROGRAMS.STATE_A_CORE ||
    text === DR_WISSAM_EDUCATION_PROGRAMS.STATE_B_SPECIALIZATION ||
    text === DR_WISSAM_EDUCATION_PROGRAMS.STATE_C_ALUMNUS ||
    OLD_DEFAULT_PROGRAMS.includes(text)
  );
}

export function educationStateForProfile(user: IntraProfile): EducationState {
  if (user.grade === "Alumni") return "STATE_C_ALUMNUS";
  const hasTranscendence = user.validatedProjects.some((p) => p.slug.includes("transcendence"));
  return hasTranscendence ? "STATE_B_SPECIALIZATION" : "STATE_A_CORE";
}

const isExamOrPiscine = (p: { slug: string; name: string }) =>
  /exam|piscine|rush/i.test(p.slug) || /exam|piscine|rush/i.test(p.name);

export function projectsFromIntra(user: IntraProfile, limit = 4): ProjectItem[] {
  return user.validatedProjects
    .filter((p) => !isExamOrPiscine(p))
    .slice(0, limit)
    .map((p) => ({
      id: `proj-intra-${p.id}`,
      name: p.name,
      slug: p.slug,
      is42Project: true,
      techStack: findProjectGuide(p.slug, p.name)?.techStack || "C",
      date: p.date || format42ProjectDate(p.markedAt),
      bulletPoints: [],
    }));
}

/** Whole Intra level, or "" when there is none (no cursus yet, or level 0). */
export function levelFromIntra(user: IntraProfile): number | "" {
  const level = Math.floor(Number(user.level) || 0);
  return level > 0 ? level : "";
}

function mainEducationFromIntra(user: IntraProfile, state: EducationState): EducationItem {
  const startYear = user.beginAt ? new Date(user.beginAt).getFullYear() : NaN;
  return {
    id: MAIN_EDUCATION_ID,
    institution: schoolNameForCampus(user.campusName),
    program: programForState(state),
    startDate: isNaN(startYear) ? "" : String(startYear),
    endDate: state === "STATE_C_ALUMNUS" ? "" : "Present",
    isCurrent: state !== "STATE_C_ALUMNUS",
    level: levelFromIntra(user),
    state,
  };
}

export function createEmptyCV(): CVData {
  return {
    targetRole: "",
    showExperience: false,
    styleDensity: "standard",
    showExtracurriculars: false,
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    educationState: "STATE_A_CORE",
    contact: {
      fullName: "",
      level: "",
      email: "",
      phoneNumber: "",
      githubUrl: "",
      linkedinUrl: "",
      location: "",
    },
    education: [
      {
        id: MAIN_EDUCATION_ID,
        institution: "",
        program: "",
        startDate: "",
        endDate: "Present",
        isCurrent: true,
        state: "STATE_A_CORE",
      },
    ],
    experience: [],
    projects: [],
    skills: {
      languages: [],
      developerTools: [],
      technologiesFrameworks: [],
      projectManagementTools: [],
    },
    coursework: [],
    extracurriculars: [],
  };
}

/** A new CV built only from what Intra knows. Unknown fields stay empty. */
export function createInitialCVFromIntra(user: IntraProfile): CVData {
  return mergeIntraIntoCV(createEmptyCV(), user);
}

const isBlank = (value: unknown) => value === undefined || value === null || String(value).trim() === "";

/**
 * Adds Intra data to a CV without overwriting anything the student typed:
 * only empty fields are filled, and projects are added only if the CV has none.
 * The level and school stage always follow Intra, since Intra is the source of truth for them.
 */
export function mergeIntraIntoCV(cv: CVData, user: IntraProfile): CVData {
  const state = educationStateForProfile(user);
  const fromIntra = mainEducationFromIntra(user, state);
  const level = levelFromIntra(user);

  const fillMain = (e: EducationItem): EducationItem => {
    // Dates were never filled in, so take Intra's start/end together
    const takeDates = isBlank(e.startDate) && (isBlank(e.endDate) || e.endDate === "Present");
    return {
      ...e,
      institution: isBlank(e.institution) ? fromIntra.institution : e.institution,
      // Keep a program the student wrote; replace only our own default text
      program: isDefaultProgram(e.program) ? fromIntra.program : e.program,
      startDate: takeDates ? fromIntra.startDate : e.startDate,
      endDate: takeDates ? fromIntra.endDate : e.endDate,
      isCurrent: takeDates ? fromIntra.isCurrent : e.isCurrent,
      level: level === "" ? e.level : level,
      state,
    };
  };

  const hasMain = cv.education.some((e) => e.id === MAIN_EDUCATION_ID);
  const education = hasMain
    ? cv.education.map((e) => (e.id === MAIN_EDUCATION_ID ? fillMain(e) : e))
    : [fromIntra, ...cv.education];

  // Derive verified skills only if the user hasn't already entered skills
  const verifiedSkills = deriveVerifiedSkillsFromProjects(user.validatedProjects || []);
  const mergedSkills = safelyMergeSkills(cv.skills, verifiedSkills);

  return {
    ...cv,
    targetRole: isBlank(cv.targetRole) ? DR_WISSAM_DEFAULT_HEADLINE : cv.targetRole,
    educationState: state,
    contact: {
      ...cv.contact,
      fullName: isBlank(cv.contact.fullName) ? user.displayname || "" : cv.contact.fullName,
      email: isBlank(cv.contact.email) ? user.email || "" : cv.contact.email,
      location: isBlank(cv.contact.location) ? user.campusName || "" : cv.contact.location,
      level: level === "" ? cv.contact.level : level,
    },
    education,
    projects: cv.projects.length > 0 ? cv.projects : projectsFromIntra(user),
    skills: mergedSkills,
  };
}

// ---------------------------------------------------------------------------
// One-time cleanup of the old built-in sample CV (runs only when an old draft is migrated).
// Older versions filled every new draft with a real person's details.
// Items are matched by a fingerprint of their old id plus a fingerprint of the untouched text,
// so nothing the student wrote is removed. Only fingerprints are kept here, never the old text.
// Contact details are short, so a full fingerprint could be reversed by trying every value.
// Only the low 12 bits are kept for them: thousands of values share each one, so the old
// details cannot be worked out. Because that is weak, they never start the cleanup alone.
// ---------------------------------------------------------------------------

// Fingerprint of each old sample item id, with the fingerprints of its untouched lines (one per old version).
const LEGACY_SAMPLE_ITEMS: Record<string, string[]> = {
  "1rcp3e6": ["1xs7kwl"],
  "2lp7qq": ["1lwfz10", "11dqtap"],
  yj4inq: ["wusv8x"],
  "16r9eda": ["ed1fw4", "sk7vgt", "851bhw"],
  s2koq3: ["1iutjs0"],
  "1r4avv1": ["1dkgyzv"],
  "14yxc1f": ["d5qo4y"],
  sn216x: ["1qc6gox"],
};
// Low 12 bits of the old sample contact details (names, emails, phones, links).
const LEGACY_SAMPLE_CONTACT_BITS = new Set([0x563, 0x0de, 0x677, 0xa40, 0x8d4, 0x792, 0xfee, 0xc6c, 0xffa, 0x0eb]);
// Low 12 bits of the old sample cities. Real students live there too, so they are only cleared after a match.
const LEGACY_SAMPLE_CITY_BITS = new Set([0x04f, 0xd9b]);
const LEGACY_SAMPLE_SCHOOL_FPS = new Set(["ky4j3q", "e5m2uc"]);
const LEGACY_SAMPLE_PROGRAM_FPS = new Set(["1xqyvfg", "1u23k1q", "ll9q9e"]);
const LEGACY_SAMPLE_SKILLS_FPS = new Set(["pu254a", "112uung"]);
const LEGACY_SAMPLE_COURSEWORK_FP = "1wnj2gu";
const LEGACY_SAMPLE_LEVELS = new Set(["7", "9"]);
const LEGACY_SAMPLE_START_YEARS = new Set(["2023", "2025"]);
// Low 12 bits of the old sample profile logins
const LEGACY_SAMPLE_LOGIN_BITS = new Set([0x6b5, 0x17b]);
// Fingerprints of the project slug and campus role the old sample pre-selected
const LEGACY_SAMPLE_SLUG_FP = "olaak1";
const LEGACY_SAMPLE_ROLE_FP = "1h3de7o";
// Old id of the main school entry
export const LEGACY_MAIN_EDUCATION_ID = "edu-42";

function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return h >>> 0;
}
const fingerprint = (text: string) => hash(text).toString(36);
const lowBits = (text: string) => hash(text) & 0xfff;

const normalizeText = (value: string) =>
  value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");

const filled = (value?: unknown): value is string => typeof value === "string" && value.trim() !== "";
const matches = (set: Set<string>, value?: unknown) => filled(value) && set.has(fingerprint(normalizeText(value)));
const matchesBits = (set: Set<number>, value?: unknown) => filled(value) && set.has(lowBits(normalizeText(value)));

// Real projects from the old app could share these ids (e.g. "proj-minishell"),
// so only an item whose text is still exactly the sample counts.
const isUntouchedSample = (item: { id: string; bulletPoints?: string[] }) =>
  (LEGACY_SAMPLE_ITEMS[fingerprint(item.id)] ?? []).includes(fingerprint((item.bulletPoints || []).join("\n")));

export function isLegacySampleProfile(profile: { login?: string } | null | undefined): boolean {
  return Boolean(profile?.login) && LEGACY_SAMPLE_LOGIN_BITS.has(lowBits(profile!.login!.toLowerCase()));
}

export const isLegacySampleSlug = (slug: unknown) => typeof slug === "string" && fingerprint(slug) === LEGACY_SAMPLE_SLUG_FP;
export const isLegacySampleRole = (role: unknown) => typeof role === "string" && fingerprint(role) === LEGACY_SAMPLE_ROLE_FP;

/** Older drafts used "edu-42" for the main school entry. */
export function renameLegacyMainEducation(cv: CVData): CVData {
  if (!Array.isArray(cv?.education)) return cv;
  if (cv.education.some((e) => e.id === MAIN_EDUCATION_ID)) return cv;
  return {
    ...cv,
    education: cv.education.map((e) => (e.id === LEGACY_MAIN_EDUCATION_ID ? { ...e, id: MAIN_EDUCATION_ID } : e)),
  };
}

const IDENTITY_KEYS = ["fullName", "email", "phoneNumber", "githubUrl", "linkedinUrl"] as const;
// The phone can start nothing: it is only cleared after another match.
const TRIGGER_KEYS = ["fullName", "email", "githubUrl", "linkedinUrl"] as const;

/** Older versions guessed github.com/<login> and linkedin.com/in/<login> at login. Remove those guesses. */
export function removeGuessedLinks(cv: CVData, login?: string): CVData {
  if (!cv?.contact || !login) return cv;
  const guess = (value: string | undefined, expected: string) =>
    Boolean(value) && normalizeText(value!) === expected.toLowerCase();
  const githubUrl = guess(cv.contact.githubUrl, `github.com/${login}`) ? "" : cv.contact.githubUrl;
  const linkedinUrl = guess(cv.contact.linkedinUrl, `linkedin.com/in/${login}`) ? "" : cv.contact.linkedinUrl;
  if (githubUrl === cv.contact.githubUrl && linkedinUrl === cv.contact.linkedinUrl) return cv;
  return { ...cv, contact: { ...cv.contact, githubUrl, linkedinUrl } };
}

/** Returns the cleaned CV and whether anything was removed. */
export function removeLegacySampleData(cv: CVData): { cv: CVData; changed: boolean } {
  if (!cv?.contact) return { cv, changed: false };

  const projectsIn = cv.projects || [];
  const experienceIn = cv.experience || [];
  const extrasIn = cv.extracurriculars || [];
  // Only strong signals: untouched sample text, or at least two of the sample person's name, email and links
  const found =
    [...projectsIn, ...experienceIn, ...extrasIn].some(isUntouchedSample) ||
    TRIGGER_KEYS.filter((k) => matchesBits(LEGACY_SAMPLE_CONTACT_BITS, cv.contact[k])).length >= 2;
  if (!found) return { cv, changed: false };

  const projects = projectsIn.filter((p) => !isUntouchedSample(p));
  const experience = experienceIn.filter((e) => !isUntouchedSample(e));
  const extracurriculars = extrasIn.filter((e) => !isUntouchedSample(e));

  const contact = { ...cv.contact };
  for (const k of IDENTITY_KEYS) {
    if (matchesBits(LEGACY_SAMPLE_CONTACT_BITS, contact[k])) contact[k] = "";
  }
  if (matchesBits(LEGACY_SAMPLE_CITY_BITS, contact.location)) contact.location = "";
  const isSampleLevel = (level: unknown) => LEGACY_SAMPLE_LEVELS.has(String(level ?? "").trim());
  if (isSampleLevel(contact.level)) contact.level = "";

  const education = (cv.education || []).map((e) => {
    const next = { ...e };
    if (matches(LEGACY_SAMPLE_SCHOOL_FPS, next.institution)) next.institution = "";
    if (matches(LEGACY_SAMPLE_PROGRAM_FPS, next.program)) next.program = "";
    if (e.id === MAIN_EDUCATION_ID || e.id === LEGACY_MAIN_EDUCATION_ID) {
      if (isSampleLevel(next.level)) next.level = "";
      if (LEGACY_SAMPLE_START_YEARS.has(String(next.startDate || "").trim()) && next.endDate === "Present") {
        next.startDate = "";
      }
    }
    return next;
  });

  const skills = cv.skills && LEGACY_SAMPLE_SKILLS_FPS.has(fingerprint(JSON.stringify(cv.skills)))
    ? { languages: [], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] }
    : cv.skills;
  const coursework = fingerprint(JSON.stringify(cv.coursework || [])) === LEGACY_SAMPLE_COURSEWORK_FP ? [] : cv.coursework;

  const cleaned: CVData = {
    ...cv,
    contact,
    projects,
    experience,
    extracurriculars,
    education,
    skills,
    coursework,
    showExperience: experience.length > 0 && cv.showExperience,
    showExtracurriculars: extracurriculars.length > 0 && cv.showExtracurriculars,
  };
  return { cv: cleaned, changed: JSON.stringify(cleaned) !== JSON.stringify(cv) };
}
