// Checks the CV score. Run: npx tsx test/verify-score.ts
import { matchJobKeywords, scoreCV } from "../src/lib/cv-score";
import { hasPronoun } from "../src/lib/bullet-helper";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";

let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

// An empty CV gets nothing, even if it "fits on one page"
const empty = scoreCV(createEmptyCV(), { fitsOnePage: true });
ok(empty.total === 0, `empty CV scores 0 (got ${empty.total})`);
ok(empty.groups.reduce((n, g) => n + g.max, 0) === 100, "groups add up to 100");

// A good CV scores high
const good = createEmptyCV();
good.contact = { fullName: "Sam Student", level: 7, email: "sam@example.org", phoneNumber: "+1 555 0100", githubUrl: "github.com/example-student", linkedinUrl: "", location: "Northfield" };
good.skills.languages = ["C", "C++", "Python"];
good.skills.developerTools = ["Git", "GDB"];
good.projects = [
  { id: "a", name: "minishell", is42Project: true, techStack: "C", date: "", bulletPoints: ["Wrote the tokenizer for a team shell and fixed 30 crash cases.", "Tested 120 commands against Bash to match its output."] },
  { id: "b", name: "webserv", is42Project: true, techStack: "C++", date: "", bulletPoints: ["Built an HTTP server in C++ that handled 500 open connections.", "Designed the config parser used by 3 teammates."] },
];
const goodScore = scoreCV(good, { fitsOnePage: true });
ok(goodScore.total >= 90, `good CV scores 90+ (got ${goodScore.total})`);
ok(goodScore.lineIssues.length === 0, "good CV has no line issues");

// Problems lower the score and are listed
const bad = structuredClone(good);
bad.projects[0].bulletPoints = [
  "I helped with the shell.",
  "Built a Unix shell from scratch in C with support for pipelines, I/O redirections, heredocs, and environment variable expansion.",
];
const badScore = scoreCV(bad, { fitsOnePage: false });
ok(badScore.total < goodScore.total - 15, `problems lower the score (${badScore.total} vs ${goodScore.total})`);
const issues = badScore.lineIssues.map((i) => i.issue).join(" | ");
ok(/Same as many other CVs/.test(issues), "template line is listed");
ok(/Remove "I"/.test(issues) && /Start with what you did/.test(issues), "pronoun and weak start are listed");
ok(badScore.groups.find((g) => g.id === "page")!.score === 0, "too long for one page loses page points");
ok(badScore.lineIssues.every((i) => i.itemId === "a" && i.section === "PROJECTS"), "issues point to the right project");

// One good line is not a finished CV
const thin = structuredClone(good);
thin.projects[0].bulletPoints = [good.projects[0].bulletPoints[0]];
thin.projects[1].bulletPoints = [];
const thinLines = scoreCV(thin, { fitsOnePage: true }).groups.find((g) => g.id === "lines")!;
ok(thinLines.score <= thinLines.max / 2, `one line gets at most half the line points (got ${thinLines.score}/${thinLines.max})`);

// Hidden sections are not scored
const hidden = structuredClone(good);
hidden.showExperience = false;
hidden.experience = [{ id: "e", company: "X", role: "Intern", location: "", startDate: "", endDate: "", isCurrent: false, bulletPoints: ["I did stuff"] }];
ok(scoreCV(hidden, { fitsOnePage: true }).lineIssues.length === 0, "hidden jobs are not checked");

// Job post words
const job = matchJobKeywords(good, "We use React, Go and Google Cloud. You know C++ and Git. Docker is a plus.");
ok(job.matched.includes("c++") && job.matched.includes("git"), `finds words in the CV (got ${job.matched})`);
ok(job.missing.includes("react") && job.missing.includes("docker") && job.missing.includes("go"), `lists missing words (got ${job.missing})`);
ok(!job.matched.includes("c") && !job.missing.includes("c"), "plain c is not found inside other words");
ok(matchJobKeywords(good, "").matched.length === 0, "empty job post");
const plain = matchJobKeywords(good, "Make sure the rest of the team can go fast.");
ok(plain.matched.length + plain.missing.length === 0, `everyday words are not tools (got ${[...plain.matched, ...plain.missing]})`);
ok(matchJobKeywords(good, "Experience with C and a REST API").missing.includes("rest"), "REST in capitals is a tool");

// Pronouns at the start of a line, in any case
ok(hasPronoun("We built a shell.") && hasPronoun("My parser handled quotes.") && hasPronoun("Our team shipped it."), "We, My and Our are caught");
ok(!hasPronoun("Built a shell in C.") && !hasPronoun("Added i18n support."), "no false pronoun warnings");

// Activities count unless they are turned off, the same as on the printed CV
const acts = structuredClone(good);
acts.showExtracurriculars = undefined;
acts.extracurriculars = [{ id: "x", organization: "Club", role: "Lead", startDate: "", endDate: "", isCurrent: false, bulletPoints: ["We ran a club."] }];
ok(scoreCV(acts, { fitsOnePage: true }).lineIssues.some((i) => i.itemId === "x"), "shown activities are checked");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
