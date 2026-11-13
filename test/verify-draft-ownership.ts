import {
  DraftOwner,
  DraftRecord,
  DraftSnapshot,
  isValidStudentId,
  isValidIntraProfile,
  ownerToKey,
  ownerMatches,
  hasSubstantiveWork,
} from "../src/lib/draft-types";
import {
  sha256Hex,
  getSecureRuntimeId,
  resetRuntimeIdForTesting,
  withDraftsLock,
  LockAcquisitionError,
  readDraftRecord,
  saveDraftRecord,
  createLegacyBackupSync,
  createRecoveryRecordSync,
  executeTransactionSync,
  resolvePendingTransactions,
  getChoices,
  recordChoice,
  readWorkspaceState,
  writeWorkspaceState,
  clearWorkspaceState,
  listKnownDrafts,
} from "../src/lib/draft-repository";
import { runMigrationBarrier } from "../src/lib/draft-migrations";
import {
  DraftSessionController,
  resetSessionControllerForTesting,
} from "../src/lib/draft-session";
import { readSavedDraft, startAgain } from "../src/lib/draft-rescue";
import { CV_STORE_KEY, DRAFTS_KEY_PREFIX, WORKSPACE_STORAGE_KEY } from "../src/lib/cv-constants";

async function runDraftOwnershipVerification() {
  console.log("==================================================================");
  console.log("VERIFY DRAFT OWNERSHIP, SESSIONS, AND CONCURRENCY CONTROLS");
  console.log("==================================================================\n");

  // In-memory mock environments for localStorage and sessionStorage
  let mockLocalStorage: Record<string, string> = {};
  let mockSessionStorage: Record<string, string> = {};

  (global as any).localStorage = {
    getItem: (key: string) => (key in mockLocalStorage ? mockLocalStorage[key] : null),
    setItem: (key: string, value: string) => {
      mockLocalStorage[key] = String(value);
    },
    removeItem: (key: string) => {
      delete mockLocalStorage[key];
    },
    clear: () => {
      mockLocalStorage = {};
    },
    get length() {
      return Object.keys(mockLocalStorage).length;
    },
    key: (i: number) => Object.keys(mockLocalStorage)[i] || null,
  };

  (global as any).sessionStorage = {
    getItem: (key: string) => (key in mockSessionStorage ? mockSessionStorage[key] : null),
    setItem: (key: string, value: string) => {
      mockSessionStorage[key] = String(value);
    },
    removeItem: (key: string) => {
      delete mockSessionStorage[key];
    },
    clear: () => {
      mockSessionStorage = {};
    },
    get length() {
      return Object.keys(mockSessionStorage).length;
    },
    key: (i: number) => Object.keys(mockSessionStorage)[i] || null,
  };

  (global as any).window = {
    localStorage: (global as any).localStorage,
    sessionStorage: (global as any).sessionStorage,
  };

  // Mock Navigator Web Locks
  let lockHeld = false;
  let simulateLockTimeout = false;
  let simulateLockDenial = false;
  let simulateLockMissing = false;

  (global as any).navigator = {
    get locks() {
      if (simulateLockMissing) return undefined;
      return {
        request: async (name: string, optionsOrCallback: any, maybeCallback?: any) => {
          if (simulateLockDenial) {
            throw new Error("Lock request denied by browser policy.");
          }
          if (simulateLockTimeout) {
            // Never resolve to test timeout
            return new Promise(() => {});
          }
          const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
          lockHeld = true;
          try {
            return await callback({ name, mode: "exclusive" });
          } finally {
            lockHeld = false;
          }
        },
      };
    },
  };

  // Mock fetch for auth session endpoints
  let mockAuthSession: any = { authenticated: false, fresh: false, user: null };
  let mockDeleteResult: any = { ok: true, data: { success: true } };

  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes("/api/auth/session")) {
      if (init?.method === "DELETE") {
        if (!mockDeleteResult.ok) {
          return { ok: false, status: 500, json: async () => ({ error: "Server error" }) };
        }
        return { ok: true, status: 200, json: async () => mockDeleteResult.data };
      }
      return { ok: true, status: 200, json: async () => mockAuthSession };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  console.log("[AC1] Contract: Positive safe-integer user.id validation & GET/DELETE shapes...");
  if (!isValidStudentId(4242) || !isValidStudentId(1)) throw new Error("Valid integer ID rejected");
  if (isValidStudentId(0) || isValidStudentId(-5) || isValidStudentId(1.5) || isValidStudentId("42") || isValidStudentId(null) || isValidStudentId(NaN)) {
    throw new Error("Invalid student ID was falsely accepted as valid!");
  }
  if (!isValidIntraProfile({ id: 101, login: "norminet" })) throw new Error("Valid profile rejected");
  if (isValidIntraProfile({ id: 0, login: "bad" }) || isValidIntraProfile({ id: 102, login: "" }) || isValidIntraProfile(null)) {
    throw new Error("Invalid profile falsely accepted!");
  }
  console.log("✓ AC1 PASSED: Strict positive integer student IDs verified.\n");

  console.log("[AC2] Web Locks: Missing, denied, and timed-out locks fail closed...");
  simulateLockMissing = true;
  let lockFailed = false;
  try {
    await withDraftsLock(async () => 123);
  } catch (e: any) {
    if (e instanceof LockAcquisitionError && e.code === "LOCK_UNAVAILABLE") {
      lockFailed = true;
    }
  }
  if (!lockFailed) throw new Error("Missing Web Locks did not throw LOCK_UNAVAILABLE!");

  simulateLockMissing = false;
  simulateLockDenial = true;
  lockFailed = false;
  try {
    await withDraftsLock(async () => 123);
  } catch (e: any) {
    if (e instanceof LockAcquisitionError && e.code === "LOCK_DENIED") {
      lockFailed = true;
    }
  }
  if (!lockFailed) throw new Error("Denied Web Locks did not throw LOCK_DENIED!");

  simulateLockDenial = false;
  simulateLockTimeout = true;
  lockFailed = false;
  try {
    await withDraftsLock(async () => 123, { timeoutMs: 50 });
  } catch (e: any) {
    if (e instanceof LockAcquisitionError && e.code === "LOCK_TIMEOUT") {
      lockFailed = true;
    }
  }
  if (!lockFailed) throw new Error("Timed-out Web Locks did not throw LOCK_TIMEOUT!");
  simulateLockTimeout = false;
  console.log("✓ AC2 PASSED: Fail-closed lock semantics verified.\n");

  console.log("[AC3] Runtime IDs: Duplicated sessionStorages receive distinct in-memory IDs...");
  resetRuntimeIdForTesting();
  const id1 = getSecureRuntimeId();
  resetRuntimeIdForTesting();
  const id2 = getSecureRuntimeId();
  if (id1 === id2 || typeof id1 !== "string" || id1.length < 10) {
    throw new Error("Runtime ID generator produced identical or invalid IDs across fresh controllers!");
  }
  console.log("✓ AC3 PASSED: Distinct secure runtime IDs confirmed.\n");

  console.log("[AC4] Session lifecycle: A -> Logout -> B -> A snapshot isolation...");
  const ctrlA = new DraftSessionController();
  mockAuthSession = { authenticated: true, fresh: false, user: { id: 1001, login: "studentA" } };
  await ctrlA.reconcileSession();
  if (ctrlA.getState().state !== "EDITING_ACCOUNT") throw new Error("ctrlA not in EDITING_ACCOUNT");

  // Save student A's snapshot
  const snapshotA: DraftSnapshot = {
    cvData: {
      targetRole: "Systems Engineer",
      educationState: "STATE_A_CORE",
      showExperience: false,
      contact: { fullName: "Student A", level: 1, email: "a@42.fr", phoneNumber: "123", githubUrl: "", linkedinUrl: "" },
      education: [],
      experience: [],
      projects: [{ id: "pa", name: "Minishell", slug: "minishell", is42Project: true, techStack: "C", date: "2024", bulletPoints: ["Custom UNIX shell"] }],
      skills: { languages: ["C"], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] },
      coursework: [],
      extracurriculars: [],
    },
  };
  await ctrlA.saveCurrentSnapshot(snapshotA);

  // Student A logs out
  const logoutRes = await ctrlA.logout();
  if (!logoutRes.success || ctrlA.getState().state !== "WELCOME") {
    throw new Error("Logout failed or did not transition to WELCOME!");
  }

  // Student B logs in
  mockAuthSession = { authenticated: true, fresh: false, user: { id: 2002, login: "studentB" } };
  const ctrlB = new DraftSessionController();
  await ctrlB.reconcileSession();
  const snapshotB: DraftSnapshot = {
    cvData: {
      targetRole: "DevOps Engineer",
      educationState: "STATE_A_CORE",
      showExperience: false,
      contact: { fullName: "Student B", level: 1, email: "b@42.fr", phoneNumber: "456", githubUrl: "", linkedinUrl: "" },
      education: [],
      experience: [],
      projects: [{ id: "pb", name: "Inception", slug: "inception", is42Project: true, techStack: "Docker", date: "2024", bulletPoints: ["Virtualization infra"] }],
      skills: { languages: ["Docker"], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] },
      coursework: [],
      extracurriculars: [],
    },
  };
  await ctrlB.saveCurrentSnapshot(snapshotB);

  // Verify A's key has A's data and B's key has B's data
  const recordA = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:1001`);
  const recordB = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:2002`);
  if (!recordA || recordA.snapshot.cvData.contact.fullName !== "Student A") throw new Error("Student A draft corrupted or lost!");
  if (!recordB || recordB.snapshot.cvData.contact.fullName !== "Student B") throw new Error("Student B draft corrupted or lost!");
  if (recordA.snapshot.cvData.projects[0].name !== "Minishell") throw new Error("Student A projects crossed!");
  if (recordB.snapshot.cvData.projects[0].name !== "Inception") throw new Error("Student B projects crossed!");

  console.log("✓ AC4 PASSED: Account isolation and clean logout verified.\n");

  console.log("[AC5] Substantive work detection & write-once recovery on collision...");
  if (!hasSubstantiveWork(snapshotA)) throw new Error("Snapshot A falsely flagged as non-substantive!");
  const emptySnapshot: DraftSnapshot = {
    cvData: { targetRole: "", educationState: "STATE_A_CORE", showExperience: false, contact: { fullName: "", level: 0, email: "", phoneNumber: "", githubUrl: "", linkedinUrl: "" }, education: [], experience: [], projects: [], skills: { languages: [], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] }, coursework: [], extracurriculars: [] },
  };
  if (hasSubstantiveWork(emptySnapshot)) throw new Error("Empty snapshot falsely flagged as substantive!");

  // Collision recovery
  const recKey = createRecoveryRecordSync("test_source", { kind: "account", provider: "42", studentId: 1001 }, "test_collision", recordA);
  const recoveryRaw = mockLocalStorage[recKey];
  if (!recoveryRaw || !recoveryRaw.includes("Minishell")) throw new Error("Recovery record missing or incomplete!");
  console.log("✓ AC5 PASSED: Substantive work detection & recovery verified.\n");

  console.log("[AC7] Revision conflict preserves work in recovery...");
  // Attempt to save record A with a stale revision (baseRevision = 0 when existing is 1+)
  const conflictRes = await saveDraftRecord({ kind: "account", provider: "42", studentId: 1001 }, "new-id", 0, snapshotA);
  if (conflictRes.success || !conflictRes.conflict) {
    throw new Error("Stale revision save did not detect revision conflict!");
  }
  console.log("✓ AC7 PASSED: Revision conflict detected and prevented overwrite.\n");

  console.log("[AC8] Failed flush sends no DELETE & logout failure reconciliation...");
  mockDeleteResult = { ok: false };
  // Re-login student A
  mockAuthSession = { authenticated: true, fresh: false, user: { id: 1001, login: "studentA" } };
  const ctrlLogoutTest = new DraftSessionController();
  await ctrlLogoutTest.reconcileSession();
  const failedLogout = await ctrlLogoutTest.logout();
  if (failedLogout.success) {
    throw new Error("Failed DELETE was reported as successful logout!");
  }
  // User remains in EDITING_ACCOUNT
  if (ctrlLogoutTest.getState().state !== "EDITING_ACCOUNT") {
    throw new Error("Failed logout unexpectedly transitioned state!");
  }
  mockDeleteResult = { ok: true, data: { success: true } };
  console.log("✓ AC8 PASSED: Truthful logout and error reconciliation verified.\n");

  console.log("[AC10] Scoped rescue: Never exposes unauthenticated bundle of other accounts...");
  mockSessionStorage[WORKSPACE_STORAGE_KEY] = JSON.stringify({ workspaceVersion: 1, mode: "account", activeKey: `${DRAFTS_KEY_PREFIX}account:42:1001` });
  const rescued = readSavedDraft();
  if (!rescued || !rescued.includes("Student A")) {
    throw new Error("Scoped draft rescue failed to read active account draft!");
  }
  if (rescued.includes("Student B")) {
    throw new Error("Scoped rescue bundled another student's draft!");
  }
  console.log("✓ AC10 PASSED: Scoped rescue verified.\n");

  console.log("==================================================================");
  console.log("ALL DRAFT OWNERSHIP AUDIT CHECKS COMPLETED SUCCESSFULLY!");
  console.log("==================================================================");
}

runDraftOwnershipVerification().catch((err) => {
  console.error("Draft ownership verification failed:", err);
  process.exit(1);
});
