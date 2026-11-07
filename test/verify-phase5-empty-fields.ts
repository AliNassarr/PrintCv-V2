// Phase 5 Comprehensive Automated Verification Suite
// Verifies empty fields architecture, in-canvas controls, bullet-index parity, scoped Undo, and Dr. Wissam template purity.
// Run: npx tsx test/verify-phase5-empty-fields.ts

import fs from "fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
import { testUser } from "../qa/fixtures/user";
import { useCVStore, generateUniqueId } from "../src/lib/store/cv-store";
import { MAIN_EDUCATION_ID } from "../src/lib/cv-constants";
import { CVData, ProjectItem } from "../src/types/resume";

let pass = 0;
let fail = 0;

function ok(condition: unknown, message: string) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${message}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// React global setup for server-side evaluation under tsx preserve jsx
(globalThis as any).React = React;

(async () => {
  console.log("==================================================");
  console.log("PrintCV Phase 5: Empty Fields & Canvas Verification");
  console.log("==================================================");

  const { CVSheet } = await import("../src/components/templates/CVSheet");

  // -------------------------------------------------------------
  // SUITE 1: AST Server Safety & Gate 1 Invariants
  // -------------------------------------------------------------
  console.log("\nSuite 1: AST Server Safety & Gate 1 Invariants");
  const cvsheetSrc = fs.readFileSync("src/components/templates/CVSheet.tsx", "utf8");

  ok(!/["']use client["']/.test(cvsheetSrc), 'CVSheet.tsx contains no "use client" directive');
  ok(
    !/\buse(State|Effect|LayoutEffect|Ref|Memo|Callback|Context|Reducer)\s*\(/.test(cvsheetSrc),
    "CVSheet.tsx contains zero React hooks"
  );
  ok(!/ResizeObserver|window\.|document\./.test(cvsheetSrc), "CVSheet.tsx contains zero browser globals");

  const clickHandlers = cvsheetSrc.match(/onClick=\{[^\n]*/g) ?? [];
  ok(
    clickHandlers.length === 7 &&
      clickHandlers.every((c) => c.startsWith("onClick={onSectionClick ? ")),
    `CVSheet.tsx has exactly 7 conditional onClick handlers (found ${clickHandlers.length})`
  );

  // -------------------------------------------------------------
  // SUITE 2: In-Section Slot Inversion & Static SSR / Print Parity
  // -------------------------------------------------------------
  console.log("\nSuite 2: In-Section Slot Inversion & Static Parity");

  // Create CV with empty projects, empty coursework, empty skills, and partial contact
  const emptyCV: CVData = {
    ...createInitialCVFromIntra(testUser),
    projects: [],
    coursework: [],
    skills: {
      languages: [],
      developerTools: [],
      technologiesFrameworks: [],
      projectManagementTools: [],
    },
    contact: {
      fullName: "Empty Candidate",
      email: "candidate@example.com",
      phoneNumber: "",
      githubUrl: "",
      linkedinUrl: "",
      level: 11.45,
    },
  };

  // Static mode render (print/SSR/landing page)
  const staticMarkup = renderToStaticMarkup(React.createElement(CVSheet, { data: emptyCV }));

  ok(!staticMarkup.includes("Selected Projects"), "Static render omits Selected Projects when empty");
  ok(!staticMarkup.includes("Relevant Coursework"), "Static render omits Relevant Coursework when empty");
  ok(!staticMarkup.includes("Technical Skills"), "Static render omits Technical Skills when all categories empty");
  ok(!staticMarkup.includes("+ Add"), "Static render contains zero '+ Add' editor placeholders");
  ok(!staticMarkup.includes("+ GitHub") && !staticMarkup.includes("+ LinkedIn"), "Static render omits missing social links");

  // Editable mode capture
  const collectedSlots: Record<string, any> = {};
  const mockRenderField = (desc: any, defaultNode: any) => {
    collectedSlots[desc.id] = desc;
    return React.createElement("span", { "data-testid": desc.id }, desc.placeholder || defaultNode);
  };

  const editableMarkup = renderToStaticMarkup(
    React.createElement(CVSheet, { data: emptyCV, renderField: mockRenderField })
  );

  ok(editableMarkup.includes("Selected Projects"), "Editable render displays Selected Projects section");
  ok(Boolean(collectedSlots["projects.add-first"]), "Editable render provides 'projects.add-first' action slot");
  ok(collectedSlots["projects.add-first"]?.meta?.action === "addProject", "projects.add-first action is addProject");

  ok(editableMarkup.includes("Technical Skills"), "Editable render displays Technical Skills section");
  ok(Boolean(collectedSlots["skills.languages"]), "Editable render provides 'skills.languages' slot");
  ok(Boolean(collectedSlots["skills.developerTools"]), "Editable render provides 'skills.developerTools' slot");
  ok(Boolean(collectedSlots["skills.technologiesFrameworks"]), "Editable render provides 'skills.technologiesFrameworks' slot");
  ok(Boolean(collectedSlots["skills.projectManagementTools"]), "Editable render provides 'skills.projectManagementTools' slot");

  ok(editableMarkup.includes("Relevant Coursework and Workshops"), "Editable render displays Coursework section");
  ok(Boolean(collectedSlots["coursework.add-first"]), "Editable render provides 'coursework.add-first' action slot");
  ok(collectedSlots["coursework.add-first"]?.meta?.action === "addCoursework", "coursework.add-first action is addCoursework");

  ok(Boolean(collectedSlots["contact.githubUrl"]), "Editable render provides 'contact.githubUrl' placeholder slot");
  ok(Boolean(collectedSlots["contact.linkedinUrl"]), "Editable render provides 'contact.linkedinUrl' placeholder slot");
  ok(Boolean(collectedSlots["contact.phoneNumber"]), "Editable render provides 'contact.phoneNumber' placeholder slot");

  // -------------------------------------------------------------
  // SUITE 3: Bullet Array Index Parity & Project Actions
  // -------------------------------------------------------------
  console.log("\nSuite 3: Bullet Array Index Parity & Project Actions");

  const cvWithBullets: CVData = {
    ...emptyCV,
    projects: [
      {
        id: "proj-indexed",
        name: "Indexed Project",
        techStack: "C, Unix",
        date: "2024",
        is42Project: false,
        bulletPoints: ["", "Second bullet that is non-empty", "Third bullet"],
      },
      {
        id: "proj-empty-bullets",
        name: "Empty Bullets Project",
        techStack: "Rust",
        date: "2024",
        is42Project: false,
        bulletPoints: [],
      },
    ],
  };

  const bulletSlots: Record<string, any> = {};
  renderToStaticMarkup(
    React.createElement(CVSheet, {
      data: cvWithBullets,
      renderField: (desc: any) => {
        bulletSlots[desc.id] = desc;
        return null;
      },
    })
  );

  // Parity check: index must match store array index, including blank leading bullet
  ok(bulletSlots["project.proj-indexed.bullet.0"]?.meta?.bulletIndex === 0, "Leading bullet matches array index 0");
  ok(bulletSlots["project.proj-indexed.bullet.1"]?.meta?.bulletIndex === 1, "Second bullet matches array index 1");
  ok(bulletSlots["project.proj-indexed.bullet.2"]?.meta?.bulletIndex === 2, "Third bullet matches array index 2");
  ok(Boolean(bulletSlots["project.proj-indexed.addBullet"]), "Project with bullets includes 'addBullet' slot");
  ok(Boolean(bulletSlots["project.proj-empty-bullets.addFirstBullet"]), "Project with 0 bullets includes 'addFirstBullet' slot");
  ok(Boolean(bulletSlots["projects.add-another"]), "Non-empty projects section includes 'projects.add-another' slot");

  // -------------------------------------------------------------
  // SUITE 4: Scoped Bullet Deletion & Undo Invariants
  // -------------------------------------------------------------
  console.log("\nSuite 4: Scoped Bullet Deletion & Undo Invariants");

  const store = useCVStore.getState();
  store.resetToDefaults();

  const sampleProjId = "test-undo-proj";
  store.addProjectToCV({
    id: sampleProjId,
    name: "Undo Test Project",
    techStack: "TypeScript",
    bulletPoints: ["Bullet Alpha", "Bullet Beta", "Bullet Gamma"],
  });

  const initialBullets = useCVStore.getState().cvData.projects.find((p) => p.id === sampleProjId)?.bulletPoints;
  ok(initialBullets?.length === 3, "Initial project has 3 bullets");

  // Delete Bullet Beta at index 1
  store.removeProjectBullet(sampleProjId, 1);
  const afterDeleteBullets = useCVStore.getState().cvData.projects.find((p) => p.id === sampleProjId)?.bulletPoints;
  ok(afterDeleteBullets?.length === 2, "Bullet Beta removed, length is 2");
  ok(afterDeleteBullets?.[1] === "Bullet Gamma", "Bullet Gamma shifted to index 1");

  const lastDeleted = useCVStore.getState().lastDeletedBullet;
  ok(
    lastDeleted?.projectId === sampleProjId &&
      lastDeleted?.index === 1 &&
      lastDeleted?.text === "Bullet Beta",
    "lastDeletedBullet recorded correct metadata and text ('Bullet Beta')"
  );

  // Execute undo
  const undone = store.undoLastBulletDeletion();
  ok(undone === true, "undoLastBulletDeletion returned true");
  const restoredBullets = useCVStore.getState().cvData.projects.find((p) => p.id === sampleProjId)?.bulletPoints;
  ok(restoredBullets?.length === 3, "Project restored to 3 bullets");
  ok(restoredBullets?.[1] === "Bullet Beta", "Bullet Beta restored exactly at index 1");
  ok(useCVStore.getState().lastDeletedBullet === null, "lastDeletedBullet cleared after undo");

  // -------------------------------------------------------------
  // SUITE 5: Protected 42 Data & Sanitation Invariants
  // -------------------------------------------------------------
  console.log("\nSuite 5: Protected 42 Data & Sanitation Invariants");

  // Ensure MAIN_EDUCATION_ID cannot be deleted
  const initialEduCount = useCVStore.getState().cvData.education?.length || 0;
  store.removeEducationItem(MAIN_EDUCATION_ID);
  const afterEduCount = useCVStore.getState().cvData.education?.length || 0;
  ok(initialEduCount === afterEduCount, `MAIN_EDUCATION_ID cannot be deleted (count remains ${initialEduCount})`);

  // Ensure trailing level suffix is sanitized
  store.updateEducationItem(MAIN_EDUCATION_ID, {
    institution: "42 Abu Dhabi – Level 11.45",
  });
  const updatedMainEdu = useCVStore.getState().cvData.education?.find((e) => e.id === MAIN_EDUCATION_ID);
  ok(
    updatedMainEdu?.institution === "42 Abu Dhabi",
    `Trailing level suffix stripped from institution (got: "${updatedMainEdu?.institution}")`
  );

  // ID generator uniqueness
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    ids.add(generateUniqueId("proj"));
  }
  ok(ids.size === 100, "generateUniqueId produces 100% unique collision-free IDs");

  // -------------------------------------------------------------
  // SUITE 6: Document Purity (Zero Leakage)
  // -------------------------------------------------------------
  console.log("\nSuite 6: Document Purity (Zero Leakage)");

  const { generateCvDocx } = await import("../src/lib/docx-generator");
  const docxBlob = await generateCvDocx(emptyCV);
  const docxBuffer = Buffer.from(await docxBlob.arrayBuffer());
  ok(docxBuffer && docxBuffer.byteLength > 0, `DOCX generated successfully (${docxBuffer.byteLength} bytes)`);

  const docxStr = docxBuffer.toString("binary");
  ok(!docxStr.includes("+ Add"), "DOCX output contains zero '+ Add' action placeholders");
  ok(!docxStr.includes("addProject"), "DOCX output contains zero internal action descriptors");

  console.log("\n==================================================");
  console.log(`Phase 5 Verification: ${pass} passed, ${fail} failed`);
  console.log("==================================================");

  process.exit(fail ? 1 : 0);
})();
