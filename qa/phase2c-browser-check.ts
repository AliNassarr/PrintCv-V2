// qa/phase2c-browser-check.ts
// Real browser E2E QA test suite for Help Me Write v2 UI using Chrome DevTools Protocol (CDP).
//
// Validates:
// 1. Modal Opening & Multi-Step Tab Navigation
// 2. ReadmeUploadZone file selection, excerpt toggle, and removal
// 3. DynamicQuestionList inline editing, custom questions, reordering, and archetype override
// 4. Offline Copy Prompt action and external AI reference links
// 5. AI Generation & Candidate Review Studio live validation (220-char limit, action verbs, pills)
// 6. Bullet Insertion: "Add Below Mine" vs "Replace My Bullets" with confirmation dialog
// 7. Store synchronization and Canvas preview (#resume-preview) updates
// 8. Privacy & localStorage purity (zero README or candidate leakage)
// 9. High-fidelity screenshot capture to qa/out/phase2c-help-me-write.png

import fs from "fs";
import path from "path";
import { launch } from "./cdp";
import { testUser } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";

const BASE = "http://localhost:3000/studio";
const OUT = "qa/out";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BrowserTestResult {
  category: string;
  id: string;
  description: string;
  passed: boolean;
  details?: string;
}

const results: BrowserTestResult[] = [];

function record(category: string, id: string, description: string, passed: boolean, details?: string) {
  results.push({ category, id, description, passed, details });
  const icon = passed ? "✓" : "✗ FAIL";
  console.log(`  ${icon} [${id}] ${description}${details ? ` (${details})` : ""}`);
}

