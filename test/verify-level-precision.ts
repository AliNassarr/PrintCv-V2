// Comprehensive automated tests for Phase 1: 42 Level Precision, subtitle formatting,
// malformed value rejection, draft preservation, and preview/print/DOCX consistency.
// Run: npx tsx test/verify-level-precision.ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import {
  parseStrict42Level,
  format42Level,
  format42LevelLabel,
  formatCVSubtitle,
  DR_WISSAM_DEFAULT_HEADLINE,
} from "../src/lib/template-constants";
import {
  levelFromIntra,
  createInitialCVFromIntra,
  mergeIntraIntoCV,
  createEmptyCV,
} from "../src/lib/intra/cv-from-intra";
import { generateCvDocx } from "../src/lib/docx-generator";

let pass = 0;
let fail = 0;
const ok = (condition: unknown, msg: string) => {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.error("FAIL:", msg);
  }
};

(globalThis as any).React = React;

async function run() {
  const { CVSheet } = await import("../src/components/templates/CVSheet");

  // =========================================================================
  // 1. Centralized Level Formatting (format42Level & format42LevelLabel)
  // =========================================================================
  console.log("Suite 1: Centralized Level Formatting");

  // Exact required examples
  ok(format42Level(11.45) === "11.45", "11.45 -> '11.45'");
  ok(format42Level(3.5) === "3.5", "3.5 -> '3.5'");
  ok(format42Level(5.01) === "5.01", "5.01 -> '5.01'");
  ok(format42Level(2) === "2", "2 -> '2'");

  // String numeric inputs (e.g. from localStorage or API)
  ok(format42Level("11.45") === "11.45", "'11.45' -> '11.45'");
  ok(format42Level(" 3.5 ") === "3.5", "' 3.5 ' -> '3.5'");
  ok(format42Level("2.0") === "2", "'2.0' -> '2'");
  ok(format42Level("2.00") === "2", "'2.00' -> '2'");
  ok(format42Level("11.4500") === "11.45", "'11.4500' -> '11.45'");

  // Truncation / rounding to max 2 decimals
  ok(format42Level(11.456) === "11.46", "11.456 rounds to 11.46");
  ok(format42Level(3.504) === "3.5", "3.504 rounds to 3.5");

  // Invalid / missing / zero values rejected (strict numeric parsing)
  ok(format42Level(0) === "", "0 -> ''");
  ok(format42Level("0") === "", "'0' -> ''");
  ok(format42Level("0.0") === "", "'0.0' -> ''");
  ok(format42Level("0.00") === "", "'0.00' -> ''");
  ok(format42Level(-1) === "", "-1 -> ''");
  ok(format42Level("-5.5") === "", "'-5.5' -> ''");
  ok(format42Level("") === "", "'' -> ''");
  ok(format42Level("   ") === "", "'   ' -> ''");
  ok(format42Level(null) === "", "null -> ''");
  ok(format42Level(undefined) === "", "undefined -> ''");
  ok(format42Level("invalid") === "", "'invalid' -> ''");
  ok(format42Level("11.45abc") === "", "'11.45abc' strictly rejected -> ''");
  ok(format42Level("5.4.2") === "", "'5.4.2' strictly rejected -> ''");
  ok(format42Level("11.45.67") === "", "'11.45.67' strictly rejected -> ''");
  ok(format42Level("Infinity") === "", "'Infinity' string rejected -> ''");
  ok(format42Level("-Infinity") === "", "'-Infinity' string rejected -> ''");
  ok(format42Level(NaN) === "", "NaN -> ''");
  ok(format42Level(Infinity) === "", "Infinity -> ''");
  ok(format42Level(-Infinity) === "", "-Infinity -> ''");
  ok(format42Level({}) === "", "{} -> ''");
  ok(format42Level([]) === "", "[] -> ''");
  ok(format42Level(true) === "", "true -> ''");
  ok(format42Level(false) === "", "false -> ''");

  // Direct parseStrict42Level checks
  ok(parseStrict42Level(11.45) === 11.45, "parseStrict42Level(11.45)");
  ok(parseStrict42Level("11.45") === 11.45, "parseStrict42Level('11.45')");
  ok(parseStrict42Level("11.45abc") === null, "parseStrict42Level('11.45abc') is null");
  ok(parseStrict42Level("5.4.2") === null, "parseStrict42Level('5.4.2') is null");
  ok(parseStrict42Level("Infinity") === null, "parseStrict42Level('Infinity') is null");
  ok(parseStrict42Level(0) === null, "parseStrict42Level(0) is null");

  // format42LevelLabel
  ok(format42LevelLabel(11.45) === "Level 11.45", "label for 11.45");
  ok(format42LevelLabel(3.5) === "Level 3.5", "label for 3.5");
  ok(format42LevelLabel(5.01) === "Level 5.01", "label for 5.01");
  ok(format42LevelLabel(2) === "Level 2", "label for 2");
  ok(format42LevelLabel(0) === "", "label for 0 is empty");
  ok(format42LevelLabel("bad") === "", "label for 'bad' is empty");
  ok(format42LevelLabel(null) === "", "label for null is empty");

  // =========================================================================
  // 2. Subtitle Formatting & Role Title Preservation (formatCVSubtitle)
  // =========================================================================
  console.log("Suite 2: Subtitle Formatting & Role Title Preservation");

  // Default role
  ok(formatCVSubtitle("", 11.45) === "42 Student – Level 11.45", "default role with level 11.45");
  ok(formatCVSubtitle(undefined, 3.5) === "42 Student – Level 3.5", "undefined role with level 3.5");
  ok(formatCVSubtitle("   ", 5.01) === "42 Student – Level 5.01", "whitespace role with level 5.01");
  ok(formatCVSubtitle("", "") === "42 Student", "default role with empty level");
  ok(formatCVSubtitle("", 0) === "42 Student", "default role with 0 level");

  // Roles containing the word "Level" (MUST NOT BE SUPPRESSED!)
  ok(
    formatCVSubtitle("Entry-Level Developer", 11.45) === "Entry-Level Developer – Level 11.45",
    "Entry-Level Developer preserves role and appends level"
  );
  ok(
    formatCVSubtitle("Mid-Level Software Engineer", 3.5) === "Mid-Level Software Engineer – Level 3.5",
    "Mid-Level Software Engineer preserves role and appends level"
  );
  ok(
    formatCVSubtitle("Staff-Level Infrastructure Architect", 2) ===
      "Staff-Level Infrastructure Architect – Level 2",
    "Staff-Level Infrastructure Architect preserves role and appends level"
  );
  ok(
    formatCVSubtitle("Entry-Level Developer", 0) === "Entry-Level Developer",
    "Entry-Level Developer without level shows clean role"
  );

  // Standard roles without "Level"
  ok(
    formatCVSubtitle("Full Stack Engineer", 11.45) === "Full Stack Engineer – Level 11.45",
    "Full Stack Engineer with level"
  );
  ok(
    formatCVSubtitle("Systems Programmer", "") === "Systems Programmer",
    "Systems Programmer without level"
  );

  // De-duplication of accidental trailing level suffixes
  ok(
    formatCVSubtitle("42 Student – Level 11", 11.45) === "42 Student – Level 11.45",
    "replaces old trailing level in role with verified level"
  );
  ok(
    formatCVSubtitle("Software Engineer - Level 9.2", 11.45) === "Software Engineer – Level 11.45",
    "replaces hyphenated trailing level in role"
  );
  ok(
    formatCVSubtitle("Level 11", 11.45) === "42 Student – Level 11.45",
    "standalone 'Level 11' role replaced with default headline and verified level"
  );

  // =========================================================================
  // 3. Intra Profile Extraction & Merge Precision (levelFromIntra)
  // =========================================================================
  console.log("Suite 3: Intra Profile Extraction & Merge Precision");

  const makeUser = (level: any) => ({
    id: 10,
    login: "testuser",
    email: "test@example.org",
    displayname: "Test User",
    image: "",
    campusName: "42 Beirut",
    campusId: 21,
    level,
    grade: "Learner",
    poolMonth: "",
    poolYear: 2024,
    coalition: "",
    beginAt: "2024-01-01T00:00:00Z",
    validatedProjects: [],
  });

  ok(levelFromIntra(makeUser(11.45) as any) === 11.45, "levelFromIntra preserves 11.45");
  ok(levelFromIntra(makeUser(3.5) as any) === 3.5, "levelFromIntra preserves 3.5");
  ok(levelFromIntra(makeUser(5.01) as any) === 5.01, "levelFromIntra preserves 5.01");
  ok(levelFromIntra(makeUser(2) as any) === 2, "levelFromIntra preserves 2");
  ok(levelFromIntra(makeUser("11.45") as any) === 11.45, "levelFromIntra parses '11.45'");
  ok(levelFromIntra(makeUser("11.45abc") as any) === "", "levelFromIntra rejects '11.45abc'");
  ok(levelFromIntra(makeUser("5.4.2") as any) === "", "levelFromIntra rejects '5.4.2'");
  ok(levelFromIntra(makeUser("Infinity") as any) === "", "levelFromIntra rejects 'Infinity'");
  ok(levelFromIntra(makeUser(0) as any) === "", "levelFromIntra returns '' for 0");
  ok(levelFromIntra(makeUser(-2) as any) === "", "levelFromIntra returns '' for negative");
  ok(levelFromIntra(makeUser("invalid") as any) === "", "levelFromIntra returns '' for malformed string");
  ok(levelFromIntra(makeUser(null) as any) === "", "levelFromIntra returns '' for null");

  // Initial CV generation from Intra
  const cv11 = createInitialCVFromIntra(makeUser(11.45) as any);
  ok(cv11.contact.level === 11.45, "initial CV contact.level is 11.45");
  ok(cv11.education[0].level === 11.45, "initial CV education[0].level is 11.45");

  // Re-synchronization preserves customized user fields
  const userCV = createEmptyCV();
  userCV.targetRole = "Entry-Level Systems Developer";
  userCV.contact.fullName = "Custom Name";
  userCV.contact.phoneNumber = "+961 70 123456";
  userCV.contact.githubUrl = "https://github.com/custom";
  userCV.contact.level = 9; // Old level in draft
  userCV.projects = [
    {
      id: "proj-custom-1",
      name: "Custom Project",
      is42Project: false,
      techStack: "Rust, WebAssembly",
      date: "2025",
      bulletPoints: ["Implemented high-performance parser", "Achieved 10x speedup"],
    },
  ];

  const merged = mergeIntraIntoCV(userCV, makeUser(11.45) as any);
  ok(merged.targetRole === "Entry-Level Systems Developer", "merge keeps custom targetRole");
  ok(merged.contact.fullName === "Custom Name", "merge keeps custom fullName");
  ok(merged.contact.phoneNumber === "+961 70 123456", "merge keeps custom phoneNumber");
  ok(merged.contact.githubUrl === "https://github.com/custom", "merge keeps custom githubUrl");
  ok(merged.contact.level === 11.45, "merge updates verified level to 11.45");
  ok(merged.education[0].level === 11.45, "merge updates education[0].level to 11.45");
  ok(merged.projects.length === 1 && merged.projects[0].name === "Custom Project", "merge preserves custom projects");
  ok(merged.projects[0].bulletPoints.length === 2, "merge preserves custom bullet points");

  // Re-synchronization with 0/missing level in Intra preserves existing draft level
  const mergedZero = mergeIntraIntoCV(userCV, makeUser(0) as any);
  ok(mergedZero.contact.level === 9, "merge with level 0 preserves existing draft level");

  // =========================================================================
  // 4. CVSheet Live Preview & Print Markup Output
  // =========================================================================
  console.log("Suite 4: CVSheet Live Preview & Print Markup Output");

  // Test 11.45
  const cvSheet11 = renderToStaticMarkup(React.createElement(CVSheet, { data: cv11 }));
  ok(cvSheet11.includes("42 Student – Level 11.45"), "CVSheet renders '42 Student – Level 11.45'");
  ok(cvSheet11.includes("42 Beirut – Level 11.45"), "CVSheet renders '42 Beirut – Level 11.45' in education");

  // Test 3.5
  const cv35 = createInitialCVFromIntra(makeUser(3.5) as any);
  const cvSheet35 = renderToStaticMarkup(React.createElement(CVSheet, { data: cv35 }));
  ok(cvSheet35.includes("42 Student – Level 3.5"), "CVSheet renders '42 Student – Level 3.5'");
  ok(!cvSheet35.includes("Level 3.50"), "CVSheet avoids unnecessary trailing zero 'Level 3.50'");

  // Test 5.01
  const cv501 = createInitialCVFromIntra(makeUser(5.01) as any);
  const cvSheet501 = renderToStaticMarkup(React.createElement(CVSheet, { data: cv501 }));
  ok(cvSheet501.includes("42 Student – Level 5.01"), "CVSheet renders '42 Student – Level 5.01'");

  // Test 2
  const cv2 = createInitialCVFromIntra(makeUser(2) as any);
  const cvSheet2 = renderToStaticMarkup(React.createElement(CVSheet, { data: cv2 }));
  ok(cvSheet2.includes("42 Student – Level 2"), "CVSheet renders '42 Student – Level 2'");
  ok(!cvSheet2.includes("Level 2.0"), "CVSheet avoids 'Level 2.0'");

  // Test "Entry-Level Developer" in CVSheet
  const cvEntry = createInitialCVFromIntra(makeUser(11.45) as any);
  cvEntry.targetRole = "Entry-Level Systems Developer";
  const cvSheetEntry = renderToStaticMarkup(React.createElement(CVSheet, { data: cvEntry }));
  ok(
    cvSheetEntry.includes("Entry-Level Systems Developer – Level 11.45"),
    "CVSheet renders 'Entry-Level Systems Developer – Level 11.45' without suppressing 'Level'"
  );

  // Test missing level in CVSheet
  const cvNoLevel = createInitialCVFromIntra(makeUser(0) as any);
  const cvSheetNoLevel = renderToStaticMarkup(React.createElement(CVSheet, { data: cvNoLevel }));
  ok(cvSheetNoLevel.includes("42 Student"), "CVSheet renders default headline without level");
  ok(!cvSheetNoLevel.includes("Level"), "CVSheet does not render 'Level' when level is 0");

  // =========================================================================
  // 5. DOCX Export Consistency
  // =========================================================================
  console.log("Suite 5: DOCX Export Consistency");

  async function getDocxXml(cvData: any): Promise<string> {
    const blob = await generateCvDocx(cvData);
    const arrayBuffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) throw new Error("word/document.xml not found in DOCX");
    return await docXmlFile.async("text");
  }

  // DOCX for 11.45
  const docxXml11 = await getDocxXml(cv11);
  ok(docxXml11.includes("42 Student – Level 11.45"), "DOCX contains '42 Student – Level 11.45' in subtitle");
  ok(docxXml11.includes("42 Beirut – Level 11.45"), "DOCX contains '42 Beirut – Level 11.45' in education");

  // DOCX for 3.5
  const docxXml35 = await getDocxXml(cv35);
  ok(docxXml35.includes("42 Student – Level 3.5"), "DOCX contains '42 Student – Level 3.5'");
  ok(!docxXml35.includes("Level 3.50"), "DOCX does not contain 'Level 3.50'");

  // DOCX for 5.01
  const docxXml501 = await getDocxXml(cv501);
  ok(docxXml501.includes("42 Student – Level 5.01"), "DOCX contains '42 Student – Level 5.01'");

  // DOCX for 2
  const docxXml2 = await getDocxXml(cv2);
  ok(docxXml2.includes("42 Student – Level 2"), "DOCX contains '42 Student – Level 2'");
  ok(!docxXml2.includes("Level 2.0"), "DOCX does not contain 'Level 2.0'");

  // DOCX for "Entry-Level Developer"
  const docxXmlEntry = await getDocxXml(cvEntry);
  ok(
    docxXmlEntry.includes("Entry-Level Systems Developer – Level 11.45"),
    "DOCX contains 'Entry-Level Systems Developer – Level 11.45' without suppression"
  );

  // DOCX for no level
  const docxXmlNoLevel = await getDocxXml(cvNoLevel);
  ok(docxXmlNoLevel.includes("42 Student"), "DOCX contains '42 Student'");
  ok(!docxXmlNoLevel.includes("Level"), "DOCX does not contain 'Level' when level is 0");

  console.log(`\n==================================================`);
  console.log(`Phase 1 Verification: ${pass} passed, ${fail} failed`);
  console.log(`==================================================`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
