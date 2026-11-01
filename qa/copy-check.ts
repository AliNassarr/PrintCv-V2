// G7 copy check: every visible string and label on every screen from qa/shots.ts, at 1440 and at 390
// (phone-only labels such as the More menu and the bottom bar). Fails on a banned word (the list includes
// "bullet"), on an em dash, or on a sentence over 22 words. Skipped, as the plan says: the printed CV text
// (.cv-sheet, .print-root), what the user types (textarea contents) and the message for the AI ([data-copy-skip]).
// Run with the server up:
//   MSYS2_ENV_CONV_EXCL=STUDIO_PATH STUDIO_PATH=/studio OUT=qa/out/t15b npx tsx qa/copy-check.ts
// Writes $OUT/copy-check.json, prints every hit and exits 1 if there is any.
import fs from "fs";
import path from "path";
import { launch, Page } from "./cdp";
import { ROOT, HEIGHTS, events, walkLanding, walkStudio, type Visit } from "./states";

const OUT = process.env.OUT || "qa/out";
const WIDTHS = (process.env.WIDTHS || "1440,390").split(",").map(Number);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const want = (screen: string) => !ONLY || ONLY.test(screen);

// "bullet" is banned in visible copy (§6); this covers the Task 11 sections and the Task 12 dialogs and toasts.
const BANNED = /synthes|telemetr|orchestrat|paradigm|deconstruct|lexical|interrogat|heuristic|hydrat|leverage|seamless|empower|unlock|elevate|supercharge|cutting-edge|robust|holistic|streamline|effortless|world-class|bullet/i;
const MAX_WORDS = 22;

// inner: the rendered text (real line breaks between blocks), for sentence length.
// all: every text node, shown or not (sr-only, closed panels), for banned words and em dashes.
// attrs: labels a user or a screen reader meets (aria-label, title, placeholder, alt, the page title).
const READ = `(() => {
  const SKIP = '.cv-sheet, .print-root, [data-copy-skip]';
  const style = document.createElement('style');
  style.textContent = SKIP + ' { display: none !important; }';
  document.head.appendChild(style);
  const inner = document.body.innerText;
  style.remove();
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll(SKIP + ', script, style, noscript, template, textarea').forEach((n) => n.remove());
  const parts = [], walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const t = walker.currentNode.nodeValue.trim(); if (t) parts.push(t); }
  const names = ['aria-label', 'title', 'placeholder', 'alt', 'aria-valuetext', 'aria-roledescription'];
  const attrs = [...document.querySelectorAll(names.map((n) => '[' + n + ']').join(','))]
    .filter((e) => !e.closest(SKIP)).flatMap((e) => names.map((n) => e.getAttribute(n) || '')).filter(Boolean);
  if (document.title) attrs.push(document.title);
  return { inner, all: parts.join('\\n'), attrs };
})()`;

type Hit = { kind: "banned" | "em dash" | "long sentence" | "setup"; text: string; where: string[] };
const hits = new Map<string, Hit>();
let states = 0;

function add(kind: Hit["kind"], text: string, where: string) {
  const key = kind + "|" + text;
  const h = hits.get(key) ?? { kind, text, where: [] };
  if (!h.where.includes(where)) h.where.push(where);
  hits.set(key, h);
}

// Sentences: split on line breaks, then after . ! ? and the "·" separator
const sentences = (s: string) => s.split(/\n+/).flatMap((line) => line.split(/(?<=[.!?])\s+|\s+·\s+/)).map((x) => x.trim()).filter(Boolean);
const words = (s: string) => s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
// The words around a match, so the report shows where it is
const around = (s: string, i: number) => s.slice(Math.max(0, i - 50), i + 60).replace(/\s+/g, " ").trim();

async function check(page: Page, screen: string, w: number, expect?: string) {
  const where = `${screen}-${w}`;
  states++;
  if (expect && !(await page.eval(`!!(${expect})`).catch(() => false))) add("setup", `expected ${expect}`, where);
  const r: { inner: string; all: string; attrs: string[] } = await page.eval(READ);
  const every = [r.all, ...r.attrs].join("\n");
  const ban = new RegExp(BANNED.source, "gi");
  for (let m; (m = ban.exec(every)); ) add("banned", `"${m[0]}" in: ${around(every, m.index)}`, where);
  for (let i = every.indexOf("—"); i >= 0; i = every.indexOf("—", i + 1)) add("em dash", around(every, i), where);
  for (const s of [...sentences(r.inner), ...r.attrs.flatMap(sentences)]) {
    const n = words(s);
    if (n > MAX_WORDS) add("long sentence", `${n} words: ${s}`, where);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { proc, page } = await launch(9351);
  const on = events(page);
  try {
    await page.send("Runtime.enable");
    await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    for (const w of WIDTHS) {
      await page.viewport(w, HEIGHTS[w] ?? 900, w < 640);
      const visit: Visit = (screen, width, expect) => check(page, screen, width, expect);
      await walkLanding(page, w, visit, want);
      if (want("not-found")) { await page.goto(ROOT + "/nope", 1500); await check(page, "not-found", w, `document.body.innerText.includes('We could not find this page')`); }
      await walkStudio(page, w, on, visit, want);
      // global-error replaces the root layout, so it is read from its static render (Task 8)
      if (want("global-error") && fs.existsSync("qa/out/global-error.html")) {
        await page.goto("file:///" + path.resolve("qa/out/global-error.html").replace(/\\/g, "/"), 800);
        await check(page, "global-error", w, `document.body.innerText.includes('Something went wrong')`);
      }
    }
  } finally { proc.kill(); }
  const list = [...hits.values()];
  fs.writeFileSync(`${OUT}/copy-check.json`, JSON.stringify({ states, widths: WIDTHS, hits: list }, null, 2));
  for (const h of list) console.log(`${h.kind.toUpperCase()}: ${h.text}\n    on ${h.where.join(", ")}`);
  const count = (k: Hit["kind"]) => list.filter((h) => h.kind === k).length;
  console.log(JSON.stringify({ states, widths: WIDTHS, banned: count("banned"), emDash: count("em dash"), longSentences: count("long sentence"), setup: count("setup") }));
  process.exitCode = list.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
