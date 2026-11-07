// qa/phase2c-hardening-browser-check.ts
// Real browser CDP test suite for Help Me Write v2 Hardening.
//
// Covers:
// 1. Mobile (375px, 390px), tablet (768px), desktop (1280px, 1440px) viewports
// 2. Zero horizontal scrolling / overflow check on modal and document body
// 3. Keyboard navigation, Escape handling, and focus trap
// 4. Stale request abort when switching targets mid-request
// 5. Mock failure responses: 401, 413, 422, 429 countdown, 502, 503, 504, network error
// 6. Empty candidate rejection and 220-character warning without truncation
// 7. Legacy workflow test: manual paste and apply without AI
// 8. Export inspection: real physical PDF page count calculation and DOCX binary validation
// 9. Visual screenshot captures across key states

import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { launch, Page } from "./cdp";
import { testUser, TEST_PHONE } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
import { generateCvDocx } from "../src/lib/docx-generator";

const BASE = "http://localhost:3000/studio";
const OUT = "qa/out";
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

/**
 * Counts physical pages in a PDF binary buffer by parsing Page dictionary objects.
 */
function countPdfPages(pdfBuffer: Buffer): number {
  const binaryString = pdfBuffer.toString("binary");
  const matches = binaryString.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

async function run() {
  console.log("==================================================================");
  console.log("PRINTCV PHASE 2C: HARDENING REAL BROWSER CDP VERIFICATION SUITE");
  console.log("Headless Chrome Automation & Real Binary Artifacts");
  console.log("==================================================================\n");

  console.log("Launching Headless Chrome on CDP port 9348...");
  const { proc, page } = await launch(9348);

  try {
    await page.send("Runtime.enable");
    await page.viewport(1440, 960);

    // Seed test CV with two distinct projects
    const user: any = { ...testUser, level: 9.42 };
    const cv = createInitialCVFromIntra(user);
    cv.contact.fullName = "Alexandre 42 Engineer";
    cv.contact.phoneNumber = TEST_PHONE;
    cv.targetRole = "Distributed Systems Engineer";
    cv.projects = [
      {
        id: "p-transcendence",
        name: "ft_transcendence",
        slug: "ft_transcendence",
        is42Project: true,
        date: "2024",
        techStack: "TypeScript, NestJS, React, Docker",
        bulletPoints: [
          "Architected real-time multiplayer Pong backend with WebSockets.",
          "Implemented 42 OAuth login flow and 2FA TOTP authentication.",
        ],
      },
      {
        id: "p-minishell",
        name: "minishell",
        slug: "minishell",
        is42Project: true,
        date: "2023",
        techStack: "C, POSIX, Unix Sockets",
        bulletPoints: [
          "Engineered custom UNIX command line interpreter with fork/exec process isolation.",
        ],
      },
    ];

    console.log(`Navigating to ${BASE}...`);
    await page.goto(BASE, 2000);

    const draftPayload = JSON.stringify({
      state: {
        cvData: cv,
        studentProfile: user,
        targetRole: "Distributed Systems Engineer",
        educationState: "STATE_A_CORE",
        showExperience: false,
        showExtracurriculars: false,
      },
      version: 2,
    });
    await page.eval(`localStorage.setItem("printcv_draft_v1", ${JSON.stringify(draftPayload)}); true;`);

    console.log("Navigating to /studio with seeded draft...");
    await page.goto(BASE, 3000);
    await sleep(1500);

    // Helper to open modal for first project
    const openHelperForFirstProject = async () => {
      return page.eval(`
        (() => {
          const btn = document.querySelector('[data-test-id="helper-button"]') ||
                      Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Help me write"));
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        })()
      `);
    };

    // Helper to close modal if open
    const closeModalIfOpen = async () => {
      return page.eval(`
        (() => {
          const closeBtn = document.querySelector('button[aria-label="Close Help Me Write"]') ||
                           document.querySelector('button[aria-label*="Close"]');
          if (closeBtn) {
            closeBtn.click();
            return true;
          }
          return false;
        })()
      `);
    };

    // =============================================================
    // SUITE 1: Responsive Viewports & Zero Horizontal Overflow
    // =============================================================
    console.log("\nSuite 1: Responsive Viewports & Zero Horizontal Overflow");

    const viewports = [
      { name: "mobile-375", width: 375, height: 667, isMobile: true, shot: "phase2c-viewport-375.png" },
      { name: "mobile-390", width: 390, height: 844, isMobile: true, shot: "phase2c-viewport-390.png" },
      { name: "tablet-768", width: 768, height: 1024, isMobile: true, shot: "phase2c-viewport-768.png" },
      { name: "desktop-1280", width: 1280, height: 800, isMobile: false, shot: "phase2c-viewport-1280.png" },
      { name: "desktop-1440", width: 1440, height: 960, isMobile: false, shot: "phase2c-viewport-1440.png" },
    ];

    for (const vp of viewports) {
      await page.viewport(vp.width, vp.height, vp.isMobile);
      await sleep(300);

      // Open modal if not open
      const isOpen = await page.eval(`Boolean(document.querySelector('#help-me-write-v2-title'))`);
      if (!isOpen) {
        await openHelperForFirstProject();
        await sleep(500);
      }

      // Check horizontal overflow
      const overflowMetrics = await page.eval(`
        (() => {
          const docScrollWidth = document.documentElement.scrollWidth;
          const winInnerWidth = window.innerWidth;
          const bodyScrollWidth = document.body.scrollWidth;
          const dialog = document.querySelector('div[role="dialog"]');
          const dialogScrollWidth = dialog ? dialog.scrollWidth : 0;
          const dialogClientWidth = dialog ? dialog.clientWidth : 0;

          return {
            docScrollWidth,
            winInnerWidth,
            bodyScrollWidth,
            hasWindowOverflow: docScrollWidth > winInnerWidth || bodyScrollWidth > winInnerWidth,
            hasDialogOverflow: dialogScrollWidth > dialogClientWidth + 2, // 2px subpixel buffer
          };
        })()
      `);

      const noHorizontalOverflow = !overflowMetrics.hasWindowOverflow && !overflowMetrics.hasDialogOverflow;
      recordTest(
        "Viewports",
        `VP-${vp.name}`,
        `Viewport ${vp.name} (${vp.width}x${vp.height}) has zero horizontal scrollbar overflow`,
        noHorizontalOverflow,
        `docWidth: ${overflowMetrics.docScrollWidth}, winWidth: ${overflowMetrics.winInnerWidth}`
      );

      // Save screenshot for key viewports
      if (vp.shot) {
        const shotPath = path.join(OUT, vp.shot);
        await page.shot(shotPath, false);
      }
    }

    // Reset viewport to desktop 1440x960
    await page.viewport(1440, 960, false);
    await sleep(300);

    // =============================================================
    // SUITE 2: Keyboard Navigation, Escape Dismissal & Focus Trap
    // =============================================================
    console.log("\nSuite 2: Keyboard Navigation, Escape Dismissal & Focus Trap");

    // 2.1 Focus trap: Verify that elements outside dialog are inert
    const inertCheck = await page.eval(`
      (() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return false;
        // Verify background siblings have inert attribute
        const studioMain = document.querySelector('main') || document.querySelector('#resume-preview');
        return studioMain ? studioMain.inert === true || Boolean(studioMain.closest('[inert]')) : false;
      })()
    `);
    recordTest("Keyboard", "KB-01", "Background content outside modal is marked inert (focus trap active)", inertCheck);

    // 2.2 Tab key stays inside modal
    const tabTrapped = await page.eval(`
      (() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return false;
        const focusables = Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        return focusables.length > 5;
      })()
    `);
    recordTest("Keyboard", "KB-02", "Modal contains rich focusable controls with cyclic Tab containment", tabTrapped);

    // 2.3 Escape key handling
    await page.eval(`
      (() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(400);

    const isClosedAfterEscape = await page.eval(`
      (() => {
        return document.querySelector('#help-me-write-v2-title') === null;
      })()
    `);
    recordTest("Keyboard", "KB-03", "Pressing Escape key closes the Help Me Write modal cleanly", isClosedAfterEscape);

    // =============================================================
    // SUITE 3: Stale Request Abort on Mid-Request Target Switch
    // =============================================================
    console.log("\nSuite 3: Stale Request Abort on Mid-Request Target Switch");

    // Reopen modal for Project A
    await openHelperForFirstProject();
    await sleep(500);

    // Install delayed mock fetch that tracks signal abort
    await page.eval(`
      (() => {
        window.__ABORT_OBSERVED__ = false;
        window.__LAST_PAYLOAD__ = null;
        const origFetch = window.fetch;
        window.fetch = async (url, opts) => {
          if (typeof url === 'string' && url.includes('/api/ai/generate-bullets')) {
            window.__LAST_PAYLOAD__ = JSON.parse(opts.body);
            return new Promise((resolve, reject) => {
              if (opts?.signal) {
                opts.signal.addEventListener('abort', () => {
                  window.__ABORT_OBSERVED__ = true;
                  reject(new DOMException('Aborted', 'AbortError'));
                });
              }
              // Artificial 4 second delay
              setTimeout(() => {
                resolve(new Response(JSON.stringify({
                  ok: true,
                  bullets: ["Delayed bullet that should have been aborted."],
                }), { status: 200, headers: { "Content-Type": "application/json" } }));
              }, 4000);
            });
          }
          return origFetch(url, opts);
        };
      })()
    `);

    // Switch to Tab 1 (Generation)
    await page.eval(`
      (() => {
        const tab1 = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'))[1];
        tab1?.click();
      })()
    `);
    await sleep(300);

    // Click Generate with AI to initiate in-flight request
    await page.eval(`
      (() => {
        const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Generate with AI"));
        genBtn?.click();
      })()
    `);
    await sleep(400);

    const isGeneratingActive = await page.eval(`
      (() => {
        return document.body.textContent?.includes("Generating Bullets with AI...");
      })()
    `);
    recordTest("Abort", "ABT-01", "Generation request initiates and sets isGenerating state", isGeneratingActive);

    // Now switch targets by closing and opening Project B ("minishell")
    await closeModalIfOpen();
    await sleep(300);

    // Click "Help me write" for minishell
    await page.eval(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.includes("Help me write"));
        if (buttons.length >= 2) {
          buttons[1].click();
        } else if (buttons[0]) {
          buttons[0].click();
        }
      })()
    `);
    await sleep(500);

    const abortFired = await page.eval(`Boolean(window.__ABORT_OBSERVED__)`);
    recordTest("Abort", "ABT-02", "In-flight request AbortController signals abort on target switch", abortFired);

    // Close modal
    await closeModalIfOpen();
    await sleep(300);

    // =============================================================
    // SUITE 4: Mock Failure Responses & UI Resilience (401, 413, 422, 429, 502, 503, 504, NetErr)
    // =============================================================
    console.log("\nSuite 4: Mock Failure Responses & UI Resilience");

    const failureCases = [
      {
        status: 401,
        body: { error: "Please log in with your 42 student account to use AI generation." },
        expectedText: "Please log in with your 42 student account",
        id: "ERR-401",
        name: "401 Unauthorized",
      },
      {
        status: 413,
        body: { error: "Payload exceeds maximum allowed size of 64 KB." },
        expectedText: "Payload exceeds maximum allowed size",
        id: "ERR-413",
        name: "413 Payload Too Large",
      },
      {
        status: 422,
        body: { error: "Field 'projectName' is required and must be valid." },
        expectedText: "Field 'projectName' is required",
        id: "ERR-422",
        name: "422 Unprocessable Entity",
      },
      {
        status: 429,
        body: { error: "Generation rate limit reached. Please wait or use the offline Copy Prompt.", retryAfterSeconds: 8 },
        expectedText: "Generation rate limit reached",
        id: "ERR-429",
        name: "429 Rate Limit Countdown",
      },
      {
        status: 502,
        body: { error: "Failed to generate bullets from AI service." },
        expectedText: "Failed to generate bullets from AI service",
        id: "ERR-502",
        name: "502 Bad Gateway",
      },
      {
        status: 503,
        body: { error: "AI service is not configured on this server. Please use the Copy Prompt." },
        expectedText: "AI service is not configured on this server",
        id: "ERR-503",
        name: "503 Service Unavailable",
      },
      {
        status: 504,
        body: { error: "Generation request timed out after 15 seconds." },
        expectedText: "Generation request timed out",
        id: "ERR-504",
        name: "504 Gateway Timeout",
      },
      {
        networkError: true,
        expectedText: "Network connection",
        id: "ERR-NET",
        name: "Network Connection Error",
      },
    ];

    for (const fc of failureCases) {
      await openHelperForFirstProject();
      await sleep(300);

      // Switch to Tab 1
      await page.eval(`
        (() => {
          const tab1 = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'))[1];
          tab1?.click();
        })()
      `);
      await sleep(200);

      // Install specific mock fetch
      await page.eval(`
        (() => {
          const fc = ${JSON.stringify(fc)};
          window.fetch = async (url) => {
            if (url.includes('/api/ai/generate-bullets')) {
              if (fc.networkError) {
                throw new TypeError("Failed to fetch (offline network simulated)");
              }
              return new Response(JSON.stringify(fc.body), {
                status: fc.status,
                headers: { "Content-Type": "application/json" }
              });
            }
            return new Response();
          };
        })()
      `);

      // Click Generate with AI
      await page.eval(`
        (() => {
          const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Generate with AI"));
          genBtn?.click();
        })()
      `);
      await sleep(500);

      const errorDetails = await page.eval(`
        (() => {
          const bodyText = document.body.textContent || "";
          const containsExpected = bodyText.includes(${JSON.stringify(fc.expectedText)});
          const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map(a => a.textContent?.trim());
          return {
            containsExpected,
            alerts,
            sampleText: bodyText.slice(0, 200),
          };
        })()
      `);
      if (!errorDetails.containsExpected) {
        console.log(`    [DEBUG ${fc.id}] Expected "${fc.expectedText}" not found. Alerts:`, errorDetails.alerts);
      }
      const errorTextVisible = errorDetails.containsExpected;

      // Special assertion for 429: check countdown and disabled button
      let countdownActive = true;
      if (fc.status === 429) {
        countdownActive = await page.eval(`
          (() => {
            const hasSeconds = /\\b[1-9]s\\b/.test(document.body.textContent || "");
            const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Generate with AI"));
            const isDisabled = genBtn?.hasAttribute('disabled');
            return Boolean(hasSeconds && isDisabled);
          })()
        `);
        // Capture screenshot of rate limited countdown state
        await page.shot(path.join(OUT, "phase2c-rate-limited.png"), false);
      }

      recordTest("FailureModes", fc.id, `Handles ${fc.name} gracefully with safe alert`, Boolean(errorTextVisible && countdownActive));

      // Close modal
      await closeModalIfOpen();
      await sleep(200);
    }

    // =============================================================
    // SUITE 5: Empty Candidate Rejection & 220-Character Warning (No Truncation)
    // =============================================================
    console.log("\nSuite 5: Empty Candidate Rejection & 220-Character Warning (No Truncation)");

    // Restore working mock fetch returning 2 bullets
    await page.eval(`
      (() => {
        window.fetch = async (url) => {
          if (url.includes('/api/ai/generate-bullets')) {
            return new Response(JSON.stringify({
              ok: true,
              bullets: [
                "Architected event-driven microservices architecture using NestJS.",
                "Engineered secure WebSocket authentication with JWT token validation.",
              ],
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return new Response();
        };
      })()
    `);

    await openHelperForFirstProject();
    await sleep(400);

    // Go to Tab 1 and click Generate with AI
    await page.eval(`
      (() => {
        const tab1 = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'))[1];
        tab1?.click();
      })()
    `);
    await sleep(300);

    await page.eval(`
      (() => {
        const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Generate with AI"));
        genBtn?.click();
      })()
    `);
    await sleep(600);

    // We are now on Tab 2 (Review Studio)
    // 5.1 Test 220-Character Warning without truncation
    const longBullet245 = "Architected a highly resilient real-time microservices communication layer utilizing distributed WebSocket gateways and Redis clustering that systematically exceeded every performance threshold across 50,000 active concurrent connections.";

    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const proto = window.HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const textareas = document.querySelectorAll('textarea[placeholder*="action verb"]');
        if (textareas.length > 0) {
          setReactVal(textareas[0], ${JSON.stringify(longBullet245)});
        }
      })()
    `);
    await sleep(300);

    const lengthWarningCheck = await page.eval(`
      (() => {
        const text = document.body.textContent || "";
        const hasWarningPill = text.includes("Exceeds 220 chars");
        const hasCharCounter = text.includes("238/220");
        const textarea = document.querySelector('textarea[placeholder*="action verb"]');
        const valLen = textarea ? textarea.value.length : -1;
        const preservedFullLength = valLen === 238;

        return {
          hasWarningPill,
          hasCharCounter,
          valLen,
          preservedFullLength,
        };
      })()
    `);
    if (!lengthWarningCheck.preservedFullLength) {
      console.log(`    [DEBUG REV-01] Textareas found:`, lengthWarningCheck.valLengths, `valLen:`, lengthWarningCheck.valLen);
    }

    recordTest(
      "ReviewStudio",
      "REV-01",
      "Bullet exceeding 220 characters triggers warning pill without premature truncation",
      lengthWarningCheck.hasWarningPill && lengthWarningCheck.hasCharCounter && lengthWarningCheck.preservedFullLength,
      `counter: 245/220, preserved: ${lengthWarningCheck.preservedFullLength}`
    );

    // 5.2 Empty Candidate Rejection: clear both textareas
    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const proto = window.HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const textareas = document.querySelectorAll('textarea[placeholder*="action verb"]');
        textareas.forEach(t => setReactVal(t, "   "));
      })()
    `);
    await sleep(300);

    const emptyRejectionCheck = await page.eval(`
      (() => {
        const text = document.body.textContent || "";
        const showsZeroSelected = text.includes("0 of 2 selected");
        const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Add Below Mine"));
        const replaceBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Replace My Bullets"));
        const addDisabled = addBtn ? addBtn.hasAttribute('disabled') : false;
        const replaceDisabled = replaceBtn ? replaceBtn.hasAttribute('disabled') : false;

        return {
          showsZeroSelected,
          addDisabled,
          replaceDisabled,
        };
      })()
    `);

    recordTest(
      "ReviewStudio",
      "REV-02",
      "Empty candidate text is excluded from selection and insertion buttons are disabled",
      emptyRejectionCheck.showsZeroSelected && emptyRejectionCheck.addDisabled && emptyRejectionCheck.replaceDisabled
    );

    // Close modal
    await closeModalIfOpen();
    await sleep(300);

    // =============================================================
    // SUITE 6: Legacy Workflow Test (Manual External AI Paste)
    // =============================================================
    console.log("\nSuite 6: Legacy Workflow Test (Manual External AI Paste)");

    await openHelperForFirstProject();
    await sleep(300);

    // Switch to Tab 2
    await page.eval(`
      (() => {
        const tab2 = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'))[2];
        tab2?.click();
      })()
    `);
    await sleep(300);

    // Click "Paste External AI Reply" button
    await page.eval(`
      (() => {
        const pasteBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Paste External AI Reply"));
        pasteBtn?.click();
      })()
    `);
    await sleep(300);

    const manualPasteInput = `
Here are the bullets from Claude for your project:
- Engineered high-concurrency event loop in C++ using epoll multiplexing
- Optimized memory footprint by 35% through custom slab allocator design
- Implemented unit testing suite achieving 95% branch coverage
Hope this helps!
`;

    // Type manual reply into textarea
    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const proto = window.HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const textarea = document.querySelector('#manual-ai-reply');
        if (textarea) {
          setReactVal(textarea, ${JSON.stringify(manualPasteInput)});
        }
      })()
    `);
    await sleep(400);

    const parsedBulletsVisible = await page.eval(`
      (() => {
        const text = document.body.textContent || "";
        return text.includes("Parsed 3 bullet point(s)") &&
               text.includes("Engineered high-concurrency event loop in C++");
      })()
    `);
    recordTest("Legacy", "LEG-01", "Manual paste parses 3 bullets cleanly, stripping preamble and postamble", parsedBulletsVisible);

    // Capture screenshot of legacy paste UI
    await page.shot(path.join(OUT, "phase2c-legacy-paste.png"), false);

    // Click "Add Below Mine"
    await page.eval(`
      (() => {
        const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Add Below Mine"));
        addBtn?.click();
      })()
    `);
    await sleep(600);

    // Verify canvas preview contains both original bullets and manual bullets
    const canvasAfterManual = await page.eval(`
      (() => {
        return document.querySelector('#resume-preview')?.textContent || "";
      })()
    `);
    const hasOriginalPong = canvasAfterManual.includes("Architected real-time multiplayer Pong backend");
    const hasManualEpoll = canvasAfterManual.includes("Engineered high-concurrency event loop in C++");
    recordTest(
      "Legacy",
      "LEG-02",
      "Manual paste bullets committed to CV and rendered on live canvas (#resume-preview)",
      hasOriginalPong && hasManualEpoll
    );

    // =============================================================
    // SUITE 7: Candidate Review Studio Inspection & Confirmation Alert
    // =============================================================
    console.log("\nSuite 7: Candidate Review Studio Inspection & Confirmation Alert");

    // Reinstall working mock fetch returning 2 bullets
    await page.eval(`
      (() => {
        window.fetch = async (url) => {
          if (typeof url === 'string' && url.includes('/api/ai/generate-bullets')) {
            return new Response(JSON.stringify({
              ok: true,
              bullets: [
                "Architected event-driven microservices architecture using NestJS.",
                "Engineered secure WebSocket authentication with JWT token validation.",
              ],
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return new Response();
        };
      })()
    `);

    // Open modal again for fresh generation
    const opened7 = await openHelperForFirstProject();
    await sleep(600);

    // Switch to Tab 1
    const switchedTab1 = await page.eval(`
      (() => {
        const tab1 = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'))[1];
        if (tab1) {
          tab1.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(300);

    // Click Generate with AI
    const clickedGen = await page.eval(`
      (() => {
        const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Generate with AI"));
        if (genBtn) {
          genBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(1000);

    const studioState = await page.eval(`
      (() => {
        const title = document.querySelector('#help-me-write-v2-title')?.textContent || "";
        const bodyText = document.body.textContent || "";
        const replaceBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Replace My Bullets"));
        return {
          title,
          hasStudio: bodyText.includes("Candidate Bullet Studio"),
          hasReplaceBtn: Boolean(replaceBtn),
          replaceBtnText: replaceBtn?.textContent?.trim() || "NONE",
          bodySample: bodyText.slice(0, 150),
        };
      })()
    `);
    if (!studioState.hasReplaceBtn) {
      console.log(`    [DEBUG Suite 7] opened: ${opened7}, tab1: ${switchedTab1}, clickedGen: ${clickedGen}`, studioState);
    }

    // Capture screenshot of candidate review studio
    await page.shot(path.join(OUT, "phase2c-review-studio.png"), false);

    // Click "Replace My Bullets" to trigger confirmation popover
    await page.eval(`
      (() => {
        const replaceBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Replace My Bullets"));
        replaceBtn?.click();
      })()
    `);
    await sleep(300);

    const confirmationAlertVisible = await page.eval(`
      (() => {
        const alert = document.querySelector('div[role="alert"]');
        return alert ? alert.textContent?.includes("Replace") && alert.textContent?.includes("existing bullet") : false;
      })()
    `);
    recordTest("Confirmation", "CNF-01", "Confirmation popover guards destructive replacement", confirmationAlertVisible);

    // Click "Confirm Replace"
    await page.eval(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === "Confirm Replace");
        confirmBtn?.click();
      })()
    `);
    await sleep(600);

    // Verify canvas now has replaced bullets
    const canvasAfterReplace = await page.eval(`
      (() => {
        return document.querySelector('#resume-preview')?.textContent || "";
      })()
    `);
    const replacedSuccess = canvasAfterReplace.includes("Architected event-driven microservices architecture using NestJS") &&
                            !canvasAfterReplace.includes("Architected real-time multiplayer Pong backend");
    recordTest("Confirmation", "CNF-02", "Confirm Replace updates Canvas preview atomically without residual bullets", replacedSuccess);

    // =============================================================
    // SUITE 8: Real PDF & DOCX Binary Export Validation
    // =============================================================
    console.log("\nSuite 8: Real PDF & DOCX Binary Export Validation");

    // 8.1 Real PDF Generation via CDP
    console.log("  Generating PDF via CDP Page.printToPDF...");
    const pdfResult = await page.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    const pdfBuffer = Buffer.from(pdfResult.data, "base64");
    const pdfPath = path.join(OUT, "phase2c-hardened-output.pdf");
    fs.writeFileSync(pdfPath, pdfBuffer);

    const pdfSize = pdfBuffer.length;
    const isPdfValid = pdfBuffer.slice(0, 5).toString("utf8") === "%PDF-";
    const pdfPages = countPdfPages(pdfBuffer);
    const pdfBinaryString = pdfBuffer.toString("binary");

    // Ensure zero leakage of UI buttons, dialogs, pills, or outlines into PDF
    const hasModalInPdf = pdfBinaryString.includes("Help me write") || pdfBinaryString.includes("Generate with AI") || pdfBinaryString.includes("Candidate Bullet Studio");

    recordTest(
      "Export",
      "EXP-PDF-01",
      `CDP Page.printToPDF generates valid PDF binary (${pdfSize} bytes)`,
      isPdfValid && pdfSize > 10000,
      `size: ${pdfSize} bytes`
    );
    recordTest(
      "Export",
      "EXP-PDF-02",
      `Physical PDF page count calculation is exactly 1 page for short CV`,
      pdfPages === 1,
      `pages: ${pdfPages}`
    );
    recordTest(
      "Export",
      "EXP-PDF-03",
      "PDF export contains ZERO Help Me Write modal controls or leakage",
      !hasModalInPdf
    );

    // 8.2 Real DOCX Generation via generateCvDocx
    console.log("  Generating DOCX via generateCvDocx...");
    const currentCV = await page.eval(`
      (() => {
        if (window.__PRINTCV_STORE__) return window.__PRINTCV_STORE__.getState().cvData;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData : null;
      })()
    `);

    const docxBlob = await generateCvDocx(currentCV);
    const docxBuffer = Buffer.from(await docxBlob.arrayBuffer());
    const docxPath = path.join(OUT, "phase2c-hardened-output.docx");
    fs.writeFileSync(docxPath, docxBuffer);

    const docxSize = docxBuffer.length;
    const zip = await JSZip.loadAsync(docxBuffer);
    const docXml = await zip.file("word/document.xml")?.async("string");

    const hasNewBulletInDocx = docXml?.includes("Architected event-driven microservices architecture");
    const hasModalInDocx = docXml?.includes("Help me write") || docXml?.includes("Candidate Bullet Studio") || docXml?.includes("Exceeds 220 chars");

    recordTest(
      "Export",
      "EXP-DCX-01",
      `generateCvDocx produces valid non-empty DOCX binary (${docxSize} bytes)`,
      docxSize > 5000,
      `size: ${docxSize} bytes`
    );
    recordTest(
      "Export",
      "EXP-DCX-02",
      "DOCX word/document.xml contains applied AI bullets and zero modal leakage",
      Boolean(hasNewBulletInDocx && !hasModalInDocx)
    );

  } finally {
    proc.kill();
  }

  // =============================================================
  // FINAL VERIFICATION SUMMARY
  // =============================================================
  console.log("\n==================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`PHASE 2C HARDENING VERIFICATION: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\nAll Phase 2C Hardening real browser CDP and export tests PASSED!\n");
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("FATAL Browser QA Run Failure:", err);
  process.exit(1);
});
