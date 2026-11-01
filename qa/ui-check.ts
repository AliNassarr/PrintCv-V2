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
cv.projects = cv.projects.slice(0, 2);
cv.projects[0].bulletPoints = ["I helped with the server.", "Built an HTTP/1.1 server in C++ that handled 500 open connections with poll()."];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { proc, page } = await launch(9334);
  const out: any = {};
  try {
    await page.send("Runtime.enable");
    await page.viewport(1440, 900);

    // 1. First visit, nothing saved
    await page.goto(BASE, 3000);
    out.emptyScore = await page.eval(`document.querySelector('[title="See your CV score"]')?.innerText`);
    out.emptyText = await page.eval(`document.querySelector('main, body').innerText.includes('Start with your 42 projects')`);
    await page.shot(`${OUT}/1-empty.png`);

    // 2. Logged in with 2 projects on the CV
    await page.eval(`localStorage.setItem("printcv_draft_v1", ${JSON.stringify(JSON.stringify({ state: { cvData: cv, studentProfile: user }, version: 2 }))}); true`);
    await page.goto(BASE, 3000);
    out.pickerChips = await page.eval(`[...document.querySelectorAll('button[aria-label^="Add "][aria-label$="to your CV"]')].map(b => b.innerText)`);
    out.score = await page.eval(`document.querySelector('[title="See your CV score"]')?.innerText`);
    await page.shot(`${OUT}/2-projects.png`);
    await page.eval(`document.querySelector('button[aria-label="Add philosophers to your CV"]').click(); true`);
    await sleep(400);
    out.afterAdd = await page.eval(`[...document.querySelectorAll('button[aria-label^="Add "][aria-label$="to your CV"]')].map(b => b.innerText)`);

    // Keyboard on a card header
    out.header = await page.eval(`(async () => {
      const h = document.querySelector('[data-test-id="item-header"] button[aria-expanded]') || document.querySelector('[id^="item-"] button[aria-expanded]');
      const before = h.getAttribute('aria-expanded');
      h.focus(); h.click();
      await new Promise(r => setTimeout(r, 200));
      const h2 = document.querySelector('[data-test-id="item-header"] button[aria-expanded]') || document.querySelector('[id^="item-"] button[aria-expanded]');
      return before + ' -> ' + h2.getAttribute('aria-expanded');
    })()`);

    // 3. Score window (focus first, like a real click or keyboard press)
    await page.eval(`(() => { const b = document.querySelector('[title="See your CV score"]'); b.focus(); b.click(); return true; })()`);
    await sleep(500);
    await page.shot(`${OUT}/3-score.png`);
    out.focusInScore = await page.eval(`document.querySelector('[role="dialog"]').contains(document.activeElement)`);
    // Escape closes it and focus goes back to the Score button
    await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await sleep(300);
    out.focusBack = await page.eval(`!document.querySelector('[role="dialog"]') && document.activeElement?.getAttribute('title') === 'See your CV score'`);
    // Order dialog: Escape closes it too
    await page.eval(`(document.querySelector('[data-test-id="order-button"]') || [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Order')).click(); true`);
    await sleep(300);
    out.orderOpen = await page.eval(`!!document.querySelector('[aria-labelledby="section-order-title"]')`);
    await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await sleep(300);
    out.orderClosed = await page.eval(`!document.querySelector('[aria-labelledby="section-order-title"]')`);
    await page.eval(`document.querySelector('[title="See your CV score"]').click(); true`);
    await sleep(400);
    await page.eval(`[...document.querySelectorAll('[role="tab"]')].find(t => t.innerText.startsWith('Fix lines')).click(); true`);
    await sleep(300);
    out.issues = await page.eval(`(() => { const d = document.querySelector('[data-test-id="score-dialog"]'); if (!d) return 0; const rows = d.querySelectorAll('[data-test-id="score-issue"]'); return rows.length ? rows.length : d.querySelectorAll('.italic').length; })()`);
    await page.shot(`${OUT}/4-score-issues.png`);
    // Fix jumps to the project
    await page.eval(`document.querySelector('button[aria-label^="Fix this line in"]').click(); true`);
    await sleep(600);
    out.dialogClosed = await page.eval(`!document.querySelector('[data-test-id="score-dialog"]')`);

    // 4. Help me write
    await page.eval(`(document.querySelector('[data-test-id="helper-button"]') || [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Help me write')).click(); true`);
    await sleep(500);
    await page.shot(`${OUT}/5-helper.png`);
    await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await sleep(300);
    out.helperClosed = await page.eval(`!document.querySelector('[role="dialog"]')`);

    // 5. Phone size
    await page.viewport(390, 844, true);
    await page.goto(BASE, 3000);
    out.mobileScrollX = await page.eval(`document.documentElement.scrollWidth - window.innerWidth`);
    out.mobileWord = await page.eval(`(() => { const b = document.querySelector('[data-test-id="word-button"]') || document.querySelector('button[aria-label="Download a Word file"]'); const r = b?.getBoundingClientRect(); return !!r && r.width > 0 && r.right <= window.innerWidth; })()`);
    await page.shot(`${OUT}/6-mobile.png`);

    // 5b. On a phone the preview toolbar fits: no control is cut off at either edge of the zone (390 and 360 wide).
    // Order is not in the toolbar there, so the More menu must have it.
    const phoneToolbar: Record<number, { buttons: number; cut: string[]; moreOrder: boolean }> = {};
    for (const w of [390, 360]) {
      await page.viewport(w, 800, true); await page.goto(BASE, 2500);
      await page.eval(`[...document.querySelectorAll('header button[aria-haspopup="menu"]')].find((b) => b.getBoundingClientRect().width)?.click(); true`);
      await sleep(300);
      const moreOrder = await page.eval<boolean>(`[...document.querySelectorAll('[role="menuitem"]')].some((m) => m.innerText.trim() === 'Order')`);
      await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
      await page.eval(`[...document.querySelectorAll('div[role="group"][aria-label="Show"] button')].find((b) => b.innerText.trim() === 'Preview')?.click(); true`);
      await sleep(400);
      phoneToolbar[w] = await page.eval(`(() => {
        const z = document.querySelector('[data-test-id="preview-zone"]').getBoundingClientRect();
        const shown = [...document.querySelector('[data-test-id="preview-zone"]').firstElementChild.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0);
        const cut = shown.filter((b) => { const r = b.getBoundingClientRect(); return r.right > z.right + 0.5 || r.left < z.left - 0.5; });
        return { buttons: shown.length, cut: cut.map((b) => b.getAttribute('aria-label') || b.innerText.trim()) };
      })()`);
      phoneToolbar[w].moreOrder = moreOrder;
    }
    out.phoneToolbar = phoneToolbar;
    out.phoneToolbarFits = Object.values(phoneToolbar).every((t) => t.buttons >= 5 && t.cut.length === 0 && t.moreOrder);

    // 6. The A4 fills at least 85% of the preview zone's inner width, and nothing in the zone scrolls sideways
    const previewWidths: Record<number, { a4: number; zone: number; share: number; sideways: number }> = {};
    for (const [w, h] of [[1280, 800], [1440, 900]]) {
      await page.viewport(w, h); await page.goto(BASE, 2500);
      previewWidths[w] = await page.eval(`(() => {
        const z = document.querySelector('[data-test-id="preview-zone"]'), a = document.querySelector('[data-test-id="preview-a4"]');
        if (!z || !a) return { a4: 0, zone: 0, share: 0, sideways: -1 };
        const a4 = a.getBoundingClientRect().width, zone = z.clientWidth;
        // The zone, its scrolling body (the "Page preview" group) and the page itself
        const body = z.querySelector('[aria-label="Page preview"]');
        const sideways = Math.max(z.scrollWidth - z.clientWidth, body ? body.scrollWidth - body.clientWidth : 0, document.documentElement.scrollWidth - innerWidth);
        return { a4: Math.round(a4), zone, share: +(a4 / zone).toFixed(3), sideways };
      })()`);
    }
    out.previewWidths = previewWidths;
    out.previewFits = Object.values(previewWidths).every((p) => p.share >= 0.85 && p.sideways <= 0);

    out.logs = page.logs;
    console.log(JSON.stringify(out, null, 2));
    fs.writeFileSync(`${OUT}/ui.json`, JSON.stringify(out, null, 2));
  } finally { proc.kill(); }
})();
