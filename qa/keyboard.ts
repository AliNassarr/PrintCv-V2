// G5 keyboard: walks the Tab order with Input.dispatchKeyEvent on / and the seeded studio at 1440 (and the
// studio at 768 for the More menu). At each stop it records the accessible name (from the browser's
// accessibility tree), checks for a focus ring (an outline, or a box-shadow ring) and checks the element is
// on screen after the browser scrolls it in (inside the viewport and not cut off by a scrolling parent).
// It compares the order with the expected one (Task 15 Step 4, see EXPECT below), then checks: Escape closes
// each dialog and focus goes back to its opener, the score tabs move with the arrow keys, "Fix this line in ..."
// puts the cursor in that line, Move up / Move down keep focus on the moved row, and the account menu (1440) and the
// More menu (768) open, move and close with the keys.
// The manual NVDA pass (the status announces only the fits/longer flip) is not covered here.
// Run with the server up:
//   node --experimental-websocket --import tsx qa/keyboard.ts
// Writes $OUT/keyboard.json, prints the orders and every failure, exits 1 on any failure.
import fs from "fs";
import { launch, Page } from "./cdp";
import { ROOT, SEEDED, LONG, openStudio, openAuthenticatedStudio, section, sleep } from "./states";

const OUT = process.env.OUT || "qa/out";
const fails: string[] = [];
const ok = (cond: unknown, msg: string) => { if (!cond) { fails.push(msg); console.log("FAIL " + msg); } return !!cond; };

// ---------- Keys ----------
const VK: Record<string, number> = { Tab: 9, Enter: 13, Escape: 27, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35 };
async function press(page: Page, key: keyof typeof VK & string, shift = false) {
  const base = { key, code: key, windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key], modifiers: shift ? 8 : 0 };
  // Enter types a character (keyDown with text), the others do not (rawKeyDown), as a real keyboard does
  await page.send("Input.dispatchKeyEvent", key === "Enter" ? { type: "keyDown", text: "\r", unmodifiedText: "\r", ...base } : { type: "rawKeyDown", ...base });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

// ---------- One stop ----------
// The ring: an outline or a box-shadow on the element that is not there when it is not focused. The resting look
// comes from a copy of the element put just before it for one moment (same classes and attributes, not focused);
// a copy fires no blur or focus events, so menus and dialogs stay as they are. A visually hidden input (a switch)
// shows its ring on the visible box next to it, so that box is checked instead (its copy goes before the input,
// so "peer" focus rules do not reach it).
const STOP = `(() => {
  const el = document.activeElement;
  // Chrome keeps document.activeElement on the final control after Tab moves focus
  // into browser chrome, so stop when the page itself no longer owns focus.
  if (!document.hasFocus() || !el || el === document.body || el === document.documentElement) return null;
  let r = el.getBoundingClientRect();
  const look = (s) => ({ outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? [s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset].join(' ') : '',
    shadow: s.boxShadow && s.boxShadow !== 'none' ? s.boxShadow : '' });
  const ringOf = (e) => {
    const now = look(getComputedStyle(e));
    const copy = e.cloneNode(false); copy.removeAttribute('id'); copy.setAttribute('aria-hidden', 'true');
    el.parentNode.insertBefore(copy, el);
    const rest = look(getComputedStyle(copy));
    copy.remove();
    return (!!now.outline && now.outline !== rest.outline) || (!!now.shadow && now.shadow !== rest.shadow);
  };
  let ringEl = el;
  if ((r.width <= 1 || r.height <= 1) && el.nextElementSibling) { ringEl = el.nextElementSibling; r = ringEl.getBoundingClientRect(); }
  const W = innerWidth, H = innerHeight;
  // A text box is scrolled in only until its caret line shows (Chrome scrolls to the caret, not the whole box),
  // so for a text box the first 24px of text must show; for everything else the whole element
  const text = /^(TEXTAREA|INPUT)$/.test(el.tagName);
  const top = r.top + (text ? parseFloat(getComputedStyle(el).paddingTop) : 0);
  const bottom = text ? Math.min(r.bottom, top + 24) : r.bottom;
  const tall = r.height > H;
  const inView = r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= W + 1 && (tall ? r.top < H && r.bottom > 0 : r.top >= -1 && bottom <= H + 1);
  let clippedBy = '';
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const ps = getComputedStyle(p);
    if (!/(auto|scroll|hidden|clip)/.test(ps.overflowX + ' ' + ps.overflowY)) continue;
    const pr = p.getBoundingClientRect();
    const big = r.height > pr.height || r.width > pr.width;
    const out = big ? (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom)
      : (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || bottom > pr.bottom + 1);
    if (out) { clippedBy = p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (p.getAttribute('role') ? '[role=' + p.getAttribute('role') + ']' : ''); break; }
  }
  return { tag: el.tagName.toLowerCase(), ring: ringOf(ringEl), inView, clippedBy, text: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.id || '').trim().replace(/\\s+/g, ' ').slice(0, 60) };
})()`;

