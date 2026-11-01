// Scores a CV out of 100 and lists what to fix.
// An empty CV scores 0: points only come from things the student has really filled in.
import type { CVData } from "@/types/resume";
import {
  hasNumber,
  hasPronoun,
  looksLikeTemplate,
  MAX_BULLET_LENGTH,
  openingWord,
  startsWithActionVerb,
  startsWithWeakWord,
} from "@/lib/bullet-helper";
import { looksLikeOldTemplate } from "@/lib/line-checks";

// Same names as the editor tabs, so a "Fix" button can open the right tab
export type ScoreSection = "CONTACT" | "EXPERIENCE" | "PROJECTS" | "EDUCATION" | "SKILLS" | "ACTIVITIES";

export interface ScoreCheck {
  id: string;
  label: string;
  points: number;
  max: number;
  tip?: string; // shown when the check is not full
  section: ScoreSection;
}

export interface ScoreGroup {
  id: "details" | "content" | "lines" | "page";
  title: string;
  score: number;
  max: number;
  checks: ScoreCheck[];
}

export interface LineIssue {
  text: string;
  issue: string;
  label: string; // project, job or activity name
  section: ScoreSection;
  itemId: string;
}

export interface CvScore {
  total: number;
  groups: ScoreGroup[];
  lineIssues: LineIssue[];
  lineCount: number;
}

interface Line {
  text: string;
  label: string;
  section: ScoreSection;
  itemId: string;
}

function collectLines(cv: CVData): Line[] {
  const lines: Line[] = [];
  const push = (bullets: string[], label: string, section: ScoreSection, itemId: string) =>
    bullets.forEach((b) => b.trim() && lines.push({ text: b.trim(), label, section, itemId }));
  cv.projects.forEach((p) => push(p.bulletPoints, p.name || "Project", "PROJECTS", p.id));
  if (cv.showExperience) {
    cv.experience.forEach((e) => push(e.bulletPoints, e.role || e.company || "Job", "EXPERIENCE", e.id));
  }
  if (cv.showExtracurriculars !== false) {
    cv.extracurriculars.forEach((a) => push(a.bulletPoints, a.role || a.organization || "Activity", "ACTIVITIES", a.id));
  }
  return lines;
}

// Share of lines that pass a test. Lines not written yet count as not passing,
// so one good line does not give full points.
const share = (lines: Line[], expected: number, test: (t: string) => boolean) =>
  lines.filter((l) => test(l.text)).length / Math.max(lines.length, expected, 1);

const check = (id: string, label: string, ratio: number, max: number, section: ScoreSection, tip: string): ScoreCheck => {
  const points = Math.round(Math.max(0, Math.min(1, ratio)) * max);
  return { id, label, points, max, section, tip: points < max ? tip : undefined };
};

