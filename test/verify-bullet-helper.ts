// Checks the "Help me write" bullet helper. Run: npx tsx test/verify-bullet-helper.ts
import { findProjectGuide } from "../src/lib/project-guide";
import {
  buildBulletPrompt,
  hasEnoughAnswers,
  helperQuestions,
  looksLikeTemplate,
  parseBulletsFromAI,
  startsWithActionVerb,
  usedOpeningWords,
  HelperTarget,
} from "../src/lib/bullet-helper";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";

let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// Finding the right 42 project
ok(findProjectGuide("42cursus-minishell")?.slug === "minishell", "intra slug with prefix");
ok(findProjectGuide("cpp-module-05")?.slug === "cpp-modules", "cpp module slug");
ok(findProjectGuide("", "Philosophers")?.slug === "philosophers", "match by name");
ok(findProjectGuide("fract-ol")?.slug === "fract-ol" && findProjectGuide("fractol")?.slug === "fract-ol", "fract-ol both spellings");
ok(findProjectGuide("ft") === undefined && findProjectGuide("") === undefined, "short or empty slug matches nothing");
ok(findProjectGuide("exam-rank-02") === undefined, "exam is not a project");
ok(findProjectGuide("my-cool-app", "My Cool App") === undefined, "own project has no guide");

// Questions
const cv = createEmptyCV();
cv.education[0].institution = "42 Northfield";
cv.targetRole = "Backend Developer";
cv.projects = [
  { id: "p1", name: "minishell", slug: "minishell", is42Project: true, techStack: "C, Readline", date: "", bulletPoints: ["Wrote a lexer in C"] },
  { id: "p2", name: "philosophers", slug: "philosophers", is42Project: true, techStack: "", date: "", bulletPoints: ["Built a thread scheduler", "Fixed a race condition"] },
];
const target: HelperTarget = { kind: "project", item: cv.projects[0] };
const qs = helperQuestions(target).map((q) => q.id);
ok(qs.includes("ms-parts") && qs.includes("hard-part") && qs.includes("team"), "known project gets its own and common questions");
ok(helperQuestions({ kind: "project", item: { ...cv.projects[0], slug: "x-app", name: "Book Swap" } }).some((q) => q.id === "about"), "other project asks what it is");

// Enough answers
ok(!hasEnoughAnswers(target, {}), "no answers is not enough");
ok(hasEnoughAnswers(target, { "hard-part": "the shell crashed on empty input, so I added checks" }), "one real sentence is enough");

// Prompt
const prompt = buildBulletPrompt({ target, cv, answers: { "ms-parts": ["Parsing commands", "Signals (Ctrl-C, Ctrl-\\, Ctrl-D)"], team: "With 1 other student", numbers: "" } });
ok(prompt.includes("42 Northfield") && prompt.includes("no teachers"), "prompt explains 42");
ok(prompt.includes("Backend Developer"), "prompt has target job");
ok(prompt.includes("Parsing commands, Signals"), "prompt has the student's answers");
ok(prompt.includes("Tools: C, Readline"), "prompt uses the student's tools");
ok(prompt.includes("Wrote a lexer in C"), "prompt includes current bullets to improve");
ok(prompt.includes("Built, Fixed") && !/these words[^\n]*Wrote/.test(prompt), "avoids verbs from other items only");
ok(prompt.includes("Do not invent numbers"), "prompt forbids made-up numbers");
ok(!prompt.includes("undefined") && !prompt.includes("Any numbers"), "no empty answers or undefined");
ok(usedOpeningWords(cv).join(",") === "Wrote,Built,Fixed", "used opening words");

// Reading the AI reply
const reply = `Sure! Here are your bullets:

- **Built** a Bash-like shell in C — with pipes and redirections.
• Wrote a tokenizer that handles nested quotes and $? expansion.
1. "Fixed signal handling so Ctrl-C never kills the shell."

Let me know if you want changes!`;
const parsed = parseBulletsFromAI(reply);
ok(parsed.length === 3, `parses 3 bullets (got ${parsed.length})`);
ok(parsed[0] === "Built a Bash-like shell in C, with pipes and redirections.", `cleans bold and em dash (got "${parsed[0]}")`);
ok(parsed[2] === "Fixed signal handling so Ctrl-C never kills the shell.", "strips quotes and numbering");
ok(parseBulletsFromAI("Designed a parser.\nTested it with 200 cases.").length === 2, "plain lines without marks");
ok(parseBulletsFromAI("").length === 0, "empty reply");

// Bullet checks
ok(startsWithActionVerb("Built a shell") && startsWithActionVerb("Fixed a bug") && startsWithActionVerb("Led a team"), "action verbs");
ok(!startsWithActionVerb("Helped with a shell") && !startsWithActionVerb("Responsible for tests") && !startsWithActionVerb("Red team work"), "weak or non-verbs");

// Old template bullets are spotted, own bullets are not
ok(looksLikeTemplate("Built a Unix shell from scratch in C with support for pipelines, I/O redirections, heredocs, and environment variable expansion."), "exact old bullet");
ok(looksLikeTemplate("Built a Unix shell from scratch in C supporting pipelines, I/O redirections, heredocs and environment variable expansion"), "almost the same old bullet");
ok(!looksLikeTemplate("Wrote the tokenizer for a team shell in C and fixed 30 crash cases found during peer reviews."), "own bullet is fine");
ok(!looksLikeTemplate("Built a shell"), "short bullet is not flagged");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