type Stop = { name: string; tag: string; ring: boolean; inView: boolean; clippedBy: string };

async function axName(page: Page): Promise<string> {
  const r = await page.send("Runtime.evaluate", { expression: "document.activeElement" });
  if (!r.result?.objectId) return "";
  try {
    const ax = await page.send("Accessibility.getPartialAXTree", { objectId: r.result.objectId, fetchRelatives: false });
    const n = ax.nodes.find((x: any) => !x.ignored) ?? ax.nodes[0];
    return `${n.role?.value ?? "?"}: ${String(n.name?.value ?? "").replace(/\s+/g, " ").trim().slice(0, 70)}`;
  } finally { await page.send("Runtime.releaseObject", { objectId: r.result.objectId }).catch(() => {}); }
}

// Tab from the top of a freshly loaded page until focus leaves the page or comes back to the first stop
async function walk(page: Page, label: string, max = 300): Promise<Stop[]> {
  const stops: Stop[] = [];
  // Give the browser document an explicit keyboard-focus anchor after CDP navigation. Chrome can
  // otherwise send the first Tab to browser chrome on the 768px emulated viewport.
  await page.eval(`document.body.tabIndex = -1; document.body.focus(); window.__kbFirst = null; true`);
  for (let i = 0; i < max; i++) {
    await press(page, "Tab");
    await sleep(90);
    let s = await page.eval(STOP);
    if (s && (!s.inView || s.clippedBy)) { await sleep(600); s = await page.eval(STOP); } // let a scroll finish
    if (!s) break;
    if (await page.eval(`(() => { if (!window.__kbFirst) { window.__kbFirst = document.activeElement; return false; } return window.__kbFirst === document.activeElement; })()`)) break;
    const name = (await axName(page)) || s.text;
    stops.push({ name, tag: s.tag, ring: s.ring, inView: s.inView, clippedBy: s.clippedBy });
    ok(s.ring, `${label}: no focus ring on stop ${i + 1} "${name}"`);
    ok(s.inView, `${label}: stop ${i + 1} "${name}" is outside the viewport`);
    ok(!s.clippedBy, `${label}: stop ${i + 1} "${name}" is cut off by ${s.clippedBy}`);
  }
  return stops;
}

// Each expected group must appear, in this order, as the first stop that matches it
function compare(label: string, stops: Stop[], expect: [string, RegExp][]) {
  let last = -1;
  for (const [what, re] of expect) {
    const i = stops.findIndex((s, k) => k > last && re.test(s.name));
    if (ok(i >= 0, `${label}: expected "${what}" after stop ${last + 1}, not found in order`)) last = i;
  }
}

// Short form of a walk for the report: runs of the same name collapse into "name ×n"
function short(stops: Stop[]) {
  const out: string[] = [];
  for (const s of stops) {
    const prev = out[out.length - 1];
    const m = prev && prev.match(/^(.*) ×(\d+)$/);
    if (prev === s.name) out[out.length - 1] = `${s.name} ×2`;
    else if (m && m[1] === s.name) out[out.length - 1] = `${s.name} ×${+m[2] + 1}`;
    else out.push(s.name);
  }
  return out;
}

