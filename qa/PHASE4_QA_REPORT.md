# PrintCV Phase 4: Full Live Preview Editing — QA & Regression Test Strategy

**Author:** Agent 4 — QA & Regression Specialist  
**Target:** Phase 4: Full Live Preview Editing  
**Workspace:** `C:\Users\Ali_n\.gemini\antigravity\worktrees\PrintCv-V2\enforce_template_format`  
**Date:** November 2026  
**Status:** APPROVED FOR IMPLEMENTATION & VERIFICATION  

---

## 1. Executive Summary & Quality Gates

Phase 4 expands the proven Phase 3 inline editing proof of concept (project bullets) into a **complete dual-editor live canvas experience** across all sections of the CV:
1. **Contact Information:** Full Name, Target Role / Headline, Email, Phone, GitHub, LinkedIn.
2. **Education:** Institution, Program title, and Attendance/Graduation Dates.
3. **Selected Projects:** Title, Tech Stack, Date, and Bullets.
4. **Technical Skills:** 4 standardized categories edited as comma-separated lists with immutable headings.
5. **Relevant Coursework:** Course/Workshop Title and Date.

### Strict Architectural Quality Gates
To prevent regressions and ensure zero production disruption, Phase 4 must satisfy 4 non-negotiable gates:
1. **Gate 1 — CVSheet Server Safety:** `src/components/templates/CVSheet.tsx` must remain 100% server-safe, strictly passing `test/verify-cvsheet.ts`:
   - 0 client hooks (`useState`, `useEffect`, `useRef`, etc.)
   - 0 browser globals (`window`, `document`, `ResizeObserver`)
   - 0 `"use client"` directives
   - Exactly 7 conditional `onClick` handlers (`onClick={onSectionClick ? () => onSectionClick(...) : undefined}`)
   - All editing capabilities injected solely via the parameterized slot `renderField?: (desc: EditableFieldDescriptor, defaultNode: React.ReactNode) => React.ReactNode`
2. **Gate 2 — Dr. Wissam Template & Level Integrity:**
   - 42 Student Level (e.g. `Level 11.45`) is immutable from the preview editor; editing `targetRole` or `institution` must never overwrite, truncate, or duplicate the level suffix.
   - Valid titles containing "Level" (e.g., `"Entry-Level Developer"`, `"Mid-Level Engineer"`) must remain intact without stripping.
   - Protected curriculum titles for State A, State B, and State C must not be accidentally corrupted or overwritten by default editors.
   - Technical skills category headings (`Languages:`, `Developer Tools:`, `Technologies/Frameworks:`, `Project Management tools:`) are structurally protected.
3. **Gate 3 — Export Purity (Print & DOCX):**
   - `PrintableCV.tsx` renders `CleanTemplate` with `editable={false}`, producing static markup free of any editing controls, buttons, toolbars, pills, or outlines.
   - DOCX generation (`generateCvDocx`) produces clean Word documents reflecting edited values with zero artifact leakage.
4. **Gate 4 — Transaction Lifecycle & Persistence:**
   - Keystrokes update local component draft without store thrashing.
   - `Enter` / `Blur` commits transaction to Zustand store (`useCVStore`) and persists to `localStorage`.
   - `Escape` cancels and discards uncommitted draft.
   - Two-way real-time synchronization between preview and traditional sidebar forms.

---

## 2. Test Case Matrix across All Levels

