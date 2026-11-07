// Comprehensive tests for Phase 4: Full Live Preview Editing across all CV sections.
// Tests slot descriptor contracts, store mutations, Dr. Wissam template invariants,
// 42 Level protection, and print/DOCX export purity.
// Run: npx tsx test/verify-full-inline-editing.ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCVStore } from "../src/lib/store/cv-store";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { generateCvDocx } from "../src/lib/docx-generator";
import {
  MAIN_EDUCATION_ID,
} from "../src/lib/cv-constants";
import {
  DR_WISSAM_DEFAULT_HEADLINE,
  DR_WISSAM_SKILL_LABELS,
  DR_WISSAM_EDUCATION_PROGRAMS,
  formatCVSubtitle,
} from "../src/lib/template-constants";
import type { EditableFieldDescriptor } from "../src/components/templates/CVSheet";

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
  // SUITE 1: CVSheet Slot Descriptors across All 6 Sections
  // =========================================================================
  console.log("Suite 1: CVSheet Slot Descriptors Coverage");

  const testCV = createEmptyCV();
  testCV.contact.fullName = "Sarah Connor";
  testCV.contact.level = 11.45;
  testCV.contact.email = "sarah@cyberdyne.org";
  testCV.contact.phoneNumber = "+1 555 0199";
  testCV.contact.githubUrl = "github.com/sconnor";
  testCV.contact.linkedinUrl = "linkedin.com/in/sconnor";
  testCV.targetRole = "Systems Architect";

  testCV.education = [
    {
      id: MAIN_EDUCATION_ID,
      institution: "42 Abu Dhabi",
      program: DR_WISSAM_EDUCATION_PROGRAMS.STATE_A_CORE,
      startDate: "2023",
      endDate: "Present",
      isCurrent: true,
      state: "STATE_A_CORE",
      level: 11.45,
    },
    {
      id: "edu-uni",
      institution: "MIT",
      program: "B.S. in Computer Science",
      degree: "B.S. in Computer Science",
      startDate: "2019",
      endDate: "2023",
      isCurrent: false,
      state: "STATE_A_CORE",
    },
  ];

  testCV.projects = [
    {
      id: "proj-shell",
      name: "Minishell",
      is42Project: true,
      techStack: "C, Unix System Calls",
      date: "January 2025",
      bulletPoints: ["Built POSIX-compliant shell with pipelines."],
    },
  ];

  testCV.skills = {
    languages: ["C", "C++", "Python"],
    developerTools: ["Git", "Docker", "Valgrind"],
    technologiesFrameworks: ["Linux", "GDB"],
    projectManagementTools: ["GitHub", "Jira"],
  };

  testCV.coursework = [
    {
      id: "cw-security",
      title: "Advanced Kernel Exploitation",
      date: "May 2025",
    },
  ];

  const capturedDescriptors: EditableFieldDescriptor[] = [];
  const renderFieldMock = (desc: EditableFieldDescriptor, defaultNode: React.ReactNode) => {
    capturedDescriptors.push(desc);
    return defaultNode;
  };

  // Render with renderField active
  renderToStaticMarkup(
    React.createElement(CVSheet, {
      data: testCV,
      renderField: renderFieldMock,
    })
  );

  // Assert descriptors captured
  const descMap = new Map(capturedDescriptors.map((d) => [d.id, d]));

  // 1. Contact / Header fields
  ok(descMap.has("contact.fullName"), "captured contact.fullName slot");
  ok(descMap.get("contact.fullName")?.value === "Sarah Connor", "fullName value matches");

  ok(descMap.has("contact.targetRole"), "captured contact.targetRole slot");
  ok(descMap.get("contact.targetRole")?.value === "Systems Architect", "targetRole value matches");
  // Verified level must NOT be part of targetRole descriptor
  ok(!descMap.get("contact.targetRole")?.value.includes("11.45"), "level excluded from targetRole input");

  ok(descMap.has("contact.email"), "captured contact.email slot");
  ok(descMap.get("contact.email")?.value === "sarah@cyberdyne.org", "email value matches");

  ok(descMap.has("contact.phoneNumber"), "captured contact.phoneNumber slot");
  ok(descMap.get("contact.phoneNumber")?.value === "+1 555 0199", "phone value matches");

  ok(descMap.has("contact.githubUrl"), "captured contact.githubUrl slot");
  ok(descMap.get("contact.githubUrl")?.value.includes("github.com/sconnor"), "github value matches");

  ok(descMap.has("contact.linkedinUrl"), "captured contact.linkedinUrl slot");
  ok(descMap.get("contact.linkedinUrl")?.value.includes("linkedin.com/in/sconnor"), "linkedin value matches");

  // 2. Education fields
  ok(descMap.has(`education.${MAIN_EDUCATION_ID}.institution`), "captured main education institution slot");
  ok(descMap.get(`education.${MAIN_EDUCATION_ID}.institution`)?.value === "42 Abu Dhabi", "main institution value");
  ok(descMap.has(`education.${MAIN_EDUCATION_ID}.program`), "captured main education program slot");
  ok(descMap.has(`education.${MAIN_EDUCATION_ID}.dates`), "captured main education dates slot");

  ok(descMap.has("education.edu-uni.institution"), "captured secondary university institution slot");
  ok(descMap.get("education.edu-uni.institution")?.value === "MIT", "secondary university value");
  ok(descMap.has("education.edu-uni.program"), "captured secondary university program slot");
  ok(descMap.has("education.edu-uni.dates"), "captured secondary university dates slot");

  // 3. Project fields
  ok(descMap.has("project.proj-shell.name"), "captured project name slot");
  ok(descMap.get("project.proj-shell.name")?.value === "Minishell", "project name value");
  ok(descMap.has("project.proj-shell.techStack"), "captured project techStack slot");
  ok(descMap.get("project.proj-shell.techStack")?.value === "C, Unix System Calls", "project techStack value");
  ok(descMap.has("project.proj-shell.date"), "captured project date slot");
  ok(descMap.get("project.proj-shell.date")?.value === "January 2025", "project date value");
  ok(descMap.has("project.proj-shell.bullet.0"), "captured project bullet.0 slot");

  // 4. Skills fields
  ok(descMap.has("skills.languages"), "captured skills.languages slot");
  ok(descMap.get("skills.languages")?.type === "comma-list", "skills.languages type is comma-list");
  ok(descMap.get("skills.languages")?.value === "C, C++, Python", "skills.languages value joined cleanly");

  ok(descMap.has("skills.developerTools"), "captured skills.developerTools slot");
  ok(descMap.has("skills.technologiesFrameworks"), "captured skills.technologiesFrameworks slot");
  ok(descMap.has("skills.projectManagementTools"), "captured skills.projectManagementTools slot");

  // 5. Coursework fields
  ok(descMap.has("coursework.cw-security.title"), "captured coursework title slot");
  ok(descMap.get("coursework.cw-security.title")?.value === "Advanced Kernel Exploitation", "coursework title value");
  ok(descMap.has("coursework.cw-security.date"), "captured coursework date slot");
  ok(descMap.get("coursework.cw-security.date")?.value === "May 2025", "coursework date value");

  // =========================================================================
  // SUITE 2: Zustand Store Atomic Mutations & Invariant Guarantees
  // =========================================================================
  console.log("Suite 2: Store Mutations & Integrity");

  const store = useCVStore.getState();
  store.setCVData(testCV);

  // 1. updateTargetRole synchronizes both state.targetRole and state.cvData.targetRole
  const initialTimestamp = useCVStore.getState().lastSavedTimestamp;
  useCVStore.getState().updateTargetRole("Lead Kernel Developer");
  const stateAfterRole = useCVStore.getState();
  ok(stateAfterRole.targetRole === "Lead Kernel Developer", "updateTargetRole updates state.targetRole");
  ok(stateAfterRole.cvData.targetRole === "Lead Kernel Developer", "updateTargetRole updates state.cvData.targetRole");
  ok(stateAfterRole.lastSavedTimestamp >= initialTimestamp, "updateTargetRole updates lastSavedTimestamp");

  // 2. setTargetRole also synchronizes both
  useCVStore.getState().setTargetRole("Principal Systems Architect");
  const stateAfterSetRole = useCVStore.getState();
  ok(stateAfterSetRole.targetRole === "Principal Systems Architect", "setTargetRole updates state.targetRole");
  ok(stateAfterSetRole.cvData.targetRole === "Principal Systems Architect", "setTargetRole updates state.cvData.targetRole");

  // 3. updateContact guards 42 Level
  useCVStore.getState().updateContact({ fullName: "Dr. Sarah Connor", level: "" as any });
  const stateAfterContact = useCVStore.getState();
  ok(stateAfterContact.cvData.contact.fullName === "Dr. Sarah Connor", "fullName updated");
  ok(stateAfterContact.cvData.contact.level === 11.45, "blank level in patch is rejected; verified level preserved");

  // 4. updateEducationItem synchronizes degree when program is patched
  useCVStore.getState().updateEducationItem("edu-uni", { program: "Master of Science in Robotics" });
  const uniEdu = useCVStore.getState().cvData.education.find((e) => e.id === "edu-uni");
  ok(uniEdu?.program === "Master of Science in Robotics", "education program updated");
  ok(uniEdu?.degree === "Master of Science in Robotics", "degree synchronized with program to prevent masking");

  // 5. updateEducationItem on MAIN_EDUCATION_ID protects level
  useCVStore.getState().updateEducationItem(MAIN_EDUCATION_ID, { institution: "42 Paris" });
  const mainEdu = useCVStore.getState().cvData.education.find((e) => e.id === MAIN_EDUCATION_ID);
  ok(mainEdu?.institution === "42 Paris", "main institution updated");
  ok(mainEdu?.level === 11.45, "main education level preserved");

  // 6. updateSkillCategory parses, trims, and deduplicates comma lists
  useCVStore.getState().updateSkillCategory("languages", "  Rust,   Go, C++,  rust  , Python  ");
  const updatedLanguages = useCVStore.getState().cvData.skills.languages;
  ok(updatedLanguages.length === 4, "deduplicated case-insensitive list");
  ok(updatedLanguages[0] === "Rust" && updatedLanguages[1] === "Go", "trimmed skill items");
  ok(updatedLanguages[2] === "C++" && updatedLanguages[3] === "Python", "preserved remaining skills");

  // 7. updateCourseworkItem modifies title and date atomically
  useCVStore.getState().updateCourseworkItem("cw-security", {
    title: "Offensive Security Certified Expert",
    date: "June 2025",
  });
  const updatedCW = useCVStore.getState().cvData.coursework.find((c) => c.id === "cw-security");
  ok(updatedCW?.title === "Offensive Security Certified Expert", "coursework title updated");
  ok(updatedCW?.date === "June 2025", "coursework date updated");

  // =========================================================================
  // SUITE 3: Subtitle & 42 Level Rendering Invariants in CVSheet
  // =========================================================================
  console.log("Suite 3: Subtitle & Level Invariants");

  // Role with "Level" in title
  const roleWithLevel = "Entry-Level Systems Programmer";
  const sub1 = formatCVSubtitle(roleWithLevel, 11.45);
  ok(sub1 === "Entry-Level Systems Programmer – Level 11.45", "role containing 'Level' preserved with suffix");

  // De-duplication of accidental trailing level in role
  const roleWithOldSuffix = "Systems Programmer – Level 7.5";
  const sub2 = formatCVSubtitle(roleWithOldSuffix, 11.45);
  ok(sub2 === "Systems Programmer – Level 11.45", "trailing level in role cleanly replaced with verified level");

  // Standalone "Level 11" role title replaced by default headline
  const standAloneLevel = "Level 11";
  const sub3 = formatCVSubtitle(standAloneLevel, 11.45);
  ok(sub3 === `${DR_WISSAM_DEFAULT_HEADLINE} – Level 11.45`, "standalone 'Level' replaced with default headline");

  // =========================================================================
  // SUITE 4: Dr. Wissam Protected Labels & Structural Invariants
  // =========================================================================
  console.log("Suite 4: Dr. Wissam Protected Labels & Invariants");

  // Check category labels
  ok(DR_WISSAM_SKILL_LABELS.languages === "Languages", "Languages label");
  ok(DR_WISSAM_SKILL_LABELS.developerTools === "Developer Tools", "Developer Tools label");
  ok(DR_WISSAM_SKILL_LABELS.technologiesFrameworks === "Technologies/Frameworks", "Technologies/Frameworks label");
  ok(DR_WISSAM_SKILL_LABELS.projectManagementTools === "Project Management tools", "PM Tools label");

  // Verify that rendering CVSheet statically still contains all 4 protected labels
  const staticHtml = renderToStaticMarkup(
    React.createElement(CVSheet, { data: useCVStore.getState().cvData })
  );
  ok(staticHtml.includes("Languages:"), "static output has 'Languages:'");
  ok(staticHtml.includes("Developer Tools:"), "static output has 'Developer Tools:'");
  ok(staticHtml.includes("Technologies/Frameworks:"), "static output has 'Technologies/Frameworks:'");
  ok(staticHtml.includes("Project Management tools:"), "static output has 'Project Management tools:'");

  // =========================================================================
  // SUITE 5: Print Purity & Export Guarantees (Zero Editing Artifacts)
  // =========================================================================
  console.log("Suite 5: Clean Print & DOCX Export Purity");

  // Printable markup (renderField omitted)
  const printMarkup = renderToStaticMarkup(
    React.createElement(CVSheet, { data: useCVStore.getState().cvData })
  );

  ok(!printMarkup.includes("<input"), "Print markup contains zero <input> elements");
  ok(!printMarkup.includes("<textarea"), "Print markup contains zero <textarea> elements");
  ok(!printMarkup.includes("<button"), "Print markup contains zero <button> elements");
  ok(!printMarkup.includes("Click to edit"), "Print markup has no 'Click to edit' badges");
  ok(!printMarkup.includes("data-editing"), "Print markup has no editing data attributes");

  // DOCX Generation
  const docxBlob = await generateCvDocx(useCVStore.getState().cvData);
  ok(docxBlob && docxBlob.size > 1500, "DOCX generates valid binary file > 1500 bytes");

  console.log(`\n==================================================`);
  console.log(`Phase 4 Full Live Preview Editing Verification: ${pass} passed, ${fail} failed`);
  console.log(`==================================================`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
