// G5 accessibility: axe-core over CDP on /, the studio (first run and seeded), every dialog (score dialog
// each tab, order dialog, helper steps, More menu at 390), the login error notice and /nope, at 1440 and 390.
// axe-core comes from node_modules (installed with eslint-plugin-jsx-a11y), so nothing is downloaded.
// Run with the server up:
//   MSYS2_ENV_CONV_EXCL=STUDIO_PATH STUDIO_PATH=/studio OUT=qa/out/t15b npx tsx qa/a11y.ts
// Writes $OUT/a11y.json, prints every violation and exits 1 on any serious or critical one.
import fs from "fs";
import { launch, Page } from "./cdp";
import { ROOT, HEIGHTS, events, walkLanding, walkStudio, type Visit } from "./states";

const OUT = process.env.OUT || "qa/out";
const WIDTHS = (process.env.WIDTHS || "1440,390").split(",").map(Number);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const AXE_VERSION = JSON.parse(fs.readFileSync(require.resolve("axe-core/package.json"), "utf8")).version;

// The landing page (and its output tabs), the studio first run and seeded sections, every dialog,
// the More and account menus, the login error notice and not-found
const SCREENS = /^(landing-(hero|check-pass|sample-.*)|not-found|studio-(first-run|details|experience|projects|education|skills|activities|more-menu|account-menu|score-.*|order|helper-.*|error-failed))$/;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : SCREENS;
const want = (screen: string) => ONLY.test(screen);

type Node = { target: string; summary: string };
type Violation = { id: string; impact: string; help: string; nodes: Node[] };
type PageResult = { screen: string; width: number; setup: boolean; counts: Record<string, number>; violations: Violation[] };
const pages: PageResult[] = [];

const RUN = `axe.run(document, { resultTypes: ["violations"] }).then((r) => r.violations.map((v) => ({
  id: v.id, impact: v.impact, help: v.help,
  nodes: v.nodes.map((n) => ({ target: n.target.join(" "), summary: (n.failureSummary || "").replace(/\\s+/g, " ").slice(0, 300) })),
})))`;

async function check(page: Page, screen: string, w: number, expect?: string) {
  const setup = !expect || !!(await page.eval(`!!(${expect})`).catch(() => false));
  if (!(await page.eval(`typeof axe !== "undefined"`))) await page.eval(AXE + "\n;true");
  const violations: Violation[] = await page.eval(RUN);
  const counts: Record<string, number> = {};
  for (const v of violations) counts[v.impact] = (counts[v.impact] ?? 0) + v.nodes.length;
  pages.push({ screen, width: w, setup, counts, violations });
  const line = Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
  console.log(`${setup ? "" : "SETUP FAILED "}${screen}-${w}: ${line}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { proc, page } = await launch(9352);
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
    }
  } finally { proc.kill(); }

  // Every rule once, with the screens it was found on
  const rules = new Map<string, { id: string; impact: string; help: string; where: string[]; nodes: Node[] }>();
  for (const p of pages) for (const v of p.violations) {
    const r = rules.get(v.id) ?? { id: v.id, impact: v.impact, help: v.help, where: [], nodes: [] };
    r.where.push(`${p.screen}-${p.width}`);
    for (const n of v.nodes) if (!r.nodes.some((x) => x.target === n.target)) r.nodes.push(n);
    rules.set(v.id, r);
  }
  for (const r of rules.values()) {
    console.log(`\n${r.impact.toUpperCase()} ${r.id}: ${r.help}\n  on ${r.where.join(", ")}`);
    for (const n of r.nodes.slice(0, 8)) console.log(`  - ${n.target}: ${n.summary}`);
  }
  const total = (impact: string) => pages.reduce((s, p) => s + (p.counts[impact] ?? 0), 0);
  const summary = { axe: AXE_VERSION, pages: pages.length, widths: WIDTHS, setupFailed: pages.filter((p) => !p.setup).map((p) => `${p.screen}-${p.width}`),
    critical: total("critical"), serious: total("serious"), moderate: total("moderate"), minor: total("minor") };
  fs.writeFileSync(`${OUT}/a11y.json`, JSON.stringify({ summary, rules: [...rules.values()], pages }, null, 2));
  console.log("\n" + JSON.stringify(summary));
  process.exitCode = summary.critical || summary.serious || summary.setupFailed.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