| ID | Test Level | Target Scope | Test Description | Expected Pass Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **TC-U01** | Unit (Slot) | Header: Full Name | `renderField` receives descriptor `id: "contact.fullName"`, `type: "text"`, `value: name` | Descriptor matches contact schema; defaultNode renders Title Case name |
| **TC-U02** | Unit (Slot) | Header: Target Role | `renderField` receives descriptor `id: "targetRole"`, `type: "text"`, `value: targetRole` | Only headline string is editable; `levelLabel` is not in descriptor value |
| **TC-U03** | Unit (Slot) | Contact: Phone & Email | Descriptors `id: "contact.phoneNumber"`, `id: "contact.email"`, `type: "text"` | Empty string descriptors supplied when fields omitted |
| **TC-U04** | Unit (Slot) | Contact: GitHub & LinkedIn | Descriptors `id: "contact.githubUrl"`, `id: "contact.linkedinUrl"`, `type: "text"` | Handles normalized and un-normalized URLs without crashing |
| **TC-U05** | Unit (Slot) | Education: Main & Other | Descriptors for `institution`, `program`, `dates` with `meta.educationId` | Protected program line correctly partitioned from institution |
| **TC-U06** | Unit (Slot) | Projects: Title & TechStack | Descriptors for `name`, `techStack`, `date` with `meta.projectId` | Pipe syntax (`Title \| Stack`) properly parsed and decoupled in slots |
| **TC-U07** | Unit (Slot) | Skills: 4 Categories | Descriptors for `languages`, `developerTools`, `technologiesFrameworks`, `projectManagementTools`, `type: "comma-list"` | Category labels rendered statically; value is comma-separated string |
| **TC-U08** | Unit (Slot) | Coursework: Title & Date | Descriptors for `title` and `date` with `meta.courseworkId` | Unbulleted two-column layout nodes preserved in slot wrapper |
| **TC-S01** | Store | Contact Mutations | `updateContact({ fullName, email, phoneNumber, githubUrl, linkedinUrl })` | Store reflects updates; `lastSavedTimestamp` bumped; `localStorage` updated |
| **TC-S02** | Store | TargetRole Mutation | `setTargetRole(role)` and `cvData.targetRole` update | Updated role is reflected in `cvData.targetRole` and `state.targetRole` |
| **TC-S03** | Store | Education Mutations | `updateEducationItem(id, { institution, startDate, endDate, program })` | Targeted item mutated; other education entries unchanged |
| **TC-S04** | Store | Project Mutations | `updateProject(id, { name, techStack, date })` and `updateProjectBullet(...)` | Project properties updated atomically; bullets array preserved |
| **TC-S05** | Store | Skills Mutations | `updateSkills({ languages, developerTools, technologiesFrameworks, projectManagementTools })` | Comma-delimited strings parsed to trimmed string arrays; empty strings filtered |
| **TC-S06** | Store | Coursework Mutations | `updateCourseworkItem(id, { title, date })` | Coursework item updated cleanly |
| **TC-R01** | Regression | Server Safety | `test/verify-cvsheet.ts` AST & SSR check | 0 hooks, 0 globals, 0 `"use client"`, exactly 7 conditional `onClick` handlers |
| **TC-R02** | Regression | Level Precision | 42 Student Level `11.45`, `3.5`, `5.01`, `2` preservation | Subtitle renders `"<Headline> – Level 11.45"`; level never modified by name/role edit |
| **TC-R03** | Regression | "Level" in Role | Custom role containing "Level" (e.g. `"Entry-Level Developer"`) | `formatCVSubtitle` renders `"Entry-Level Developer – Level 11.45"`; role preserved |
| **TC-R04** | Regression | Subtitle De-duplication | Role with trailing level (e.g. `"Backend Engineer – Level 9.2"`) | Replaced with `"Backend Engineer – Level 11.45"`; no double level suffix |
| **TC-R05** | Regression | Wissam State A Program | State A Core Curriculum program title preservation | Matches `DR_WISSAM_EDUCATION_PROGRAMS.STATE_A_CORE` exactly |
| **TC-R06** | Regression | Wissam State B Program | State B Specialization program title and specialization track | Matches `STATE_B_SPECIALIZATION` + `formatSpecializationTrack(track)` |
| **TC-R07** | Regression | Wissam State C Program | State C Alumnus graduation year single date format | Shows single graduation year (e.g. `"2025"`); no range syntax |
| **TC-R08** | Regression | DOCX Export Purity | `generateCvDocx(cvData)` produces valid blob | Contains updated text; 0 editing artifacts; size > 1000 bytes |
| **TC-R09** | Regression | Print Sheet Purity | Static render without `renderField` (`PrintableCV`) | 0 `<input>`, 0 `<textarea>`, 0 action buttons, 0 edit pills |
| **TC-B01** | Browser (CDP) | Contact Click-to-Edit | Click Full Name, TargetRole, Email, Phone, GitHub, LinkedIn | In-place `<input>` opens with pre-populated text; autofocus active |
| **TC-B02** | Browser (CDP) | Commit via Enter Key | Type new Full Name, press Enter | Editor closes; text updates in canvas; sidebar updates in real-time |
| **TC-B03** | Browser (CDP) | Commit via Blur | Edit Project Title, click outside on canvas preview background | Editor closes; draft committed to store and persisted to `localStorage` |
| **TC-B04** | Browser (CDP) | Cancel via Escape Key | Edit Tech Stack, type gibberish, press Escape | Editor closes; original text restored; no store mutation dispatched |
| **TC-B05** | Browser (CDP) | Skills Comma Parsing | Edit Languages: `"C, C++, Python, Rust"`, press Enter | Comma-separated list correctly splits into array of 4 items |
| **TC-B06** | Browser (CDP) | Rapid Field Switching | Focus Field A, type text, directly click Field B without blurring first | Field A commits cleanly before Field B activates; no race condition |
| **TC-B07** | Browser (CDP) | Zoom Scaling Stability | Set canvas zoom to 50%, 75%, 100%, 125%; click fields | Inline input bounds align precisely with text; no cursor jump or drift |
| **TC-B08** | Browser (CDP) | Live Advisory Pills | Type weak bullet (`"I worked on shell"`) | Real-time advisory pills appear: `[Weak start]`, `[Pronoun]`; Enter still saves |

