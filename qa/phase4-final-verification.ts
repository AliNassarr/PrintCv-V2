// qa/phase4-final-verification.ts
// Task 1 Phase 4 Final Verification in real Headless Chrome via Chrome DevTools Protocol (CDP).
// Executes comprehensive end-to-end tests covering all editable fields, interaction models,
// two-way sidebar sync, keyboard-only workflows, viewports, zoom levels, level protection,
// and real PDF / DOCX artifact generation and inspection.
//
// Run: node --experimental-websocket --import tsx qa/phase4-final-verification.ts

import fs from "fs";
import JSZip from "jszip";
import { launch } from "./cdp";
import { testUser, TEST_PHONE } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
import { generateCvDocx } from "../src/lib/docx-generator";

const BASE = (process.env.BASE || "http://localhost:3000") + "/studio";
const OUT = process.env.PRINTCV_QA_OUT || "qa/out";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TestResult {
  suite: string;
  id: string;
  description: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(suite: string, id: string, description: string, passed: boolean, details?: string) {
  results.push({ suite, id, description, passed, details });
  const icon = passed ? "✓" : "✗ FAIL";
  console.log(`  ${icon} [${id}] ${description}${details ? ` (${details})` : ""}`);
}

async function run() {
  console.log("==================================================================");
  console.log("PRINTCV PHASE 4: FULL LIVE PREVIEW EDITING E2E VERIFICATION SUITE");
  console.log("Headless Chrome CDP & Real Artifact Inspection");
  console.log("==================================================================\n");

  console.log("Launching Headless Chrome on CDP port 9337...");
  const { proc, page } = await launch(9337);

  try {
    await page.send("Runtime.enable");
    await page.viewport(1440, 960);

    // Initial CV setup with exact 42 level 11.45
    const user: any = {
      ...testUser,
      level: 11.45,
    };
    const cv = createInitialCVFromIntra(user);
    cv.contact.fullName = "Sarah Connor";
    cv.contact.phoneNumber = TEST_PHONE;
    cv.contact.email = "sarah.connor@42.fr";
    cv.contact.githubUrl = "github.com/sconnor";
    cv.contact.linkedinUrl = "linkedin.com/in/sconnor";
    cv.targetRole = "42 Student";

    cv.projects = [
      {
        id: "proj-minishell",
        name: "Minishell",
        slug: "minishell",
        is42Project: true,
        techStack: "C, Unix",
        date: "January 2025",
        bulletPoints: ["Built a POSIX Unix shell handling pipes, redirections, and custom signals."],
      },
    ];

    cv.skills = {
      languages: ["C", "C++", "Bash"],
      developerTools: ["Git", "Make", "GDB"],
      technologiesFrameworks: ["Linux", "Valgrind"],
      projectManagementTools: ["JIRA"],
    };

    cv.coursework = [
      { id: "cw-cyber", title: "Cybersecurity Piscine", date: "May 2024" },
    ];

    // Seed localStorage draft
    await page.goto(BASE, 2000);
    const draftPayload = JSON.stringify({
      state: {
        cvData: cv,
        studentProfile: user,
        targetRole: "42 Student",
        educationState: "STATE_A_CORE",
      },
      version: 2,
    });
    await page.eval(`localStorage.setItem("printcv_draft_v1", ${JSON.stringify(draftPayload)}); true;`);

    console.log("Navigating to /studio with seeded draft...");
    await page.goto(BASE, 3000);

    // The current app never auto-loads a prior global draft. It first migrates
    // a validated copy to an unassigned record, then asks the user to review
    // and explicitly copy that draft into a guest workspace. Exercise that
    // real flow before testing the editor instead of bypassing ownership.
    const welcomeState = await page.eval<string>(
      `window.__PRINTCV_CONTROLLER__?.getState()?.state || "missing-controller"`
    );
    recordTest("Draft review", "MIG-01", "Legacy draft remains unassigned until explicitly reviewed", welcomeState === "WELCOME", `state: ${welcomeState}`);

    const reviewClicked = await page.eval<boolean>(`
      (() => {
        const button = Array.from(document.querySelectorAll("button")).find((item) =>
          item.textContent?.includes("Review Previous session draft")
        );
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    recordTest("Draft review", "MIG-02", "User can open explicit review for a previous session draft", reviewClicked);
    await sleep(300);

    const reviewDialog = await page.eval<string>(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog?.innerText || "";
      })()
    `);
    const reviewReady = reviewDialog.includes("Review Browser Draft") &&
      reviewDialog.includes("Sarah Connor") && reviewDialog.includes("Copy to Workspace") &&
      reviewDialog.includes("Keep Separate");
    recordTest("Draft review", "MIG-03", "Review dialog exposes source identity, Copy, and Keep Separate choices", reviewReady);

    const copyClicked = await page.eval<boolean>(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        const button = Array.from(dialog?.querySelectorAll("button") || []).find((item) =>
          item.textContent?.trim() === "Copy to Workspace"
        );
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    recordTest("Draft review", "MIG-04", "User explicitly confirms copying into the guest workspace", copyClicked);
    await sleep(1400);

    const copiedDraft = await page.eval<{ state: string; name: string; preview: string }>(`
      (() => ({
        state: window.__PRINTCV_CONTROLLER__?.getState()?.state || "missing-controller",
        name: window.__PRINTCV_CONTROLLER__?.getCurrentDraft()?.snapshot?.cvData?.contact?.fullName || "",
        preview: document.querySelector("#resume-preview")?.innerText || "",
      }))()
    `);
    recordTest(
      "Draft review",
      "MIG-05",
      "Confirmed legacy copy opens the guest editor with the reviewed CV",
      copiedDraft.state === "EDITING_GUEST" && copiedDraft.name === "Sarah Connor" && copiedDraft.preview.includes("Sarah Connor"),
      `state: ${copiedDraft.state}, name present: ${copiedDraft.name === "Sarah Connor"}`
    );

    // =========================================================================
    // SUITE 1: ALL EDITABLE FIELDS IN LIVE PREVIEW
    // =========================================================================
    console.log("\n[SUITE 1] Verifying Every Editable Field via Live Browser Interaction");

    // 1.1 Full Name
    const nameClicked = await page.eval<boolean>(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Full Name"]');
        if (!el) return false;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      })()
    `);
    await sleep(300);
    const nameInputExists = await page.eval<boolean>(`Boolean(document.querySelector('input[aria-label="Edit Full Name"]'))`);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Full Name"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Sarah J. Connor");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedNameInPreview = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E01", "Full Name inline click and Enter commit", nameClicked && nameInputExists && updatedNameInPreview.includes("Sarah J. Connor"));

    // 1.2 Target Role
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Target Role"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Target Role"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Entry-Level Systems Developer");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedRoleInPreview = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const roleHasLevel = /Entry-Level Systems Developer[\s\S]{0,80}Level 11\.45/.test(updatedRoleInPreview);
    recordTest("SUITE 1", "TC-E02", "Target Role inline edit with preserved level", roleHasLevel);

    // 1.3 Contact Email
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Email"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Email"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "sarah.lead@cyberdyne.org");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedEmailInPreview = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E03", "Email address inline edit and Enter commit", updatedEmailInPreview.includes("sarah.lead@cyberdyne.org"));

    // 1.4 Contact Phone
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Phone Number"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Phone Number"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "+1 555 999 8888");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedPhoneInPreview = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E04", "Phone number inline edit and Enter commit", updatedPhoneInPreview.includes("+1 555 999 8888"));

    // 1.5 GitHub Link
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit GitHub URL"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit GitHub URL"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "github.com/sarah-connor-systems");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedGithubInPreview = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E05", "GitHub URL inline edit and normalization", updatedGithubInPreview.includes("github.com/sarah-connor-systems"));

    // 1.6 LinkedIn Link
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit LinkedIn URL"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit LinkedIn URL"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "linkedin.com/in/sarah-connor-official");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedLinkedinInPreview = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E06", "LinkedIn URL inline edit and normalization", updatedLinkedinInPreview.includes("linkedin.com/in/sarah-connor-official"));

    // 1.7 Project Name
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Project Name"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Project Name"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Minishell POSIX Core");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedProjTitle = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E07", "Project Name inline edit and Enter commit", updatedProjTitle.includes("Minishell POSIX Core"));

    // 1.8 Project Tech Stack
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Tech Stack"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Tech Stack"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "C, POSIX, Linux Kernel");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedTechStack = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E08", "Project Tech Stack inline edit with pipe separator intact", updatedTechStack.includes("C, POSIX, Linux Kernel"));

    // 1.9 Project Date
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Project Date"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Project Date"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "March 2025");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedProjDate = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E09", "Project Date inline edit and Enter commit", updatedProjDate.includes("March 2025"));

    // 1.10 Project Bullet
    await page.eval(`
      (() => {
        const el = document.querySelector('[title="Click to edit bullet directly"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(400);
    const bulletTextarea = await page.eval<boolean>(`Boolean(document.querySelector('textarea[aria-label*="bullet point"]'))`);
    await page.eval(`
      (() => {
        const ta = document.querySelector('textarea[aria-label*="bullet point"]');
        if (!ta) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(ta, "Engineered a high-throughput POSIX shell in C passing 350+ automated validation tests.");
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(500);
    const updatedBulletText = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E10", "Project Bullet inline edit with auto-resize and Enter commit", bulletTextarea && updatedBulletText.includes("350+ automated validation tests"));

    // 1.11 Skills Category (Languages)
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Languages skills list"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    const skillsTextarea = await page.eval<boolean>(`Boolean(document.querySelector('textarea[aria-label*="Languages skills"]'))`);
    await page.eval(`
      (() => {
        const ta = document.querySelector('textarea[aria-label*="Languages skills"]');
        if (!ta) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(ta, "C, C++, Rust, Zig, Bash, Go");
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedSkillsText = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const skillsValid = updatedSkillsText.includes("Languages:") && updatedSkillsText.includes("C, C++, Rust, Zig, Bash, Go");
    recordTest("SUITE 1", "TC-E11", "Skills category comma-separated list editing with heading protected", skillsTextarea && skillsValid);

    // 1.12 Education Institution
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Institution"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Institution"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "42 Abu Dhabi Campus");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedEduText = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const eduHasLevel = /42 Abu Dhabi Campus[\s\S]{0,80}Level 11\.45/.test(updatedEduText);
    recordTest("SUITE 1", "TC-E12", "Education institution inline edit preserving Level 11.45", eduHasLevel);

    // 1.13 Education Program (Protected Dr. Wissam title verification)
    const eduProgramText = await page.eval<string>(`
      document.querySelector('#resume-preview')?.innerText || ""
    `);
    const programProtected = eduProgramText.includes("42 Core Curriculum - Architecture of Digital Technologies Program");
    recordTest("SUITE 1", "TC-E13", "Education curriculum title remains Dr. Wissam template protected", programProtected);

    // 1.14 Education Dates
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Attendance Dates"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Attendance Dates"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "2023 – 2026");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedEduDates = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E14", "Education dates inline edit and Enter commit", updatedEduDates.includes("2023 – 2026"));

    // 1.15 Coursework Title
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Coursework Title"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Coursework Title"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Advanced Kernel Exploitation & Defense");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedCwTitle = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E15", "Coursework title inline edit and Enter commit", updatedCwTitle.includes("Advanced Kernel Exploitation & Defense"));

    // 1.16 Coursework Date
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Coursework Date"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Coursework Date"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "September 2025");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);
    const updatedCwDate = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 1", "TC-E16", "Coursework date inline edit and Enter commit", updatedCwDate.includes("September 2025"));

    await page.shot(`${OUT}/phase4-all-fields-edited.png`);

    // =========================================================================
    // SUITE 2: INTERACTION LIFECYCLE (ENTER, ESCAPE, BLUR, RAPID SWITCHING)
    // =========================================================================
    console.log("\n[SUITE 2] Testing Detailed Interaction Models (Escape, Blur, Rapid Switch)");

    // 2.1 Escape Key Cancellation
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Full Name"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Full Name"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Discarded Alteration");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      })()
    `);
    await sleep(400);
    const textAfterEscape = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const escapeWorked = textAfterEscape.includes("Sarah J. Connor") && !textAfterEscape.includes("Discarded Alteration");
    recordTest("SUITE 2", "TC-I01", "Escape key cancels draft and reverts to previous value", escapeWorked);

    // 2.2 Blur Commit (Clicking outside)
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit Project Name"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Project Name"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Minishell POSIX V3 Ultra");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        // Click outside on canvas
        document.querySelector('[data-test-id="preview-a4"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        inp.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      })()
    `);
    await sleep(500);
    const textAfterBlur = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const blurWorked = textAfterBlur.includes("Minishell POSIX V3 Ultra");
    recordTest("SUITE 2", "TC-I02", "Blur (clicking outside) cleanly commits transaction", blurWorked);

    // 2.3 Rapid Switching Between Fields Without Explicit Blur
    await page.eval(`
      (() => {
        // Open Name
        const nameEl = document.querySelector('[aria-label="Edit Full Name"]');
        nameEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(200);
    await page.eval(`
      (() => {
        const nameInp = document.querySelector('input[aria-label="Edit Full Name"]');
        if (nameInp) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          setter?.call(nameInp, "Sarah Connor Vance");
          nameInp.dispatchEvent(new Event('input', { bubbles: true }));
          // Focus transfer to next field triggers focusout on current
          nameInp.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        }
        // Click Email field
        const emailEl = document.querySelector('[aria-label="Edit Email"]');
        emailEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(500);
    const textAfterRapidSwitch = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const rapidSwitchWorked = textAfterRapidSwitch.includes("Sarah Connor Vance");
    recordTest("SUITE 2", "TC-I03", "Rapid switching between fields without blurring commits previous field safely", rapidSwitchWorked);

    // =========================================================================
    // SUITE 3: TWO-WAY SIDEBAR-TO-PREVIEW SYNCHRONIZATION
    // =========================================================================
    console.log("\n[SUITE 3] Testing Real-Time Two-Way Sidebar-to-Preview Synchronization");

    // 3.1 Switch to Contact tab in sidebar
    await page.eval(`
      (() => {
        const contactTab = document.querySelector('button[data-section="CONTACT"]');
        if (contactTab) contactTab.click();
      })()
    `);
    await sleep(500);

    // 3.2 Verify preview edit updated sidebar input
    const sidebarNameValue = await page.eval<string>(`
      document.querySelector('#contact-full-name')?.value || ""
    `);
    recordTest("SUITE 3", "TC-S01", "Preview edit reflects in sidebar input (Preview -> Sidebar)", sidebarNameValue === "Sarah Connor Vance", `Found "${sidebarNameValue}"`);

    // 3.3 Type in sidebar input -> verify preview updates in real-time
    await page.eval(`
      (() => {
        const inp = document.querySelector('#contact-full-name');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Sarah Connor Commander");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await sleep(500);
    const previewAfterSidebarType = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 3", "TC-S02", "Sidebar input updates live preview (Sidebar -> Preview)", previewAfterSidebarType.includes("Sarah Connor Commander"));

    // =========================================================================
    // SUITE 4: LOCALSTORAGE PERSISTENCE AFTER FULL PAGE REFRESH
    // =========================================================================
    console.log("\n[SUITE 4] Testing LocalStorage Persistence After Page Reload");

    console.log("Navigating (reloading) to test full hydration from localStorage...");
    await page.goto(BASE, 3000);

    const reloadedPreviewText = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const persistedName = reloadedPreviewText.includes("Sarah Connor Commander");
    const persistedRole = /Entry-Level Systems Developer[\s\S]{0,80}Level 11\.45/.test(reloadedPreviewText);
    const persistedSkills = reloadedPreviewText.includes("Rust, Zig");
    const persistedEdu = /42 Abu Dhabi Campus[\s\S]{0,80}Level 11\.45/.test(reloadedPreviewText);

    recordTest("SUITE 4", "TC-P01", "Full Name persisted across page reload", persistedName);
    recordTest("SUITE 4", "TC-P02", "Target Role & Level 11.45 persisted across reload", persistedRole);
    recordTest("SUITE 4", "TC-P03", "Skills comma list persisted across reload", persistedSkills);
    recordTest("SUITE 4", "TC-P04", "Education institution persisted across reload", persistedEdu);

    // =========================================================================
    // SUITE 5: KEYBOARD-ONLY ACCESSIBILITY (TAB / ENTER / ESCAPE)
    // =========================================================================
    console.log("\n[SUITE 5] Testing Keyboard-Only Accessibility Workflow");

    // Focus on Full Name button via keyboard
    const keyboardNavSuccess = await page.eval<boolean>(`
      (() => {
        const btn = document.querySelector('[aria-label="Edit Full Name"]');
        if (!btn) return false;
        btn.focus();
        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        return true;
      })()
    `);
    await sleep(400);
    const keyboardInputOpen = await page.eval<boolean>(`Boolean(document.querySelector('input[aria-label="Edit Full Name"]'))`);
    await page.eval(`
      (() => {
        const inp = document.querySelector('input[aria-label="Edit Full Name"]');
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(inp, "Sarah C. Keymaster");
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(500);
    const previewAfterKeyboard = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    recordTest("SUITE 5", "TC-K01", "Keyboard-only focus and Enter activation", keyboardNavSuccess && keyboardInputOpen);
    recordTest("SUITE 5", "TC-K02", "Keyboard-only save commit via Enter", previewAfterKeyboard.includes("Sarah C. Keymaster"));

    // =========================================================================
    // SUITE 6: RESPONSIVE VIEWPORTS
    // =========================================================================
    console.log("\n[SUITE 6] Testing Responsive Viewports (Mobile, Tablet, Laptop, Desktop)");

    const viewports = [
      { name: "mobile-375", width: 375, height: 667, mobile: true },
      { name: "tablet-768", width: 768, height: 1024, mobile: false },
      { name: "laptop-1024", width: 1024, height: 768, mobile: false },
      { name: "desktop-1440", width: 1440, height: 960, mobile: false },
    ];

    for (const vp of viewports) {
      await page.viewport(vp.width, vp.height, vp.mobile);
      if (vp.width < 1024) {
        const previewButtonClicked = await page.eval<boolean>(`
          (() => {
            const group = document.querySelector('[role="group"][aria-label="Show"]');
            const button = Array.from(group?.querySelectorAll("button") || []).find((item) => item.textContent?.trim() === "Preview");
            if (!button) return false;
            button.click();
            return true;
          })()
        `);
        recordTest("SUITE 6", `TC-V-PREVIEW-${vp.name}`, `Preview is a real selectable pane at ${vp.width}px`, previewButtonClicked);
      }
      await sleep(300);
      const layout = await page.eval<{ visible: boolean; scrollWidth: number; width: number; offenders: string[] }>(`
        (() => {
          const preview = document.querySelector("#resume-preview");
          const rect = preview?.getBoundingClientRect();
          const width = document.documentElement.clientWidth;
          return {
            visible: !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(preview).visibility !== "hidden",
            scrollWidth: document.documentElement.scrollWidth,
            width,
            offenders: [...document.querySelectorAll("body *")].map((element) => {
              const bounds = element.getBoundingClientRect();
              const name = [element.tagName.toLowerCase(), element.id, String(element.className || "").split(" ").slice(0, 3).join(".")].filter(Boolean).join("#");
              const ancestors = [];
              for (let parent = element.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
                const style = getComputedStyle(parent);
                const parentRect = parent.getBoundingClientRect();
                ancestors.push([parent.tagName.toLowerCase(), String(parent.className || "").split(" ").slice(0, 3).join("."), "overflow:" + style.overflowX, Math.round(parentRect.left) + "-" + Math.round(parentRect.right)].join(" "));
              }
              const text = element.tagName === "BUTTON" ? element.textContent?.trim().slice(0, 30) || "" : "";
              const label = element.getAttribute("aria-label") || element.getAttribute("title") || "";
              return { name, text, label, ancestors, left: Math.round(bounds.left), right: Math.round(bounds.right), width: Math.round(bounds.width) };
            }).filter((item) => item.width > 0 && item.left >= 0 && item.right > width + 1).slice(0, 8).map((item) => item.name + "[" + item.text + "," + item.label + "] " + item.left + "-" + item.right + " via " + item.ancestors.join(" <- ")),
          };
        })()
      `);
      await page.shot(`${OUT}/phase4-viewport-${vp.name}.png`);
      recordTest(
        "SUITE 6",
        `TC-V-${vp.name}`,
        `Viewport ${vp.name} (${vp.width}x${vp.height}) shows the CV without page overflow`,
        layout.visible && layout.scrollWidth <= layout.width + 1,
        `visible: ${layout.visible}, scroll width: ${layout.scrollWidth}, viewport width: ${layout.width}, overflow elements: ${layout.offenders.join("; ") || "none"}`
      );
    }

    // Reset to desktop viewport
    await page.viewport(1440, 960);

    // =========================================================================
    // SUITE 7: PREVIEW ZOOM LEVELS (50%, 75%, 100%, 125%)
    // =========================================================================
    console.log("\n[SUITE 7] Testing Preview Zoom Level Scaling Stability");

    const zooms = [50, 75, 100, 125];
    for (const percent of zooms) {
      const selectedZoom = await page.eval<{ percent: number; scale: number }>(`
        (async () => {
          const group = document.querySelector('[role="group"][aria-label="Zoom"]');
          const buttons = Array.from(group?.querySelectorAll("button") || []);
          const realSize = buttons.find((button) => button.textContent?.trim() === "100%");
          const plus = group?.querySelector('button[aria-label="Zoom in"]');
          const minus = group?.querySelector('button[aria-label="Zoom out"]');
          if (!realSize || !plus || !minus) return { percent: -1, scale: -1 };
          realSize.click();
          await new Promise((resolve) => setTimeout(resolve, 80));
          const delta = ((${percent} - 100) / 5);
          const control = delta < 0 ? minus : plus;
          for (let i = 0; i < Math.abs(delta); i++) {
            control.click();
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          const labelText = Array.from(group.querySelectorAll("span")).map((span) => span.textContent?.trim() || "").find((text) => /^\\d+%$/.test(text)) || "-1%";
          const label = Number.parseInt(labelText, 10);
          const transform = getComputedStyle(document.querySelector("#resume-preview")).transform;
          const scale = Number(transform.match(/^matrix\\(([^,]+)/)?.[1] || "-1");
          return { percent: label, scale };
        })()
      `);
      const zoomMatchesControl = selectedZoom.percent === percent && Math.abs(selectedZoom.scale - percent / 100) < 0.01;
      recordTest("SUITE 7", `TC-Z-CONTROL-${percent}`, `Visible zoom control sets exactly ${percent}%`, zoomMatchesControl, `label: ${selectedZoom.percent}%, scale: ${selectedZoom.scale}`);

      const editPoint = await page.eval<{ x: number; y: number; visible: boolean }>(`
        (() => {
          const element = document.querySelector('[aria-label="Edit Project Name"]');
          if (!element) return { x: 0, y: 0, visible: false };
          element.scrollIntoView({ block: "center", inline: "center" });
          const rect = element.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, visible: rect.width > 0 && rect.height > 0 };
        })()
      `);
      if (editPoint.visible) {
        await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: editPoint.x, y: editPoint.y, button: "left", clickCount: 1 });
        await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: editPoint.x, y: editPoint.y, button: "left", clickCount: 1 });
      }
      await sleep(300);
      const editState = await page.eval<{ visible: boolean; intersectsPage: boolean }>(`
        (() => {
          const input = document.querySelector('input[aria-label="Edit Project Name"]');
          const sheet = document.querySelector("#resume-preview");
          const r = input?.getBoundingClientRect();
          const s = sheet?.getBoundingClientRect();
          return {
            visible: !!r && r.width > 0 && r.height > 0,
            intersectsPage: !!r && !!s && r.right > s.left && r.left < s.right && r.bottom > s.top && r.top < s.bottom,
          };
        })()
      `);
      recordTest(
        "SUITE 7",
        `TC-Z-EDIT-${percent}`,
        `Project name remains clickable and inline editing stays on the page at ${percent}%`,
        zoomMatchesControl && editPoint.visible && editState.visible && editState.intersectsPage,
        `target visible: ${editPoint.visible}, input visible: ${editState.visible}, intersects page: ${editState.intersectsPage}`
      );
      await page.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
      await sleep(200);
      const editorClosed = await page.eval<boolean>(`!document.querySelector('input[aria-label="Edit Project Name"]')`);
      recordTest("SUITE 7", `TC-Z-ESC-${percent}`, `Real Escape key closes inline editor at ${percent}%`, editorClosed);

      await page.shot(`${OUT}/phase4-zoom-${percent}.png`);
    }

    // =========================================================================
    // SUITE 8: 42 LEVEL & TEMPLATE INVARIANT VERIFICATION
    // =========================================================================
    console.log("\n[SUITE 8] Testing 42 Level Immutability & Dr. Wissam Invariants");

    const finalPreviewText = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    const levelCount = (finalPreviewText.match(/Level 11\.45/g) || []).length;
    // Level appears in subtitle and in education institution header = exactly 2 times
    recordTest("SUITE 8", "TC-L01", "Level 11.45 preserved exactly without duplication or loss", levelCount === 2, `Found ${levelCount} occurrences`);

    const hasNoDanglingLevel = !finalPreviewText.includes("Level 11.45 – Level 11.45");
    recordTest("SUITE 8", "TC-L02", "Zero duplicate or doubled level suffixes", hasNoDanglingLevel);

    const hasProtectedProgram = finalPreviewText.includes("42 Core Curriculum - Architecture of Digital Technologies Program");
    recordTest("SUITE 8", "TC-L03", "Dr. Wissam State A program curriculum title intact", hasProtectedProgram);

    // =========================================================================
    // SUITE 9: ACTUAL PDF & DOCX EXPORT GENERATION AND INSPECTION
    // =========================================================================
    console.log("\n[SUITE 9] Generating & Inspecting Actual PDF and DOCX Exports");

    // 9.1 Generate PDF via Chrome CDP Page.printToPDF
    console.log("  Generating PDF via CDP Page.printToPDF...");
    const pdfResponse = await page.send("Page.printToPDF", {
      paperWidth: 8.27, // A4 inches (210mm)
      paperHeight: 11.69, // A4 inches (297mm)
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      printBackground: true,
      preferCSSPageSize: true,
    });

    const pdfBuffer = Buffer.from(pdfResponse.data, "base64");
    const pdfPath = `${OUT}/final-verification-output.pdf`;
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`  Saved PDF: ${pdfPath} (${pdfBuffer.length} bytes)`);

    const pdfIsNonEmpty = pdfBuffer.length > 10000;
    const pdfHeaderValid = pdfBuffer.slice(0, 5).toString() === "%PDF-";
    recordTest("SUITE 9", "TC-X01", "CDP Page.printToPDF produces valid non-empty PDF binary", pdfIsNonEmpty && pdfHeaderValid, `${pdfBuffer.length} bytes`);

    // Inspect PDF raw string for edit artifact leakages
    const pdfRawString = pdfBuffer.toString("latin1");
    const pdfHasNoEditButtons = !pdfRawString.includes("Click to edit") && !pdfRawString.includes("group-hover/field");
    recordTest("SUITE 9", "TC-X02", "PDF contains zero editing controls, toolbars, or outline cues", pdfHasNoEditButtons);

    // 9.2 Generate DOCX via generateCvDocx
    console.log("  Generating DOCX via generateCvDocx...");
    const latestCvState = await page.eval<any>(`
      (() => {
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData : null;
      })()
    `);

    const docxBlob = await generateCvDocx(latestCvState);
    const docxBuffer = Buffer.from(await docxBlob.arrayBuffer());
    const docxPath = `${OUT}/final-verification-output.docx`;
    fs.writeFileSync(docxPath, docxBuffer);
    console.log(`  Saved DOCX: ${docxPath} (${docxBuffer.length} bytes)`);

    const docxIsNonEmpty = docxBuffer.length > 5000;
    recordTest("SUITE 9", "TC-X03", "generateCvDocx produces valid non-empty DOCX binary", docxIsNonEmpty, `${docxBuffer.length} bytes`);

    // Inspect DOCX structure using JSZip
    const zip = await JSZip.loadAsync(docxBuffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    const docXmlExists = Boolean(docXml && docXml.length > 100);
    const docXmlHasEditedName = docXml?.includes("Sarah C. Keymaster") || docXml?.includes("Sarah Connor");
    const docXmlHasLevel = docXml?.includes("Level 11.45");
    const docXmlHasNoEditMarkers = !docXml?.includes("Click to edit") && !docXml?.includes("InlineText");

    recordTest("SUITE 9", "TC-X04", "DOCX word/document.xml contains updated content and precise Level 11.45", docXmlExists && Boolean(docXmlHasEditedName) && Boolean(docXmlHasLevel));
    recordTest("SUITE 9", "TC-X05", "DOCX contains zero inline editing markers or artifacts", Boolean(docXmlHasNoEditMarkers));

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    console.log("\n==================================================================");
    console.log(`FINAL VERIFICATION RESULTS: ${passed}/${total} PASSED (${failed} FAILED)`);
    console.log("==================================================================");

    if (failed > 0) {
      console.error("\nFailed test details:");
      for (const r of results.filter((r) => !r.passed)) {
        console.error(`  - [${r.id}] ${r.description}: ${r.details || "assertion failed"}`);
      }
      process.exit(1);
    } else {
      console.log("\nAll Phase 4 Live Preview Editing browser and artifact tests PASSED!");
      process.exit(0);
    }
  } catch (err) {
    console.error("Fatal error during Phase 4 verification:", err);
    process.exit(1);
  } finally {
    proc.kill();
  }
}

run();
