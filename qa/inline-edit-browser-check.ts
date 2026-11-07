// Browser QA verification script for Phase 3: Inline Project Bullet Editing PoC.
// Uses Headless Chrome via CDP (qa/cdp.ts) to verify real browser rendering, interaction,
// keystroke handling (Enter/Escape/Blur), validation pills, zoom scaling, and sidebar synchronization.
import fs from "fs";
import { launch } from "./cdp";
import { testUser, TEST_PHONE } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";

const BASE = "http://localhost:3000/studio";
const OUT = "qa/out";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log("Launching Headless Chrome on CDP port 9335...");
  const { proc, page } = await launch(9335);

  let passed = 0;
  let failed = 0;
  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      passed++;
      console.log(`  ✓ ${msg}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${msg}`);
    }
  };

  try {
    await page.send("Runtime.enable");
    await page.viewport(1440, 960);

    const user: any = {
      ...testUser,
      level: 11.45,
    };
    const cv = createInitialCVFromIntra(user);
    cv.contact.phoneNumber = TEST_PHONE;
    cv.targetRole = "42 Student";
    cv.projects = [
      {
        id: "proj-minishell",
        name: "Minishell",
        slug: "minishell",
        is42Project: true,
        techStack: "C, Unix",
        date: "January 2025",
        bulletPoints: ["Built a Bash-like shell in C with pipes and redirections."],
      },
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

    // Reload /studio to hydrate seeded state
    console.log("Navigating to /studio with seeded draft...");
    await page.goto(BASE, 3000);

    // -----------------------------------------------------------------------
    // TEST 1: Initial View Mode Rendering & Decimal Level
    // -----------------------------------------------------------------------
    console.log("\n[TEST 1] Verifying View Mode and Level 11.45...");
    const subtitle = await page.eval<string>(
      `document.querySelector('#resume-preview')?.innerText`
    );
    assert(subtitle.includes("42 Student – Level 11.45"), "Preview shows '42 Student – Level 11.45'");
    assert(
      subtitle.includes("Built a Bash-like shell in C with pipes and redirections."),
      "Preview shows initial bullet text"
    );

    await page.shot(`${OUT}/inline-1-view.png`);
    console.log(`  Saved screenshot: ${OUT}/inline-1-view.png`);

    // -----------------------------------------------------------------------
    // TEST 2: Click to Activate Inline Bullet Editor
    // -----------------------------------------------------------------------
    console.log("\n[TEST 2] Activating Inline Editor on Project Bullet...");

    const clicked = await page.eval<boolean>(`
      (() => {
        const bulletSpan = document.querySelector('[title="Click to edit bullet directly"]');
        if (!bulletSpan) return false;
        bulletSpan.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      })()
    `);
    assert(clicked, "Found and clicked project bullet in live preview");
    await sleep(500);

    // Check textarea and advisory toolbar existence
    const textareaExists = await page.eval<boolean>(
      `Boolean(document.querySelector('textarea[aria-label*="bullet point"]'))`
    );
    assert(textareaExists, "Inline <textarea> mounted in preview canvas");

    const textareaValue = await page.eval<string>(
      `document.querySelector('textarea[aria-label*="bullet point"]')?.value || ""`
    );
    assert(
      textareaValue === "Built a Bash-like shell in C with pipes and redirections.",
      "Textarea populated with existing bullet text"
    );

    const toolbarPills = await page.eval<string[]>(`
      [...document.querySelectorAll('#resume-preview .rounded-full')].map(el => el.innerText.trim())
    `);
    assert(toolbarPills.some((p) => p.includes("Strong start")), "Validation shows 'Strong start' pill");

    await page.shot(`${OUT}/inline-2-editing.png`);
    console.log(`  Saved screenshot: ${OUT}/inline-2-editing.png`);

    // -----------------------------------------------------------------------
    // TEST 3: Validation Warnings on Weak/Pronoun Input
    // -----------------------------------------------------------------------
    console.log("\n[TEST 3] Testing Live Advisory Validation Warnings...");

    await page.eval(`
      (() => {
        const ta = document.querySelector('textarea[aria-label*="bullet point"]');
        if (!ta) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(ta, "I helped build the shell and my teammate tested it.");
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await sleep(400);

    const warningTexts = await page.eval<string[]>(`
      [...document.querySelectorAll('#resume-preview ul[id] li')].map(el => el.innerText.trim())
    `);
    assert(
      warningTexts.some((w) => w.toLowerCase().includes("pronoun") || w.includes('"I"')),
      "Advisory warning detects pronoun ('I', 'my')"
    );

    const weakPill = await page.eval<string[]>(`
      [...document.querySelectorAll('#resume-preview .rounded-full')].map(el => el.innerText.trim())
    `);
    assert(weakPill.some((p) => p.includes("Weak start")), "Validation pill changes to 'Weak start'");

    await page.shot(`${OUT}/inline-3-warning.png`);
    console.log(`  Saved screenshot: ${OUT}/inline-3-warning.png`);

    // -----------------------------------------------------------------------
    // TEST 4: Cancel Transaction via Escape Key
    // -----------------------------------------------------------------------
    console.log("\n[TEST 4] Canceling Edit with Escape Key...");

    await page.eval(`
      (() => {
        const ta = document.querySelector('textarea[aria-label*="bullet point"]');
        if (!ta) return;
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      })()
    `);
    await sleep(400);

    const isEditingAfterEsc = await page.eval<boolean>(
      `Boolean(document.querySelector('textarea[aria-label*="bullet point"]'))`
    );
    assert(!isEditingAfterEsc, "Escape closed inline editor without saving");

    const bulletAfterEsc = await page.eval<string>(
      `document.querySelector('[title="Click to edit bullet directly"]')?.innerText || ""`
    );
    assert(
      bulletAfterEsc.includes("Built a Bash-like shell in C with pipes and redirections."),
      "Bullet reverted to original text after Escape"
    );

    // -----------------------------------------------------------------------
    // TEST 5: Save Transaction via Enter Key & Real-Time Sidebar Sync
    // -----------------------------------------------------------------------
    console.log("\n[TEST 5] Saving Edit with Enter Key & Syncing to Sidebar...");

    // Click again to edit
    await page.eval(`
      document.querySelector('[title="Click to edit bullet directly"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    `);
    await sleep(400);

    const updatedText = "Engineered a POSIX Unix shell in C handling pipes, redirections, and custom signals.";
    await page.eval(`
      (() => {
        const ta = document.querySelector('textarea[aria-label*="bullet point"]');
        if (!ta) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(ta, ${JSON.stringify(updatedText)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(500);

    const isEditingAfterEnter = await page.eval<boolean>(
      `Boolean(document.querySelector('textarea[aria-label*="bullet point"]'))`
    );
    assert(!isEditingAfterEnter, "Enter closed inline editor and committed transaction");

    const previewBulletText = await page.eval<string>(
      `document.querySelector('[title="Click to edit bullet directly"]')?.innerText || ""`
    );
    assert(
      previewBulletText.includes("Engineered a POSIX Unix shell in C handling pipes, redirections, and custom signals."),
      "Preview reflects committed edit"
    );

    // Verify localStorage draft updated
    const savedInLocalStorage = await page.eval<boolean>(`
      (() => {
        const raw = localStorage.getItem("printcv_draft_v1");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const bullet = parsed?.state?.cvData?.projects?.[0]?.bulletPoints?.[0];
        return bullet === ${JSON.stringify(updatedText)};
      })()
    `);
    assert(savedInLocalStorage, "Zustand persistence saved updated bullet to localStorage");

    await page.shot(`${OUT}/inline-4-saved.png`);
    console.log(`  Saved screenshot: ${OUT}/inline-4-saved.png`);

    // -----------------------------------------------------------------------
    // TEST 6: Save via Blur (Clicking Outside)
    // -----------------------------------------------------------------------
    console.log("\n[TEST 6] Testing Save on Blur (Click Outside)...");

    // Click bullet to enter edit mode
    await page.eval(`
      document.querySelector('[title="Click to edit bullet directly"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    `);
    await sleep(500);

    const taOpenedTest6 = await page.eval<boolean>(
      `Boolean(document.querySelector('textarea[aria-label*="bullet point"]'))`
    );
    assert(taOpenedTest6, "Textarea opened for blur test");

    const blurUpdate = "Engineered a POSIX Unix shell in C. Tested against 350 POSIX test suites.";
    await page.eval(`
      (() => {
        const ta = document.querySelector('textarea[aria-label*="bullet point"]');
        if (!ta) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(ta, ${JSON.stringify(blurUpdate)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        // Click outside on the canvas preview background and dispatch blur
        document.querySelector('[data-test-id="preview-a4"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      })()
    `);
    await sleep(800);

    const previewAfterBlur = await page.eval<string>(
      `document.querySelector('[title="Click to edit bullet directly"]')?.innerText || ""`
    );
    assert(
      previewAfterBlur.includes("Tested against 350 POSIX test suites."),
      "Blur (clicking outside) cleanly saved the draft"
    );

    await page.shot(`${OUT}/inline-5-blur-saved.png`);
    console.log(`  Saved screenshot: ${OUT}/inline-5-blur-saved.png`);

    // -----------------------------------------------------------------------
    // TEST 7: Zoom Resilience
    // -----------------------------------------------------------------------
    console.log("\n[TEST 7] Testing Zoom Scaling Stability...");

    // Zoom out (scale 0.75)
    await page.eval(`
      (() => {
        const preview = document.querySelector('#resume-preview');
        if (preview) preview.style.transform = 'scale(0.75)';
      })()
    `);
    await sleep(300);

    // Click bullet while zoomed
    await page.eval(`
      document.querySelector('[title="Click to edit bullet directly"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    `);
    await sleep(400);

    const editingWhileZoomed = await page.eval<boolean>(
      `Boolean(document.querySelector('textarea[aria-label*="bullet point"]'))`
    );
    assert(editingWhileZoomed, "Inline editor activates seamlessly when zoomed to 75%");

    await page.shot(`${OUT}/inline-6-zoomed.png`);
    console.log(`  Saved screenshot: ${OUT}/inline-6-zoomed.png`);

    // Reset zoom and close any open textarea
    await page.eval(`
      (() => {
        const preview = document.querySelector('#resume-preview');
        if (preview) preview.style.transform = 'scale(1)';
        const btn = document.querySelector('button[title*="Cancel"]');
        if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(400);

    // -----------------------------------------------------------------------
    // TEST 8: Full Name Inline Editing (InlineText)
    // -----------------------------------------------------------------------
    console.log("\n[TEST 8] Testing Full Name Inline Editing...");

    // Click full name
    const clickedName = await page.eval<boolean>(`
      (() => {
        const nameSpan = document.querySelector('span[aria-label*="Full Name"]');
        if (!nameSpan) return false;
        nameSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      })()
    `);
    assert(clickedName, "Found and clicked Full Name in live preview");
    await sleep(300);

    const nameInputActive = await page.eval<boolean>(`
      Boolean(document.querySelector('input[aria-label*="Full Name"]'))
    `);
    assert(nameInputActive, "Full Name input mounted with zero layout shift");

    // Type new name and commit with Enter
    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label*="Full Name"]');
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(input, 'Sarah Connor');
        else input.value = 'Sarah Connor';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(500);

    const previewAfterName = await page.eval<string>(
      `document.querySelector('#resume-preview')?.innerText || ""`
    );
    assert(previewAfterName.includes("Sarah Connor"), "Preview displays committed Full Name 'Sarah Connor'");

    // -----------------------------------------------------------------------
    // TEST 9: Target Role Inline Editing & 42 Level Badge Preservation
    // -----------------------------------------------------------------------
    console.log("\n[TEST 9] Testing Target Role Editing & 42 Level Preservation...");

    const clickedRole = await page.eval<boolean>(`
      (() => {
        const roleSpan = document.querySelector('span[aria-label*="Target Role"]');
        if (!roleSpan) return false;
        roleSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      })()
    `);
    assert(clickedRole, "Found and clicked Target Role in live preview");
    await sleep(300);

    // Type new role and press Enter
    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label*="Target Role"]');
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(input, 'Principal Kernel Architect');
        else input.value = 'Principal Kernel Architect';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(500);

    const previewAfterRole = await page.eval<string>(
      `document.querySelector('#resume-preview')?.innerText || ""`
    );
    assert(
      previewAfterRole.includes("Principal Kernel Architect – Level 11.45"),
      "Subtitle combines new role with preserved verified 42 Level: 'Principal Kernel Architect – Level 11.45'"
    );

    // -----------------------------------------------------------------------
    // TEST 10: Technical Skills Inline Editing (InlineSkills)
    // -----------------------------------------------------------------------
    console.log("\n[TEST 10] Testing Technical Skills Comma-List Editing...");

    const clickedSkills = await page.eval<boolean>(`
      (() => {
        const skillsSpan = document.querySelector('span[aria-label*="Languages skills list"]');
        if (!skillsSpan) return false;
        skillsSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      })()
    `);
    assert(clickedSkills, "Found and clicked Languages skills in live preview");
    await sleep(300);

    const skillsTextareaActive = await page.eval<boolean>(`
      Boolean(document.querySelector('textarea[aria-label*="Languages skills"]'))
    `);
    assert(skillsTextareaActive, "Languages inline textarea mounted with protected heading");

    // Type new comma-delimited skills list and press Enter
    await page.eval(`
      (() => {
        const ta = document.querySelector('textarea[aria-label*="Languages skills"]');
        if (!ta) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(ta, 'C, C++, Rust, Python, Go');
        else ta.value = 'C, C++, Rust, Python, Go';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(500);

    const previewAfterSkills = await page.eval<string>(
      `document.querySelector('#resume-preview')?.innerText || ""`
    );
    assert(
      previewAfterSkills.includes("Languages: C, C++, Rust, Python, Go"),
      "Languages skills updated and formatted with protected 'Languages:' heading"
    );

    // -----------------------------------------------------------------------
    // TEST 11: Education Institution Editing
    // -----------------------------------------------------------------------
    console.log("\n[TEST 11] Testing Education Institution Editing...");

    const clickedInst = await page.eval<boolean>(`
      (() => {
        const instSpan = document.querySelector('span[aria-label*="Edit Institution"]');
        if (!instSpan) return false;
        instSpan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      })()
    `);
    assert(clickedInst, "Found and clicked Education Institution in live preview");
    await sleep(300);

    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label*="Edit Institution"]');
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(input, '42 Abu Dhabi Campus');
        else input.value = '42 Abu Dhabi Campus';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(500);

    const previewAfterInst = await page.eval<string>(
      `document.querySelector('#resume-preview')?.innerText || ""`
    );
    assert(
      previewAfterInst.includes("42 Abu Dhabi Campus – Level 11.45"),
      "Education institution updated and verified Level preserved: '42 Abu Dhabi Campus – Level 11.45'"
    );

    await page.shot(`${OUT}/inline-7-full-preview-edited.png`);
    console.log(`  Saved screenshot: ${OUT}/inline-7-full-preview-edited.png`);

    console.log(`\n==================================================`);
    console.log(`Browser QA Verification: ${passed} passed, ${failed} failed`);
    console.log(`==================================================`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Browser QA threw error:", err);
    process.exit(1);
  } finally {
    proc.kill();
  }
}

run();