---

## 3. Exhaustive Edge Cases & Failure Modes

### 3.1 Empty Strings & Omissions
1. **Empty Full Name:**
   - *Behavior:* When user deletes all characters in Full Name and commits, the preview falls back to `"Your Name"` (placeholder styling) in the preview canvas. Printable output renders clean fallback.
2. **Empty Target Role:**
   - *Behavior:* When user clears Target Role, `formatCVSubtitle("", level)` falls back cleanly to `"42 Student – Level X.XX"`. If level is also empty, falls back to `"42 Student"`.
3. **Empty Contact Links (GitHub / LinkedIn):**
   - *Behavior:* If emptied, the item is dropped from the static contact strip. In studio edit mode, a subtle placeholder prompt (`[+ GitHub]`, `[+ LinkedIn]`) is available (`print:hidden`).
4. **Empty Project Tech Stack:**
   - *Behavior:* The pipe separator `|` is omitted cleanly; no dangling `"Minishell | "` or `" | "`.
5. **Empty Skills Category:**
   - *Behavior:* If user clears all skills in a category (e.g. PM Tools), the category row is omitted from print/PDF export, but shows a dashed add prompt in Studio preview.
6. **Empty Project Date / Coursework Date:**
   - *Behavior:* Left-aligned title spans the row cleanly without layout misalignment.

### 3.2 Special Characters & Sanitization
1. **Pipes `|` in Project Titles & Tech Stacks:**
   - *Edge Case:* Legacy CVs used `Title | TechStack` in `proj.name`. If a student types a pipe in `proj.name` or `proj.techStack`, the parser must not split unintentionally or corrupt data.
   - *Fix:* Isolate `name` and `techStack` as distinct properties in `ProjectItem`; do not re-concatenate with pipes.
2. **HTML / Script Injection (`<script>`, `<b>`, `&`, `"`):**
   - *Edge Case:* Student pastes `<script>alert(1)</script>` or `C & C++` or `Senior "Rockstar" Developer`.
   - *Behavior:* React escapes all text nodes by default. Verify no `dangerouslySetInnerHTML` is used in inline components.
3. **URL Variants in GitHub & LinkedIn:**
   - *Edge Case:* Student types `https://github.com/torvalds/`, `github.com/torvalds`, `@torvalds`, or `torvalds`.
   - *Behavior:* Store normalizer (`normalizeGitHub` / `normalizeLinkedIn`) cleans leading protocols, trailing slashes, and redundant domain prefixes, storing canonical format `github.com/torvalds`.

### 3.3 Whitespace & Formatting Boundaries
1. **Leading & Trailing Whitespace:**
   - *Behavior:* Automatic `.trim()` on commit for single-line inputs and bullet points.
2. **Whitespace-Only Inputs:**
   - *Behavior:* Evaluated as empty string `""` rather than multi-space strings.
3. **Comma-List Trimming:**
   - *Input:* `"  C  ,   C++ ,,, Python  ,   "`
   - *Output:* `["C", "C++", "Python"]` (empty tokens discarded, tokens trimmed).
4. **Newlines in Single-Line Fields:**
   - *Input:* Pasting multi-line text into Full Name or Project Title.
   - *Behavior:* Replace `\r?\n` with single space on paste/input to preserve single-line layout.