// ---------- Expected orders ----------
// Landing (plan): skip link, wordmark, nav links, Log in with 42, the hero's Log in with 42, Open the editor, line check
// textarea, output tabs, FAQ links, CTA link, footer links. The FAQ has no links (every answer is always shown),
// and the output tabs are one stop (arrow keys move inside the tab row).
const LANDING: [string, RegExp][] = [
  ["skip link", /^link: Skip to the main content/],
  ["wordmark", /^link: PrintCV$/],
  ["nav: How it works", /^link: How it works/],
  ["nav: Sample", /^link: Sample/],
  ["nav: Questions", /^link: Questions/],
  ["Log in with 42", /^link: Log in with 42/],
  ["hero: Log in with 42", /^link: Log in with 42/],
  ["Open the editor", /^link: Open the editor/],
  ["line check textarea", /^textbox: /],
  ["output tabs", /^tab: /],
  ["CTA button", /^link: Log in with 42/],
  ["footer: Make your CV", /^link: Make your CV/],
  ["footer: Editor", /^link: Editor/],
  ["footer: Back to top", /^link: Back to top/],
];
// Studio at 1440: Score, Word, PDF, the account (the account circle when logged in, else Log in with 42), the section
// steps (one stop: arrow keys move inside the tablist), Fix it, section content, preview toolbar
const STUDIO_1440: [string, RegExp][] = [
  ["Score", /^button: \d+.*See your CV score/],
  ["Word", /^button: Download a Word file/],
  ["PDF", /^button: Download PDF/],
  ["account", /^(button: Account: |link: Log in with 42)/],
  ["section steps", /^tab: /],
  ["Fix it", /^button: Fix it/],
  ["section content", /^(textbox|button|combobox|checkbox|switch): /],
  ["Order", /^button: Change section order/],
  ["zoom", /^button: Zoom out/],
  ["Fit width", /^button: Fit width/],
  ["Whole page", /^button: Whole page/],
  ["100%", /^button: 100%/],
  ["Full screen", /^button: Full screen/],
];
// The preview toolbar when the CV is longer than 1 page: "Make it fit" sits left of Order, so it comes first
const TOOLBAR_LONG: [string, RegExp][] = [
  ["Make it fit", /^button: Make it fit/],
  ["Order", /^button: Change section order/],
  ["zoom", /^button: Zoom out/],
];
// Studio at 768: More takes the place of the account; the section tabs and Fix it come after the top bar
const STUDIO_768: [string, RegExp][] = [
  ["Score", /^button: \d+.*See your CV score/],
  ["Word", /^button: Download a Word file/],
  ["PDF", /^button: Download PDF/],
  ["More", /^button: More/],
  ["section tab", /^tab: /],
  ["Fix it", /^button: Fix it/],
  ["section content", /^(textbox|button|combobox|checkbox|switch): /],
  ["Edit / Preview", /^button: Edit/],
];

// ---------- Behaviour checks ----------
const active = (page: Page) => page.eval<string>(`(() => { const e = document.activeElement; return e ? (e.getAttribute('aria-label') || e.innerText || e.id || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 60) : ''; })()`);
const focus = (page: Page, sel: string) => page.eval<boolean>(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().width); if (!e) return false; e.focus(); return document.activeElement === e; })()`);
const mark = (page: Page) => page.eval(`(() => { document.querySelectorAll('[data-kb-opener]').forEach((e) => e.removeAttribute('data-kb-opener')); document.activeElement.setAttribute('data-kb-opener', ''); return true; })()`);
const onOpener = (page: Page) => page.eval<boolean>(`document.activeElement?.hasAttribute('data-kb-opener') ?? false`);
const exists = (page: Page, sel: string) => page.eval<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`);