export function scoreCV(cv: CVData, opts: { fitsOnePage: boolean; allowSampleLines?: boolean }): CvScore {
  // The landing page samples may use their own lines; for students, sample lines count as shared.
  const shared = opts.allowSampleLines ? looksLikeOldTemplate : looksLikeTemplate;
  const lines = collectLines(cv);
  const c = cv.contact;

  const details: ScoreCheck[] = [
    check("name", "Your name", c.fullName?.trim() ? 1 : 0, 4, "CONTACT", "Add your full name."),
    check("email", "Email", /\S+@\S+\.\S+/.test(c.email || "") ? 1 : 0, 4, "CONTACT", "Add an email you check often."),
    check("phone", "Phone number", c.phoneNumber?.trim() ? 1 : 0, 3, "CONTACT", "Add a phone number so companies can call you."),
    check("links", "GitHub or LinkedIn", c.githubUrl?.trim() || c.linkedinUrl?.trim() ? 1 : 0, 5, "CONTACT", "Add your GitHub or LinkedIn link."),
    check("location", "City", c.location?.trim() ? 1 : 0, 4, "CONTACT", "Add the city you live in."),
  ];

  const items = [
    ...cv.projects.map((p) => p.bulletPoints.filter((b) => b.trim()).length),
    ...(cv.showExperience ? cv.experience.map((e) => e.bulletPoints.filter((b) => b.trim()).length) : []),
  ];
  const skillCount = Object.values(cv.skills || {}).reduce((n, list) => n + (list?.filter((s: string) => s.trim()).length || 0), 0);
  const content: ScoreCheck[] = [
    check("items", "At least 2 projects or jobs", items.length / 2, 8, "PROJECTS", "Add at least 2 projects or jobs."),
    check(
      "lines-per-item",
      "2 to 4 lines for each project or job",
      items.length ? items.filter((n) => n >= 2 && n <= 4).length / items.length : 0,
      9,
      "PROJECTS",
      "Give each project or job 2 to 4 lines about what you did."
    ),
    check("skills", "At least 5 skills", skillCount / 5, 8, "SKILLS", "List at least 5 skills, like languages and tools."),
  ];

  // About 2 lines for each project or job, and at least 4 lines in total
  const expected = Math.max(4, 2 * items.length);
  const openings = lines.map((l) => openingWord(l.text).toLowerCase()).filter(Boolean);
  const lineChecks: ScoreCheck[] = [
    check("own-words", "Lines in your own words", share(lines, expected, (t) => !shared(t)), 12, "PROJECTS", "Some lines are the same as many other CVs. Rewrite them with what you did."),
    check("action", "Lines start with what you did", share(lines, expected, startsWithActionVerb), 10, "PROJECTS", "Start each line with a verb like Built, Fixed or Tested."),
    // Half the lines with a number is plenty
    check("numbers", "Numbers in at least half the lines", share(lines, expected, hasNumber) / 0.5, 8, "PROJECTS", "Add real numbers where you can: how many tests, users, files or hours."),
    check("pronouns", 'No "I", "my" or "we"', share(lines, expected, (t) => !hasPronoun(t)), 7, "PROJECTS", 'Remove "I", "my" and "we" from your lines.'),
    check("variety", "Different first words", new Set(openings).size / Math.max(openings.length, expected), 5, "PROJECTS", "Many lines start with the same word. Mix them up."),
    check("length", "Short lines", share(lines, expected, (t) => t.length <= MAX_BULLET_LENGTH), 3, "PROJECTS", `Keep each line under ${MAX_BULLET_LENGTH} letters.`),
  ];

  const page: ScoreCheck[] = [
    check(
      "one-page",
      "Fits on one page",
      opts.fitsOnePage && lines.length > 0 ? 1 : 0,
      10,
      "PROJECTS",
      lines.length ? "Your CV is longer than one page. Cut a few lines or use smaller spacing." : "Add some lines first."
    ),
  ];

  const group = (id: ScoreGroup["id"], title: string, checks: ScoreCheck[]): ScoreGroup => ({
    id,
    title,
    checks,
    score: checks.reduce((n, ch) => n + ch.points, 0),
    max: checks.reduce((n, ch) => n + ch.max, 0),
  });
  const groups = [
    group("details", "Your details", details),
    group("content", "Projects, jobs and skills", content),
    group("lines", "How your lines read", lineChecks),
    group("page", "Page size", page),
  ];

  const lineIssues: LineIssue[] = [];
  for (const l of lines) {
    const base = { text: l.text, label: l.label, section: l.section, itemId: l.itemId };
    if (shared(l.text)) lineIssues.push({ ...base, issue: "Same as many other CVs. Rewrite it with what you did." });
    if (startsWithWeakWord(l.text)) lineIssues.push({ ...base, issue: "Start with what you did, like Built or Fixed." });
    if (hasPronoun(l.text)) lineIssues.push({ ...base, issue: 'Remove "I", "my" or "we".' });
    if (l.text.length > MAX_BULLET_LENGTH) lineIssues.push({ ...base, issue: "Too long. Cut a few words." });
  }

  return {
    total: groups.reduce((n, g) => n + g.score, 0),
    groups,
    lineIssues,
    lineCount: lines.length,
  };
}

export function scoreLabel(total: number): string {
  if (total >= 85) return "Ready to send";
  if (total >= 60) return "Almost there";
  if (total >= 30) return "Good start";
  return "Just getting started";
}

// Common tech words to look for in a job post
const JOB_KEYWORDS = [
  "c", "c++", "c#", "java", "python", "go", "rust", "javascript", "typescript", "php", "ruby", "kotlin", "swift", "bash",
  "linux", "unix", "posix", "docker", "kubernetes", "make", "cmake", "valgrind", "gdb", "git", "ci/cd",
  "networking", "tcp/ip", "sockets", "http", "rest", "api", "graphql", "microservices", "nginx",
  "threads", "concurrency", "multithreading", "algorithms", "data structures", "oop", "testing", "unit tests",
  "sql", "postgresql", "mysql", "mongodb", "redis", "react", "next.js", "node.js", "vue", "angular", "django", "flask",
  "aws", "azure", "gcp", "terraform", "security", "agile", "scrum",
];

// Tool names that are also everyday words ("make sure", "go fast", "the rest", "Plan C").
// These only count when written like the tool name.
const EXACT_CASE: Record<string, string[]> = {
  c: ["C"],
  go: ["Go", "Golang", "golang"],
  make: ["Makefile", "Makefiles", "makefile", "GNU Make"],
  rest: ["REST", "RESTful"],
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const wordRegex = (word: string, flags: string) =>
  new RegExp(`(^|[^A-Za-z0-9+#.])${escapeRegex(word)}(?=$|[^A-Za-z0-9+#])`, flags);
// Whole-word match, so "c" does not match inside "react" and "go" not inside "google"
const hasWord = (text: string, word: string) =>
  EXACT_CASE[word] ? EXACT_CASE[word].some((form) => wordRegex(form, "").test(text)) : wordRegex(word, "i").test(text);

export function matchJobKeywords(cv: CVData, jobText: string): { matched: string[]; missing: string[] } {
  if (!jobText.trim()) return { matched: [], missing: [] };
  const cvText = [
    cv.targetRole,
    ...Object.values(cv.skills || {}).flat(),
    ...cv.projects.flatMap((p) => [p.techStack, ...p.bulletPoints]),
    ...cv.experience.flatMap((e) => [e.role, ...e.bulletPoints]),
    ...cv.extracurriculars.flatMap((a) => a.bulletPoints),
  ].join(" \n ");
  const wanted = JOB_KEYWORDS.filter((kw) => hasWord(jobText, kw));
  return {
    matched: wanted.filter((kw) => hasWord(cvText, kw)),
    missing: wanted.filter((kw) => !hasWord(cvText, kw)),
  };
}
