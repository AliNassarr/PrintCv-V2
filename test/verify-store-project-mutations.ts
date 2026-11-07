// Automated verification for Phase 2: Granular Zustand store project mutations.
// Run: npx tsx test/verify-store-project-mutations.ts
import { useCVStore } from "../src/lib/store/cv-store";
import { ProjectItem } from "../src/types/resume";

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

async function run() {
  const store = useCVStore.getState();

  // Reset store to known state
  store.resetToDefaults();

  const proj1: ProjectItem = {
    id: "proj-test-1",
    name: "Minishell",
    slug: "minishell",
    is42Project: true,
    techStack: "C, Unix",
    date: "January 2025",
    bulletPoints: ["Initial bullet 1", "Initial bullet 2"],
  };

  const proj2: ProjectItem = {
    id: "proj-test-2",
    name: "Inception",
    slug: "inception",
    is42Project: true,
    techStack: "Docker, NGINX",
    date: "February 2025",
    bulletPoints: ["Docker containerization bullet"],
  };

  useCVStore.setState((state) => ({
    cvData: {
      ...state.cvData,
      contact: {
        fullName: "Original Student",
        level: 11.45,
        email: "student@example.org",
        phoneNumber: "+1 555 0100",
        githubUrl: "github.com/student",
        linkedinUrl: "linkedin.com/in/student",
      },
      projects: [proj1, proj2],
    },
  }));

  const initialTime = useCVStore.getState().lastSavedTimestamp;

  // 1. updateProject: updates target project fields atomically without touching other projects
  useCVStore.getState().updateProject("proj-test-1", {
    techStack: "C, POSIX System Calls, Process Management",
    date: "March 2025",
  });

  const state1 = useCVStore.getState();
  const updatedProj1 = state1.cvData.projects.find((p) => p.id === "proj-test-1")!;
  const untouchedProj2 = state1.cvData.projects.find((p) => p.id === "proj-test-2")!;

  ok(
    updatedProj1.techStack === "C, POSIX System Calls, Process Management",
    "updateProject updates techStack on target project"
  );
  ok(updatedProj1.date === "March 2025", "updateProject updates date on target project");
  ok(updatedProj1.name === "Minishell", "updateProject leaves unpatched name untouched");
  ok(untouchedProj2.techStack === "Docker, NGINX", "updateProject never mutates unrelated project 2");
  ok(state1.cvData.contact.fullName === "Original Student", "updateProject never mutates contact info");
  ok(state1.lastSavedTimestamp >= initialTime, "updateProject updates lastSavedTimestamp");

  // 2. updateProjectBullet: updates single bullet at index atomically
  useCVStore.getState().updateProjectBullet("proj-test-1", 1, "Updated bullet point 2 text");

  const state2 = useCVStore.getState();
  const proj1AfterBulletUpdate = state2.cvData.projects.find((p) => p.id === "proj-test-1")!;
  ok(
    proj1AfterBulletUpdate.bulletPoints[0] === "Initial bullet 1",
    "bullet at index 0 remains untouched"
  );
  ok(
    proj1AfterBulletUpdate.bulletPoints[1] === "Updated bullet point 2 text",
    "bullet at index 1 is updated"
  );
  ok(proj1AfterBulletUpdate.bulletPoints.length === 2, "bulletPoints length unchanged");

  // 3. updateProjectBullet on empty project bullet list (boundary check for first bullet)
  const emptyProj: ProjectItem = {
    id: "proj-empty",
    name: "Empty Project",
    is42Project: true,
    techStack: "C",
    date: "2025",
    bulletPoints: [],
  };
  useCVStore.setState((s) => ({
    cvData: { ...s.cvData, projects: [...s.cvData.projects, emptyProj] },
  }));

  useCVStore.getState().updateProjectBullet("proj-empty", 0, "First created bullet");
  const state3 = useCVStore.getState();
  const updatedEmpty = state3.cvData.projects.find((p) => p.id === "proj-empty")!;
  ok(
    updatedEmpty.bulletPoints.length === 1 && updatedEmpty.bulletPoints[0] === "First created bullet",
    "updateProjectBullet cleanly sets index 0 when bullets was empty"
  );

  // 4. addProjectBullet: appends bullet cleanly
  useCVStore.getState().addProjectBullet("proj-test-2", "New second bullet for Inception");
  const state4 = useCVStore.getState();
  const proj2AfterAdd = state4.cvData.projects.find((p) => p.id === "proj-test-2")!;
  ok(proj2AfterAdd.bulletPoints.length === 2, "addProjectBullet increments count");
  ok(
    proj2AfterAdd.bulletPoints[1] === "New second bullet for Inception",
    "addProjectBullet appends at end"
  );

  // 5. removeProjectBullet: removes bullet at index cleanly
  useCVStore.getState().removeProjectBullet("proj-test-1", 0);
  const state5 = useCVStore.getState();
  const proj1AfterRemove = state5.cvData.projects.find((p) => p.id === "proj-test-1")!;
  ok(proj1AfterRemove.bulletPoints.length === 1, "removeProjectBullet decrements count");
  ok(
    proj1AfterRemove.bulletPoints[0] === "Updated bullet point 2 text",
    "remaining bullet shifted correctly"
  );

  console.log(`\n==================================================`);
  console.log(`Phase 2 Store Mutations Verification: ${pass} passed, ${fail} failed`);
  console.log(`==================================================`);
  process.exit(fail ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
