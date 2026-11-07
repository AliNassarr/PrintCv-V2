// The "Help me write" bullet helper: builds a message for ChatGPT, Claude or Gemini
// from the student's own answers, and reads the bullets back from the AI's reply.
// Nothing here calls an AI. The student copies the message and pastes the answer.

import type { CVData, ExperienceItem, ExtracurricularItem, ProjectItem } from "@/types/resume";
import { MAIN_EDUCATION_ID } from "@/lib/intra/cv-from-intra";
import { removeEmDashes } from "@/lib/sanitizer";
import {
  ACTIVITY_QUESTIONS,
  COMMON_PROJECT_QUESTIONS,
  EXPERIENCE_QUESTIONS,
  findProjectGuide,
  getNon42ProjectQuestions,
  GuideQuestion,
  OTHER_PROJECT_QUESTIONS,
  ProjectGuide,
} from "@/lib/project-guide";
import { MAX_BULLET_LENGTH, openingWord } from "@/lib/line-checks";
export { MAX_BULLET_LENGTH, openingWord, startsWithActionVerb, startsWithWeakWord, hasPronoun, hasNumber, looksLikeTemplate } from "@/lib/line-checks";

export type HelperTarget =
  | { kind: "project"; item: ProjectItem }
  | { kind: "experience"; item: ExperienceItem }
  | { kind: "activity"; item: ExtracurricularItem };

export type HelperAnswer = string | string[];
export type HelperAnswers = Record<string, HelperAnswer>;

const MAX_BULLETS = 6;

export function guideFor(target: HelperTarget): ProjectGuide | undefined {
  return target.kind === "project" ? findProjectGuide(target.item.slug, target.item.name) : undefined;
}

export function helperQuestions(target: HelperTarget): GuideQuestion[] {
  if (target.kind === "experience") return EXPERIENCE_QUESTIONS;
  if (target.kind === "activity") return ACTIVITY_QUESTIONS;
  const guide = guideFor(target);
  const questions = guide ? guide.questions : getNon42ProjectQuestions(target.item);
  return [...questions, ...COMMON_PROJECT_QUESTIONS];
}

const answerText = (answer: HelperAnswer | undefined): string =>
  Array.isArray(answer) ? answer.filter(Boolean).join(", ") : (answer || "").trim();

// True when the student wrote enough for the AI to say something real about them.
export function hasEnoughAnswers(target: HelperTarget, answers: HelperAnswers): boolean {
  const questions = helperQuestions(target);
  const answered = questions.filter((q) => answerText(answers[q.id]) !== "");
  const wroteSomething = questions.some((q) => q.type === "text" && answerText(answers[q.id]).length >= 10);
  return wroteSomething || answered.length >= 3;
}

