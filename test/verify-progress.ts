// Section marks and "Next" agree with the score. Run: npx tsx test/verify-progress.ts
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { scoreCV } from "../src/lib/cv-score";
import { sectionProgress, nextStep, linesToFix, linesToFixList } from "../src/lib/progress";
import { STUDIO_SECTIONS } from "../src/lib/studio-sections";
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const run = (cv: ReturnType<typeof createEmptyCV>) => { const s = scoreCV(cv, { fitsOnePage: true }); return { s, p: sectionProgress(cv, s), n: nextStep(cv, s) }; };

// Empty CV
const e = run(createEmptyCV());
ok(e.p.CONTACT === "todo" && e.p.PROJECTS === "todo" && e.p.SKILLS === "todo" && e.p.EDUCATION === "todo", "empty: main sections to do");
ok(e.p.EXPERIENCE === "off", "empty: work experience is hidden by default");
ok(e.p.ACTIVITIES === "optional", "empty: courses and activities optional");
ok(e.n?.section === "PROJECTS" && e.n.text === "Add your 42 projects first.", `empty: next step is projects (got ${e.n?.text})`);

// Whitespace counts as empty
const w = createEmptyCV(); w.contact.fullName = "   "; w.skills.languages = ["  "];
ok(run(w).p.CONTACT === "todo" && run(w).p.SKILLS === "todo", "whitespace is not content");

// A finished CV (same data as verify-score's good CV, plus a school and 5 skills)
const good = createEmptyCV();
good.contact = { fullName: "Sam Student", level: 7, email: "sam@example.org", phoneNumber: "+1 555 0100", githubUrl: "github.com/example-student", linkedinUrl: "", location: "Northfield" };
good.education[0].institution = "42";
good.skills.languages = ["C", "C++", "Python"]; good.skills.developerTools = ["Git", "GDB"];
good.projects = [
  { id: "a", name: "minishell", is42Project: true, techStack: "C", date: "", bulletPoints: ["Wrote the tokenizer for a team shell and fixed 30 crash cases.", "Tested 120 commands against Bash to match its output."] },
  { id: "b", name: "webserv", is42Project: true, techStack: "C++", date: "", bulletPoints: ["Built an HTTP server in C++ that handled 500 open connections.", "Designed the config parser used by 3 teammates."] },
];
const g = run(good);
ok(["CONTACT", "PROJECTS", "EDUCATION", "SKILLS"].every((k) => g.p[k as keyof typeof g.p] === "done"), `good: main sections done (${JSON.stringify(g.p)})`);
ok(g.n === null, `good: nothing left (got ${g.n?.text})`);

// A line issue blocks "done" and becomes the next step
const bad = structuredClone(good); bad.projects[0].bulletPoints[0] = "I helped with the shell.";
const b = run(bad);
ok(b.p.PROJECTS === "started", "a line issue keeps Projects from done");
ok(b.n?.section === "PROJECTS" && b.n.itemId === "a" && b.n.text.startsWith("minishell: "), `line issue is next (got ${b.n?.text})`);

// Hidden toggles
const job = (bulletPoints: string[]) => ({ id: "j", company: "Shop", role: "Helper", location: "", startDate: "", endDate: "", isCurrent: false, bulletPoints });
const hid = structuredClone(good); hid.showExperience = true; hid.experience = [job(["Served 40 customers a day."])];
const h = run(hid);
ok(h.p.EXPERIENCE === "started", "a job with 1 line is started");

// A job with too few lines points Next at the job, not at Projects
ok(h.p.PROJECTS === "done", `job problem: Projects stays done (got ${h.p.PROJECTS})`);
ok(h.n?.section === "EXPERIENCE" && h.n.itemId === "j", `job problem: next is the job (got ${h.n?.section} ${h.n?.text})`);

// A project with too few lines still points at that project
const shortProj = structuredClone(hid); shortProj.experience[0].bulletPoints.push("Counted 300 items a week for stock checks.");
shortProj.projects[1].bulletPoints = ["Built an HTTP server in C++ that handled 500 open connections."];
const sp = run(shortProj);
ok(sp.n?.section === "PROJECTS" && sp.n.itemId === "b", `short project: next is that project (got ${sp.n?.section} ${sp.n?.itemId})`);

// 1 project + 1 job is enough for the score, so Projects is done and nothing is left
const oneEach = structuredClone(good); oneEach.projects = [good.projects[0]]; oneEach.showExperience = true;
oneEach.experience = [job(["Served 40 customers a day at a busy shop.", "Counted 300 items a week for stock checks."])];
const oe = run(oneEach);
ok(oe.p.PROJECTS === "done" && oe.p.EXPERIENCE === "done", `1 project + 1 job: both done (${JSON.stringify(oe.p)})`);
ok(oe.n === null, `1 project + 1 job: nothing left (got ${oe.n?.text})`);

// Work experience shown with no jobs
const noJobs = structuredClone(good); noJobs.showExperience = true; noJobs.experience = [];
const nj = run(noJobs);
ok(nj.p.EXPERIENCE === "todo", "shown work experience with no jobs is to do");
ok(nj.n?.section === "EXPERIENCE" && nj.n.text === "Add a job, or hide work experience.", `no jobs: next is work experience (got ${nj.n?.text})`);

// Only jobs, no projects
const onlyJobs = structuredClone(oneEach); onlyJobs.projects = [];
onlyJobs.experience.push({ ...job(["Fixed 12 broken tills in the first month.", "Trained 3 new staff on the stock system."]), id: "k" });
const oj = run(onlyJobs);
ok(oj.p.PROJECTS === "todo" && oj.n?.section === "PROJECTS", `only jobs: next is projects (got ${oj.n?.text})`);