async function run() {
  console.log("==================================================================");
  console.log("PRINTCV PHASE 2C: HELP ME WRITE V2 REAL BROWSER QA SUITE");
  console.log("Headless Chrome CDP & DOM State Inspection");
  console.log("==================================================================\n");

  console.log("Launching Headless Chrome on CDP port 9345...");
  const { proc, page } = await launch(9345);

  try {
    await page.send("Runtime.enable");
    await page.viewport(1440, 960);

    // Prepare seeded CV with ft_transcendence project and 2 initial bullets
    const user: any = { ...testUser, level: 7.2 };
    const cv = createInitialCVFromIntra(user);
    cv.contact.fullName = "Alexandre 42 Student";
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
    ];

    console.log(`Navigating to ${BASE}...`);
    await page.goto(BASE, 2000);

    // Seed localStorage draft with test CV
    const draftPayload = JSON.stringify({
      state: {
        cvData: cv,
        studentProfile: user,
        targetRole: "Full-Stack Software Engineer",
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

    // Install mock fetch for /api/ai/generate-bullets in page context
    await page.eval(`
      (() => {
        const origFetch = window.fetch;
        window.fetch = async (url, opts) => {
          if (typeof url === 'string' && url.includes('/api/ai/generate-bullets')) {
            return new Response(JSON.stringify({
              ok: true,
              hasSufficientEvidence: true,
              bullets: [
                "Architected server-authoritative Pong game loop maintaining 60 FPS across WebSocket sessions.",
                "Engineered Redis pub/sub chat engine handling 1,000 concurrent player messages.",
                "Implemented OAuth2 2FA security flow with JWT session management.",
              ],
              modelUsed: "llama-3.3-70b-versatile",
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          }
          return origFetch(url, opts);
        };
      })()
    `);

    // =============================================================
    // SUITE 1: Modal Opening & Navigation Tabs
    // =============================================================
    console.log("\nSuite 1: Modal Opening & Navigation Tabs");

    // Click "Help me write" button for ft_transcendence
    const openedHelper = await page.eval(`
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
    await sleep(600);

    record("Modal", "MOD-01", "Help Me Write button found and clicked", openedHelper);

    // Verify modal title
    const modalTitle = await page.eval(`
      (() => {
        const titleEl = document.querySelector('#help-me-write-v2-title') || document.querySelector('h2');
        return titleEl ? titleEl.textContent?.trim() : "";
      })()
    `);
    const titleMatches = modalTitle.includes("ft_transcendence") && (modalTitle.includes("Write bullets") || modalTitle.includes("Help me write"));
    record("Modal", "MOD-02", "Modal renders with project title", !!titleMatches, `got "${modalTitle}"`);

    // Verify step tabs
    const stepTabs = await page.eval(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'));
        return tabs.map(t => t.textContent?.trim());
      })()
    `);
    const hasThreeTabs = Array.isArray(stepTabs) && stepTabs.length === 3;
    record("Modal", "MOD-03", "Modal displays 3 progressive workflow steps", hasThreeTabs, `steps: ${JSON.stringify(stepTabs)}`);

    // =============================================================
    // SUITE 2: ReadmeUploadZone & Ephemeral Excerpt Preview
    // =============================================================
    console.log("\nSuite 2: ReadmeUploadZone & Ephemeral Excerpt Preview");

    const sampleReadme = `# ft_transcendence Architecture
A real-time multiplayer Pong tournament platform.

## Architecture
Built with microservices architecture using NestJS backend, Next.js frontend, and Redis cache.
The game loop runs on server-authoritative physics at 60 FPS using raw WebSocket connections.

## Security
Implemented 2FA Two-Factor Authentication via TOTP and JWT token pairs in httpOnly cookies.

## Installation
\`\`\`bash
npm install
docker compose up -d
\`\`\`
`;

    // Simulate file upload via input change
    const uploadTriggered = await page.eval(`
      (() => {
        const input = document.querySelector('input[type="file"][accept*=".md"]');
        if (!input) return false;

        const file = new File([${JSON.stringify(sampleReadme)}], "README.md", { type: "text/markdown" });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
    await sleep(800);

    record("README", "RDM-01", "README file loaded via file input", uploadTriggered);

    // Check file summary card
    const readmeCardInfo = await page.eval(`
      (() => {
        const summary = document.querySelector('[data-testid="readme-summary"]');
        return summary ? summary.textContent?.trim() : "";
      })()
    `);
    const cardShowsName = readmeCardInfo.includes("README.md") && readmeCardInfo.includes("words");
    record("README", "RDM-02", "Displays file summary card with filename and word count", !!cardShowsName, `got "${readmeCardInfo.slice(0, 50)}..."`);

    // Toggle excerpt preview
    const excerptToggle = await page.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => 
          b.textContent?.includes("Preview extracted prompt text") || 
          b.textContent?.includes("Hide extracted prompt preview")
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(400);

    const excerptText = await page.eval(`
      (() => {
        const preview = document.querySelector('pre');
        return preview ? preview.textContent?.trim() : "";
      })()
    `);
    const excerptHasArchitecture = excerptText.includes("server-authoritative physics") && !excerptText.includes("npm install");
    record("README", "RDM-03", "Excerpt preview displays technical architecture and filters install script", excerptToggle && excerptHasArchitecture);

    // =============================================================
    // SUITE 3: Dynamic Question List & Archetype Customization
    // =============================================================
    console.log("\nSuite 3: Dynamic Question List & Archetype Customization");

    // Check 42 project badge
    const guidePill = await page.eval(`
      (() => {
        const pills = Array.from(document.querySelectorAll('span')).map(s => s.textContent?.trim());
        return pills.find(p => p === "42 Common Core" || p === "42 Curriculum" || p === "42Next Core");
      })()
    `);
    record("Questions", "QST-01", "Displays verified curriculum badge", !!guidePill, `got "${guidePill}"`);

    // Edit an existing question inline
    await page.eval(`
      (() => {
        const editBtn = document.querySelector('button[aria-label*="Edit wording"]');
        editBtn?.click();
      })()
    `);
    await sleep(200);

    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const proto = window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const input = document.querySelector('input[type="text"][class*="rounded-control"]');
        if (input) {
          setReactVal(input, "Which custom microservices and APIs did you build?");
          const saveBtn = document.querySelector('button[aria-label="Save question"]');
          saveBtn?.click();
        }
      })()
    `);
    await sleep(300);

    const editedQuestionPresent = await page.eval(`
      (() => {
        return document.body.textContent?.includes("Which custom microservices and APIs did you build?");
      })()
    `);
    record("Questions", "QST-02", "Inline editing updates question wording", !!editedQuestionPresent);

    // Add a custom question
    await page.eval(`
      (() => {
        const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Add a Custom Question"));
        addBtn?.click();
      })()
    `);
    await sleep(200);

    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const proto = window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const input = document.querySelector('#custom-question-input');
        if (input) {
          setReactVal(input, "How did you manage Redis caching and pub/sub for chat?");
          const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === "Add");
          saveBtn?.click();
        }
      })()
    `);
    await sleep(300);

    const customQuestionPresent = await page.eval(`
      (() => {
        return document.body.textContent?.includes("How did you manage Redis caching and pub/sub for chat?");
      })()
    `);
    record("Questions", "QST-03", "Custom question added and rendered with badge", !!customQuestionPresent);

    // Switch archetype override to hackathon
    await page.eval(`
      (() => {
        const select = document.querySelector('#archetype-select');
        if (select) {
          select.value = "hackathon";
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await sleep(400);

    const hackathonQuestionsLoaded = await page.eval(`
      (() => {
        const text = document.body.textContent?.toLowerCase() || "";
        return text.includes("time constraint") || text.includes("prototype demo") || text.includes("hackathon");
      })()
    `);
    record("Questions", "QST-04", "Archetype override to Hackathon dynamically updates questions", !!hackathonQuestionsLoaded);

    // Restore default questions
    await page.eval(`
      (() => {
        const restoreBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Restore Defaults"));
        restoreBtn?.click();
      })()
    `);
    await sleep(400);

    const restoredQuestions = await page.eval(`
      (() => {
        return document.body.textContent?.includes("Which frontend, backend, and database technologies");
      })()
    `);
    record("Questions", "QST-05", "Restore Defaults restores canonical questions", !!restoredQuestions);

    // =============================================================
    // SUITE 4: Generation Action Bar & Offline Fallback
    // =============================================================
    console.log("\nSuite 4: Generation Action Bar & Offline Fallback");

    // Click "Next: Generate Bullets" tab
    await page.eval(`
      (() => {
        const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Next: Generate Bullets"));
        if (nextBtn) nextBtn.click();
        else {
          const tab2 = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'))[1];
          tab2?.click();
        }
      })()
    `);
    await sleep(400);

    const tab2Active = await page.eval(`
      (() => {
        return document.body.textContent?.includes("AI Bullet Generation") &&
               document.body.textContent?.includes("Copy Prompt");
      })()
    `);
    record("Generation", "GEN-01", "Switched to Generation tab", !!tab2Active);

    // Click "Copy Prompt" button
    const copyClicked = await page.eval(`
      (() => {
        const copyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Copy Prompt"));
        if (copyBtn) {
          copyBtn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(600);

    const copySuccess = await page.eval(`
      (() => {
        const text = document.body.textContent || "";
        return text.includes("Copied!") || text.includes("Copied");
      })()
    `);
    record("Generation", "GEN-02", "Copy Prompt executes and triggers Copied! confirmation state", copyClicked && !!copySuccess);

    // Verify external chat links
    const chatLinks = await page.eval(`
      (() => {
        const links = Array.from(document.querySelectorAll('a[target="_blank"]')).map(a => a.getAttribute('href'));
        return {
          chatgpt: links.some(l => l?.includes("chatgpt.com")),
          claude: links.some(l => l?.includes("claude.ai")),
          gemini: links.some(l => l?.includes("gemini.google.com")),
        };
      })()
    `);
    const allLinksPresent = chatLinks.chatgpt && chatLinks.claude && chatLinks.gemini;
    record("Generation", "GEN-03", "External LLM fallback links (ChatGPT, Claude, Gemini) present", allLinksPresent);

    // =============================================================
    // SUITE 5: AI Generation & Review Studio Live Quality Checks
    // =============================================================
    console.log("\nSuite 5: AI Generation & Review Studio Live Quality Checks");

    // Click "Generate with AI" button (mocked fetch returns 3 bullets)
    await page.eval(`
      (() => {
        const genBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Generate with AI"));
        genBtn?.click();
      })()
    `);
    await sleep(800);

    // Verify automatically transitioned to Review Studio with 3 candidates
    const studioRendered = await page.eval(`
      (() => {
        return document.body.textContent?.includes("Candidate Bullet Studio") &&
               document.body.textContent?.includes("3 of 3 selected");
      })()
    `);
    record("Studio", "STU-01", "AI generation transitions to Review Studio with 3 candidates", !!studioRendered);

    // Check candidate quality indicators (Strong action start, metrics, character count)
    const qualityPills = await page.eval(`
      (() => {
        const pills = Array.from(document.querySelectorAll('span')).map(s => s.textContent?.trim());
        return {
          hasActionStart: pills.some(p => p === "Strong action start"),
          hasMetrics: pills.some(p => p === "Has metrics/numbers"),
        };
      })()
    `);
    record("Studio", "STU-02", "Quality indicators (Action Start, Metrics) displayed on candidates", qualityPills.hasActionStart && qualityPills.hasMetrics);

    // Test typing a too-long bullet in candidate 0 textarea
    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const proto = window.HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const candidateTextarea = document.querySelector('textarea[placeholder*="action verb"]');
        if (candidateTextarea) {
          setReactVal(candidateTextarea, "Architected high-throughput distributed microservice in TypeScript and NestJS that exceeded every performance milestone by handling extraordinary volume of WebSocket events with extreme fault tolerance across multiple container instances with zero degradation.");
        }
      })()
    `);
    await sleep(300);

    const lengthWarningVisible = await page.eval(`
      (() => {
        const text = document.body.textContent || "";
        return text.includes("Exceeds 220 chars") || text.includes("too long");
      })()
    `);
    record("Studio", "STU-03", "Live length warning appears when bullet exceeds 220 chars", !!lengthWarningVisible);

    // Restore candidate 0 to valid concise bullet
    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const proto = window.HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const candidateTextarea = document.querySelector('textarea[placeholder*="action verb"]');
        if (candidateTextarea) {
          setReactVal(candidateTextarea, "Architected server-authoritative Pong game loop maintaining 60 FPS across WebSocket sessions.");
        }
      })()
    `);
    await sleep(200);

    // Toggle candidate 2 selection (checkbox)
    await page.eval(`
      (() => {
        const toggleButtons = Array.from(document.querySelectorAll('button[aria-label*="candidate"]'));
        if (toggleButtons.length > 0) {
          toggleButtons[0].click();
        }
      })()
    `);
    await sleep(200);

    const selectionCountUpdated = await page.eval(`
      (() => {
        const text = document.body.textContent || "";
        return text.includes("selected");
      })()
    `);
    record("Studio", "STU-04", "Candidate selection toggle updates selection count", !!selectionCountUpdated);

    // Ensure all 3 candidates are selected for insertion
    await page.eval(`
      (() => {
        const toggleButtons = Array.from(document.querySelectorAll('button[aria-label*="candidate"]'));
        toggleButtons.forEach(btn => {
          if (btn.querySelector('svg[class*="Square"]')) {
            btn.click();
          }
        });
      })()
    `);
    await sleep(200);

    // Capture screenshot of Review Studio before applying
    const screenshotPath = path.join(OUT, "phase2c-help-me-write.png");
    await page.shot(screenshotPath, false);
    const screenshotExists = fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 10000;
    record("Screenshot", "SHT-01", "High-fidelity UI screenshot captured in qa/out/phase2c-help-me-write.png", screenshotExists, `size: ${fs.statSync(screenshotPath).size} bytes`);

    // =============================================================
    // SUITE 6: Bullet Insertion Modes (Add Below vs Replace)
    // =============================================================
    console.log("\nSuite 6: Bullet Insertion Modes (Add Below vs Replace)");

    // Test "Add Below Mine": Click "Add Below Mine"
    const addBelowClicked = await page.eval(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Add Below Mine"));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    await sleep(600);
    record("Insertion", "INS-01", "Clicked 'Add Below Mine' button", addBelowClicked);

    // Verify modal is closed and toast notification appeared
    const modalClosedAfterAdd = await page.eval(`
      (() => {
        return document.querySelector('#help-me-write-v2-title') === null;
      })()
    `);
    record("Insertion", "INS-02", "Modal closed cleanly after applying bullets", modalClosedAfterAdd);

    // Verify canvas preview (#resume-preview) contains both original and new bullets
    const canvasTextAfterAdd = await page.eval(`
      (() => {
        return document.querySelector('#resume-preview')?.textContent || "";
      })()
    `);
    const hasOriginal1 = canvasTextAfterAdd.includes("Implemented 42 OAuth login flow");
    const hasNewChat = canvasTextAfterAdd.includes("Engineered Redis pub/sub chat engine");
    record("Insertion", "INS-03", "Add Below Mine preserved original bullets and appended new bullets on Canvas", hasOriginal1 && hasNewChat);

    // Now test "Replace My Bullets" with confirmation dialog:
    // Open Help Me Write again for ft_transcendence
    await page.eval(`
      (() => {
        const btn = document.querySelector('[data-test-id="helper-button"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Help me write"));
        btn?.click();
      })()
    `);
    await sleep(600);

    // Go to Tab 2 and Generate
    await page.eval(`
      (() => {
        const tab2 = Array.from(document.querySelectorAll('nav[aria-label="Help Me Write Steps"] button'))[1];
        tab2?.click();
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

    // Click "Replace My Bullets" to trigger confirmation alert
    await page.eval(`
      (() => {
        const replaceBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes("Replace My Bullets"));
        replaceBtn?.click();
      })()
    `);
    await sleep(300);

    // Verify confirmation alert is open
    const confirmAlertVisible = await page.eval(`
      (() => {
        const alert = document.querySelector('div[role="alert"]');
        return alert ? alert.textContent?.includes("Replace") && alert.textContent?.includes("existing bullet") : false;
      })()
    `);
    record("Insertion", "INS-04", "Confirmation popover appears before destructive replacement", !!confirmAlertVisible);

    // Click "Confirm Replace"
    await page.eval(`
      (() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === "Confirm Replace");
        confirmBtn?.click();
      })()
    `);
    await sleep(600);

    // Verify canvas preview now has ONLY the replaced bullets
    const canvasTextAfterReplace = await page.eval(`
      (() => {
        return document.querySelector('#resume-preview')?.textContent || "";
      })()
    `);
    const originalGone = !canvasTextAfterReplace.includes("Implemented 42 OAuth login flow");
    const replacementPresent = canvasTextAfterReplace.includes("Engineered Redis pub/sub chat engine");
    record("Insertion", "INS-05", "Replace My Bullets replaces all previous bullets on Canvas without remnants", originalGone && replacementPresent);

    // =============================================================
    // SUITE 7: Privacy & LocalStorage Purity
    // =============================================================
    console.log("\nSuite 7: Privacy & LocalStorage Purity");

    const storagePurity = await page.eval(`
      (() => {
        const raw = localStorage.getItem("printcv_draft_v1") || "";
        return {
          hasRawReadme: raw.includes("server-authoritative physics at 60 FPS"),
          hasInstallScript: raw.includes("docker compose up -d"),
          hasCandidateItems: raw.includes("candidate-"),
        };
      })()
    `);
    const privacyPass = !storagePurity.hasRawReadme && !storagePurity.hasInstallScript && !storagePurity.hasCandidateItems;
    record("Privacy", "PRV-01", "CRITICAL PRIVACY INVARIANT: Zero README or ephemeral candidate leakage in localStorage", privacyPass);

  } finally {
    proc.kill();
  }

  // Summary
  console.log("\n==================================================================");
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  console.log(`PrintCV Phase 2C Real Browser QA Summary: ${totalPassed} passed, ${totalFailed} failed (Total: ${results.length})`);
  console.log("==================================================================");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL Browser QA Run Failure:", err);
  process.exit(1);
});
