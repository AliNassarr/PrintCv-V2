// G8 data: saved draft, privacy and layout shift checks over CDP. Run with the server up:
//   MSYS2_ENV_CONV_EXCL=STUDIO_PATH STUDIO_PATH=/studio OUT=qa/out/t15c npx tsx qa/data-check.ts
// (a) printcv_draft_v1 is byte-identical before and after a visit to / (seeded on the studio first; the visit
//     also scrolls the page and types in the line check).
// (b) Typing in the landing line check sends 0 network requests.
// (c) A seeded draft gives the same cvData and the same scoreCV result as the baseline. The baseline is the
//     Task 0 record (qa/out/before/ui.json) of the ui-check fixture: score 58 and 2 problems listed (the old
//     dialog listed one row per problem; "I helped with the server." has two). The same fixture is seeded here.
//     Compared: the cvData the store hands to the print copy (read from React's props after a reload) against the
//     seeded fixture; scoreCV run here in Node (total and number of line problems) against that baseline; and the
//     top-bar score and dialog score on the page against the baseline score.
// (d) CLS under 0.1 on /studio with a saved draft (layout-shift entries, buffered, without recent input),
//     at 1440, 768 and 390.
// (e) The top-bar score, the dialog score, the section marks (step bar at 1440, tab row at 768), the "Fix lines"
//     count and "Next" (the line under the section steps and the dialog) all agree with scoreCV, sectionProgress, linesToFix and nextStep
//     run here in Node on the same draft.
// Writes $OUT/data-check.json, prints each check and exits 1 on any failure.
import fs from "fs";
import { launch, Page } from "./cdp";
import { ROOT, STUDIO, SEEDED, seeded, user, sleep, openStudio, click, escape } from "./states";
import { TEST_PHONE } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
import { scoreCV } from "../src/lib/cv-score";
import { sectionProgress, nextStep, linesToFix, linesToFixList } from "../src/lib/progress";
import { STUDIO_SECTIONS } from "../src/lib/studio-sections";

