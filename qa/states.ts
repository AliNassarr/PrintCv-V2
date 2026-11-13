// The screen states shared by the QA scripts (shots, copy-check, a11y): fixtures, page helpers and a walk
// through every screen in §7. Each state calls visit(screen, width, expect, print); `want` picks the screens.
import { Page } from "./cdp";
import { testUser, TEST_PHONE } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
import { AUTH_ERROR_MESSAGES } from "../src/lib/auth-errors";

export const ROOT = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
export const STUDIO = ROOT + (process.env.STUDIO_PATH || "/studio");
export const HEIGHTS: Record<number, number> = { 390: 844, 768: 1024, 1280: 800, 1440: 900 };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Fixtures (fictional, from qa/fixtures) ----------
export const user: any = testUser;
export const seeded = createInitialCVFromIntra(user);
seeded.contact.phoneNumber = TEST_PHONE;
seeded.projects = seeded.projects.slice(0, 3);
seeded.projects[0].bulletPoints = ["Built an HTTP/1.1 server in C++ that handled 500 open connections with poll().", "I helped with the server."];
seeded.projects[1].bulletPoints = ["Built a Bash-like shell in C with pipes, redirections and signal handling, tested against 300 edge cases.",
  "Split the parser and the runner with a teammate and merged our work every day."];
seeded.projects[2].bulletPoints = ["Solved the dining philosophers problem in C with POSIX threads and mutexes, with no data races."];
seeded.skills = { languages: ["C", "C++", "Python", "Bash"], developerTools: ["Git", "GDB", "Valgrind"], technologiesFrameworks: ["Linux", "Docker"], projectManagementTools: ["GitHub"] };
seeded.showExperience = true;
seeded.experience = [{ id: "qa-exp-1", company: "Sample Shop", role: "IT Helper (part time)", location: "Sample city", startDate: "June 2024", endDate: "September 2024", isCurrent: false,
  bulletPoints: ["Set up 12 laptops and a shared printer for a small team, and wrote a one-page guide for new staff.", "Answered about 20 help requests a week and closed most of them the same day."] }];
seeded.coursework = [{ id: "qa-cw-1", title: "Intro to Networks (online course)", date: "May 2024" }];
seeded.showExtracurriculars = true;
seeded.extracurriculars = [{ id: "qa-ex-1", organization: "Campus coding club", role: "Peer helper", startDate: "2024", isCurrent: true,
  bulletPoints: ["Ran weekly help sessions for 15 new students learning C and Git."] }];

// Longer than one page: every project and job gets many lines
export const long = JSON.parse(JSON.stringify(seeded)) as typeof seeded;
long.projects = createInitialCVFromIntra(user).projects;
const filler = (n: number) => Array.from({ length: n }, (_, i) =>
  `Wrote part ${i + 1} of the work in C, tested it with 40 small cases and fixed every leak that Valgrind found on the way.`);
long.projects.forEach((p) => { p.bulletPoints = filler(4); });
long.experience = [0, 1].map((i) => ({ ...seeded.experience[0], id: `qa-exp-${i + 1}`, bulletPoints: filler(3) }));
long.extracurriculars = [0, 1].map((i) => ({ ...seeded.extracurriculars[0], id: `qa-ex-${i + 1}`, bulletPoints: filler(2) }));

export const draft = (state: object) => JSON.stringify({ state, version: 2 });
export const SEEDED = draft({ cvData: seeded, studentProfile: user, showExperience: true, showExtracurriculars: true });
export const LONG = draft({ cvData: long, studentProfile: user, showExperience: true, showExtracurriculars: true });
export const NOTICE = draft({ cvData: seeded, studentProfile: user, showExperience: true, showExtracurriculars: true, sampleDataRemovedNotice: true });
// A broken draft (projects is not a list). The studio throws while drawing it, so error.tsx shows (§7.9 corrupt draft).
export const CORRUPT = draft({ cvData: { projects: 5 } });

export type Visit = (screen: string, w: number, expect?: string, print?: boolean) => Promise<void>;
export type Want = (screen: string) => boolean;
export type On = (method: string, ms?: number) => Promise<any>;

// ---------- Page helpers ----------
export function events(page: Page) {
  const waiters: { method: string; res: (p: any) => void }[] = [];
  page.ws.addEventListener("message", (ev: MessageEvent) => {
    const m = JSON.parse(String(ev.data));
    if (!m.method) return;
    const i = waiters.findIndex((w) => w.method === m.method);
    if (i >= 0) waiters.splice(i, 1)[0].res(m.params);
  });
  return (method: string, ms = 10000) => new Promise<any>((res, rej) => {
    const w = { method, res };
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); rej(new Error(`no ${method} in ${ms}ms`)); } }, ms);
  });
}

