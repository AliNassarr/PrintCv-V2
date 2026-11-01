// The landing samples score honestly, stay unique, and never reach the editor. Run: npx tsx test/verify-sample-cv.ts
import fs from "fs"; import path from "path";
import { DEMO_CV, SAMPLE_CVS } from "../src/lib/sample-cv";
import { ALL_SAMPLE_LINES } from "../src/lib/sample-lines";
import { scoreCV } from "../src/lib/cv-score";
import { looksLikeOldTemplate, looksLikeTemplate, overlap, startsWithActionVerb, hasPronoun, MAX_BULLET_LENGTH } from "../src/lib/line-checks";
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
for (const cv of [...SAMPLE_CVS, DEMO_CV]) {
  const own = scoreCV(cv, { fitsOnePage: true, allowSampleLines: true });
  ok(own.total >= 85, `${cv.contact.fullName} scores 85+ on the landing (got ${own.total})`);
  ok(own.lineIssues.length === 0, `${cv.contact.fullName} has no line issues on the landing`);
  const pasted = scoreCV(cv, { fitsOnePage: true });
  const lineCount = [...cv.projects, ...(cv.showExperience ? cv.experience : []), ...(cv.showExtracurriculars !== false ? cv.extracurriculars : [])]
    .reduce((n, item) => n + item.bulletPoints.length, 0);
  ok(pasted.lineIssues.filter((i) => /Same as many other CVs/.test(i.issue)).length === lineCount, `${cv.contact.fullName}'s lines are flagged when pasted`);
  ok(/@example\.org$/.test(cv.contact.email), "email uses example.org");
  ok(/^\+1 555 01\d\d$/.test(cv.contact.phoneNumber), "phone uses 555-01xx");
  ok(!cv.contact.githubUrl && !cv.contact.linkedinUrl && !cv.contact.location, "no links and no city");
}
for (const line of ALL_SAMPLE_LINES) {
  ok(!looksLikeOldTemplate(line) && looksLikeTemplate(line), `sample line is new and flagged: ${line.slice(0, 40)}`);
  ok(startsWithActionVerb(line) && !hasPronoun(line) && line.length <= MAX_BULLET_LENGTH && !line.includes("—"), `sample line passes the checks: ${line.slice(0, 40)}`);
}
for (let i = 0; i < ALL_SAMPLE_LINES.length; i++) for (let j = i + 1; j < ALL_SAMPLE_LINES.length; j++)
  ok(overlap(ALL_SAMPLE_LINES[i], ALL_SAMPLE_LINES[j]) < 0.5, `sample lines ${i} and ${j} are different`);
const guide = fs.readFileSync("src/lib/project-guide.ts", "utf8").match(/"([^"]{40,})"/g) || [];
for (const line of ALL_SAMPLE_LINES) ok(guide.every((g) => overlap(line, g) < 0.6), `sample line not close to project-guide: ${line.slice(0, 40)}`);
const walk = (d: string): string[] => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
for (const f of [...walk("src/components/studio"), ...walk("src/lib/store"), ...walk("src/app/studio")])
  ok(!/sample-cv/.test(fs.readFileSync(f, "utf8")), `${f} does not import sample-cv`);
console.log(`sample cv: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
