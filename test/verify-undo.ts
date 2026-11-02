// Verifies soft-delete and restore operations for all section types in cv-store
import { useCVStore } from "../src/lib/store/cv-store";
import type { EducationItem, ExtracurricularItem } from "../src/types/resume";

let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass++;
  else {
    fail++;
    console.error("FAIL:", m);
  }
};

(() => {
  const store = useCVStore.getState();

  // Test 1: Education removal and restore
  const initialEduCount = store.cvData.education.length;
  const testEdu: EducationItem = {
    id: "edu-test-1",
    institution: "Test Tech Academy",
    program: "Computer Science",
    startDate: "2022",
    endDate: "2024",
    isCurrent: false,
    state: "STATE_A_CORE",
  };

  store.addEducationItem(testEdu);
  const afterAddEdu = useCVStore.getState().cvData.education;
  ok(afterAddEdu.length === initialEduCount + 1, "Education item added");

  const addedId = afterAddEdu[afterAddEdu.length - 1].id;
  const itemToRestore = afterAddEdu[afterAddEdu.length - 1];
  const itemIndex = afterAddEdu.length - 1;

  store.removeEducationItem(addedId);
  const afterRemoveEdu = useCVStore.getState().cvData.education;
  ok(afterRemoveEdu.length === initialEduCount, "Education item removed");
  ok(!afterRemoveEdu.some((e) => e.id === addedId), "Removed education item not in store");

  // Restore education at exact index
  store.restoreEducationAt(itemToRestore, itemIndex);
  const afterRestoreEdu = useCVStore.getState().cvData.education;
  ok(afterRestoreEdu.length === initialEduCount + 1, "Education item restored");
  ok(afterRestoreEdu[itemIndex].id === addedId, "Restored education item is at correct index");

  // Test 2: Education reordering (moveEducationItem)
  if (afterRestoreEdu.length >= 2) {
    const firstId = afterRestoreEdu[0].id;
    const secondId = afterRestoreEdu[1].id;
    store.moveEducationItem(0, "down");
    const reordered = useCVStore.getState().cvData.education;
    ok(reordered[0].id === secondId && reordered[1].id === firstId, "moveEducationItem moved item 0 down");
    store.moveEducationItem(1, "up");
    const reverted = useCVStore.getState().cvData.education;
    ok(reverted[0].id === firstId && reverted[1].id === secondId, "moveEducationItem moved item 1 up");
  }

  // Test 3: Extracurricular removal and restore
  const testEc: ExtracurricularItem = {
    id: "ec-test-1",
    organization: "Robotics Club",
    role: "Lead Builder",
    startDate: "2023",
    endDate: "Present",
    isCurrent: true,
    bulletPoints: ["Designed autonomous navigation", "Won local hackathon"],
  };

  store.addExtracurricularItem(testEc);
  const afterAddEc = useCVStore.getState().cvData.extracurriculars;
  const ecId = afterAddEc[afterAddEc.length - 1].id;
  const ecItem = afterAddEc[afterAddEc.length - 1];
  const ecIndex = afterAddEc.length - 1;

  store.removeExtracurricularItem(ecId);
  const afterRemoveEc = useCVStore.getState().cvData.extracurriculars;
  ok(!afterRemoveEc.some((e) => e.id === ecId), "Extracurricular item removed");

  store.restoreExtracurricularAt(ecItem, ecIndex);
  const afterRestoreEc = useCVStore.getState().cvData.extracurriculars;
  ok(afterRestoreEc[ecIndex].id === ecId, "Extracurricular item restored with bulletPoints");
  ok(afterRestoreEc[ecIndex].bulletPoints.length === 2, "Bullet points preserved after restore");

  // Test 4: Hydration state check
  store.setHasHydrated(true);
  ok(useCVStore.getState().hasHydrated === true, "Store hasHydrated is true");

  console.log(`undo: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