// Education needs the main school, not just any school
const otherSchool = structuredClone(good); otherSchool.education[0].institution = "";
otherSchool.education.push({ ...good.education[0], id: "edu-2", institution: "City College" });
const os = run(otherSchool);
ok(os.p.EDUCATION === "todo", "education is to do while the main school has no name");
ok(os.n?.section === "EDUCATION" && os.n.text === "Add the name of your school.", `no main school: next is education (got ${os.n?.text})`);

// A line without a verb in a job points at that job line
const noVerb = structuredClone(oneEach); noVerb.experience[0].bulletPoints[0] = "Customer service for 40 people a day.";
const nv = run(noVerb);
ok(nv.n?.section === "EXPERIENCE" && nv.n.lineText === "Customer service for 40 people a day.", `no verb: next is the job line (got ${nv.n?.section} ${nv.n?.text})`);

// A shown activity with a line that has no verb: Next points at that activity
const act = (bulletPoints: string[]) => ({ id: "act-1", organization: "Coding club", role: "Peer helper", startDate: "", isCurrent: true, bulletPoints });
const shownAct = structuredClone(good); shownAct.showExtracurriculars = true;
shownAct.extracurriculars = [act(["Peer helper for 15 new students.", "Ran weekly help sessions for 15 new students."])];
const sa = run(shownAct);
ok(sa.n?.section === "ACTIVITIES" && sa.n.itemId === "act-1" && sa.n.lineText === "Peer helper for 15 new students.", `shown activity: next is the activity line (got ${sa.n?.section} ${sa.n?.itemId})`);

// A hidden activity is not on the CV, so its bad lines never become the next step
const hiddenAct = structuredClone(good); hiddenAct.showExtracurriculars = false;
hiddenAct.extracurriculars = [act(["I helped with the club.", "Peer helper for new students."])];
const ha = run(hiddenAct);
ok(ha.n === null, `hidden activity: nothing left (got ${ha.n?.section} ${ha.n?.text})`);

// The menu counts lines to fix, like the card pill: a line with two problems counts once
const twoProblems = structuredClone(good); twoProblems.projects[0].bulletPoints = ["I helped with the shell.", "Tested 120 commands against Bash to match its output."];
const tp = scoreCV(twoProblems, { fitsOnePage: true });
ok(tp.lineIssues.length === 2, `two problems on one line give 2 issues (got ${tp.lineIssues.length})`);
ok(linesToFix(twoProblems, tp).PROJECTS === 1, `one line to fix, not 2 (got ${linesToFix(twoProblems, tp).PROJECTS})`);
const tpList = linesToFixList(twoProblems, tp);
ok(tpList.length === 1 && tpList[0].issues.length === 2 && tpList[0].itemId === "a" && tpList[0].text === "I helped with the shell.", `the Fix lines list has 1 line with 2 problems (${JSON.stringify(tpList)})`);
// The same bad line twice in one card is 2 lines, as the card counts it
const twice = structuredClone(twoProblems); twice.projects[0].bulletPoints.push("I helped with the shell.");
ok(linesToFix(twice, scoreCV(twice, { fitsOnePage: true })).PROJECTS === 2, "the same bad line twice counts 2 lines");
// ...and each of those lines lists its 2 problems once, not twice
const twiceList = linesToFixList(twice, scoreCV(twice, { fitsOnePage: true }));
ok(twiceList[0].issues.length === 2, `the same bad line twice still shows 2 problems per line (got ${twiceList[0].issues.length})`);
// Hidden activities are not counted; shown ones are
const hidCount = linesToFix(hiddenAct, ha.s), showCount = linesToFix(shownAct, sa.s);
ok(hidCount.ACTIVITIES === 0 && showCount.ACTIVITIES === 0, `activity counts (hidden ${hidCount.ACTIVITIES}, shown ${showCount.ACTIVITIES})`);
const badAct = structuredClone(shownAct); badAct.extracurriculars[0].bulletPoints[0] = "I helped my friends.";
ok(linesToFix(badAct, scoreCV(badAct, { fitsOnePage: true })).ACTIVITIES === 1, "a shown activity line with problems counts 1");
ok(linesToFix(good, g.s).PROJECTS === 0, "a finished CV has nothing to fix");

// Invariants over every fixture
const LINE_STYLE = new Set(["own-words", "action", "numbers", "pronouns", "variety", "length", "one-page"]);
const all = { e, g, b, h, sp, oe, nj, oj, os, nv, sa, ha };
for (const [name, r] of Object.entries(all)) {
  for (const { id } of STUDIO_SECTIONS)
    if (r.p[id] === "done") ok(!r.s.lineIssues.some((i) => i.section === id), `${name}: ${id} done with no line issues`);
  if (r.n === null) {
    for (const { id } of STUDIO_SECTIONS) ok(r.p[id] !== "todo" && r.p[id] !== "started", `${name}: next is empty but ${id} is ${r.p[id]}`);
  } else if (r.p[r.n.section] === "done") {
    // Only a line style problem may point at a done section
    const open = r.s.groups.flatMap((gr) => gr.checks).filter((c) => c.points < c.max && c.tip);
    const onlyStyle = r.s.lineIssues.length === 0 && open.length > 0 && open.every((c) => LINE_STYLE.has(c.id));
    ok(onlyStyle, `${name}: next points at done ${r.n.section} (${r.n.text})`);
  }
}
console.log(`progress: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
