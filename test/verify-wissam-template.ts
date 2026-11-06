// Comprehensive tests for Dr. Wissam CV Template compliance across CVSheet, DOCX, and Intra merge.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createInitialCVFromIntra,
  mergeIntraIntoCV,
  createEmptyCV,
  programForState,
  projectsFromIntra,
} from "../src/lib/intra/cv-from-intra";
import {
  deriveVerifiedSkillsFromProjects,
  safelyMergeSkills,
  hasExistingSkills,
} from "../src/lib/intra/skills-from-projects";
import {
  DR_WISSAM_EDUCATION_PROGRAMS,
  DR_WISSAM_DEFAULT_HEADLINE,
  DR_WISSAM_SKILL_LABELS,
  DR_WISSAM_SECTION_ORDER,
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

  // -------------------------------------------------------------
  // TEST SUITE 1: Template Constants & Formatting Helpers
  // -------------------------------------------------------------
  ok(
    DR_WISSAM_EDUCATION_PROGRAMS.STATE_A_CORE ===
      "42 Core Curriculum - Architecture of Digital Technologies Program",
    "State A program matches Dr. Wissam template"
  );
  ok(
    DR_WISSAM_EDUCATION_PROGRAMS.STATE_B_SPECIALIZATION ===
      "Completed the 42 Core Curriculum - Architecture of Digital Technologies Program",
    "State B program matches Dr. Wissam template"
  );
  ok(
    DR_WISSAM_SKILL_LABELS.technologiesFrameworks === "Technologies/Frameworks",
    "Category 3 uses slash per template"
  );
  ok(
    DR_WISSAM_SKILL_LABELS.projectManagementTools === "Project Management tools",
    "Category 4 uses lowercase 'tools' per template"
  );
  ok(
    formatSpecializationTrack("Cybersecurity") ===
      "Advanced Curriculum - Cybersecurity Specialization Track",
    "formatSpecializationTrack adds prefix and suffix"
  );
  ok(
    formatSpecializationTrack("Cybersecurity Track") ===
      "Advanced Curriculum - Cybersecurity Specialization Track",
    "formatSpecializationTrack handles 'Track' suffix gracefully"
  );
  ok(
    formatSpecializationTrack("Advanced Curriculum - Cybersecurity Specialization Track") ===
      "Advanced Curriculum - Cybersecurity Specialization Track",
    "formatSpecializationTrack is idempotent"
  );

  // -------------------------------------------------------------
  // TEST SUITE 2: Evidence-Based Skill Inference from 42 Projects
  // -------------------------------------------------------------
  const projects = [
    { id: 1, name: "libft", slug: "libft", finalMark: 100, validated: true, markedAt: "2024-01-01" },
    { id: 2, name: "minishell", slug: "minishell", finalMark: 100, validated: true, markedAt: "2024-03-01" },
    { id: 3, name: "CPP Module 00", slug: "cpp-module-00", finalMark: 100, validated: true, markedAt: "2024-04-01" },
    { id: 4, name: "Inception", slug: "inception", finalMark: 100, validated: true, markedAt: "2024-05-01" },
  ];

  const derived = deriveVerifiedSkillsFromProjects(projects);
  ok(derived.languages.includes("C") && derived.languages.includes("C++") && derived.languages.includes("Bash"), "inferred C, C++, and Bash");
  ok(derived.developerTools.includes("Git") && derived.developerTools.includes("Make"), "inferred Git and Make in Developer Tools");
  ok(derived.technologiesFrameworks.includes("Linux") && derived.technologiesFrameworks.includes("Docker"), "inferred Linux and Docker in Technologies/Frameworks");
  ok(derived.projectManagementTools.length === 0, "unverified PM tools left empty per Decision 2");

  // Preservation: user-entered skills are NEVER overwritten
  const userSkills = {
    languages: ["Rust", "Go"],
    developerTools: ["Neovim"],
    technologiesFrameworks: ["Kubernetes"],
    projectManagementTools: ["Linear"],
  };
  ok(hasExistingSkills(userSkills), "detects existing user skills");
  const mergedSkills = safelyMergeSkills(userSkills, derived);
  ok(
    mergedSkills.languages.length === 2 &&
      mergedSkills.languages[0] === "Rust" &&
      mergedSkills.languages[1] === "Go",
    "user skills strictly preserved on subsequent merge"
  );

  // -------------------------------------------------------------
  // TEST SUITE 3: 42 Intra Merge Behavior & Project Fallbacks
  // -------------------------------------------------------------
  const mockUser: any = {
    id: 42,
    login: "wsammour",
    email: "wissam@example.org",
    displayname: "Wissam Sammouri",
    image: "",
    campusName: "Beirut",
    campusId: 21,
    level: 9.35,
    grade: "Learner",
    poolMonth: "",
    poolYear: 2023,
    coalition: "",
    beginAt: "2023-11-01T00:00:00Z",
    validatedProjects: projects,
  };

  const initialCV = createInitialCVFromIntra(mockUser);
  ok(initialCV.contact.fullName === "Wissam Sammouri", "full name imported from Intra");
  ok(initialCV.targetRole === DR_WISSAM_DEFAULT_HEADLINE, "targetRole defaults to 42 Student");
  ok(initialCV.education[0].program === DR_WISSAM_EDUCATION_PROGRAMS.STATE_A_CORE, "State A education program set");
  ok(initialCV.skills.languages.includes("C"), "initial CV populated with verified skills");
  ok(initialCV.projects.length === 4, "projects imported");
  ok(initialCV.projects.every((p) => p.techStack !== ""), "every 42 project has non-empty techStack");

  // Subsequent login idempotency & user changes preservation
  const customizedCV = { ...initialCV };
  customizedCV.targetRole = "Backend Systems Engineer";
  customizedCV.projects[0].bulletPoints = ["Custom verified achievement line 1", "Custom verified line 2"];

  const remergedCV = mergeIntraIntoCV(customizedCV, mockUser);
  ok(remergedCV.targetRole === "Backend Systems Engineer", "merge preserves customized targetRole");
  ok(
    remergedCV.projects[0].bulletPoints.length === 2 &&
      remergedCV.projects[0].bulletPoints[0] === "Custom verified achievement line 1",
    "merge preserves user-written project bullets"
  );

  // -------------------------------------------------------------
  // TEST SUITE 4: CVSheet Live Preview & Print Markup
  // -------------------------------------------------------------
  initialCV.contact.githubUrl = "github.com/wsammour";
  initialCV.contact.linkedinUrl = "linkedin.com/in/wsammour";
  initialCV.skills.projectManagementTools = ["JIRA"];

  const html = renderToStaticMarkup(React.createElement(CVSheet, { data: initialCV }));

  // Header Title Case: Wissam Sammouri (NOT WISSAM SAMMOURI)
  ok(html.includes("Wissam Sammouri"), "name rendered in title case");
  ok(!html.includes("WISSAM SAMMOURI"), "uppercase name removed");

  // Subtitle: 42 Student – Level 9
  ok(html.includes("42 Student – Level 9"), "subtitle rendered with Dr. Wissam default and Level");

  // Icons: GitHub & LinkedIn SVGs present
  ok(html.includes("<svg") && html.includes("viewBox=\"0 0 24 24\""), "contact icons rendered as SVGs");

  // Location NOT in header contact line
  ok(!html.includes("|") || !html.includes("<span>Beirut</span>"), "header contact strip does not duplicate campus location");

  // Education: Program title without duplicated location on right
  ok(
    html.includes("42 Core Curriculum - Architecture of Digital Technologies Program"),
    "State A program rendered"
  );

  // Technical Skills Category Labels
  ok(html.includes("Languages:"), "Skills has 'Languages:'");
  ok(html.includes("Developer Tools:"), "Skills has 'Developer Tools:'");
  ok(html.includes("Technologies/Frameworks:"), "Skills has 'Technologies/Frameworks:'");
  ok(html.includes("Project Management tools:"), "Skills has 'Project Management tools:'");

  // Relevant Coursework: unbulleted two-column rows
  initialCV.coursework = [
    { id: "cw-1", title: "42 Beirut Extracurricular Cybersecurity Piscine", date: "May 2025" },
  ];
  const htmlWithCw = renderToStaticMarkup(React.createElement(CVSheet, { data: initialCV }));
  ok(
    htmlWithCw.includes("Relevant Coursework and Workshops") &&
      htmlWithCw.includes("42 Beirut Extracurricular Cybersecurity Piscine") &&
      !htmlWithCw.includes("list-disc ml-4 space-y-0 text-gray-800\"><li"),
    "coursework rendered without bullet list"
  );

  // State B Specialization formatting in CVSheet
  const stateBCV = {
    ...initialCV,
    educationState: "STATE_B_SPECIALIZATION" as const,
    specializationTrack: "Cybersecurity",
    education: [
      {
        ...initialCV.education[0],
        state: "STATE_B_SPECIALIZATION" as const,
        program: DR_WISSAM_EDUCATION_PROGRAMS.STATE_B_SPECIALIZATION,
      },
    ],
  };
  const htmlStateB = renderToStaticMarkup(React.createElement(CVSheet, { data: stateBCV }));
  ok(
    htmlStateB.includes("Completed the 42 Core Curriculum - Architecture of Digital Technologies Program"),
    "State B completed core line"
  );
  ok(
    htmlStateB.includes("Advanced Curriculum - Cybersecurity Specialization Track"),
    "State B specialization track formatted"
  );

  // State C Alumnus graduation year in CVSheet
  const stateCCV = {
    ...initialCV,
    educationState: "STATE_C_ALUMNUS" as const,
    education: [
      {
        ...initialCV.education[0],
        state: "STATE_C_ALUMNUS" as const,
        startDate: "2024",
        endDate: "2025",
        isCurrent: false,
        program: DR_WISSAM_EDUCATION_PROGRAMS.STATE_C_ALUMNUS,
      },
    ],
  };
  const htmlStateC = renderToStaticMarkup(React.createElement(CVSheet, { data: stateCCV }));
  ok(htmlStateC.includes("2025"), "State C shows graduation year");
  ok(!htmlStateC.includes("2024 – 2025"), "State C avoids range format when graduation year available");

  // -------------------------------------------------------------
  // TEST SUITE 5: DOCX Export Generation
  // -------------------------------------------------------------
  const docxBlob = await generateCvDocx(stateBCV);
  ok(docxBlob && docxBlob.size > 1000, "DOCX generator produces valid non-empty blob");

  console.log(`Dr. Wissam template verification: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
