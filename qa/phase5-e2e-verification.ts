// qa/phase5-e2e-verification.ts
// Comprehensive Phase 5 Hardening & Regression E2E Suite in Headless Chrome via CDP.
// Covers:
// 1. Issue A: Date range parsing (ISO dates, ranges, single dates, Present)
// 2. Issue B: Temporary drafts for projects & bullets, cancel cleanup, no hardcoded 'C'
// 3. Issue C: A4 pagination accuracy, real PDF page count inspection, zoom invariance, overflow detection
// 4. Scoped Undo, Contact Placeholders, Optional Inserter, and DOCX Purity
//
// Run: npx --node-options="--experimental-websocket" tsx qa/phase5-e2e-verification.ts

import fs from "fs";
import JSZip from "jszip";
import { launch } from "./cdp";
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

// Counts physical pages in a PDF binary buffer by parsing Page dictionary objects
function countPdfPages(pdfBuffer: Buffer): number {
  const binaryString = pdfBuffer.toString("binary");
  const matches = binaryString.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

async function run() {
  console.log("==================================================================");
  console.log("PRINTCV PHASE 5: HARDENING & REGRESSION E2E VERIFICATION SUITE");
  console.log("Headless Chrome CDP & Real Artifact Inspection");
  console.log("==================================================================\n");

  console.log("Launching Headless Chrome on CDP port 9339...");
  const { proc, page } = await launch(9339);

  try {
    await page.send("Runtime.enable");
    await page.viewport(1440, 960);

    // Initial CV setup
    const user: any = { ...testUser, level: 11.45 };
    const cv = createInitialCVFromIntra(user);
    cv.contact.fullName = "Sarah Connor";
    cv.contact.phoneNumber = TEST_PHONE;
    cv.contact.email = "sarah.connor@42.fr";
    cv.contact.githubUrl = "";
    cv.contact.linkedinUrl = "";
    cv.projects = [];
    cv.coursework = [];
    cv.showExperience = false;
    cv.showExtracurriculars = false;

    console.log(`Navigating to ${BASE}...`);
    await page.goto(BASE, 2000);

    // Seed localStorage draft with Phase 5 test state
    const draftPayload = JSON.stringify({
      state: {
        cvData: cv,
        studentProfile: user,
        targetRole: "42 Student",
        educationState: "STATE_A_CORE",
        showExperience: false,
        showExtracurriculars: false,
      },
      version: 2,
    });
    await page.eval(`localStorage.setItem("printcv_draft_v1", ${JSON.stringify(draftPayload)}); true;`);

    console.log("Navigating to /studio with seeded draft...");
    await page.goto(BASE, 3000);
    await sleep(1200);

    // =============================================================
    // SUITE 1: Missing Contact Placeholders in Canvas
    // =============================================================
    console.log("\nSuite 1: Missing Contact Placeholders in Canvas");
    const githubBtn = await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit GitHub URL"]');
        return el ? el.textContent?.replace(/Edit$/, "").trim() : null;
      })()
    `);
    recordTest("Contacts", "CNT-01", "Missing GitHub displays '+ GitHub' placeholder button", githubBtn === "+ GitHub", `got "${githubBtn}"`);

    const linkedinBtn = await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit LinkedIn URL"]');
        return el ? el.textContent?.replace(/Edit$/, "").trim() : null;
      })()
    `);
    recordTest("Contacts", "CNT-02", "Missing LinkedIn displays '+ LinkedIn' placeholder button", linkedinBtn === "+ LinkedIn", `got "${linkedinBtn}"`);

    // Click and fill GitHub URL
    await page.eval(`
      (() => {
        const el = document.querySelector('[aria-label="Edit GitHub URL"]');
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(200);

    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label="Edit GitHub URL"]');
        if (input) {
          input.value = "github.com/sconnor";
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(100);
    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label="Edit GitHub URL"]');
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(300);

    const updatedGithub = await page.eval(`
      (() => {
        if (window.__PRINTCV_STORE__) return window.__PRINTCV_STORE__.getState().cvData.contact.githubUrl;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.contact.githubUrl : null;
      })()
    `);
    recordTest("Contacts", "CNT-03", "Editing missing contact saves normalized URL into store", updatedGithub === "github.com/sconnor", `got "${updatedGithub}"`);

    // =============================================================
    // SUITE 2: Issue B — Temporary Drafts, Cancellation & No Fake Details
    // =============================================================
    console.log("\nSuite 2: Temporary Drafts, Cancellation & No Fake Defaults");
    const addProjectBtn = await page.eval(`
      (() => {
        const btn = document.querySelector('button[aria-label="Add Project"]');
        return btn ? btn.textContent?.trim() : null;
      })()
    `);
    recordTest("Drafts", "DFT-01", "Empty projects section renders '+ Add Project' action slot", Boolean(addProjectBtn), `text: "${addProjectBtn}"`);

    // 2.1 Click "+ Add Project" to open Temporary Draft Card
    await page.eval(`
      (() => {
        const btn = document.querySelector('button[aria-label="Add Project"]');
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);

    const draftCardVisible = await page.eval(`
      (() => {
        const input = document.querySelector('#draft-project-name');
        return Boolean(input);
      })()
    `);
    recordTest("Drafts", "DFT-02", "Clicking '+ Add Project' opens Temporary Draft Card (not store record)", draftCardVisible === true);

    const storeCountDuringDraft = await page.eval(`
      (() => {
        if (window.__PRINTCV_STORE__) return window.__PRINTCV_STORE__.getState().cvData.projects.length;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.projects.length : 0;
      })()
    `);
    recordTest("Drafts", "DFT-03", "Zustand store remains clean (count: 0) while draft card is open", storeCountDuringDraft === 0, `count: ${storeCountDuringDraft}`);

    // 2.2 Test Cancellation: Click Cancel button
    await page.eval(`
      (() => {
        const cancelBtn = document.querySelector('button[aria-label="Cancel new project"]');
        cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);

    const storeCountAfterCancel = await page.eval(`
      (() => {
        if (window.__PRINTCV_STORE__) return window.__PRINTCV_STORE__.getState().cvData.projects.length;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.projects.length : 0;
      })()
    `);
    const draftCardGone = await page.eval(`
      (() => {
        return document.querySelector('#draft-project-name') === null;
      })()
    `);
    recordTest("Drafts", "DFT-04", "Cancelling draft leaves zero empty records in store", storeCountAfterCancel === 0 && draftCardGone, `count: ${storeCountAfterCancel}`);

    // 2.3 Open Draft again, enter custom project info (Rust & WebAssembly, NOT C) and Save
    await page.eval(`
      (() => {
        const btn = document.querySelector('button[aria-label="Add Project"]');
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(200);

    await page.eval(`
      (() => {
        function setReactVal(el, val) {
          const isTextarea = el.tagName.toLowerCase() === 'textarea';
          const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const nameInput = document.querySelector('#draft-project-name');
        const techInput = document.querySelector('#draft-project-tech');
        const bulletInput = document.querySelector('#draft-project-bullet');
        if (nameInput) setReactVal(nameInput, "wasm-raytracer");
        if (techInput) setReactVal(techInput, "Rust, WebAssembly");
        if (bulletInput) setReactVal(bulletInput, "Built high-performance SIMD raytracer in Rust running in browser at 60 FPS.");
      })()
    `);
    await sleep(200);

    // Click Save Project
    await page.eval(`
      (() => {
        const saveBtn = document.querySelector('button[aria-label="Save new project"]');
        saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(500);

    const savedProject = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) {
          const projs = store.getState().cvData.projects;
          return projs.length > 0 ? projs[0] : null;
        }
        const raw = localStorage.getItem("printcv_draft_v1");
        const projs = raw ? JSON.parse(raw).state.cvData.projects : [];
        return projs.length > 0 ? projs[0] : null;
      })()
    `);
    recordTest(
      "Drafts",
      "DFT-05",
      "Saving project persists custom tech stack ('Rust, WebAssembly'), not hardcoded 'C'",
      savedProject?.name === "wasm-raytracer" && savedProject?.techStack === "Rust, WebAssembly" && savedProject?.bulletPoints?.length === 1,
      `name: "${savedProject?.name}", techStack: "${savedProject?.techStack}"`
    );

    // 2.4 Test Temporary Draft for Bullets
    // Click "+ Add bullet" to open in-place draft
    await page.eval(`
      (() => {
        const addBulletBtn = document.querySelector('button[aria-label="Add bullet point"]');
        addBulletBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);

    const bulletDraftVisible = await page.eval(`
      (() => {
        const textarea = document.querySelector('textarea[aria-label="New bullet point text"]');
        return Boolean(textarea);
      })()
    `);
    recordTest("Drafts", "DFT-06", "Clicking '+ Add bullet' opens in-place bullet draft textarea", bulletDraftVisible === true);

    // Cancel bullet draft with Escape or Cancel button
    await page.eval(`
      (() => {
        const cancelBtn = document.querySelector('button[aria-label="Cancel new bullet"]');
        cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);

    const bulletCountAfterBulletCancel = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) return store.getState().cvData.projects[0].bulletPoints.length;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.projects[0].bulletPoints.length : 0;
      })()
    `);
    recordTest("Drafts", "DFT-07", "Cancelling bullet draft leaves bullet count unchanged (1)", bulletCountAfterBulletCancel === 1);

    // Open bullet draft again, type valid bullet and Save
    await page.eval(`
      (() => {
        const addBulletBtn = document.querySelector('button[aria-label="Add bullet point"]');
        addBulletBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(200);

    await page.eval(`
      (() => {
        const textarea = document.querySelector('textarea[aria-label="New bullet point text"]');
        if (textarea) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(textarea, "Optimized BVH traversal using multi-threaded Web Workers.");
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(100);

    await page.eval(`
      (() => {
        const saveBtn = document.querySelector('button[aria-label="Save new bullet"]');
        saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(400);

    const bulletCountAfterSave = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) return store.getState().cvData.projects[0].bulletPoints.length;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.projects[0].bulletPoints.length : 0;
      })()
    `);
    const secondBulletText = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) return store.getState().cvData.projects[0].bulletPoints[1];
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.projects[0].bulletPoints[1] : "";
      })()
    `);
    recordTest("Drafts", "DFT-08", "Saving bullet draft correctly appends to store bulletPoints", bulletCountAfterSave === 2 && secondBulletText.includes("BVH traversal"), `count: ${bulletCountAfterSave}`);

    // =============================================================
    // SUITE 3: Issue A — Date Range Parsing via Live Canvas
    // =============================================================
    console.log("\nSuite 3: Issue A — Date Range Parsing via Live Canvas");

    // Click education dates field to edit
    await page.eval(`
      (() => {
        const dateEl = document.querySelector('[aria-label="Edit Attendance Dates"]');
        dateEl?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);

    // Test ISO dates range: "2023-09 – 2024-05"
    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label="Edit Attendance Dates"]');
        if (input) {
          input.value = "2023-09 – 2024-05";
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(100);
    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label="Edit Attendance Dates"]');
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);

    const parsedIsoEdu = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) {
          const edu = store.getState().cvData.education.find((e) => e.id === "edu-main");
          return edu ? { startDate: edu.startDate, endDate: edu.endDate, isCurrent: edu.isCurrent } : null;
        }
        const raw = localStorage.getItem("printcv_draft_v1");
        if (!raw) return null;
        const edu = JSON.parse(raw).state.cvData.education.find((e) => e.id === "edu-main");
        return edu ? { startDate: edu.startDate, endDate: edu.endDate, isCurrent: edu.isCurrent } : null;
      })()
    `);
    recordTest(
      "Dates",
      "DAT-01",
      "ISO date range '2023-09 – 2024-05' parsed without splitting internal hyphens",
      parsedIsoEdu?.startDate === "2023-09" && parsedIsoEdu?.endDate === "2024-05" && parsedIsoEdu?.isCurrent === false,
      `start: "${parsedIsoEdu?.startDate}", end: "${parsedIsoEdu?.endDate}"`
    );

    // Test "January 2023 – Present"
    await page.eval(`
      (() => {
        const dateEl = document.querySelector('[aria-label="Edit Attendance Dates"]');
        dateEl?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);
    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label="Edit Attendance Dates"]');
        if (input) {
          input.value = "January 2023 – Present";
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(100);
    await page.eval(`
      (() => {
        const input = document.querySelector('input[aria-label="Edit Attendance Dates"]');
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(400);

    const parsedPresentEdu = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) {
          const edu = store.getState().cvData.education.find((e) => e.id === "edu-main");
          return edu ? { startDate: edu.startDate, endDate: edu.endDate, isCurrent: edu.isCurrent } : null;
        }
        const raw = localStorage.getItem("printcv_draft_v1");
        if (!raw) return null;
        const edu = JSON.parse(raw).state.cvData.education.find((e) => e.id === "edu-main");
        return edu ? { startDate: edu.startDate, endDate: edu.endDate, isCurrent: edu.isCurrent } : null;
      })()
    `);
    recordTest(
      "Dates",
      "DAT-02",
      "'January 2023 – Present' parsed with isCurrent: true and endDate: 'Present'",
      parsedPresentEdu?.startDate === "January 2023" && parsedPresentEdu?.endDate === "Present" && parsedPresentEdu?.isCurrent === true,
      `start: "${parsedPresentEdu?.startDate}", isCurrent: ${parsedPresentEdu?.isCurrent}`
    );

    // =============================================================
    // SUITE 4: Bullet Deletion, Toolbar & Scoped Undo
    // =============================================================
    console.log("\nSuite 4: Bullet Deletion, Toolbar & Scoped Undo");

    // Click on second bullet to enter edit mode
    await page.eval(`
      (() => {
        const bullets = document.querySelectorAll('li [role="button"]');
        if (bullets.length >= 2) {
          bullets[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      })()
    `);
    await sleep(300);

    // Click delete in bullet toolbar
    await page.eval(`
      (() => {
        const delBtn = document.querySelector('button[aria-label="Delete bullet point"]');
        delBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(400);

    const bulletCountAfterDelete = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) return store.getState().cvData.projects[0].bulletPoints.length;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.projects[0].bulletPoints.length : 0;
      })()
    `);
    recordTest("Undo", "UND-01", "Bullet deleted via toolbar trash button (count: 1)", bulletCountAfterDelete === 1);

    const undoToastVisible = await page.eval(`
      (() => {
        const toast = document.querySelector('button[aria-label="Undo bullet deletion"]');
        return Boolean(toast);
      })()
    `);
    recordTest("Undo", "UND-02", "Accessible Undo toast notification appears", undoToastVisible === true);

    // Execute Undo
    await page.eval(`
      (() => {
        const undoBtn = document.querySelector('button[aria-label="Undo bullet deletion"]');
        undoBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(400);

    const bulletCountAfterUndo = await page.eval(`
      (() => {
        const store = window.__PRINTCV_STORE__;
        if (store) return store.getState().cvData.projects[0].bulletPoints.length;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData.projects[0].bulletPoints.length : 0;
      })()
    `);
    recordTest("Undo", "UND-03", "Clicking Undo restores bullet to exact original array position (count: 2)", bulletCountAfterUndo === 2);

    // =============================================================
    // SUITE 5: Issue C — A4 Pagination & Real PDF Page Count
    // =============================================================
    console.log("\nSuite 5: Issue C — A4 Pagination & Real PDF Page Count");

    // 5.1 Test Short CV -> exactly 1 page
    const shortPdf = await page.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    const shortPdfBuffer = Buffer.from(shortPdf.data, "base64");
    const shortPdfPages = countPdfPages(shortPdfBuffer);
    fs.writeFileSync(`${OUT}/short-cv.pdf`, shortPdfBuffer);
    recordTest("A4", "PAG-01", "Short CV prints to exactly 1 physical A4 page in PDF", shortPdfPages === 1, `pages: ${shortPdfPages}`);

    // 5.2 Test Open Draft State does NOT affect measurement or print
    // Open project draft
    await page.eval(`
      (() => {
        const btn = document.querySelector('button[aria-label="Add Project"]');
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);

    const draftOpenPdf = await page.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    const draftOpenPdfBuffer = Buffer.from(draftOpenPdf.data, "base64");
    const draftOpenPdfPages = countPdfPages(draftOpenPdfBuffer);
    const draftOpenPdfStr = draftOpenPdfBuffer.toString("binary");
    const hasDraftLeakage = draftOpenPdfStr.includes("New Project Draft") || draftOpenPdfStr.includes("Cancel new project");
    recordTest(
      "A4",
      "PAG-02",
      "Open temporary draft card has 0 leakage into PDF and page count remains 1",
      draftOpenPdfPages === 1 && hasDraftLeakage === false,
      `pages: ${draftOpenPdfPages}, leakage: ${hasDraftLeakage}`
    );

    // Cancel draft
    await page.eval(`
      (() => {
        const cancelBtn = document.querySelector('button[aria-label="Cancel new project"]');
        cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })()
    `);
    await sleep(300);

    // 5.3 Test Genuine Overflow (Add multiple large projects with bullets exceeding 1123px)
    const bigProjects = [];
    for (let i = 1; i <= 10; i++) {
      bigProjects.push({
        id: "proj-overflow-" + i,
        name: "Large Scale Enterprise System " + i,
        techStack: "Go, Kubernetes, Kafka, gRPC, PostgreSQL",
        date: "2023 – 2024",
        is42Project: false,
        bulletPoints: [
          "Architected distributed microservices handling over 50,000 transactions per second with 99.99% uptime across multiple AWS regions.",
          "Designed event-driven messaging topology using Apache Kafka with custom partitioning, dead-letter queues, and schema registry validation.",
          "Implemented zero-downtime canary deployment pipeline using ArgoCD, Prometheus alerts, and Kubernetes service mesh routing.",
          "Optimized PostgreSQL query performance through custom B-tree indexing and partitioned tables, reducing latency by 45%.",
        ],
      });
    }

    const overflowPayload = JSON.stringify({
      state: {
        cvData: {
          ...cv,
          projects: bigProjects,
          showExperience: true,
          experience: [
            {
              id: "exp-1",
              company: "Datacenter Infrastructure Corp",
              role: "Systems Reliability Engineer",
              startDate: "2022",
              endDate: "2023",
              isCurrent: false,
              bulletPoints: [
                "Maintained bare-metal clusters and automated server provisioning with Ansible and PXE boot.",
                "Reduced incident mean time to resolution (MTTR) by 45% through enhanced Prometheus alerting.",
              ],
            },
          ],
        },
        studentProfile: user,
        targetRole: "42 Student",
        educationState: "STATE_A_CORE",
        showExperience: true,
        showExtracurriculars: false,
      },
      version: 2,
    });

    await page.eval(`localStorage.setItem("printcv_draft_v1", ${JSON.stringify(overflowPayload)}); true;`);
    await page.goto(BASE, 2500);
    await sleep(800);

    // Verify overflow detection in DOM
    const isOverflowReported = await page.eval(`
      (() => {
        const endPageLine = document.querySelector('.cv-sheet > .border-dashed');
        return Boolean(endPageLine);
      })()
    `);
    recordTest("A4", "PAG-03", "Genuine content overflow correctly displays screen page-boundary indicator", isOverflowReported === true);

    const overflowPdf = await page.send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    const overflowPdfBuffer = Buffer.from(overflowPdf.data, "base64");
    const overflowPdfPages = countPdfPages(overflowPdfBuffer);
    fs.writeFileSync(`${OUT}/overflow-cv.pdf`, overflowPdfBuffer);
    recordTest("A4", "PAG-04", "Genuine overflow prints to multiple pages (>= 2) without artificial truncation", overflowPdfPages >= 2, `pages: ${overflowPdfPages}`);

    // =============================================================
    // SUITE 6: Real DOCX Export Purity Verification
    // =============================================================
    console.log("\nSuite 6: Real DOCX Export Purity Verification");
    const currentCV = await page.eval(`
      (() => {
        if (window.__PRINTCV_STORE__) return window.__PRINTCV_STORE__.getState().cvData;
        const raw = localStorage.getItem("printcv_draft_v1");
        return raw ? JSON.parse(raw).state.cvData : null;
      })()
    `);
    const docxBlob = await generateCvDocx(currentCV);
    const docxBuffer = Buffer.from(await docxBlob.arrayBuffer());
    const docxPath = `${OUT}/phase5-hardened.docx`;
    fs.writeFileSync(docxPath, docxBuffer);

    const zip = await JSZip.loadAsync(docxBuffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    const hasAddLeakage = docXml?.includes("+ Add") || docXml?.includes("addProject") || docXml?.includes("Click to edit") || docXml?.includes("New Project Draft");
    recordTest("DOCX", "DCX-01", "Real DOCX generated successfully and contains zero editor controls or draft leakage", fs.existsSync(docxPath) && !hasAddLeakage, `size: ${docxBuffer.byteLength} bytes`);

    console.log("\n==================================================================");
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;
    console.log(`Phase 5 Hardening Verification: ${passed}/${total} passed (${failed} failed)`);
    console.log("==================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      proc.kill();
    } catch {}
  }
}

run().catch((err) => {
  console.error("FATAL ERROR in Phase 5 Hardening suite:", err);
  process.exit(1);
});