// Opens a dialog from its opener with Enter, then closes it with Escape and checks where focus went
async function escapeCheck(page: Page, label: string, openerSel: string, dialogSel: string) {
  if (!ok(await focus(page, openerSel), `${label}: opener ${openerSel} not found`)) return;
  await mark(page);
  await press(page, "Enter"); await sleep(500);
  if (!ok(await exists(page, dialogSel), `${label}: Enter on the opener did not open ${dialogSel}`)) return;
  ok(await page.eval(`document.querySelector(${JSON.stringify(dialogSel)}).closest('[role="dialog"], [role="menu"]')?.contains(document.activeElement) ?? false`),
    `${label}: focus is not inside the open window (it is on "${await active(page)}")`);
  await press(page, "Escape"); await sleep(400);
  ok(!(await exists(page, dialogSel)), `${label}: Escape did not close it`);
  ok(await onOpener(page), `${label}: after Escape focus is on "${await active(page)}", not the opener`);
}

const report: any = {};

async function studioChecks(page: Page) {
  // Escape closes each dialog, and focus returns to its opener
  await escapeCheck(page, "score dialog", '[data-test-id="score-button"]', '[data-test-id="score-dialog"]');
  await escapeCheck(page, "order dialog", '[data-test-id="order-button"]', '[aria-labelledby="section-order-title"]');
  await section(page, "PROJECTS", "Projects"); await sleep(400);
  await escapeCheck(page, "helper", '[data-test-id="helper-button"]', '[aria-labelledby="bullet-helper-title"], [role="dialog"]');

  // The score tabs move with the arrow keys (and wrap), Home and End jump to the ends
  await focus(page, '[data-test-id="score-button"]'); await press(page, "Enter"); await sleep(500);
  const tab = () => page.eval<string>(`(() => { const e = document.activeElement; return e?.getAttribute('role') === 'tab' && e.getAttribute('aria-selected') === 'true' ? e.id : 'not a selected tab: ' + (e?.id || e?.tagName); })()`);
  await focus(page, '[role="dialog"] [role="tab"][aria-selected="true"]');
  const seen = [await tab()];
  for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home"] as const) { await press(page, k); await sleep(200); seen.push(await tab()); }
  report.scoreTabs = seen;
  ok(JSON.stringify(seen) === JSON.stringify(["score-tab-overview", "score-tab-issues", "score-tab-matcher", "score-tab-overview", "score-tab-matcher", "score-tab-matcher", "score-tab-overview"]),
    `score tabs: arrow keys gave ${seen.join(" > ")}`);

  // "Fix this line in ..." closes the dialog and puts the cursor in that line
  await page.eval(`document.getElementById('score-tab-issues').click(); true`); await sleep(300);
  const want = await page.eval<{ label: string; text: string }>(`(() => { const b = document.querySelector('button[aria-label^="Fix this line in"]'); const row = b.closest('li'); return { label: b.getAttribute('aria-label'), text: row.querySelector('p.text-ink').innerText.trim() }; })()`);
  await focus(page, 'button[aria-label^="Fix this line in"]'); await press(page, "Enter"); await sleep(900);
  const got = await page.eval<{ tag: string; label: string; value: string; dialog: boolean }>(`(() => { const e = document.activeElement; return { tag: e.tagName, label: e.getAttribute('aria-label') || '', value: (e.value || '').trim(), dialog: !!document.querySelector('[data-test-id="score-dialog"]') }; })()`);
  report.fixThisLine = { want, got };
  ok(!got.dialog && got.tag === "TEXTAREA" && /^Line \d/.test(got.label) && got.value === want.text,
    `"${want.label}": focus went to ${got.tag} "${got.label}" with "${got.value.slice(0, 40)}", not the line "${want.text.slice(0, 40)}"`);

  // Move up / Move down on a project card keep focus on the moved card
  await section(page, "PROJECTS", "Projects"); await sleep(400);
  const cards = `[...document.querySelectorAll('[id^="item-"]:not([id$="-body"]):not([id$="-lines"])')].filter((e) => e.querySelector('[data-test-id="item-header"]')).map((e) => e.id)`;
  for (const dir of ["down", "up"] as const) {
    const before: string[] = await page.eval(cards);
    const idx = dir === "down" ? 0 : 1;
    await focus(page, `#${before[idx]} [data-test-id="item-header"] button[aria-label="Move project ${dir}"]`);
    await press(page, "Enter"); await sleep(400);
    const after: string[] = await page.eval(cards);
    const where = await page.eval<string>(`document.activeElement.closest('[id^="item-"]')?.id + ' / ' + document.activeElement.getAttribute('aria-label')`);
    report[`moveProject${dir}`] = { before: before.slice(0, 3), after: after.slice(0, 3), focus: where };
    ok(after[dir === "down" ? 1 : 0] === before[idx] && where.startsWith(before[idx] + " / Move project"), `Move project ${dir}: card order ${after.slice(0, 3)} with focus on ${where}`);
  }

  // Move line down / up keep focus on the moved line's row
  const lines = (card: string) => `[...document.querySelectorAll('#${card} textarea[aria-label^="Line "]')].map((t) => t.value)`;
  const card: string = (await page.eval<string[]>(cards))[0];
  for (const dir of ["down", "up"] as const) {
    const before: string[] = await page.eval(lines(card));
    const idx = dir === "down" ? 0 : 1;
    await page.eval(`(() => { const rows = [...document.querySelectorAll('#${card} textarea[aria-label^="Line "]')].map((t) => t.closest('.rounded-card')); rows[${idx}].querySelector('button[aria-label="Move line ${dir}"]').focus(); return true; })()`);
    await press(page, "Enter"); await sleep(400);
    const after: string[] = await page.eval(lines(card));
    const focusRow = await page.eval<number>(`(() => { const rows = [...document.querySelectorAll('#${card} textarea[aria-label^="Line "]')].map((t) => t.closest('.rounded-card')); return rows.findIndex((r) => r.contains(document.activeElement)); })()`);
    const to = dir === "down" ? 1 : 0;
    report[`moveLine${dir}`] = { moved: after[to] === before[idx], focusRow, focus: await active(page) };
    ok(after[to] === before[idx] && focusRow === to && /^Move line/.test(await active(page)), `Move line ${dir}: focus on row ${focusRow} "${await active(page)}"`);
  }

  // Section order dialog: Move down / up keep focus on the same button of the moved row
  await focus(page, '[data-test-id="order-button"]'); await press(page, "Enter"); await sleep(500);
  const rows = `[...document.querySelectorAll('[role="dialog"] ol > li')].map((li) => li.querySelector('span').innerText.trim())`;
  for (const dir of ["down", "up"] as const) {
    const before: string[] = await page.eval(rows);
    const idx = dir === "down" ? 0 : 1;
    const name = `Move ${before[idx]} ${dir}`;
    await focus(page, `[role="dialog"] button[aria-label="${name}"]`);
    await press(page, "Enter"); await sleep(400);
    const after: string[] = await page.eval(rows);
    const now = await active(page);
    report[`order${dir}`] = { before, after, focus: now };
    ok(after[dir === "down" ? 1 : 0] === before[idx] && now === name, `order dialog ${name}: rows ${after.join(", ")} with focus on "${now}"`);
  }
  await press(page, "Escape"); await sleep(300);
}