const OUT = process.env.OUT || "qa/out";
const KEY = "printcv_draft_v1";
const results: { check: string; pass: boolean; detail: unknown }[] = [];
const ok = (check: string, pass: boolean, detail: unknown) => {
  results.push({ check, pass, detail });
  console.log(`${pass ? "ok  " : "FAIL"} ${check}  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
};

// The ui-check fixture, built the same way as qa/ui-check.ts (Task 0 baseline)
const uiCv = createInitialCVFromIntra(user);
uiCv.contact.phoneNumber = TEST_PHONE;
uiCv.projects = uiCv.projects.slice(0, 2);
uiCv.projects[0].bulletPoints = ["I helped with the server.", "Built an HTTP/1.1 server in C++ that handled 500 open connections with poll()."];
const UI_DRAFT = JSON.stringify({ state: { cvData: uiCv, studentProfile: user }, version: 2 });
const BASELINE = (() => {
  const fallback = { score: 58, issues: 2, from: "Task 0 record (qa/out/before/ui.json is not here)" };
  try {
    const j = JSON.parse(fs.readFileSync("qa/out/before/ui.json", "utf8"));
    return { score: parseInt(String(j.score), 10), issues: Number(j.issues), from: "qa/out/before/ui.json" };
  } catch { return fallback; }
})();

// Same JSON whatever the key order
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);

// ---------- Page readers ----------
// The cvData the store hands to the print copy (PrintableCV reads it straight from the store)
const STORE_CV = `(() => {
  const el = document.querySelector('.print-root .cv-sheet'); if (!el) return null;
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$')); if (!key) return null;
  for (let f = el[key]; f; f = f.return) { const d = f.memoizedProps && f.memoizedProps.data; if (d && d.contact && d.projects) return d; }
  return null;
})()`;
const TOP_SCORE = `parseInt(document.querySelector('[data-test-id="score-button"]').innerText, 10)`;
const FITS = `(() => { const t = document.body.innerText; return t.includes('Longer than 1 page') ? false : t.includes('Fits on 1 page') ? true : null; })()`;
// The dialog: the big number, the "Next: ..." line and the count in the "Fix lines (n)" tab
const DIALOG = `(() => {
  const d = document.querySelector('[data-test-id="score-dialog"]'); if (!d) return null;
  const num = d.querySelector('.text-app-kpi');
  const nextP = [...d.querySelectorAll('p')].find((p) => /^Next: |^Your CV is ready to send\\./.test(p.innerText.trim()));
  const tab = [...d.querySelectorAll('[role="tab"]')].find((t) => t.innerText.trim().startsWith('Fix lines'));
  return { score: num ? parseInt(num.innerText, 10) : null, next: nextP ? nextP.innerText.trim().replace(/^Next: /, '') : null,
           fix: tab ? parseInt((tab.innerText.match(/\\((\\d+)\\)/) || [])[1], 10) : null };
})()`;
// Section marks: the section tabs (the step bar from 1024px, the tab row below). Each tab's text is the label,
// a hidden comma, then the mark: "{n} line(s) to fix", "Hidden", or a hidden word (done, started, to do, optional).
const MARKS = `(() => {
  const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Sections"] [role="tab"]')].filter((e) => e.getBoundingClientRect().width);
  return tabs.map((e) => e.textContent.replace(/\\s+/g, ' ').trim());
})()`;
// The Next line under the section steps: "Next: {text}" with Fix it, or "Your CV is ready to send." (null)
const SIDE_NEXT = `(() => {
  const row = document.querySelector('[data-test-id="next-step"]'); if (!row) return 'missing';
  const p = row.querySelector('p'); const t = p ? p.innerText.trim() : '';
  if (t === 'Your CV is ready to send.') return null;
  return t.startsWith('Next:') ? t.replace(/^Next:\\s*/, '') : 'missing';
})()`;

const STATUS_WORDS: Record<string, string> = { done: "done", started: "started", todo: "to do", off: "Hidden", optional: "optional" };

async function waitFor(page: Page, expr: string, ms = 8000) {
  for (let t = 0; t < ms; t += 200) { if (await page.eval(`!!(${expr})`).catch(() => false)) return true; await sleep(200); }
  return false;
}

async function openDialog(page: Page) {
  await click(page, '[data-test-id="score-button"]');
  await waitFor(page, `document.querySelector('[data-test-id="score-dialog"]')`);
  await sleep(300);
  const d = await page.eval(DIALOG);
  await escape(page); await sleep(300);
  return d;
}

(async () => {
  const { proc, page } = await launch(9351);
  try {
    await page.send("Runtime.enable");
    await page.viewport(1440, 900);

    // ---------- (a) The landing never touches the saved draft ----------
    await openStudio(page, SEEDED);
    await waitFor(page, `document.querySelector('[data-test-id="score-button"]')`);
    await sleep(800);
    const before = await page.eval<string | null>(`localStorage.getItem(${JSON.stringify(KEY)})`);
    await page.goto(ROOT + "/", 2500);
    await page.eval(`window.scrollTo(0, document.body.scrollHeight); true`); await sleep(500);
    await page.eval(`(() => { const t = document.querySelector('#check textarea'); t.scrollIntoView(); t.focus(); return true; })()`);
    await page.send("Input.insertText", { text: "Built a shell in C." }); await sleep(800);
    const after = await page.eval<string | null>(`localStorage.getItem(${JSON.stringify(KEY)})`);
    ok("(a) draft byte-identical before and after visiting /", !!before && before === after,
      { bytesBefore: before?.length ?? 0, bytesAfter: after?.length ?? 0, same: before === after });

    // ---------- (b) Typing in the line check sends no request ----------
    await page.goto(ROOT + "/", 2500);
    await page.eval(`(() => { const t = document.querySelector('#check textarea'); t.scrollIntoView({ block: 'center' }); return true; })()`);
    await sleep(2500); // let link prefetches from scrolling settle first
    const requests: string[] = [];
    const onMsg = (ev: MessageEvent) => { const m = JSON.parse(String(ev.data)); if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url); };
    await page.send("Network.enable");
    await sleep(300);
    requests.length = 0;
    page.ws.addEventListener("message", onMsg);
    await page.eval(`(() => { const t = document.querySelector('#check textarea'); t.focus(); t.select(); return true; })()`);
    for (const word of "I worked on minishell with my team and fixed 30 bugs".split(" ")) {
      await page.send("Input.insertText", { text: word + " " }); await sleep(60);
    }
    await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await sleep(1500); // past the 400ms summary debounce
    page.ws.removeEventListener("message", onMsg);
    await page.send("Network.disable");
    const typed = await page.eval<string>(`document.querySelector('#check textarea').value`);
    ok("(b) typing in the line check sends 0 requests", requests.length === 0 && typed.includes("minishell"), { requests, typedChars: typed.length });

    // ---------- (c) Saved draft against the baseline ----------
    await openStudio(page, UI_DRAFT);
    await waitFor(page, `document.querySelector('.print-root .cv-sheet')`);
    await page.goto(STUDIO, 2500); // a reload: the store reads the draft back from localStorage
    await waitFor(page, `document.querySelector('.print-root .cv-sheet')`);
    await sleep(500);
    const storeCv = await page.eval(STORE_CV);
    const sameCv = !!storeCv && canon(storeCv) === canon(uiCv);
    ok("(c) store cvData after reload equals the seeded fixture", sameCv, storeCv ? (sameCv ? "deep-equal" : "differs") : "store cvData not found");
    const fitsC = await page.eval<boolean | null>(FITS);
    const nodeC = scoreCV(uiCv, { fitsOnePage: fitsC !== false });
    const topC = await page.eval<number>(TOP_SCORE);
    const dlgC = await openDialog(page);
    const toFixC = linesToFixList(uiCv, nodeC).length;
    ok("(c) scoreCV equals the baseline", nodeC.total === BASELINE.score && nodeC.lineIssues.length === BASELINE.issues,
      { baseline: BASELINE, nodeScore: nodeC.total, nodeProblems: nodeC.lineIssues.length, fitsOnePage: fitsC });
    ok("(c) page score equals the baseline", topC === BASELINE.score && dlgC?.score === BASELINE.score && dlgC?.fix === toFixC,
      { top: topC, dialog: dlgC?.score, fixLines: dlgC?.fix, nodeLinesToFix: toFixC });

    // ---------- (d) Layout shift on a studio with a saved draft ----------
    const CLS_INIT = `window.__cls = 0; window.__shifts = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4)]); } } })
        .observe({ type: 'layout-shift', buffered: true });`;
    await page.send("Page.enable");
    const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: CLS_INIT });
    for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, true], [390, 844, true]] as const) {
      await page.viewport(w, h, mobile);
      await openStudio(page, SEEDED);
      await sleep(2500);
      const cls = await page.eval<{ cls: number; shifts: number[][] }>(`({ cls: window.__cls, shifts: window.__shifts })`);
      ok(`(d) CLS under 0.1 on the studio with a saved draft at ${w}`, cls.cls < 0.1, { cls: +cls.cls.toFixed(4), shifts: cls.shifts });
    }
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });

    // ---------- (e) Score, marks, Fix lines and Next agree ----------
    const cv = seeded;
    for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, true]] as const) {
      await page.viewport(w, h, mobile);
      await openStudio(page, SEEDED);
      await waitFor(page, `document.querySelector('[data-test-id="score-button"]')`);
      await sleep(500);
      const fits = await page.eval<boolean | null>(FITS);
      const score = scoreCV(cv, { fitsOnePage: fits !== false });
      const progress = sectionProgress(cv, score);
      const counts = linesToFix(cv, score);
      const next = nextStep(cv, score);
      const fixTotal = linesToFixList(cv, score).length;
      const expectMarks = STUDIO_SECTIONS.map((s) => {
        const n = counts[s.id];
        const mark = n > 0 ? `${n} ${n === 1 ? "line" : "lines"} to fix` : STATUS_WORDS[progress[s.id]];
        return `${s.label},${mark}`.replace(/\s+/g, " ");
      });
      const marks = (await page.eval<string[]>(MARKS)).map((m) => m.replace(/,\s*/, ","));
      const top = await page.eval<number>(TOP_SCORE);
      const sideNext = await page.eval<string | null>(SIDE_NEXT);
      const dlg = await openDialog(page);
      const sumMarks = Object.values(counts).reduce((a, b) => a + b, 0);
      ok(`(e) top-bar score = dialog score = scoreCV at ${w}`, top === score.total && dlg?.score === score.total, { top, dialog: dlg?.score, node: score.total, fitsOnePage: fits });
      ok(`(e) section marks match at ${w}`, canon(marks) === canon(expectMarks), { page: marks, node: expectMarks });
      ok(`(e) Fix lines count = sum of the marks at ${w}`, dlg?.fix === fixTotal && fixTotal === sumMarks, { dialog: dlg?.fix, node: fixTotal, sumOfMarks: sumMarks });
      const nextText = next ? next.text : null;
      ok(`(e) Next agrees (Next line, dialog, nextStep) at ${w}`, dlg?.next === (nextText ?? "Your CV is ready to send.") && sideNext === nextText,
        { nextLine: sideNext, dialog: dlg?.next, node: nextText });
    }
  } finally {
    proc.kill();
    fs.writeFileSync(`${OUT}/data-check.json`, JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.pass).length;
    console.log(failed ? `${failed} data check(s) failed` : `All ${results.length} data checks passed`);
    process.exitCode = failed || !results.length ? 1 : 0;
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
