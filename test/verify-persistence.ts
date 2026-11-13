import { useCVStore, CV_STORE_KEY, CV_STORE_VERSION } from "../src/lib/store/cv-store";
import { runMigrationBarrier, parseLegacyDraftPayload } from "../src/lib/draft-migrations";
import { sha256Hex, readDraftRecord, executeTransactionSync } from "../src/lib/draft-repository";
import { DRAFTS_KEY_PREFIX } from "../src/lib/cv-constants";

async function runPersistenceAudit() {
  console.log("==================================================================");
  console.log("Checks: saving the CV in the store & migration barrier");
  console.log("==================================================================\n");

  // Mock a localStorage environment if running in Node.js
  const mockStorage: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => (key in mockStorage ? mockStorage[key] : null),
    setItem: (key: string, value: string) => {
      mockStorage[key] = String(value);
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const k in mockStorage) delete mockStorage[k];
    },
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: (i: number) => Object.keys(mockStorage)[i] || null,
  };
  (global as any).window = {
    localStorage: (global as any).localStorage,
  };

  // Polyfill Web Locks in Node environment for tests
  (global as any).navigator = {
    locks: {
      request: async (_name: string, _optionsOrCallback: any, maybeCallback?: any) => {
        const callback = typeof _optionsOrCallback === "function" ? _optionsOrCallback : maybeCallback;
        return await callback({ name: _name, mode: "exclusive" });
      },
    },
  };

  console.log("[TEST 1] Verifying store initial state and lastSavedTimestamp...");
  const store = useCVStore.getState();
  console.log("  - Current Step:        ", store.currentStep);
  console.log("  - Last Saved Timestamp:", store.lastSavedTimestamp);
  if (!store.lastSavedTimestamp || store.lastSavedTimestamp <= 0) {
    throw new Error("lastSavedTimestamp was not initialized!");
  }
  console.log("✓ TEST 1 PASSED: Initial state and timestamp verified.\n");

  console.log("[TEST 2] Verifying mutation updates lastSavedTimestamp and persists...");
  const oldTimestamp = store.lastSavedTimestamp;
  // Sleep 15ms so timestamp changes
  await new Promise((r) => setTimeout(r, 20));

  store.setCurrentStep("SETUP");
  store.updateContact({ fullName: "Test Candidate Engineer" });

  const stateAfterUpdate = useCVStore.getState();
  console.log("  - Updated Step:        ", stateAfterUpdate.currentStep);
  console.log("  - Updated Full Name:   ", stateAfterUpdate.cvData.contact.fullName);
  console.log("  - New Timestamp:       ", stateAfterUpdate.lastSavedTimestamp);

  if (stateAfterUpdate.currentStep !== "SETUP") throw new Error("Step did not update");
  if (stateAfterUpdate.cvData.contact.fullName !== "Test Candidate Engineer") throw new Error("Contact fullName did not update");
  if (stateAfterUpdate.lastSavedTimestamp <= oldTimestamp) throw new Error("Timestamp did not advance on mutation");
  console.log("✓ TEST 2 PASSED: Mutation successfully updated timestamp and state.\n");

  console.log("[TEST 3] Verifying resetToDefaults()...");
  store.resetToDefaults();
  const resetState = useCVStore.getState();
  console.log("  - Reset Step:          ", resetState.currentStep);
  console.log("  - Reset Full Name:     ", resetState.cvData.contact.fullName);
  if (resetState.cvData.contact.fullName === "Test Candidate Engineer") {
    throw new Error("resetToDefaults did not restore initial contact!");
  }
  console.log("✓ TEST 3 PASSED: resetToDefaults successfully restored clean state.\n");

  console.log("[TEST 4] Undo after the same 42 project was picked again...");
  const s4 = useCVStore.getState();
  const removed = { id: "p-undo", name: "libft", slug: "libft", is42Project: true, techStack: "", date: "", bulletPoints: ["Wrote my own C library"] };
  s4.restoreProjectAt(removed, 0);
  s4.removeProjectFromCV("p-undo");
  // Picked again from the list while the Undo toast is still open
  s4.addProjectToCV({ name: "libft", slug: "libft", is42Project: true, bulletPoints: [] });
  s4.restoreProjectAt(removed, 0);
  const libfts = useCVStore.getState().cvData.projects.filter((p) => p.slug === "libft");
  if (libfts.length !== 1 || libfts[0].id !== "p-undo" || libfts[0].bulletPoints[0] !== "Wrote my own C library") {
    throw new Error("Undo made a second copy of the same 42 project");
  }
  // Two projects without a slug are never treated as the same one
  const own = (id: string) => ({ id, name: id, slug: "", is42Project: false, techStack: "", date: "", bulletPoints: [] });
  s4.restoreProjectAt(own("p-own-b"), 0);
  s4.restoreProjectAt(own("p-own-a"), 0);
  const ids = useCVStore.getState().cvData.projects.map((p) => p.id);
  if (!ids.includes("p-own-a") || !ids.includes("p-own-b")) throw new Error("Undo removed a project with an empty slug");
  console.log("✓ TEST 4 PASSED: Undo keeps one copy, with its lines.\n");

  if (CV_STORE_KEY !== "printcv_draft_v1" || CV_STORE_VERSION !== 2) {
    console.log("FAIL store key/version changed");
    process.exit(1);
  }

  console.log("[TEST 5] Instrumenting Migration Barrier and access ordering...");
  const sampleLegacyPayload = JSON.stringify({
    version: 1,
    state: {
      currentStep: "EDITOR",
      cvData: {
        contact: { fullName: "Legacy Student" },
        education: [{ id: "edu-main", institution: "42 Paris", degree: "Software Engineer", state: "STATE_A_CORE" }],
        experience: [],
        projects: [{ id: "p1", name: "Push_swap", slug: "push-swap", bulletPoints: ["Sorting algorithm in C"] }],
        skills: { languages: ["C", "C++"], developerTools: ["Git"], technologiesFrameworks: [], projectManagementTools: [] },
        coursework: [],
        extracurriculars: [],
      },
    },
  });

  mockStorage[CV_STORE_KEY] = sampleLegacyPayload;
  const legacyHash = sha256Hex(sampleLegacyPayload);

  // Spying on storage calls
  const accessLog: Array<{ method: "getItem" | "setItem"; key: string }> = [];
  const origGet = (global as any).localStorage.getItem;
  const origSet = (global as any).localStorage.setItem;

  (global as any).localStorage.getItem = (k: string) => {
    accessLog.push({ method: "getItem", key: k });
    return origGet(k);
  };
  (global as any).localStorage.setItem = (k: string, v: string) => {
    accessLog.push({ method: "setItem", key: k });
    return origSet(k, v);
  };

  const migrationRes = await runMigrationBarrier();
  if (!migrationRes.migrated || migrationRes.hash !== legacyHash) {
    throw new Error("Migration failed to migrate legacy draft!");
  }

  // Restore spies
  (global as any).localStorage.getItem = origGet;
  (global as any).localStorage.setItem = origSet;

  // Verify access ordering:
  // 1. Initial read of CV_STORE_KEY
  // 2. setItem of backup
  // 3. getItem of backup (readback verification)
  // 4. setItem of unassigned
  // 5. setItem of migration record
  const backupKey = `${DRAFTS_KEY_PREFIX}backup:legacy:${legacyHash}`;
  const unassignedKey = `${DRAFTS_KEY_PREFIX}legacy:${legacyHash}`;
  const migrationKey = `${DRAFTS_KEY_PREFIX}migration:${legacyHash}`;

  const backupSetIndex = accessLog.findIndex((e) => e.method === "setItem" && e.key === backupKey);
  const backupReadbackIndex = accessLog.findIndex((e) => e.method === "getItem" && e.key === backupKey);
  const unassignedSetIndex = accessLog.findIndex((e) => e.method === "setItem" && e.key === unassignedKey);
  const migrationSetIndex = accessLog.findIndex((e) => e.method === "setItem" && e.key === migrationKey);

  if (backupSetIndex === -1 || backupReadbackIndex === -1 || unassignedSetIndex === -1 || migrationSetIndex === -1) {
    throw new Error("Access log did not contain all required migration steps: " + JSON.stringify(accessLog));
  }

  if (backupSetIndex > backupReadbackIndex) {
    throw new Error("Backup was read before it was set!");
  }
  if (backupReadbackIndex > unassignedSetIndex) {
    throw new Error("Unassigned draft was written before backup readback verification!");
  }
  if (mockStorage[CV_STORE_KEY] !== sampleLegacyPayload) {
    throw new Error("Original legacy draft was modified during migration!");
  }

  // Verify unassigned draft record
  const unassignedDraft = readDraftRecord(unassignedKey);
  if (!unassignedDraft || unassignedDraft.owner.kind !== "unassigned") {
    throw new Error("Migrated record owner is not unassigned!");
  }
  if (unassignedDraft.snapshot.cvData.projects[0].name !== "Push_swap") {
    throw new Error("Migrated snapshot project content lost!");
  }

  console.log("✓ TEST 5 PASSED: Migration barrier access ordering and readback verified.\n");

  console.log("[TEST 6] Verifying Migration Idempotency...");
  const secondRun = await runMigrationBarrier();
  if (secondRun.migrated) {
    throw new Error("Second run of migration barrier should be a no-op (idempotent)!");
  }
  console.log("✓ TEST 6 PASSED: Migration idempotency verified.\n");

  console.log("==================================================================");
  console.log("ALL PERSISTENCE AUDIT CHECKS COMPLETED SUCCESSFULLY!");
  console.log("==================================================================");
}

runPersistenceAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