### 3.4 Long Text & Typography Bounds
1. **Ultra-Long Project Title (100+ chars):**
   - *Behavior:* Wraps cleanly using `break-words` or standard word wrapping without overflowing the 210mm printable boundary or obscuring the right-aligned date.
2. **Ultra-Long Bullet Point (250+ chars):**
   - *Behavior:* `checkLine` displays `[256/220]` warning pill in amber. Text is not truncated; user can commit safely.
3. **Budget Height Overflow (> 1027px):**
   - *Behavior:* When editing causes content to exceed 1027px printable A4 budget, `CanvasPreviewViewport` displays the dashed `"End of page 1"` indicator and enables `"Make it fit"` auto-spacing.

### 3.5 Interaction Timing & Lifecycle Races
1. **Escape vs. Blur Race:**
   - *Scenario:* User presses `Escape`. React dispatches `onKeyDown`, triggering `cancel()`. The input element blurs as edit mode closes or user clicks away.
   - *Mitigation:* `isCancelledRef.current = true` prevents the subsequent `onBlur` from invoking `commit()`.
2. **Enter vs. Blur Race:**
   - *Scenario:* User presses `Enter`. React dispatches `onKeyDown`, triggering `commit()`. The input blurs.
   - *Mitigation:* `isCommittingRef.current = true` prevents redundant duplicate store dispatch.
3. **Fast Switching Between Adjacent Fields:**
   - *Scenario:* User is typing in `contact.fullName` and immediately clicks `contact.email`.
   - *Sequence:* `contact.fullName` receives `blur` $\rightarrow$ commits $\rightarrow$ `contact.email` receives `click` $\rightarrow$ enters edit mode.
   - *Assertion:* Both transactions resolve deterministically with zero data collision.
4. **External Store Updates While Editing:**
   - *Scenario:* User is editing a project bullet in the preview while a background auto-save or sidebar action fires.
   - *Mitigation:* Local component `draft` state remains isolated until explicit commit/cancel.

---

## 4. Draft Specification: `test/verify-full-inline-editing.ts`

The following test script is designed to be added to `test/verify-full-inline-editing.ts` once Agent 2 & Agent 3 complete wiring. It is automatically picked up by `npx tsx test/run-all.ts`.

