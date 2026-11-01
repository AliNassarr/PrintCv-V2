// One source for the section marks, the section sublines and the "Next" block.
// Built on scoreCV, so the menu never says "done" while a line in that section has a problem,
// and "Next" is empty only when no shown section is still "to do" or "started".
// One exception: the checks over all lines together (verbs, numbers, different first words) and the page size
// check can point "Next" at a section marked done. They are about how the lines read, not missing content;
// verbs and numbers point at the first line that needs work, the others at Projects.
import type { CVData } from "@/types/resume";
import type { CvScore, LineIssue, ScoreCheck, ScoreSection } from "@/lib/cv-score";
import { MAIN_EDUCATION_ID } from "@/lib/cv-constants";
import { hasNumber, startsWithActionVerb } from "@/lib/line-checks";
import { STUDIO_SECTIONS } from "@/lib/studio-sections";

export type SectionStatus = "todo" | "started" | "done" | "off" | "optional";
export type Progress = Record<ScoreSection, SectionStatus>;
export interface NextStep { section: ScoreSection; itemId?: string; lineText?: string; text: string }

const filled = (s?: string | number | null) => typeof s === "number" || (typeof s === "string" && s.trim().length > 0);
const lines = (b: string[]) => b.filter((x) => filled(x)).length;
const twoToFour = (n: number) => n >= 2 && n <= 4;
const checkFull = (score: CvScore, id: string) => {
  const c = score.groups.flatMap((g) => g.checks).find((x) => x.id === id);
  return !!c && c.points >= c.max;
};
const issuesIn = (score: CvScore, section: ScoreSection) => score.lineIssues.filter((i) => i.section === section);
// The main school is the one printed at the top of Education
const schoolDone = (cv: CVData) => {
  const main = cv.education.find((e) => e.id === MAIN_EDUCATION_ID) || cv.education[0];
  return !!main && filled(main.institution);
};

// Projects and shown jobs in the same order as the score counts them
interface Item { section: ScoreSection; id: string; label: string; lines: string[] }
const itemsOf = (cv: CVData, withActivities: boolean): Item[] => [
  ...cv.projects.map((p) => ({ section: "PROJECTS" as const, id: p.id, label: p.name || "Project", lines: p.bulletPoints })),
  ...(cv.showExperience
    ? cv.experience.map((e) => ({ section: "EXPERIENCE" as const, id: e.id, label: e.role || e.company || "Job", lines: e.bulletPoints }))
    : []),
  ...(withActivities && cv.showExtracurriculars !== false
    ? cv.extracurriculars.map((a) => ({ section: "ACTIVITIES" as const, id: a.id, label: a.role || a.organization || "Activity", lines: a.bulletPoints }))
    : []),
];

// Per-line checks we can point at one line: the first line that fails them
const LINE_TESTS: Record<string, (t: string) => boolean> = { action: startsWithActionVerb, numbers: hasNumber };

// Where an open score check should send the student
function stepFor(cv: CVData, check: ScoreCheck): NextStep {
  if (check.id === "lines-per-item") {
    const item = itemsOf(cv, false).find((i) => !twoToFour(lines(i.lines)));
    if (item) return { section: item.section, itemId: item.id, text: `${item.label}: Write 2 to 4 lines about what you did.` };
  }
  const test = LINE_TESTS[check.id];
  if (test) {
    for (const item of itemsOf(cv, true)) {
      const line = item.lines.map((l) => l.trim()).find((l) => l && !test(l));
      if (line) return { section: item.section, itemId: item.id, lineText: line, text: `${item.label}: ${check.tip}` };
    }
  }
  return { section: check.section, text: check.tip! };
}

