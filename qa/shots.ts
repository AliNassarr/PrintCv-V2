// Screenshots of every screen in §7 at 390, 768, 1280 and 1440 (DPR 1), with the G6 checks in every state:
// no sideways scroll, controls at least 44px tall and inputs at least 16px below 640px, dialog Close buttons on screen.
// Run with the server up:
//   MSYS2_ENV_CONV_EXCL=STUDIO_PATH STUDIO_PATH=/studio npx tsx qa/shots.ts
// Writes qa/out/after/<screen>-<width>.png, qa/out/after/shots.json and qa/out/compare/index.html.
// Prints a JSON summary and exits 1 on any failure. WIDTHS=390,1440 or ONLY=<regex on the screen name> narrow a run.
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { launch, Page } from "./cdp";
import { ROOT, HEIGHTS, events, walkLanding, walkStudio, type Visit } from "./states";

const AFTER = process.env.AFTER || "qa/out/after";
const BEFORE = process.env.BEFORE || "qa/out/before";
const COMPARE = process.env.COMPARE || "qa/out/compare";
const WIDTHS = (process.env.WIDTHS || "390,768,1280,1440").split(",").map(Number);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

// ---------- G6 checks, run inside the page ----------
const G6 = `(() => {
  const W = innerWidth, H = innerHeight, phone = W < 640, de = document.documentElement;
  const hidden = (el) => !!el.closest('[aria-hidden="true"], [inert], .sr-only');
  const shown = (el) => {
    if (hidden(el)) return false;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0 && !/^rect\\(0px,? 0px,? 0px,? 0px\\)$/.test(s.clip);
  };
  // The tap target's height: a checkbox or radio is tapped through its <label>; the skip link is measured while it shows (on focus)
  const height = (el) => {
    if (/^(checkbox|radio)$/.test(el.type) && el.closest('label')) return el.closest('label').getBoundingClientRect().height;
    return el.getBoundingClientRect().height;
  };
  const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.id || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 50);
  const out = { scrollX: de.scrollWidth - de.clientWidth, sheetScrollX: 0, small: [], smallFont: [], dialogs: [] };
  const sheet = document.getElementById('studio-sheet');
  if (sheet && shown(sheet)) out.sheetScrollX = sheet.scrollWidth - sheet.clientWidth;
  if (phone) {
    const before = document.activeElement;
    for (const el of document.querySelectorAll('.sr-only-focusable')) {
      el.focus({ preventScroll: true });
      const h = Math.round(el.getBoundingClientRect().height * 10) / 10;
      if (h < 43.5) out.small.push(name(el) + ' (' + h + 'px, on focus)');
      el.blur();
    }
    if (before && before !== document.activeElement && before.focus) before.focus({ preventScroll: true });
    for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="menuitem"], summary')) {
      if (!shown(el) || el.closest('.cv-sheet')) continue;
      const h = Math.round(height(el) * 10) / 10;
      if (h < 43.5) out.small.push(name(el) + ' (' + h + 'px)');
    }
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (!shown(el) || /^(hidden|checkbox|radio|range|color|file)$/.test(el.type)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.smallFont.push(name(el) + ' (' + fs + 'px)');
    }
  }
  for (const d of document.querySelectorAll('[role="dialog"]')) {
    if (!shown(d)) continue;
    const c = [...d.querySelectorAll('button')].find((b) => /^close/i.test(b.getAttribute('aria-label') || b.innerText.trim()));
    const r = c && c.getBoundingClientRect();
    out.dialogs.push({ dialog: name(d.querySelector('h2') || d), close: c ? name(c) : null,
      inside: !!r && r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H });
  }
  return out;
})()`;

type Result = { screen: string; width: number; file: string; metrics?: any; fail: string[] };
const results: Result[] = [];
const screens = new Set<string>();

// print: the page is laid out for paper (an A4 is wider than a phone), so sideways scroll is not a screen fault there
async function shoot(page: Page, screen: string, w: number, expect?: string, print = false) {
  screens.add(screen);
  const file = `${AFTER}/${screen}-${w}.png`;
  const fail: string[] = [];
  if (expect && !(await page.eval(`!!(${expect})`).catch(() => false))) fail.push(`setup: expected ${expect}`);
  await page.shot(file);
  const m = await page.eval(G6);
  if (m.scrollX > 0 && !print) fail.push(`sideways scroll ${m.scrollX}px`);
  if (m.sheetScrollX > 0) fail.push(`sideways scroll inside the sheet ${m.sheetScrollX}px`);
  for (const s of m.small) fail.push(`control under 44px: ${s}`);
  for (const s of m.smallFont) fail.push(`input font under 16px: ${s}`);
  for (const d of m.dialogs) if (!d.close || !d.inside) fail.push(`dialog "${d.dialog}": Close ${d.close ? "outside the screen" : "missing"}`);
  results.push({ screen, width: w, file, metrics: m, fail });
  if (fail.length) console.error(`FAIL ${screen}-${w}: ${fail.join("; ")}`);
}