// Clicks the first shown element that matches the selector (and, if given, whose text or label starts with `text`)
export const click = (page: Page, sel: string, text = "") => page.eval(`(() => {
  const t = ${JSON.stringify(text)};
  const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden') return false;
    return !t || (e.getAttribute('aria-label') || '').startsWith(t) || e.innerText.trim().startsWith(t);
  });
  if (!el) return false; el.focus(); el.click(); return true;
})()`);

export const scrollTo = (page: Page, sel: string, offset = 0) => page.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false;
  window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - ${offset})); return true;
})()`);

export async function seed(page: Page, value: string | null) {
  await page.goto(ROOT + "/robots.txt", 300);
  await page.eval(`localStorage.clear(); ${value ? `localStorage.setItem("printcv_draft_v1", ${JSON.stringify(value)});` : ""} true`);
}

export async function openStudio(page: Page, value: string | null, query = "") {
  await seed(page, value);
  await page.goto(STUDIO + query, 2500);
  if (!value) {
    let state = "missing-controller";
    for (let i = 0; i < 40; i++) {
      state = await page.eval<string>(`window.__PRINTCV_CONTROLLER__?.getState()?.state || "missing-controller"`);
      if (state === "WELCOME" || state === "EDITING_GUEST" || state === "EDITING_ACCOUNT") return;
      if (state === "RECOVERY_BLOCKED" || state === "SESSION_UNKNOWN") break;
      await sleep(250);
    }
    throw new Error(`Welcome screen did not become ready (state: ${state}).`);
  }

  // A saved global draft is intentionally unassigned. Follow the same explicit
  // ownership review and copy flow as a student instead of treating storage as
  // an already selected editor session.
  let state = "missing-controller";
  let reviewButtonText = "";
  for (let i = 0; i < 40; i++) {
    const review = await page.eval<{ state: string; button: string }>(`
      (() => {
        const state = window.__PRINTCV_CONTROLLER__?.getState()?.state || "missing-controller";
        const wanted = state === "WELCOME" ? "Review Previous session draft" : "Review Legacy Draft";
        const button = [...document.querySelectorAll("button")].find((item) =>
          item.textContent?.includes(wanted) && item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0
        );
        return { state, button: button?.textContent?.trim() || "" };
      })()
    `);
    state = review.state;
    reviewButtonText = review.button;
    if (reviewButtonText) break;
    await sleep(250);
  }
  if (!reviewButtonText) {
    throw new Error(`Previous draft review did not become available (state: ${state}).`);
  }
  if (!(await click(page, "button", reviewButtonText))) {
    throw new Error("Expected explicit review action for the previous session draft.");
  }
  await sleep(250);
  const dialogText = await page.eval<string>(`document.querySelector('[role="dialog"]')?.innerText || ""`);
  if (!dialogText.includes("Review Browser Draft") || !dialogText.includes("Keep Separate")) {
    throw new Error("The previous session draft review dialog did not show its ownership choices.");
  }
  if (!(await click(page, '[role="dialog"] button', "Copy to Workspace"))) {
    throw new Error("The reviewed draft could not be explicitly copied into the guest workspace.");
  }
  await sleep(1200);
  const copied = await page.eval<{ state: string; name: string }>(`
    (() => ({
      state: window.__PRINTCV_CONTROLLER__?.getState()?.state || "missing-controller",
      name: window.__PRINTCV_CONTROLLER__?.getCurrentDraft()?.snapshot?.cvData?.contact?.fullName || "",
    }))()
  `);
  const expectedName = JSON.parse(value).state?.cvData?.contact?.fullName || "";
  if (copied.state !== "EDITING_GUEST" || (expectedName && copied.name !== expectedName)) {
    throw new Error(`Explicit draft copy did not open the selected guest draft (state: ${copied.state}, expected name matched: ${copied.name === expectedName}).`);
  }
}

// Deterministic synthetic session for account-only browser states; never contacts 42.
export async function openAuthenticatedStudio(page: Page) {
  await seed(page, null);
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*api/auth/session*", requestStage: "Request" }] });
  const mockUser = { ...user, id: 101, login: "keyboard-qa", displayname: "Keyboard QA" };
  page.on("Fetch.requestPaused", async (params: any) => {
    try {
      const body = params.request.method === "DELETE"
        ? { success: true }
        : { authenticated: true, fresh: false, user: mockUser };
      await page.send("Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: "application/json" },
          { name: "Cache-Control", value: "no-store" },
        ],
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
      });
    } catch (error) {
      console.error("Mocked test session response failed:", String(error));
    }
  });
  try {
    await page.goto(STUDIO, 2000);
    let state = "missing-controller";
    for (let i = 0; i < 40; i++) {
      const current = await page.eval<any>(`window.__PRINTCV_CONTROLLER__?.getState()`);
      state = current?.state || "missing-controller";
      if (state === "EDITING_ACCOUNT" && current.studentId === mockUser.id) return;
      await sleep(250);
    }
    throw new Error(`Mocked authenticated editor did not become ready (state: ${state}).`);
  } finally {
    await page.send("Fetch.disable").catch(() => {});
  }
}

// Opens a section from the section tabs (a tab row below 1024px, the step bar from 1024px: the same tablist)
export const section = (page: Page, id: string, label: string) =>
  page.eval(`(() => {
    const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Sections"] [role="tab"]')].filter((e) => e.getBoundingClientRect().width);
    const el = tabs.find((e) => e.dataset.section === "${id}") || tabs.find((e) => e.innerText.trim().startsWith(${JSON.stringify(label)}));
    if (!el) return false; el.click(); return true;
  })()`);

// Shows the preview: below 1024px the bottom bar's Preview; from 1024px it is always there
export const showPreview = async (page: Page, w: number) => {
  if (w < 1024) await click(page, 'div[role="group"][aria-label="Show"] button', "Preview");
  await sleep(400);
};

// ---------- Screens ----------
export async function walkLanding(page: Page, w: number, visit: Visit, want: Want) {
  if (!"landing-hero landing-how landing-check-fail landing-check-pass landing-sample-pdf landing-sample-score landing-sample-ai landing-features landing-questions landing-start landing-footer".split(" ").some(want)) return;
  // Reduced motion: no entrance fades or crossfade, so every shot is the settled page
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await page.goto(ROOT + "/", 2000);
  const at = async (screen: string, sel: string, offset = 0, expect?: string) => {
    if (!want(screen)) return;
    await scrollTo(page, sel, offset); await sleep(300); await visit(screen, w, expect);
  };
  await at("landing-hero", "#hero");
  await at("landing-how", "#how");
  const PILLS = `[...document.querySelectorAll('#check li > span:last-child')].map((s) => s.innerText)`;
  await at("landing-check-fail", "#check", 24, `${PILLS}.includes('No')`);
  if (want("landing-check-pass")) {
    await page.eval(`(() => { const t = document.querySelector('#check textarea'); t.focus(); t.select(); return true; })()`);
    await page.send("Input.insertText", { text: "Built a Bash-like shell in C with pipes and redirections, tested against 300 edge cases." });
    await sleep(700);
    await at("landing-check-pass", "#check", 24, `${PILLS}.every((t) => t === 'Yes')`);
  }
  const tabs = ["landing-sample-pdf", "landing-sample-score", "landing-sample-ai"];
  for (let i = 0; i < tabs.length; i++) {
    if (!want(tabs[i])) continue;
    await click(page, `#out-tab-${i}`);
    await sleep(400);
    if (w >= 1024) await at(tabs[i], "#sample", 0, `!document.querySelector('#out-panel-${i}').hidden`);
    else await at(tabs[i], '#sample [role="tablist"]', 16, `!document.querySelector('#out-panel-${i}').hidden`);
  }
  await at("landing-features", "#features");
  await at("landing-questions", "#questions");
  await at("landing-start", "#start");
  await at("landing-footer", "footer");
  await page.send("Emulation.setEmulatedMedia", { features: [] });
}