export function sectionProgress(cv: CVData, score: CvScore): Progress {
  const c = cv.contact;
  const contactAny = [c.fullName, c.email, c.phoneNumber, c.githubUrl, c.linkedinUrl, c.location].some(filled);
  const contactDone = ["name", "email", "phone", "links", "location"].every((id) => checkFull(score, id));

  // The score asks for 2 projects or jobs in total, so 1 project plus 1 job is enough
  const projAny = cv.projects.length > 0;
  const projDone = projAny && checkFull(score, "items") && cv.projects.every((p) => twoToFour(lines(p.bulletPoints))) && issuesIn(score, "PROJECTS").length === 0;

  const jobAny = cv.experience.length > 0;
  const jobDone = jobAny && cv.experience.every((j) => twoToFour(lines(j.bulletPoints))) && issuesIn(score, "EXPERIENCE").length === 0;

  const skillCount = Object.values(cv.skills || {}).reduce((n, l) => n + (l?.filter((s: string) => filled(s)).length || 0), 0);

  const showActs = cv.showExtracurriculars !== false;
  const actsAny = cv.coursework.some((x) => filled(x.title)) || (showActs && cv.extracurriculars.some((a) => filled(a.organization) || filled(a.role) || lines(a.bulletPoints) > 0));

  return {
    CONTACT: contactDone ? "done" : contactAny ? "started" : "todo",
    EXPERIENCE: !cv.showExperience ? "off" : jobDone ? "done" : jobAny ? "started" : "todo",
    PROJECTS: projDone ? "done" : projAny ? "started" : "todo",
    EDUCATION: schoolDone(cv) ? "done" : "todo",
    SKILLS: checkFull(score, "skills") ? "done" : skillCount > 0 ? "started" : "todo",
    ACTIVITIES: !actsAny ? "optional" : issuesIn(score, "ACTIVITIES").length ? "started" : "done",
  };
}

// The one next thing to do: projects first, then line problems, then the first open check,
// then any shown section that is still empty.
export function nextStep(cv: CVData, score: CvScore): NextStep | null {
  if (cv.projects.length === 0 && score.lineCount === 0) return { section: "PROJECTS", text: "Add your 42 projects first." };
  const order = STUDIO_SECTIONS.map((s) => s.id).filter((id) => id !== "EXPERIENCE" || cv.showExperience);
  for (const section of order) {
    const issue = issuesIn(score, section)[0];
    if (issue) return { section, itemId: issue.itemId, lineText: issue.text, text: `${issue.label}: ${issue.issue}` };
  }
  const groupOrder = ["content", "details", "lines", "page"] as const;
  for (const gid of groupOrder) {
    const open = score.groups.find((g) => g.id === gid)!.checks.find((c) => c.points < c.max && c.tip);
    if (open) return stepFor(cv, open);
  }
  if (cv.showExperience && cv.experience.length === 0) return { section: "EXPERIENCE", text: "Add a job, or hide work experience." };
  if (cv.projects.length === 0) return { section: "PROJECTS", text: "Add your 42 projects first." };
  if (!schoolDone(cv)) return { section: "EDUCATION", text: "Add the name of your school." };
  return null;
}

// The lines with at least one problem, in CV order, each with all of its problems.
// The score lists a line once per problem, so a line with two problems is one line here.
// The same line written twice in one card is 2 lines, but each shows its problems once.
// The same count as the "{n} lines to fix" pill on each card, the menu and the "Fix lines" tab.
export interface LineToFix { section: ScoreSection; itemId: string; label: string; text: string; issues: string[] }
export function linesToFixList(cv: CVData, score: CvScore): LineToFix[] {
  const byLine = new Map<string, LineIssue[]>();
  for (const i of score.lineIssues) {
    const key = `${i.section}|${i.itemId}|${i.text}`;
    byLine.set(key, [...(byLine.get(key) ?? []), i]);
  }
  const out: LineToFix[] = [];
  for (const item of itemsOf(cv, true))
    for (const l of item.lines) {
      const text = l.trim();
      const found = text ? byLine.get(`${item.section}|${item.id}|${text}`) : undefined;
      if (found) out.push({ section: item.section, itemId: item.id, label: found[0].label, text, issues: [...new Set(found.map((f) => f.issue))] });
    }
  return out;
}

// "{n} to fix" in the menu, per section
export function linesToFix(cv: CVData, score: CvScore): Record<ScoreSection, number> {
  const counts: Record<ScoreSection, number> = { CONTACT: 0, EXPERIENCE: 0, PROJECTS: 0, EDUCATION: 0, SKILLS: 0, ACTIVITIES: 0 };
  for (const l of linesToFixList(cv, score)) counts[l.section] += 1;
  return counts;
}