const want = (screen: string) => !ONLY || ONLY.test(screen);

// ---------- Before / after page ----------
// The baseline shots (Task 0) were taken by the old ui-check at 1440x900 (6-mobile at 390x844) and by print-check.
const PAIRS: [string, string, string][] = [
  ["Studio, first run", "1-empty.png", "studio-first-run-1440.png"],
  ["Studio, projects with the fixture", "2-projects.png", "studio-projects-1440.png"],
  ["Score window", "3-score.png", "studio-score-overview-1440.png"],
  ["Score window, lines to fix", "4-score-issues.png", "studio-score-issues-1440.png"],
  ["Help me write", "5-helper.png", "studio-helper-1-1440.png"],
  ["Studio on a phone", "6-mobile.png", "studio-projects-390.png"],
  ["Print media", "print-media.png", "print-media-1440.png"],
];
function comparePage() {
  fs.mkdirSync(COMPARE, { recursive: true });
  const rel = (dir: string, f: string) => path.relative(COMPARE, path.join(dir, f)).replace(/\\/g, "/");
  const pairs = [...PAIRS];
  // Any other file with the same name in both folders
  if (fs.existsSync(BEFORE)) for (const f of fs.readdirSync(BEFORE)) if (f.endsWith(".png") && fs.existsSync(path.join(AFTER, f)) && !pairs.some((p) => p[1] === f)) pairs.push([f, f, f]);
  const rows = pairs.filter(([, b, a]) => fs.existsSync(path.join(BEFORE, b)) && fs.existsSync(path.join(AFTER, a)))
    .map(([title, b, a]) => `<section><h2>${title}</h2><div class="row"><figure><img src="${rel(BEFORE, b)}" alt=""><figcaption>Before: ${b}</figcaption></figure><figure><img src="${rel(AFTER, a)}" alt=""><figcaption>After: ${a}</figcaption></figure></div></section>`);
  fs.writeFileSync(path.join(COMPARE, "index.html"), `<!doctype html><meta charset="utf-8"><title>PrintCV before and after</title>
<style>body{font:15px Arial,sans-serif;margin:24px;background:#f3f3f3;color:#232323}section{margin:0 0 40px}.row{display:flex;gap:16px;align-items:flex-start}figure{margin:0;flex:1}img{max-width:100%;border:1px solid #d6d6d6;background:#fff}figcaption{margin-top:4px;color:#666}</style>
<h1>PrintCV before and after</h1>${rows.join("\n")}`);
  return rows.length;
}

(async () => {
  fs.mkdirSync(AFTER, { recursive: true });
  const { proc, page } = await launch(9350);
  const on = events(page);
  try {
    await page.send("Runtime.enable");
    // Act as a focused window, so :focus applies in headless Chrome (the skip link is measured while focused)
    await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    for (const w of WIDTHS) {
      await page.viewport(w, HEIGHTS[w] ?? 900, w < 640);
      const visit: Visit = (screen, width, expect, print) => shoot(page, screen, width, expect, print);
      await walkLanding(page, w, visit, want);
      if (want("not-found")) { await page.goto(ROOT + "/nope", 1500); await shoot(page, "not-found", w, `document.body.innerText.includes('We could not find this page')`); }
      await walkStudio(page, w, on, visit, want);
      // global-error replaces the root layout, so a page throw never reaches it: shoot its static render (Task 8)
      if (want("global-error") && fs.existsSync("qa/out/global-error.html")) {
        await page.goto("file:///" + path.resolve("qa/out/global-error.html").replace(/\\/g, "/"), 800);
        await shoot(page, "global-error", w, `document.body.innerText.includes('Something went wrong')`);
      }
    }
  } finally { proc.kill(); }
  // The same file through qa/shot-file.ts, as Task 15 asks (its prefix gives global-error-<width>.png)
  if (want("global-error") && fs.existsSync("qa/out/global-error.html"))
    execSync(`npx tsx qa/shot-file.ts qa/out/global-error.html ${AFTER}/global-error ${WIDTHS.join(",")}`, { stdio: "inherit" });
  else if (want("global-error")) results.push({ screen: "global-error", width: 0, file: "", fail: ["qa/out/global-error.html is missing (see Task 8)"] });

  const compared = comparePage();
  const failures = results.flatMap((r) => r.fail.map((f) => `${r.screen}-${r.width}: ${f}`));
  const summary = { screens: screens.size, shots: results.length, widths: WIDTHS, compared, failures };
  fs.writeFileSync(`${AFTER}/shots.json`, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = failures.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