export const SECTIONS: [string, string, string][] = [
  ["CONTACT", "Your details", "studio-details"], ["EXPERIENCE", "Work experience", "studio-experience"], ["PROJECTS", "Projects", "studio-projects"],
  ["EDUCATION", "Education", "studio-education"], ["SKILLS", "Skills", "studio-skills"], ["ACTIVITIES", "Courses and activities", "studio-activities"],
];
export const DIALOG = `document.querySelector('[role="dialog"]')`;
export const escape = (page: Page) => page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);

export async function walkStudio(page: Page, w: number, on: On, visit: Visit, want: Want) {
  if (want("studio-first-run")) {
    await openStudio(page, null);
    await visit("studio-first-run", w, `document.body.innerText.includes('Continue as Guest') && document.querySelector('main h1')?.innerText === 'PrintCV'`);
  }

  // Each section with the fixture
  if (SECTIONS.some(([, , s]) => want(s)) || want("studio-more-menu") || want("studio-account-menu")) {
    await openStudio(page, SEEDED);
    for (const [id, label, screen] of SECTIONS) {
      if (!want(screen)) continue;
      await section(page, id, label); await sleep(400);
      await visit(screen, w, `document.querySelector('#studio-sheet h1')?.innerText.startsWith(${JSON.stringify(label)})`);
    }
    // The More menu exists below 1024px only
    if (want("studio-more-menu") && w < 1024) {
      await click(page, 'header button[aria-haspopup="menu"]'); await sleep(300);
      await visit("studio-more-menu", w, `document.querySelector('[role="menu"]')`);
      await escape(page); await sleep(200);
    }
    // The account menu (the initials circle) takes its place from 1024px
    if (want("studio-account-menu") && w >= 1024) {
      await openAuthenticatedStudio(page);
      await click(page, '[data-test-id="account-button"]'); await sleep(300);
      await visit("studio-account-menu", w, `document.querySelector('[role="menu"]')`);
      await escape(page); await sleep(200);
    }
  }

  if (want("studio-preview") || want("studio-fullscreen")) {
    await openStudio(page, SEEDED);
    await showPreview(page, w);
    if (want("studio-preview")) await visit("studio-preview", w, `document.querySelector('[data-test-id="preview-a4"]').getBoundingClientRect().width > 100`);
    if (want("studio-fullscreen")) {
      await click(page, 'button[aria-label="Full screen"]'); await sleep(400);
      await visit("studio-fullscreen", w, `document.querySelector('button[aria-label="Exit full screen"]')`);
    }
  }

  // Longer than 1 page, then "Make it fit" (its message is an info toast)
  if (want("studio-long") || want("studio-long-fit")) {
    await openStudio(page, LONG);
    await showPreview(page, w);
    await visit("studio-long", w, `document.body.innerText.includes('Longer than 1 page')`);
    await click(page, "button", "Make it fit"); await sleep(500);
    await visit("studio-long-fit", w, `document.body.innerText.includes('Spacing made smaller')`);
  }

  // Score dialog, three tabs
  if (["studio-score-overview", "studio-score-issues", "studio-score-compare"].some(want)) {
    await openStudio(page, SEEDED);
    await click(page, '[data-test-id="score-button"]'); await sleep(500);
    await visit("studio-score-overview", w, `document.querySelector('[data-test-id="score-dialog"]')`);
    await click(page, '[role="dialog"] [role="tab"]', "Fix lines"); await sleep(300);
    await visit("studio-score-issues", w, `document.querySelector('[data-test-id="score-issue"]')`);
    await click(page, '[role="dialog"] [role="tab"]', "Compare with a job ad"); await sleep(300);
    await visit("studio-score-compare", w, `document.querySelector('#score-tab-matcher[aria-selected="true"]')`);
    await escape(page);
  }

  // Section order: the preview toolbar button from 1024, the More menu below
  if (want("studio-order")) {
    await openStudio(page, SEEDED);
    if (w >= 1024) await click(page, '[data-test-id="order-button"]');
    else { await click(page, 'header button[aria-haspopup="menu"]'); await sleep(200); await click(page, '[role="menuitem"]', "Order"); }
    await sleep(400);
    await visit("studio-order", w, `document.querySelector('[aria-labelledby="section-order-title"]')`);
    await escape(page);
  }

  // Help me write is an offline prompt and manual-paste workflow; never submit a paid AI request here.
  if (["studio-helper-1", "studio-helper-2", "studio-helper-3", "studio-helper-error", "studio-toast-info"].some(want)) {
    await openStudio(page, SEEDED);
    await click(page, '[data-test-id="helper-button"]'); await sleep(500);
    await visit("studio-helper-1", w, `${DIALOG} && document.querySelector('[aria-current="step"]').innerText.includes('1.')`);
    await page.eval(`(() => { const t = ${DIALOG}.querySelector('textarea'); t.focus(); return true; })()`);
    await page.send("Input.insertText", { text: "A small web server in C++ that serves files and runs CGI scripts." });
    await click(page, '[role="dialog"] button', "Next: Generate Bullets"); await sleep(400);
    await visit("studio-helper-2", w, `document.querySelector('[aria-current="step"]').innerText.includes('Generate')`);
    await click(page, '[role="dialog"] [aria-label="Help Me Write Steps"] button', "3. Review"); await sleep(400);
    await click(page, '[role="dialog"] button', "Paste External AI Reply"); await sleep(250);
    await visit("studio-helper-error", w, `document.querySelector('#manual-ai-reply') && [...${DIALOG}.querySelectorAll('button')].some((b) => b.innerText.includes('Replace My Lines') && b.disabled)`);
    await page.eval(`(() => { const t = document.querySelector('#manual-ai-reply'); t.focus(); return true; })()`);
    await page.send("Input.insertText", { text: "- Built an HTTP/1.1 server in C++ that served static files and CGI scripts.\n- Fixed two memory leaks found with Valgrind under load.\n- Tested the server with siege at 500 open connections." });
    await sleep(400);
    await visit("studio-helper-3", w, `${DIALOG}.innerText.includes('Parsed 3 bullet point(s)') && ${DIALOG}.innerText.includes('Add Below Mine')`);
    await click(page, '[role="dialog"] button', "Add Below Mine"); await sleep(500);
    await visit("studio-toast-info", w, `!document.querySelector('[role="dialog"]')`);
  }

  // Undo toast after removing a project
  if (want("studio-toast-undo")) {
    await openStudio(page, SEEDED);
    await click(page, 'button[aria-label="Remove project"]'); await sleep(500);
    await visit("studio-toast-undo", w, `document.body.innerText.includes('Removed "')`);
  }

  // Loading: the server HTML, before any script runs
  if (want("studio-loading")) {
    await seed(page, SEEDED);
    await page.send("Emulation.setScriptExecutionDisabled", { value: true });
    await page.goto(STUDIO, 1500);
    await visit("studio-loading", w, `document.querySelector('[aria-busy="true"]')`);
    await page.send("Emulation.setScriptExecutionDisabled", { value: false });
  }

  // Login in progress: hold the session request, take the shot, then answer it with the test user
  if (want("studio-login") || want("studio-login-done")) {
    await seed(page, null);
    await page.send("Fetch.enable", { patterns: [{ urlPattern: "*api/auth/session*", requestStage: "Request" }] });
    const paused = on("Fetch.requestPaused", 15000);
    await page.send("Page.navigate", { url: STUDIO + "?login=qa-code" });
    const req = await paused;
    await sleep(500);
    await visit("studio-login", w, `document.body.innerText.includes('Getting your 42 projects')`);
    const body = Buffer.from(JSON.stringify({ authenticated: true, fresh: true, user })).toString("base64");
    await page.send("Fetch.fulfillRequest", { requestId: req.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body });
    await page.send("Fetch.disable");
    await sleep(1500);
    await visit("studio-login-done", w, `document.querySelector('[id^="item-"]')`);
  }

  // Login errors: every code from auth-errors.ts, plus an unknown one
  for (const code of [...Object.keys(AUTH_ERROR_MESSAGES), "garbage"]) {
    const screen = `studio-error-${code}`;
    if (!want(screen)) continue;
    const message = AUTH_ERROR_MESSAGES[(code in AUTH_ERROR_MESSAGES ? code : "failed") as keyof typeof AUTH_ERROR_MESSAGES];
    await openStudio(page, null, `?error=${code}`);
    await visit(screen, w, `document.querySelector('[role="alert"]')?.innerText.includes(${JSON.stringify(message)})`);
  }

  if (want("studio-sample-notice")) {
    await openStudio(page, NOTICE);
    await visit("studio-sample-notice", w, `document.body.innerText.includes('We removed the example CV')`);
  }

  // error.tsx, reached through a broken saved draft (no code change needed)
  if (want("studio-error-boundary")) {
    await openStudio(page, CORRUPT);
    await visit("studio-error-boundary", w, `document.body.innerText.includes('Something went wrong')`);
  }

  if (want("print-media")) {
    await openStudio(page, SEEDED);
    await page.send("Emulation.setEmulatedMedia", { media: "print" });
    await sleep(300);
    await visit("print-media", w, `matchMedia('print').matches && document.querySelector('.print-root .cv-sheet')`, true);
    await page.send("Emulation.setEmulatedMedia", { media: "" });
  }
  await seed(page, null);
}
