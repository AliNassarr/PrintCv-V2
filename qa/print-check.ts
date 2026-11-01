import fs from "fs";
import { launch } from "./cdp";
import { testUser, TEST_PHONE } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";

const ROOT = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
const BASE = ROOT + (process.env.STUDIO_PATH ?? "");   // "" before Task 2, "/studio" after
const OUT = process.env.OUT || "qa/out";
const user: any = testUser;
const cv = createInitialCVFromIntra(user);
cv.contact.phoneNumber = TEST_PHONE;
cv.projects[0].bulletPoints = ["Built a Bash-like shell in C with pipes, redirections and signal handling, tested against 300+ edge cases."];
// The print CSS sets min-height: 0, so fill the sheet with fictional lines to make it a full page (> 1000px tall).
const fill: string[][] = [
  ["Parsed HTTP/1.1 requests in C++ and served static files and CGI scripts to 500 open connections.", "Wrote a config file reader for ports, routes and error pages, checked with 40 test configs.", "Tested the server under load with siege and fixed two memory leaks found by Valgrind along the way."],
  ["Built a Bash-like shell in C that runs pipes, redirections and here documents.", "Handled Ctrl-C, Ctrl-D and Ctrl-\\ the same way Bash does, checked by hand against 60 cases.", "Split the code with a teammate into a parser and a runner, and met every day to merge our work."],
  ["Solved the dining philosophers problem in C with POSIX threads and mutexes, with no data races.", "Kept every thread on time within 10 ms over runs of 200 philosophers.", "Found and fixed a deadlock by changing the order in which forks are picked up."],
  ["Sorted 500 numbers in under 5,500 moves using two stacks and a small set of allowed moves.", "Wrote a checker program and a random test script to prove every result was sorted.", "Compared three sorting ideas and kept the one that used the fewest moves on large inputs."],
];
cv.projects.forEach((p, i) => { p.bulletPoints.push(...(fill[i] ?? [])); });
cv.skills = { languages: ["C", "C++", "Python", "Bash"], developerTools: ["Git", "GDB", "Valgrind", "VS Code"], technologiesFrameworks: ["Linux", "Docker", "Make"], projectManagementTools: ["GitHub"] };
cv.showExperience = true;
cv.experience = [{ id: "qa-exp-1", company: "Sample Shop", role: "IT Helper (part time)", location: "Sample city", startDate: "June 2024", endDate: "September 2024", isCurrent: false,
  bulletPoints: ["Set up 12 laptops and a shared printer for a small team, and wrote a one-page guide for new staff.", "Answered about 20 help requests a week and closed most of them the same day.", "Moved old files to a backup drive and set up a weekly copy so nothing would be lost."] },
  { id: "qa-exp-2", company: "Sample Library", role: "Student helper", location: "Sample city", startDate: "January 2024", endDate: "May 2024", isCurrent: false,
    bulletPoints: ["Helped visitors use the computers and printers, about 30 people a day.", "Kept a simple sheet of broken machines and got 8 of them fixed in one term."] }];
cv.coursework = [{ id: "qa-cw-1", title: "Intro to Networks (online course)", date: "May 2024" }, { id: "qa-cw-2", title: "Databases and SQL basics (online course)", date: "August 2024" }];
cv.extracurriculars = [{ id: "qa-ex-1", organization: "Campus coding club", role: "Peer helper", startDate: "2024", isCurrent: true,
  bulletPoints: ["Ran weekly help sessions for 15 new students learning C and Git.", "Planned a two-day coding event for 40 people with a team of four helpers."] }];

(async () => {
  const { proc, page } = await launch();
  try {
    await page.send("Runtime.enable");
    await page.goto(BASE, 1500);
    await page.eval(`localStorage.setItem("printcv_draft_v1", ${JSON.stringify(JSON.stringify({ state: { cvData: cv }, version: 2 }))}); true`);
    await page.goto(BASE, 3000);
    await page.send("Emulation.setEmulatedMedia", { media: "print" });
    const info = await page.eval(`(() => {
      const root = document.querySelector('.print-root');
      const visible = [...document.body.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.className || e.tagName);
      return { visible, rootText: root ? root.innerText.slice(0, 300) : null, h1: root && root.querySelector('h1') ? getComputedStyle(root.querySelector('h1')).display : null };
    })()`);
    console.log(JSON.stringify(info, null, 2));
    await page.shot(`${OUT}/print-media.png`);
    const metrics = await page.eval(`(() => {
      if (!matchMedia('print').matches) return { error: 'not in print media' };
      const root = document.querySelector('.print-root'); const s = root && root.querySelector('.cv-sheet');
      if (!s) return { error: 'no .print-root .cv-sheet' };
      const pick = (el) => { if (!el) return null; const c = getComputedStyle(el); return { fontFamily: c.fontFamily, fontSize: c.fontSize, lineHeight: c.lineHeight, letterSpacing: c.letterSpacing, fontWeight: c.fontWeight }; };
      return { sheet: pick(s), h1: pick(s.querySelector('h1')), firstLi: pick(s.querySelector('li')), height: s.getBoundingClientRect().height,
               text: root.innerText, html: root.outerHTML };
    })()`);
    fs.writeFileSync(`${OUT}/print-metrics.json`, JSON.stringify(metrics, null, 2));
    if (metrics.error || !(metrics.height > 1000) || !/calibri|arial/i.test(metrics.sheet?.fontFamily ?? "")) {
      process.exitCode = 1;
      throw new Error(`print metrics invalid: ${metrics.error ?? `height ${metrics.height}, font ${metrics.sheet?.fontFamily}`}`);
    }
    await page.send("Emulation.setEmulatedMedia", { media: "" });
    const pdf = await page.send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(`${OUT}/print.pdf`, Buffer.from(pdf.data, "base64"));
    console.log("title during print:", await page.eval("document.title"));
    console.log("logs:", page.logs);
  } finally { proc.kill(); }
})();