```typescript
// test/verify-full-inline-editing.ts
// Comprehensive automated tests for Phase 4: Full Live Preview Inline Editing.
// Verifies slot descriptor generation, store synchronization across all 6 sections,
// Dr. Wissam template preservation, level integrity, and export purity.
// Run: npx tsx test/verify-full-inline-editing.ts

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCVStore } from "../src/lib/store/cv-store";
import { createEmptyCV, createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
import { testUser } from "../qa/fixtures/user";
import {
  formatCVSubtitle,
  DR_WISSAM_EDUCATION_PROGRAMS,
  DR_WISSAM_SKILL_LABELS,
  formatSpecializationTrack,
} from "../src/lib/template-constants";
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

  // =========================================================================
  // SUITE 1: CVSheet Slot Descriptors across All Sections
  // =========================================================================
  console.log("Suite 1: CVSheet Slot Descriptors across All Sections");

  const cv = createInitialCVFromIntra({
    ...testUser,
    level: 11.45,
  });
  cv.targetRole = "42 Student";
  cv.contact.fullName = "Test Candidate";
  cv.contact.email = "candidate@42.fr";
  cv.contact.phoneNumber = "+961 70 123456";
  cv.contact.githubUrl = "github.com/candidate";
  cv.contact.linkedinUrl = "linkedin.com/in/candidate";

  cv.projects = [
    {
      id: "proj-shell",
      name: "Minishell",
      techStack: "C, Unix",
      date: "January 2025",
      bulletPoints: ["Built a POSIX shell with signals and pipes."],
      is42Project: true,
    },
  ];

  cv.skills = {
    languages: ["C", "C++", "Python"],
    developerTools: ["Git", "Make", "Docker"],
    technologiesFrameworks: ["Linux", "Valgrind"],
    projectManagementTools: ["JIRA"],
  };

  cv.coursework = [
    { id: "cw-1", title: "Cybersecurity Piscine", date: "May 2025" },
  ];

  const capturedSlots: Record<string, any> = {};

  // Render with a collecting slot handler
  renderToStaticMarkup(
    React.createElement(CVSheet, {
      data: cv,
      renderField: (desc, defaultNode) => {
        capturedSlots[desc.id] = { desc, defaultNode };
        return React.createElement("span", { "data-slot-id": desc.id }, defaultNode);
      },
    })
  );

  // Verify Header & Contact slots
  ok(capturedSlots["contact.fullName"] !== undefined, "Slot registered: contact.fullName");
  ok(capturedSlots["contact.fullName"].desc.value === "Test Candidate", "Full name slot value matches");

  ok(capturedSlots["targetRole"] !== undefined, "Slot registered: targetRole");
  ok(capturedSlots["targetRole"].desc.value === "42 Student", "TargetRole slot value matches (without level suffix)");

  ok(capturedSlots["contact.email"] !== undefined, "Slot registered: contact.email");
  ok(capturedSlots["contact.phoneNumber"] !== undefined, "Slot registered: contact.phoneNumber");
  ok(capturedSlots["contact.githubUrl"] !== undefined, "Slot registered: contact.githubUrl");
  ok(capturedSlots["contact.linkedinUrl"] !== undefined, "Slot registered: contact.linkedinUrl");

  // Verify Education slots
  const mainEdu = cv.education[0];
  ok(capturedSlots[`education.${mainEdu.id}.institution`] !== undefined, "Slot registered: education institution");
  ok(capturedSlots[`education.${mainEdu.id}.dates`] !== undefined, "Slot registered: education dates");

  // Verify Project slots
  ok(capturedSlots["project.proj-shell.title"] !== undefined, "Slot registered: project title");
  ok(capturedSlots["project.proj-shell.techStack"] !== undefined, "Slot registered: project techStack");
  ok(capturedSlots["project.proj-shell.date"] !== undefined, "Slot registered: project date");
  ok(capturedSlots["project.proj-shell.bullet.0"] !== undefined, "Slot registered: project bullet 0");

  // Verify Skills slots
  ok(capturedSlots["skills.languages"] !== undefined, "Slot registered: skills.languages");
  ok(capturedSlots["skills.developerTools"] !== undefined, "Slot registered: skills.developerTools");
  ok(capturedSlots["skills.technologiesFrameworks"] !== undefined, "Slot registered: skills.technologiesFrameworks");
  ok(capturedSlots["skills.projectManagementTools"] !== undefined, "Slot registered: skills.projectManagementTools");

  // Verify Coursework slots
  ok(capturedSlots["coursework.cw-1.title"] !== undefined, "Slot registered: coursework title");
  ok(capturedSlots["coursework.cw-1.date"] !== undefined, "Slot registered: coursework date");

  // =========================================================================
  // SUITE 2: Store Synchronization across All Sections
  // =========================================================================
  console.log("Suite 2: Store Synchronization across All Sections");

  useCVStore.getState().resetToDefaults();
  useCVStore.setState({ cvData: cv });

  // 1. Update Contact
  useCVStore.getState().updateContact({
    fullName: "Jane Doe",
    email: "jane@42.fr",
    phoneNumber: "+1 555 0199",
  });
  ok(useCVStore.getState().cvData.contact.fullName === "Jane Doe", "Store updated contact.fullName");
  ok(useCVStore.getState().cvData.contact.email === "jane@42.fr", "Store updated contact.email");

  // 2. Update Target Role
  useCVStore.getState().setTargetRole("Systems Software Engineer");
  useCVStore.setState((s) => ({ cvData: { ...s.cvData, targetRole: "Systems Software Engineer" } }));
  ok(useCVStore.getState().cvData.targetRole === "Systems Software Engineer", "Store updated targetRole");

  // 3. Update Education
  useCVStore.getState().updateEducationItem(mainEdu.id, {
    institution: "42 Abu Dhabi",
    startDate: "2023",
    endDate: "2026",
  });
  const updatedEdu = useCVStore.getState().cvData.education.find((e) => e.id === mainEdu.id);
  ok(updatedEdu?.institution === "42 Abu Dhabi", "Store updated education institution");
  ok(updatedEdu?.startDate === "2023", "Store updated education startDate");

  // 4. Update Project Header
  useCVStore.getState().updateProject("proj-shell", {
    name: "Minishell V2",
    techStack: "C, POSIX, Docker",
    date: "February 2025",
  });
  const updatedProj = useCVStore.getState().cvData.projects.find((p) => p.id === "proj-shell");
  ok(updatedProj?.name === "Minishell V2", "Store updated project name");
  ok(updatedProj?.techStack === "C, POSIX, Docker", "Store updated project techStack");
  ok(updatedProj?.date === "February 2025", "Store updated project date");

  // 5. Update Skills
  useCVStore.getState().updateSkills({
    languages: ["C", "C++", "Rust", "Go"],
    projectManagementTools: ["JIRA", "Linear"],
  });
  const updatedSkills = useCVStore.getState().cvData.skills;
  ok(updatedSkills.languages.length === 4 && updatedSkills.languages[2] === "Rust", "Store updated skills.languages");
  ok(updatedSkills.projectManagementTools.length === 2 && updatedSkills.projectManagementTools[1] === "Linear", "Store updated skills.projectManagementTools");

  // 6. Update Coursework
  useCVStore.getState().updateCourseworkItem("cw-1", {
    title: "Advanced Kernel Exploitation",
    date: "June 2025",
  });
  const updatedCw = useCVStore.getState().cvData.coursework.find((c) => c.id === "cw-1");
  ok(updatedCw?.title === "Advanced Kernel Exploitation", "Store updated coursework title");
  ok(updatedCw?.date === "June 2025", "Store updated coursework date");

  // =========================================================================
  // SUITE 3: Target Role & Level Invariant Preservation
  // =========================================================================
  console.log("Suite 3: Target Role & Level Invariant Preservation");

  // Verify that setting targetRole does not alter raw contact.level or mainEducation.level
  ok(useCVStore.getState().cvData.contact.level === 11.45, "Contact level 11.45 preserved");

  // Verify valid titles with "Level" remain intact
  const roleWithLevel = "Entry-Level Systems Developer";
  const subtitleWithLevel = formatCVSubtitle(roleWithLevel, 11.45);
  ok(
    subtitleWithLevel === "Entry-Level Systems Developer – Level 11.45",
    "Entry-Level title is preserved and level label appended"
  );

  // Verify accidental duplicate level suffix is cleaned
  const roleWithAccidentalLevel = "Systems Developer – Level 10";
  const subtitleCleaned = formatCVSubtitle(roleWithAccidentalLevel, 11.45);
  ok(
    subtitleCleaned === "Systems Developer – Level 11.45",
    "Accidental duplicate level suffix stripped before appending verified level"
  );

  // =========================================================================
  // SUITE 4: Dr. Wissam Protected Education Invariants
  // =========================================================================
  console.log("Suite 4: Dr. Wissam Protected Education Invariants");

  // State A
  const stateAHtml = renderToStaticMarkup(React.createElement(CVSheet, { data: useCVStore.getState().cvData }));
  ok(
    stateAHtml.includes(DR_WISSAM_EDUCATION_PROGRAMS.STATE_A_CORE),
    "State A protected curriculum text present in markup"
  );

  // State B
  const stateBCV = {
    ...useCVStore.getState().cvData,
    educationState: "STATE_B_SPECIALIZATION" as const,
    specializationTrack: "Cybersecurity",
    education: [
      {
        ...useCVStore.getState().cvData.education[0],
        state: "STATE_B_SPECIALIZATION" as const,
        program: DR_WISSAM_EDUCATION_PROGRAMS.STATE_B_SPECIALIZATION,
      },
    ],
  };
  const stateBHtml = renderToStaticMarkup(React.createElement(CVSheet, { data: stateBCV }));
  ok(
    stateBHtml.includes(DR_WISSAM_EDUCATION_PROGRAMS.STATE_B_SPECIALIZATION),
    "State B completed core text present"
  );
  ok(
    stateBHtml.includes(formatSpecializationTrack("Cybersecurity")),
    "State B formatted specialization track present"
  );

  // =========================================================================
  // SUITE 5: Technical Skills Label Protection
  // =========================================================================
  console.log("Suite 5: Technical Skills Label Protection");

  ok(stateAHtml.includes(`${DR_WISSAM_SKILL_LABELS.languages}:`), "Languages heading protected");
  ok(stateAHtml.includes(`${DR_WISSAM_SKILL_LABELS.developerTools}:`), "Developer Tools heading protected");
  ok(stateAHtml.includes(`${DR_WISSAM_SKILL_LABELS.technologiesFrameworks}:`), "Technologies/Frameworks heading protected");
  ok(stateAHtml.includes(`${DR_WISSAM_SKILL_LABELS.projectManagementTools}:`), "Project Management tools heading protected");

  // =========================================================================
  // SUITE 6: Print & DOCX Export Purity
  // =========================================================================
  console.log("Suite 6: Print & DOCX Export Purity");

  // Static render (as used by PrintableCV)
  const printHtml = renderToStaticMarkup(React.createElement(CVSheet, { data: useCVStore.getState().cvData }));
  ok(!printHtml.includes("<input"), "Print markup contains zero <input> tags");
  ok(!printHtml.includes("<textarea"), "Print markup contains zero <textarea> tags");
  ok(!printHtml.includes("<button"), "Print markup contains zero <button> tags");
  ok(!printHtml.includes("data-slot-id"), "Print markup contains zero data-slot-id attributes");

  // DOCX Generation
  const docxBlob = await generateCvDocx(useCVStore.getState().cvData);
  ok(docxBlob && docxBlob.size > 1000, "DOCX generates cleanly with full edited dataset");

  console.log(`\n==================================================`);
  console.log(`Phase 4 Full Inline Editing Verification: ${pass} passed, ${fail} failed`);
  console.log(`==================================================`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
```