// Opening words already used on the CV, outside the item being written, so the AI can avoid them.
export function usedOpeningWords(cv: CVData, excludeId?: string): string[] {
  const bullets = [
    ...cv.projects.filter((p) => p.id !== excludeId).flatMap((p) => p.bulletPoints),
    ...(cv.showExperience ? cv.experience.filter((e) => e.id !== excludeId).flatMap((e) => e.bulletPoints) : []),
    ...(cv.showExtracurriculars !== false ? cv.extracurriculars.filter((a) => a.id !== excludeId).flatMap((a) => a.bulletPoints) : []),
  ];
  const seen = new Map<string, string>();
  for (const bullet of bullets) {
    const word = openingWord(bullet);
    if (word.length > 1 && !seen.has(word.toLowerCase())) {
      seen.set(word.toLowerCase(), word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    }
  }
  return [...seen.values()];
}

function schoolLine(cv: CVData): string {
  const main = cv.education.find((e) => e.id === MAIN_EDUCATION_ID) || cv.education[0];
  const school = main?.institution?.trim() || "";
  if (!school) return "";
  if (/^42\b/.test(school)) {
    return `I study at ${school}, a free coding school with no teachers or classes. Students learn by building projects and checking each other's code.`;
  }
  return `I study at ${school}.`;
}

function itemTitle(target: HelperTarget): string {
  if (target.kind === "project") return target.item.name?.trim() || "my project";
  if (target.kind === "experience") {
    const { role, company } = target.item;
    return [role?.trim(), company?.trim()].filter(Boolean).join(" at ") || "my job";
  }
  const { role, organization } = target.item;
  return [role?.trim(), organization?.trim()].filter(Boolean).join(", ") || "my activity";
}

const SECTION_NAME: Record<HelperTarget["kind"], string> = {
  project: "Projects",
  experience: "Work Experience",
  activity: "Activities",
};

export interface PromptInput {
  target: HelperTarget;
  answers: HelperAnswers;
  cv: CVData;
}

export function buildBulletPrompt({ target, answers, cv }: PromptInput): string {
  const lines: string[] = [];
  const title = itemTitle(target);
  lines.push(`Write bullet points for the "${SECTION_NAME[target.kind]}" section of my CV, about: ${title}.`);
  lines.push("");

  const about: string[] = [];
  const school = schoolLine(cv);
  if (school) about.push(school);
  const role = cv.targetRole?.trim();
  if (role) about.push(`The job I want: ${role}.`);
  if (about.length) {
    lines.push("About me:");
    about.forEach((line) => lines.push(`- ${line}`));
    lines.push("");
  }

  if (target.kind === "project") {
    const guide = guideFor(target);
    lines.push("About the project:");
    if (guide) lines.push(`- What it is: ${guide.about}`);
    const tools = target.item.techStack?.trim() || guide?.techStack || "";
    if (tools) lines.push(`- Tools: ${tools}`);
    lines.push("");
  }

  const facts = helperQuestions(target)
    .map((q) => ({ q, text: answerText(answers[q.id]) }))
    .filter(({ text }) => text !== "");
  if (facts.length) {
    lines.push("What I did (my own answers):");
    facts.forEach(({ q, text }) => lines.push(`- ${q.question.replace(/\s*\(optional\)\s*$/i, "")} ${text}`));
    lines.push("");
  }

  const current = target.item.bulletPoints.map((b) => b.trim()).filter(Boolean);
  if (current.length) {
    lines.push("My current bullets (keep the facts, write them better):");
    current.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
  }

  const used = usedOpeningWords(cv, target.item.id);
  lines.push("Rules:");
  lines.push("- Write 2 to 4 bullets.");
  lines.push(`- Each bullet is one sentence, under ${MAX_BULLET_LENGTH} characters.`);
  lines.push("- Start each bullet with a strong past-tense action verb, and use a different verb for each bullet.");
  if (used.length) lines.push(`- Do not start with these words, they are already on my CV: ${used.join(", ")}.`);
  lines.push("- Use only the facts above. Do not invent numbers, users, results or tools.");
  lines.push("- Show what I did, how I did it, and what it changed.");
  lines.push('- No "I", "me", "my", "we" or "our". No em dashes.');
  lines.push("- Plain, clear English. No buzzwords.");
  lines.push('- Reply with only the bullets, one per line, each starting with "- ".');
  return lines.join("\n");
}

const BULLET_MARK = /^\s*(?:[-*•·▪◦‣–—]|\d{1,2}[.)])\s+/;
const INTRO_LINE = /^(here(?:'s| is| are)|sure|okay|ok|of course|certainly|below|these|i hope|let me|feel free)\b/i;

// Reads bullets from whatever the AI replied: lists with "-", "•" or "1.", bold text, quotes, intro lines.
export function parseBulletsFromAI(reply: string): string[] {
  const marked: string[] = [];
  const plain: string[] = [];
  for (const raw of (reply || "").replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;
    const isMarked = BULLET_MARK.test(raw);
    let line = raw.replace(BULLET_MARK, "").trim();
    line = line
      .replace(/\*\*|__|`/g, "")
      .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
      .trim();
    if (!line) continue;
    if (!isMarked && (INTRO_LINE.test(line) || /:\s*$/.test(line))) continue;
    line = removeEmDashes(line).replace(/\s+([,.;])/g, "$1").trim();
    line = line.charAt(0).toUpperCase() + line.slice(1);
    (isMarked ? marked : plain).push(line);
  }
  const picked = marked.length ? marked : plain;
  return [...new Set(picked)].slice(0, MAX_BULLETS);
}