async function accountChecks(page: Page) {
  // The account menu at 1440: Arrow down opens it on the first item, arrows move, Escape closes it on the circle
  if (!ok(await focus(page, '[data-test-id="account-button"]'), "Account: button not found at 1440")) return;
  await mark(page);
  await press(page, "ArrowDown"); await sleep(300);
  const items: string[] = [await active(page)];
  await press(page, "ArrowDown"); await sleep(100); items.push(await active(page));
  await press(page, "ArrowDown"); await sleep(100); items.push(await active(page));
  report.accountMenu = items;
  ok(items[0] === "Update from 42" && items[1] === "Log out" && items[2] === "Update from 42", `Account menu: arrow keys gave ${items.join(" > ")}`);
  await press(page, "Escape"); await sleep(300);
  ok(!(await exists(page, '[role="menu"]')), "Account menu: Escape did not close it");
  ok(await onOpener(page), `Account menu: after Escape focus is on "${await active(page)}", not the account circle`);
}

async function moreChecks(page: Page) {
  // The More menu: Enter opens it on the first item, arrows move, Escape closes it on More
  if (!ok(await focus(page, 'header button[aria-haspopup="menu"]'), "More: button not found at 768")) return;
  await mark(page);
  await press(page, "Enter"); await sleep(300);
  const items: string[] = [await active(page)];
  await press(page, "ArrowDown"); await sleep(100); items.push(await active(page));
  await press(page, "ArrowUp"); await sleep(100); items.push(await active(page));
  report.moreMenu = items;
  ok(items[0] === "Order" && items[1] !== "Order" && items[2] === "Order", `More menu: arrow keys gave ${items.join(" > ")}`);
  await press(page, "Escape"); await sleep(300);
  ok(!(await exists(page, '[role="menu"]')), "More menu: Escape did not close it");
  ok(await onOpener(page), `More menu: after Escape focus is on "${await active(page)}", not More`);
  // More > Order opens the order dialog; Escape there returns focus to More
  await press(page, "Enter"); await sleep(300); await press(page, "Enter"); await sleep(500);
  ok(await exists(page, '[aria-labelledby="section-order-title"]'), "More > Order: the order dialog did not open");
  await press(page, "Escape"); await sleep(400);
  ok(!(await exists(page, '[aria-labelledby="section-order-title"]')), "More > Order: Escape did not close the order dialog");
  ok(await onOpener(page), `More > Order: after Escape focus is on "${await active(page)}", not More`);
}

