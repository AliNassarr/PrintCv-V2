import { useCVStore, normalizeLinkedIn, normalizeGitHub, ParsedCVData } from "../src/lib/store/cv-store";
import { CVData } from "../src/types/resume";

async function testHydration() {
  console.log("==================================================================");
  console.log("Checks: loading a parsed CV into the store, and link cleanup");
  console.log("==================================================================\n");

  // Sample student resume mock data (e.g. from the copy-paste import)
  const mockParsedData: ParsedCVData = {
    contact: {
      fullName: "Alex Example",
      email: "alex@example.org",
      phone: "+1 555 0100",
      linkedin: "https://www.linkedin.com/in/example-student",
      github: "https://github.com/example-student",
    },
    education: [
      {
        institution: "Example University - Faculty of Sciences",
        degree: "Bachelor of Science in Computer Science",
        location: "Southport, Example",
        startDate: "September 2020",
        endDate: "July 2023",
      },
    ],
    experience: [
      {
        company: "Example Market",
        role: "Part-time Web Helper",
        location: "Southport, Example",
        startDate: "February 2026",
        endDate: "September 2026",
        descriptionBullets: [
          "Made a simple opening-hours page for a small example shop.",
          "Built Study Planner, a web app using Next.js and Supabase to track 200+ study tasks.",
        ],
        rawNotes: "Made a shop opening-hours page and the Study Planner app.",
      },
    ],
    skills: {
      languages: ["C", "C++", "Python", "JavaScript", "TypeScript", "SQL"],
      developerTools: ["Git", "GitHub", "Docker", "Make", "Linux", "VS Code", "GDB", "Valgrind"],
      technologiesFrameworks: ["React", "Next.js", "Node.js", "NGINX", "Supabase", "Express"],
      projectManagementTools: ["JIRA", "GitHub Projects", "Trello"],
    },
    customProjects: [
      {
        name: "Study Planner",
        techStack: "Next.js, Supabase",
        date: "2025",
        summaryBullets: [
          "Built a web app that lets students plan study tasks for each week.",
          "Added a simple reminder list that shows the next three tasks.",
        ],
        rawNotes: "Study planner web app with a Supabase backend.",
      },
    ],
    extracurriculars: [
      {
        organization: "Example Chess Club",
        role: "Club Helper",
        startDate: "2022",
        endDate: "2024",
        bulletPoints: ["Kept the club sign-up list up to date."],
      },
    ],
    coursework: [
      "Example Online Web Basics Course",
      "Example Intro to Databases Course",
    ],
  };

  // Test 1: Test hydrateFromParsedCV in Zustand store
  console.log("[STAGE 1] Testing hydrateFromParsedCV state hydration...");
  const store = useCVStore.getState();

  store.hydrateFromParsedCV(mockParsedData);

  const updatedState = useCVStore.getState();
  const cv = updatedState.cvData;

  console.log("  - Full Name:        ", cv.contact.fullName);
  console.log("  - Email:            ", cv.contact.email);
  console.log("  - Phone:            ", cv.contact.phoneNumber);
  console.log("  - LinkedIn:         ", cv.contact.linkedinUrl);
  console.log("  - GitHub:           ", cv.contact.githubUrl);
  console.log("  - Show Experience:  ", updatedState.showExperience);
  console.log("  - Experience Count: ", cv.experience.length);
  console.log("  - Education Count:  ", cv.education.length);
  console.log("  - Languages:        ", cv.skills.languages.join(", "));
  console.log("  - Developer Tools:  ", cv.skills.developerTools.join(", "));
  console.log("  - Frameworks:       ", cv.skills.technologiesFrameworks.join(", "));
  console.log("  - PM Tools:         ", cv.skills.projectManagementTools.join(", "));
  console.log("  - Custom Projects:  ", updatedState.customProjects.length);
  console.log("  - Selected Projects:", updatedState.selectedProjects.length);

  // Assertions
  if (cv.contact.fullName !== "Alex Example") throw new Error("Full name mismatch");
  if (cv.contact.email !== "alex@example.org") throw new Error("Email mismatch");
  if (cv.contact.phoneNumber !== "+1 555 0100") throw new Error("Phone mismatch");
  if (cv.contact.linkedinUrl !== "linkedin.com/in/example-student") throw new Error("LinkedIn normalization failed");
  if (cv.contact.githubUrl !== "github.com/example-student") throw new Error("GitHub normalization failed");

  if (!updatedState.showExperience) throw new Error("showExperience was not set to true");
  if (cv.experience.length < 1) throw new Error("Experience was not populated");
  if (cv.experience[0].company !== "Example Market") throw new Error("Experience company mismatch");

  // Verify education kept the main 42 entry and added the university
  const hasPrimary = cv.education.some((e) => e.id === "edu-main");
  const hasUniv = cv.education.some((e) => e.institution.includes("Example University"));
  if (!hasPrimary) throw new Error("Main 42 education entry was overwritten!");
  if (!hasUniv) throw new Error("University degree was not added!");

  // Verify skills populated
  if (!cv.skills.languages.includes("C++") || !cv.skills.languages.includes("Python")) {
    throw new Error("Languages were not merged!");
  }
  if (!cv.skills.developerTools.includes("Docker") || !cv.skills.developerTools.includes("Valgrind")) {
    throw new Error("Developer tools were not merged!");
  }
  if (!cv.skills.technologiesFrameworks.includes("Supabase") || !cv.skills.technologiesFrameworks.includes("Express")) {
    throw new Error("Frameworks were not merged!");
  }
  if (!cv.skills.projectManagementTools.includes("JIRA")) {
    throw new Error("PM tools were not merged!");
  }

  // Verify custom project added to customProjects and selectedProjects
  const hasPlannerInCustom = updatedState.customProjects.some((p) => p.name === "Study Planner");
  const hasPlannerInSelected = updatedState.selectedProjects.some((p) => p.name === "Study Planner");
  if (!hasPlannerInCustom) throw new Error("Study Planner not found in customProjects");
  if (!hasPlannerInSelected) throw new Error("Study Planner not found in selectedProjects");

  // Verify projectAnswers has notes
  const notes = updatedState.projectAnswers["study-planner"]?.["personal-notes"];
  if (!notes || notes.length < 5) throw new Error("Project answers personal-notes not populated");

  console.log("✓ STAGE 1 PASSED: store loading works.\n");

  // Stage 2: Verify Anti-Duplication Regex Normalization
  console.log("[STAGE 2] Testing recursive URL normalization edge cases...");
  const recursiveLinkedIn = normalizeLinkedIn("linkedin.com/in/linkedin.com/in/example-student");
  const recursiveGitHub = normalizeGitHub("github.com/github.com/example-student");
  console.log("  - Normalized recursive LinkedIn:", recursiveLinkedIn);
  console.log("  - Normalized recursive GitHub:  ", recursiveGitHub);
  if (recursiveLinkedIn !== "linkedin.com/in/example-student") throw new Error("Recursive LinkedIn normalization failed");
  if (recursiveGitHub !== "github.com/example-student") throw new Error("Recursive GitHub normalization failed");
  console.log("✓ STAGE 2 PASSED: link cleanup works.\n");

  console.log("==================================================================");
  console.log("All hydration checks passed.");
  console.log("==================================================================");
}

testHydration().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