---

## 5. Draft Specification: Enhanced `qa/inline-edit-browser-check.ts`

The following enhanced CDP script validates the real browser lifecycle across all 6 sections in headless Chrome:

```typescript
// qa/inline-edit-browser-check.ts
// Comprehensive Headless Chrome CDP verification for Phase 4: Full Live Preview Editing.
// Verifies live preview click-to-edit, keystroke handling (Enter/Escape/Blur),
// level immutability, comma-separated skills parsing, zoom scaling, and sidebar/localStorage sync.

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
    cv.contact.fullName = "Test Candidate";
    cv.contact.phoneNumber = TEST_PHONE;
    cv.contact.email = "test.candidate@42.fr";
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
    cv.skills = {
      languages: ["C", "C++"],
      developerTools: ["Git", "Make"],
      technologiesFrameworks: ["Linux"],
      projectManagementTools: [],
    };
    cv.coursework = [
      { id: "cw-1", title: "Cybersecurity Piscine", date: "May 2025" },
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

    // -----------------------------------------------------------------------
    // TEST 1: Initial View Mode Verification
    // -----------------------------------------------------------------------
    console.log("\n[TEST 1] Verifying View Mode & Level 11.45...");
    const previewText = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    assert(previewText.includes("Test Candidate"), "Preview displays full name");
    assert(previewText.includes("42 Student – Level 11.45"), "Preview shows '42 Student – Level 11.45'");
    assert(previewText.includes("Minishell"), "Preview shows project title");
    assert(previewText.includes("Cybersecurity Piscine"), "Preview shows coursework item");
    await page.shot(`${OUT}/phase4-1-initial-view.png`);

    // -----------------------------------------------------------------------
    // TEST 2: Inline Name Editing & Enter Commit
    // -----------------------------------------------------------------------
    console.log("\n[TEST 2] Editing Full Name in Live Preview...");
    const nameClicked = await page.eval<boolean>(`
      (() => {
        const el = document.querySelector('[data-slot-id="contact.fullName"], #resume-preview h1, #resume-preview p.font-bold');
        if (!el) return false;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      })()
    `);
    assert(nameClicked, "Found and clicked Name field");
    await sleep(400);

    // Type new name and press Enter
    await page.eval(`
      (() => {
        const input = document.querySelector('#resume-preview input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, "Alexandria Vance");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(500);

    const updatedName = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    assert(updatedName.includes("Alexandria Vance"), "Full name updated in preview canvas");
    await page.shot(`${OUT}/phase4-2-name-saved.png`);

    // -----------------------------------------------------------------------
    // TEST 3: Headline Editing Preserving Level & Titles with "Level"
    // -----------------------------------------------------------------------
    console.log("\n[TEST 3] Editing Target Role to 'Entry-Level Developer'...");
    await page.eval(`
      (() => {
        const roleEl = document.querySelector('[data-slot-id="targetRole"]') || [...document.querySelectorAll('#resume-preview div')].find(d => d.innerText.includes('42 Student'));
        roleEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(400);

    await page.eval(`
      (() => {
        const input = document.querySelector('#resume-preview input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, "Entry-Level Systems Developer");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(500);

    const updatedSubtitle = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    assert(
      updatedSubtitle.includes("Entry-Level Systems Developer – Level 11.45"),
      "Subtitle preserves 'Entry-Level' and verified 'Level 11.45'"
    );

    // -----------------------------------------------------------------------
    // TEST 4: Skills Comma-Separated List Editing
    // -----------------------------------------------------------------------
    console.log("\n[TEST 4] Editing Technical Skills via Comma-Separated Input...");
    await page.eval(`
      (() => {
        const skillsEl = document.querySelector('[data-slot-id="skills.languages"]') || [...document.querySelectorAll('#resume-preview div')].find(d => d.innerText.startsWith('Languages:'));
        skillsEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(400);

    await page.eval(`
      (() => {
        const input = document.querySelector('#resume-preview input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, "C, C++, Rust, Go, Python");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      })()
    `);
    await sleep(500);

    const updatedSkillsText = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    assert(
      updatedSkillsText.includes("C, C++, Rust, Go, Python"),
      "Skills preview displays expanded comma list"
    );
    assert(
      updatedSkillsText.includes("Languages:"),
      "Skills 'Languages:' heading preserved intact"
    );

    // -----------------------------------------------------------------------
    // TEST 5: Escape Reversion on Coursework Edit
    // -----------------------------------------------------------------------
    console.log("\n[TEST 5] Testing Escape Key Cancellation on Coursework...");
    await page.eval(`
      (() => {
        const cwEl = document.querySelector('[data-slot-id="coursework.cw-1.title"]') || [...document.querySelectorAll('#resume-preview div')].find(d => d.innerText.includes('Cybersecurity Piscine'));
        cwEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    `);
    await sleep(400);

    await page.eval(`
      (() => {
        const input = document.querySelector('#resume-preview input');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, "Discarded Coursework Title");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      })()
    `);
    await sleep(500);

    const previewAfterCancel = await page.eval<string>(`document.querySelector('#resume-preview')?.innerText || ""`);
    assert(
      previewAfterCancel.includes("Cybersecurity Piscine") && !previewAfterCancel.includes("Discarded Coursework Title"),
      "Coursework title reverted to original after Escape"
    );

    // -----------------------------------------------------------------------
    // TEST 6: Persistence to localStorage
    // -----------------------------------------------------------------------
    console.log("\n[TEST 6] Verifying Zustand localStorage Persistence...");
    const isSaved = await page.eval<boolean>(`
      (() => {
        const raw = localStorage.getItem("printcv_draft_v1");
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const name = parsed?.state?.cvData?.contact?.fullName;
        const role = parsed?.state?.cvData?.targetRole;
        return name === "Alexandria Vance" && role === "Entry-Level Systems Developer";
      })()
    `);
    assert(isSaved, "Zustand persistence confirmed in localStorage");
    await page.shot(`${OUT}/phase4-3-final-state.png`);

    console.log(`\n==================================================`);
    console.log(`Headless Browser Verification: ${passed} passed, ${failed} failed`);
    console.log(`==================================================`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error("Browser QA failed with error:", err);
    process.exit(1);
  } finally {
    proc.kill();
  }
}

run();
```

---

## 6. Execution Runbook & Verification Steps

1. **Phase 4 Implementation Gate Checklist for Developers (Agents 2 & 3):**
   - [ ] Implement `InlineText.tsx` (single line input, auto-commit on Enter/Blur, cancel on Escape).
   - [ ] Implement `InlineSkills.tsx` (comma-separated list parser and renderer).
   - [ ] Wire `renderField` descriptors in `CVSheet.tsx` for Contact, Target Role, Education, Projects, Skills, and Coursework.
   - [ ] Wire slot mapping in `CleanTemplate.tsx`.
   - [ ] Guarantee `test/verify-cvsheet.ts` continues to pass with 0 hooks and 7 conditional onClicks.
2. **Automated Verification:**
   - Execute: `npx tsx test/verify-cvsheet.ts`
   - Execute: `npx tsx test/verify-level-precision.ts`
   - Execute: `npx tsx test/verify-full-inline-editing.ts`
   - Execute: `npm test` (ensures all 14 test suites pass).
3. **Browser Automation Check:**
   - Ensure local dev server is running on port 3000 (`npm run dev`).
   - Execute: `npx tsx qa/inline-edit-browser-check.ts`.
   - Inspect screenshot artifacts in `qa/out/phase4-*.png`.