// A step that hangs fails the run instead of waiting forever
function withTimeouts(page: Page) {
  const send = page.send.bind(page);
  page.send = (method: string, params: any = {}) => Promise.race([send(method, params),
    new Promise<any>((_, rej) => setTimeout(() => rej(new Error(`${method} got no answer in 20s`)), 20000))]);
}
// And the whole run stops after 10 minutes, whatever hangs
setTimeout(() => { console.error("keyboard.ts did not finish in 10 minutes"); process.exit(1); }, 600000).unref();
const step = (s: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { proc, page } = await launch(9353);
  withTimeouts(page);
  try {
    await page.send("Runtime.enable");
    await page.send("Accessibility.enable");
    await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });

    step("landing at 1440");
    await page.viewport(1440, 900);
    await page.goto(ROOT + "/", 2500);
    const landing = await walk(page, "landing-1440");
    compare("landing-1440", landing, LANDING);

    step("studio at 1440");
    await openStudio(page, SEEDED);
    const studio = await walk(page, "studio-1440");
    compare("studio-1440", studio, STUDIO_1440);
    step("studio longer than 1 page at 1440");
    await openStudio(page, LONG);
    const long = await walk(page, "studio-long-1440");
    compare("studio-long-1440", long, TOOLBAR_LONG);
    step("dialogs, tabs, Fix this line, moves");
    await openStudio(page, SEEDED);
    await studioChecks(page);
    step("account menu at 1440");
    await openAuthenticatedStudio(page);
    await accountChecks(page);

    step("studio at 768");
    await page.viewport(768, 1024);
    await openStudio(page, SEEDED);
    const studio768 = await walk(page, "studio-768");
    compare("studio-768", studio768, STUDIO_768);
    step("More menu at 768");
    await openStudio(page, SEEDED);
    await moreChecks(page);

    report.orders = { "landing-1440": short(landing), "studio-1440": short(studio), "studio-long-1440": short(long).slice(-8), "studio-768": short(studio768) };
    report.stops = { "landing-1440": landing, "studio-1440": studio, "studio-long-1440": long, "studio-768": studio768 };
  } finally { page.close(); proc.kill(); }
  report.fails = fails;
  fs.writeFileSync(`${OUT}/keyboard.json`, JSON.stringify(report, null, 2));
  for (const [k, v] of Object.entries(report.orders ?? {})) console.log(`\n${k} (${(report.stops[k] as Stop[]).length} stops):\n  ${(v as string[]).join("\n  ")}`);
  console.log("\n" + JSON.stringify({ scoreTabs: report.scoreTabs, fixThisLine: report.fixThisLine?.got?.label, accountMenu: report.accountMenu, moreMenu: report.moreMenu, fails: fails.length }));
  console.log("NVDA: not run here (manual).");
  process.exitCode = fails.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
