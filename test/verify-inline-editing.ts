// Automated tests for Phase 3: Inline editing proof of concept on project bullet.
// Tests transaction lifecycle, state synchronization with sidebar/store, validation, and print purity.
// Run: npx tsx test/verify-inline-editing.ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCVStore } from "../src/lib/store/cv-store";
import { checkLine, lineWarnings } from "../src/components/studio/BulletEditorRow";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { generateCvDocx } from "../src/lib/docx-generator";

let pass = 0;
let fail = 0;
const ok = (c: unknown, m: string) => {
  if (c) {
    pass++;
  } else {
    fail++;
    console.error("FAIL:", m);
  }
};

(globalThis as any).React = React;

async function run() {
  const { CVSheet } = await import("../src/components/templates/CVSheet");
  const { InlineBullet } = await import("../src/components/studio/inline-editor/InlineBullet");

  // =========================================================================
  // 1. CVSheet Server Purity vs. Parameterized Slot Mode
  // =========================================================================
  console.log("Suite 1: CVSheet Slot Mode & SSR Parity");

  const cv = createEmptyCV();
  cv.projects = [
    {
      id: "proj-shell",
      name: "Minishell",
      is42Project: true,
      techStack: "C, Unix",
      date: "January 2025",
      bulletPoints: ["Built a POSIX-compliant shell with pipes, redirections, and signals."],
    },
  ];

  // Static SSR (renderField omitted)
  const staticHtml = renderToStaticMarkup(React.createElement(CVSheet, { data: cv }));
  ok(
    staticHtml.includes("Built a POSIX-compliant shell with pipes, redirections, and signals."),
    "static render contains bullet text"
  );
  ok(!staticHtml.includes("<textarea"), "static render contains no <textarea>");
  ok(!staticHtml.includes("group/bullet"), "static render contains no inline edit wrappers");

  // Studio Interactive Mode (renderField passed)
  const interactiveHtml = renderToStaticMarkup(
    React.createElement(CVSheet, {
      data: cv,
      renderField: (desc, defaultNode) => {
        if (desc.type === "textarea" && desc.meta?.projectId && desc.meta?.bulletIndex !== undefined) {
          return React.createElement(
            InlineBullet,
            {
              projectId: String(desc.meta.projectId),
              bulletIndex: Number(desc.meta.bulletIndex),
              initialValue: desc.value,
            },
            defaultNode
          );
        }
        return defaultNode;
      },
    })
  );
  ok(interactiveHtml.includes("group/bullet"), "interactive preview renders inline edit wrapper");
  ok(interactiveHtml.includes("Click to edit bullet directly"), "interactive preview has edit tooltip");

  // =========================================================================
  // 2. Transaction & State Synchronization with Zustand Store
  // =========================================================================
  console.log("Suite 2: State Synchronization & Store Mutations");

  useCVStore.getState().resetToDefaults();
  useCVStore.setState({ cvData: cv });

  const initialBullet = useCVStore.getState().cvData.projects[0].bulletPoints[0];
  ok(
    initialBullet === "Built a POSIX-compliant shell with pipes, redirections, and signals.",
    "initial bullet in store verified"
  );

  // Commit mutation via store action used by InlineBullet
  const newBulletText = "Engineered a high-performance shell handling 300+ edge cases and custom signals.";
  useCVStore.getState().updateProjectBullet("proj-shell", 0, newBulletText);

  const updatedStore = useCVStore.getState().cvData;
  ok(
    updatedStore.projects[0].bulletPoints[0] === newBulletText,
    "store reflects committed inline bullet edit"
  );

  // Verify that an unrelated CV section was not touched
  ok(updatedStore.educationState === "STATE_A_CORE", "unrelated CV state unchanged");

  // =========================================================================
  // 3. Validation Logic (checkLine & lineWarnings)
  // =========================================================================
  console.log("Suite 3: Bullet Validation Engine");

  // Valid strong bullet
  const validCheck = checkLine("Built a high-performance HTTP server in C++ using epoll.");
  ok(validCheck.goodStart === true, "detects strong action verb (Built)");
  ok(validCheck.weakStart === false, "does not flag strong verb as weak");
  ok(validCheck.pronoun === false, "no pronoun in valid bullet");
  ok(lineWarnings(validCheck).length === 0, "no warnings for strong bullet");

  // Weak opener
  const weakCheck = checkLine("Worked on the frontend authentication using React.");
  ok(weakCheck.weakStart === true, "detects weak verb (Worked on)");
  ok(lineWarnings(weakCheck).length > 0, "generates warning for weak start");

  // Pronoun detection
  const pronounCheck = checkLine("I developed the parser and my teammate wrote the tests.");
  ok(pronounCheck.pronoun === true, "detects pronoun (I / my)");
  ok(lineWarnings(pronounCheck).some((w) => w.includes("pronoun") || w.includes('"I"')), "generates pronoun warning");

  // Too long
  const longText = "A".repeat(230);
  const longCheck = checkLine(longText);
  ok(longCheck.tooLong === true, "detects bullet exceeding MAX_BULLET_LENGTH");

  // =========================================================================
  // 4. Print & Export Purity (Clean PDF and DOCX)
  // =========================================================================
  console.log("Suite 4: Print & DOCX Export Purity");

  const docxBlob = await generateCvDocx(useCVStore.getState().cvData);
  ok(docxBlob && docxBlob.size > 1000, "DOCX generates cleanly with edited bullet");

  console.log(`\n==================================================`);
  console.log(`Phase 3 Inline Editing PoC Verification: ${pass} passed, ${fail} failed`);
  console.log(`==================================================`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
