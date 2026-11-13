import {
  DraftOwner,
  DraftRecord,
  DraftSnapshot,
  isValidStudentId,
  isValidIntraProfile,
  ownerToKey,
  ownerMatches,
  hasSubstantiveWork,
  validateDraftRecord,
} from "../src/lib/draft-types";
import {
  sha256Hex,
  getSecureRuntimeId,
  generateOperationId,
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
  listRecoveryRecords,
} from "../src/lib/draft-repository";
import { runMigrationBarrier } from "../src/lib/draft-migrations";
import {
  DraftSessionController,
  resetSessionControllerForTesting,
} from "../src/lib/draft-session";
import { useCVStore, bindStoreToSession } from "../src/lib/store/cv-store";
import { readSavedDraft, startAgain } from "../src/lib/draft-rescue";
import { CV_STORE_KEY, DRAFTS_KEY_PREFIX, WORKSPACE_STORAGE_KEY } from "../src/lib/cv-constants";

async function runComprehensiveAccountIsolationTests() {
  console.log("==================================================================");
  console.log("COMPREHENSIVE ACCOUNT ISOLATION & REGRESSION TEST SUITE");
  console.log("==================================================================\n");

  // Mock Storage Setup
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

  // Mock Web Locks
  (global as any).navigator = {
    locks: {
      request: async (_name: string, optionsOrCallback: any, maybeCallback?: any) => {
        const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
        return await callback({ name: _name, mode: "exclusive" });
      },
    },
  };

  // Mock Fetch
  let mockSessionResponse: any = { authenticated: false, fresh: false, user: null };
  let mockDeleteResult: any = { ok: true, data: { success: true } };

  (global as any).fetch = async (url: string, init?: any) => {
    if (url.includes("/api/auth/session")) {
      if (init?.method === "DELETE") {
        if (!mockDeleteResult.ok) {
          return { ok: false, status: 500, json: async () => ({ error: "Server error" }) };
        }
        return { ok: true, status: 200, json: async () => mockDeleteResult.data };
      }
      return { ok: true, status: 200, json: async () => mockSessionResponse };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  // -------------------------------------------------------------------------
  // Test 1: Full Lifecycle A -> Logout -> B -> Logout -> A
  // -------------------------------------------------------------------------
  console.log("[TEST 1] Lifecycle: Account A -> Logout -> Account B -> Logout -> Account A...");
  resetSessionControllerForTesting();
  const ctrl1 = new DraftSessionController();
  const unbind1 = bindStoreToSession(ctrl1);

  // Student A logs in
  mockSessionResponse = {
    authenticated: true,
    fresh: true,
    user: { id: 101, login: "alice", email: "alice@42.fr", displayname: "Alice", validatedProjects: [] },
  };
  await ctrl1.reconcileSession();
  if (ctrl1.getState().state !== "EDITING_ACCOUNT") throw new Error("ctrl1 failed to enter EDITING_ACCOUNT for Alice");

  // Alice makes changes in store
  useCVStore.getState().updateContact({ fullName: "Alice Engineer", email: "alice@42.fr" });
  useCVStore.getState().addProjectToCV({ name: "Alice Shell", slug: "alice-shell", bulletPoints: ["Shell in C"] });

  // Flush Alice's save
  const flushedA = await ctrl1.flush();
  if (!flushedA) throw new Error("Failed to flush Alice's draft");

  // Alice logs out
  const logoutA = await ctrl1.logout();
  if (!logoutA.success) throw new Error("Alice logout failed");
  if (ctrl1.getState().state !== "WELCOME") throw new Error("Controller did not transition to WELCOME on logout");

  // Verify Zustand store was wiped clean on logout (no lingering Alice data)
  const storeAfterAliceLogout = useCVStore.getState();
  if (storeAfterAliceLogout.cvData.contact.fullName !== "") {
    throw new Error("Zustand store retained Alice's full name after logout!");
  }
  if (storeAfterAliceLogout.cvData.projects.length !== 0) {
    throw new Error("Zustand store retained Alice's projects after logout!");
  }

  // Student B logs in
  mockSessionResponse = {
    authenticated: true,
    fresh: true,
    user: { id: 202, login: "bob", email: "bob@42.fr", displayname: "Bob", validatedProjects: [] },
  };
  await ctrl1.reconcileSession();
  if (ctrl1.getState().state !== "EDITING_ACCOUNT") throw new Error("ctrl1 failed to enter EDITING_ACCOUNT for Bob");

  // Bob's workspace should not have Alice's data
  const storeBob = useCVStore.getState();
  if (storeBob.cvData.contact.fullName.includes("Alice") || storeBob.cvData.projects.some((p) => p.name.includes("Alice"))) {
    throw new Error("Bob inherited Alice's draft data!");
  }

  // Bob makes distinct edits
  useCVStore.getState().updateContact({ fullName: "Bob Virtualizer", email: "bob@42.fr" });
  useCVStore.getState().addProjectToCV({ name: "Bob Docker", slug: "bob-docker", bulletPoints: ["Container infra"] });
  await ctrl1.flush();

  // Bob logs out
  await ctrl1.logout();
  if (useCVStore.getState().cvData.contact.fullName !== "") {
    throw new Error("Store retained Bob's full name after Bob logged out!");
  }

  // Alice logs back in
  mockSessionResponse = {
    authenticated: true,
    fresh: false,
    user: { id: 101, login: "alice", email: "alice@42.fr", displayname: "Alice", validatedProjects: [] },
  };
  await ctrl1.reconcileSession();
  const storeAliceReturned = useCVStore.getState();
  if (storeAliceReturned.cvData.contact.fullName !== "Alice Engineer") {
    throw new Error("Alice's returned draft full name lost or corrupted: " + storeAliceReturned.cvData.contact.fullName);
  }
  if (!storeAliceReturned.cvData.projects.some((p) => p.name === "Alice Shell")) {
    throw new Error("Alice's returned draft projects lost or corrupted!");
  }
  unbind1();
  console.log("✓ TEST 1 PASSED: Lifecycle A -> Logout -> B -> Logout -> A with complete data isolation.\n");

  // -------------------------------------------------------------------------
  // Test 2: Same-Account Refresh preserves deliberate edits and deletions
  // -------------------------------------------------------------------------
  console.log("[TEST 2] Same-Account Refresh preserves deliberate edits, stable IDs, and deletions...");
  const ctrl2 = new DraftSessionController();
  const unbind2 = bindStoreToSession(ctrl2);

  mockSessionResponse = {
    authenticated: true,
    fresh: false,
    user: {
      id: 303,
      login: "charlie",
      email: "charlie@42.fr",
      displayname: "Charlie",
      validatedProjects: [
        { id: 1, name: "libft", slug: "libft", finalMark: 100, validated: true, markedAt: "2024-01-01" },
        { id: 2, name: "ft_printf", slug: "ft-printf", finalMark: 100, validated: true, markedAt: "2024-02-01" },
      ],
    },
  };
  // Initialize Charlie as a new account
  await ctrl2.reconcileSession();

  // Charlie deliberately deletes a project and customizes contact
  useCVStore.getState().updateContact({ fullName: "Charlie Senior", email: "charlie.custom@42.fr" });
  const currentProjects = useCVStore.getState().cvData.projects;
  if (currentProjects.length > 0) {
    useCVStore.getState().removeProjectFromCV(currentProjects[0].id);
  }
  const deletedCount = useCVStore.getState().cvData.projects.length;
  await ctrl2.flush();

  // Simulate page refresh / reconcileSession
  await ctrl2.reconcileSession();
  const storeAfterRefresh = useCVStore.getState();

  if (storeAfterRefresh.cvData.contact.fullName !== "Charlie Senior") {
    throw new Error("Deliberate contact edit was lost on same-account refresh!");
  }
  if (storeAfterRefresh.cvData.projects.length !== deletedCount) {
    throw new Error("Deliberately deleted project was automatically refilled on refresh!");
  }
  unbind2();
  console.log("✓ TEST 2 PASSED: Deliberate edits and deletions preserved on refresh without automatic refill.\n");

  // -------------------------------------------------------------------------
  // Test 3: Pending/debounced saves flushed truthfully before logout & never leak to next user
  // -------------------------------------------------------------------------
  console.log("[TEST 3] Debounced autosaves flushed truthfully before logout, never leak across accounts...");
  const ctrl3 = new DraftSessionController();
  const unbind3 = bindStoreToSession(ctrl3);

  mockSessionResponse = {
    authenticated: true,
    fresh: true,
    user: { id: 404, login: "dave", email: "dave@42.fr", displayname: "Dave", validatedProjects: [] },
  };
  await ctrl3.reconcileSession();

  // Dave makes a fast edit and immediately initiates logout without waiting for 300ms debounce
  useCVStore.getState().updateContact({ fullName: "Dave Fast Editor" });

  // Logout should trigger truthful flush of Dave's edit to Dave's storage key BEFORE sending DELETE
  const logoutDave = await ctrl3.logout();
  if (!logoutDave.success) throw new Error("Dave logout failed");

  // Verify Dave's key has the flushed edit
  const daveRecord = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:404`);
  if (!daveRecord || daveRecord.snapshot.cvData.contact.fullName !== "Dave Fast Editor") {
    throw new Error("Dave's pending debounced edit was not flushed before logout!");
  }

  // Next user Eve logs in immediately
  mockSessionResponse = {
    authenticated: true,
    fresh: true,
    user: { id: 505, login: "eve", email: "eve@42.fr", displayname: "Eve", validatedProjects: [] },
  };
  await ctrl3.reconcileSession();
  const eveRecord = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:505`);
  if (eveRecord && eveRecord.snapshot.cvData.contact.fullName.includes("Dave")) {
    throw new Error("Dave's pending save leaked into Eve's account record!");
  }
  unbind3();
  console.log("✓ TEST 3 PASSED: Truthful pending save flush before logout confirmed.\n");

  // -------------------------------------------------------------------------
  // Test 4: Memory-Only Guest produces zero localStorage writes & never touches account keys
  // -------------------------------------------------------------------------
  console.log("[TEST 4] Memory-Only Guest produces zero localStorage writes...");
  const ctrl4 = new DraftSessionController();
  const unbind4 = bindStoreToSession(ctrl4);

  const localKeysBefore = Object.keys(mockLocalStorage);
  await ctrl4.activateGuestOwner(true); // memoryOnly = true

  useCVStore.getState().updateContact({ fullName: "Ephemeral Guest" });
  useCVStore.getState().addProjectToCV({ name: "Memory Project", slug: "mem-proj", bulletPoints: ["Only in memory"] });
  await ctrl4.flush();

  const localKeysAfter = Object.keys(mockLocalStorage);
  if (localKeysAfter.length !== localKeysBefore.length) {
    throw new Error("Memory-only guest wrote new keys to localStorage: " + JSON.stringify(localKeysAfter));
  }
  // Verify status is memory
  if (useCVStore.getState().saveStatus !== "memory") {
    throw new Error("Memory-only guest did not have saveStatus === 'memory'");
  }
  unbind4();
  console.log("✓ TEST 4 PASSED: Memory-only guest isolation verified.\n");

  // -------------------------------------------------------------------------
  // Test 5: Unique Operation IDs & Independent Recovery Records
  // -------------------------------------------------------------------------
  console.log("[TEST 5] Independent recovery records receive unique IDs per operation...");
  const idA = generateOperationId();
  const idB = generateOperationId();
  if (idA === idB) throw new Error("generateOperationId produced identical IDs");

  const recKey1 = createRecoveryRecordSync("key1", { kind: "guest" }, "reason_1", undefined, "raw_data_1");
  const recKey2 = createRecoveryRecordSync("key1", { kind: "guest" }, "reason_2", undefined, "raw_data_2");

  if (recKey1 === recKey2) {
    throw new Error("Subsequent createRecoveryRecordSync overwrote previous recovery record!");
  }
  const recoveryRecords = listRecoveryRecords();
  if (recoveryRecords.length < 2) {
    throw new Error("Expected at least 2 recovery records, found: " + recoveryRecords.length);
  }
  console.log("✓ TEST 5 PASSED: Unique recovery and transaction IDs verified.\n");

  // -------------------------------------------------------------------------
  // Test 6: Corrupt Stored Data Preserved in Recovery Before Overwrite
  // -------------------------------------------------------------------------
  console.log("[TEST 6] Corrupt stored records are preserved in recovery, not silently overwritten...");
  const corruptKey = `${DRAFTS_KEY_PREFIX}account:42:777`;
  mockLocalStorage[corruptKey] = "INVALID_CORRUPTED_JSON_DATA{{{";

  // Saving to this key must preserve the corrupt bytes to recovery
  const saveCorruptRes = await saveDraftRecord({ kind: "account", provider: "42", studentId: 777 }, "new-draft-id", 0, {
    cvData: { targetRole: "", educationState: "STATE_A_CORE", showExperience: false, contact: { fullName: "Fresh User", level: 1, email: "", phoneNumber: "", githubUrl: "", linkedinUrl: "" }, education: [], experience: [], projects: [], skills: { languages: [], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] }, coursework: [], extracurriculars: [] },
  });
  if (saveCorruptRes.success) throw new Error("Corrupt bytes must never count as true absence for a base-zero save");
  if (mockLocalStorage[corruptKey] !== "INVALID_CORRUPTED_JSON_DATA{{{") throw new Error("Corrupt primary bytes changed after rejected save");

  const recList = listRecoveryRecords({ kind: "account", provider: "42", studentId: 777 });
  const corruptRecovery = recList.find((r) => r.reason === "corrupt_record_preserved");
  if (!corruptRecovery || corruptRecovery.raw !== "INVALID_CORRUPTED_JSON_DATA{{{") {
    throw new Error("Corrupt data was silently overwritten without preservation in recovery!");
  }
  console.log("✓ TEST 6 PASSED: Corrupt stored data preserved in recovery.\n");

  // -------------------------------------------------------------------------
  // Test 7: Scoped Rescue never leaks unauthenticated account drafts
  // -------------------------------------------------------------------------
  console.log("[TEST 7] Scoped rescue with verified controller identity never leaks account drafts...");
  resetSessionControllerForTesting();
  const ctrl7 = new DraftSessionController();

  // Controller in WELCOME state
  mockSessionResponse = { authenticated: false, fresh: false, user: null };
  await ctrl7.reconcileSession();

  // Even if sessionStorage has a stale account key left from student 101
  mockSessionStorage[WORKSPACE_STORAGE_KEY] = JSON.stringify({
    workspaceVersion: 1,
    mode: "account",
    activeKey: `${DRAFTS_KEY_PREFIX}account:42:101`,
  });

  const rescuedWhileWelcome = readSavedDraft();
  if (rescuedWhileWelcome && rescuedWhileWelcome.includes("Alice")) {
    throw new Error("readSavedDraft leaked Alice's account draft to unauthenticated user!");
  }
  console.log("✓ TEST 7 PASSED: Scoped rescue prevents unauthenticated account leakage.\n");

  // -------------------------------------------------------------------------
  // Test 8: Stale Journal Replay does not overwrite newer user edits
  // -------------------------------------------------------------------------
  console.log("[TEST 8] Transaction recovery respects expectedRevisions and protects newer edits...");
  const targetKey8 = `${DRAFTS_KEY_PREFIX}account:42:888`;
  // Storage currently has revision 3
  const currentRecord8: DraftRecord = {
    schemaVersion: 1,
    draftId: "d-888",
    owner: { kind: "account", provider: "42", studentId: 888 },
    revision: 3,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 100,
    snapshotVersion: 1,
    snapshot: {
      cvData: { targetRole: "", educationState: "STATE_A_CORE", showExperience: false, contact: { fullName: "User at Rev 3", level: 1, email: "", phoneNumber: "", githubUrl: "", linkedinUrl: "" }, education: [], experience: [], projects: [], skills: { languages: [], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] }, coursework: [], extracurriculars: [] },
    },
  };
  mockLocalStorage[targetKey8] = JSON.stringify(currentRecord8);

  // An old crashed transaction journal staged a write based on revision 1
  const staleRecord: DraftRecord = {
    ...currentRecord8,
    revision: 2,
    snapshot: {
      ...currentRecord8.snapshot,
      cvData: { ...currentRecord8.snapshot.cvData, contact: { ...currentRecord8.snapshot.cvData.contact, fullName: "Stale Rev 2 Content" } },
    },
  };
  const staleTxKey = `${DRAFTS_KEY_PREFIX}transaction:${generateOperationId()}`;
  mockLocalStorage[staleTxKey] = JSON.stringify({
    journalVersion: 1,
    txId: "stale-tx",
    state: "committed",
    expectedRevisions: { [targetKey8]: 1 },
    stagedRecords: { [targetKey8]: staleRecord },
    timestamp: Date.now() - 500,
  });

  // An ambiguous historical journal cannot be safely replayed or discarded.
  const exactJournalBytes = mockLocalStorage[staleTxKey];
  const exactNewerBytes = mockLocalStorage[targetKey8];
  let recoveryRejected = false;
  try { resolvePendingTransactions(); } catch (error: any) {
    recoveryRejected = error.message.includes("CRASH_RECOVERY_FAILED");
  }
  if (!recoveryRejected) throw new Error("Ambiguous journal must fail recovery closed");
  if (mockLocalStorage[staleTxKey] !== exactJournalBytes) throw new Error("Unresolved journal bytes changed");
  if (mockLocalStorage[targetKey8] !== exactNewerBytes) throw new Error("Independent newer primary bytes changed");
  const blockedController = new DraftSessionController();
  await blockedController.bootstrap();
  if (blockedController.getState().state !== "RECOVERY_BLOCKED") throw new Error("Unresolved journal allowed persistent editing");
  blockedController.destroy();
  // Only the exact synthetic fixtures in this isolated mock are cleaned up.
  if (mockLocalStorage[staleTxKey] !== exactJournalBytes) throw new Error("Bootstrap altered unresolved journal");
  delete mockLocalStorage[staleTxKey];
  delete mockLocalStorage[corruptKey];

  // Storage should STILL have revision 3 with "User at Rev 3"
  const afterResolve = readDraftRecord(targetKey8);
  if (!afterResolve || afterResolve.revision !== 3 || afterResolve.snapshot.cvData.contact.fullName !== "User at Rev 3") {
    throw new Error("Stale transaction journal replayed over newer revision 3!");
  }
  console.log("✓ TEST 8 PASSED: Stale transaction journal prevented from overwriting newer user changes.\n");

  // -------------------------------------------------------------------------
  // Test 9: Stale Activation Guard & Generation Check
  // -------------------------------------------------------------------------
  console.log("[TEST 9] Stale activation guard prevents suspended activation from overwriting newer account...");
  resetSessionControllerForTesting();
  const ctrl9 = new DraftSessionController();
  const unbind9 = bindStoreToSession(ctrl9);

  let lockRelease9: (() => void) | null = null;
  const originalLockRequest = (global as any).navigator.locks.request;
  let delayNextLock = false;

  (global as any).navigator.locks.request = async (name: string, optsOrCallback: any, maybeCallback?: any) => {
    const cb = typeof optsOrCallback === "function" ? optsOrCallback : maybeCallback;
    if (delayNextLock) {
      delayNextLock = false;
      return new Promise((resolve) => {
        lockRelease9 = () => resolve(cb({ name, mode: "exclusive" }));
      });
    }
    return cb({ name, mode: "exclusive" });
  };

  // Initialize account B (912)
  await ctrl9.activateAccountOwner({ id: 912, login: "userB", validatedProjects: [] } as any, false);

  // Start activating A (911) with delayed lock
  delayNextLock = true;
  const activatingA = ctrl9.activateAccountOwner({ id: 911, login: "userA", validatedProjects: [] } as any, false);

  // Activate B again while A is suspended
  await ctrl9.activateAccountOwner({ id: 912, login: "userB", validatedProjects: [] } as any, false);

  // Release A's lock
  if (lockRelease9) (lockRelease9 as any)();
  await activatingA;

  // Controller state, owner, and store MUST remain B (912), never overwritten by stale A
  if (ctrl9.getState().state !== "EDITING_ACCOUNT" || (ctrl9.getState() as any).studentId !== 912) {
    throw new Error(`Controller state was overwritten by stale activation: ${JSON.stringify(ctrl9.getState())}`);
  }
  if (ctrl9.getCurrentOwner().kind !== "account" || (ctrl9.getCurrentOwner() as any).studentId !== 912) {
    throw new Error(`Current owner was overwritten by stale activation: ${JSON.stringify(ctrl9.getCurrentOwner())}`);
  }
  if (useCVStore.getState().cvData.contact.fullName === "userA") {
    throw new Error("Store rendered stale user A after activation was superseded!");
  }
  (global as any).navigator.locks.request = originalLockRequest;
  unbind9();
  ctrl9.destroy();
  console.log("✓ TEST 9 PASSED: Stale activation correctly aborted by generation check.\n");

  // -------------------------------------------------------------------------
  // Test 10: Visibility / BFCache Revalidation Preserves Unsaved Edits
  // -------------------------------------------------------------------------
  console.log("[TEST 10] Rapid same-account reconciliation preserves unsaved pending edits without loss...");
  resetSessionControllerForTesting();
  const ctrl10 = new DraftSessionController();
  const unbind10 = bindStoreToSession(ctrl10);

  mockSessionResponse = { authenticated: true, fresh: false, user: { id: 901, login: "qa-a", validatedProjects: [] } };
  await ctrl10.reconcileSession();

  // User makes an edit in store with 300ms debounce
  useCVStore.getState().updateContact({ fullName: "Unsaved Important Edit" });

  // Reconcile immediately before debounce fires
  await ctrl10.reconcileSession();
  await new Promise((resolve) => setTimeout(resolve, 350));

  const storeContact10 = useCVStore.getState().cvData.contact.fullName;
  const savedRecord10 = readDraftRecord(ownerToKey(ctrl10.getCurrentOwner()));
  if (storeContact10 !== "Unsaved Important Edit") {
    throw new Error(`Pending edit was lost from store on reconciliation: '${storeContact10}'`);
  }
  if (!savedRecord10 || savedRecord10.snapshot.cvData.contact.fullName !== "Unsaved Important Edit") {
    throw new Error("Pending edit was not flushed to storage before rehydration!");
  }
  unbind10();
  ctrl10.destroy();
  console.log("✓ TEST 10 PASSED: Unsaved edits truthfully flushed and preserved on reconciliation.\n");

  // -------------------------------------------------------------------------
  // Test 11: Failed In-Flight Save Blocks Logout
  // -------------------------------------------------------------------------
  console.log("[TEST 11] Failed in-flight save blocks logout and sends zero DELETE requests...");
  resetSessionControllerForTesting();
  const ctrl11 = new DraftSessionController();
  mockSessionResponse = { authenticated: true, fresh: false, user: { id: 903, login: "qa-c", validatedProjects: [] } };
  await ctrl11.reconcileSession();

  let deleteRequestSent11 = false;
  const origFetch11 = (global as any).fetch;
  (global as any).fetch = async (url: string, opts: any) => {
    if (opts?.method === "DELETE") {
      deleteRequestSent11 = true;
      return { ok: true, json: async () => ({ success: true }) };
    }
    return { ok: true, json: async () => mockSessionResponse };
  };

  const origSetItem11 = (global as any).localStorage.setItem;
  // Suspend save with lock
  let releaseSaveLock11: any = null;
  (global as any).navigator.locks.request = async (name: string, optsOrCallback: any, maybeCallback?: any) => {
    const cb = typeof optsOrCallback === "function" ? optsOrCallback : maybeCallback;
    return new Promise((resolve) => {
      releaseSaveLock11 = () => resolve(cb({ name, mode: "exclusive" }));
    });
  };

  const saving11 = ctrl11.saveCurrentSnapshot({ ...ctrl11.getCurrentDraft()!.snapshot, targetRole: "Unsaved Role" });
  const loggingOut11 = ctrl11.logout();

  // Inject quota error during save
  (global as any).localStorage.setItem = () => {
    throw new Error("QuotaExceeded");
  };

  if (releaseSaveLock11) releaseSaveLock11();
  const saveRes11 = await saving11;
  const logoutRes11 = await loggingOut11;

  (global as any).localStorage.setItem = origSetItem11;
  (global as any).navigator.locks.request = originalLockRequest;
  (global as any).fetch = origFetch11;

  if (saveRes11.success !== false) {
    throw new Error("Expected saving to fail on QuotaExceeded!");
  }
  if (logoutRes11.success !== false) {
    throw new Error("Expected logout to fail because in-flight save failed!");
  }
  if (deleteRequestSent11) {
    throw new Error("DELETE request was sent despite failed save!");
  }
  ctrl11.destroy();
  console.log("✓ TEST 11 PASSED: Failed save blocked logout; zero DELETE sent.\n");

  // -------------------------------------------------------------------------
  // Test 12: Memory Guest Transition to Authenticated Account Persistence
  // -------------------------------------------------------------------------
  console.log("[TEST 12] Memory guest transitioning to authenticated account enables storage persistence...");
  resetSessionControllerForTesting();
  const ctrl12 = new DraftSessionController();
  const unbind12 = bindStoreToSession(ctrl12);

  // Activate memory-only guest
  await ctrl12.activateGuestOwner(true);
  if (!ctrl12.isMemoryOnlyGuest()) throw new Error("Controller should be memory-only guest");

  // Transition to account 902
  mockSessionResponse = { authenticated: true, fresh: false, user: { id: 902, login: "qa-b", validatedProjects: [] } };
  await ctrl12.reconcileSession();

  if (ctrl12.getState().state !== "EDITING_ACCOUNT") throw new Error("Expected EDITING_ACCOUNT");
  if (ctrl12.isMemoryOnlyGuest()) {
    throw new Error("memoryOnlyGuest was not cleared upon transitioning to account!");
  }

  useCVStore.getState().updateContact({ fullName: "Account Edit B" });
  await ctrl12.flush();

  const accountRecord12 = readDraftRecord(ownerToKey(ctrl12.getCurrentOwner()));
  if (!accountRecord12 || accountRecord12.snapshot.cvData.contact.fullName !== "Account Edit B") {
    throw new Error(`Account edit was not persisted to localStorage: ${JSON.stringify(accountRecord12)}`);
  }
  unbind12();
  ctrl12.destroy();
  console.log("✓ TEST 12 PASSED: Memory-only guest flag cleanly reset on account transition.\n");

  // -------------------------------------------------------------------------
  // Test 13: Unverified Reset (startAgain) Refuses to Delete Account Drafts
  // -------------------------------------------------------------------------
  console.log("[TEST 13] Unverified reset refuses to delete account drafts from stale workspace key...");
  resetSessionControllerForTesting();
  const ctrl13 = new DraftSessionController();
  mockSessionResponse = { authenticated: false, fresh: false, user: null };
  await ctrl13.reconcileSession();

  const accountAKey13 = `${DRAFTS_KEY_PREFIX}account:42:911`;
  mockLocalStorage[accountAKey13] = JSON.stringify({
    schemaVersion: 1,
    draftId: "a-911",
    owner: { kind: "account", provider: "42", studentId: 911 },
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshotVersion: 1,
    snapshot: {
      cvData: { targetRole: "", educationState: "STATE_A_CORE", showExperience: false, contact: { fullName: "Alice Protected", level: 1, email: "a@42.fr", phoneNumber: "123", githubUrl: "", linkedinUrl: "" }, education: [], experience: [], projects: [], skills: { languages: [], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] }, coursework: [], extracurriculars: [] },
    },
  });

  // Stale activeKey in sessionStorage pointing to Alice
  mockSessionStorage[WORKSPACE_STORAGE_KEY] = JSON.stringify({
    workspaceVersion: 1,
    mode: "account",
    activeKey: accountAKey13,
  });

  (global as any).confirm = () => true;
  (global as any).location = { assign: () => {} };

  await startAgain();

  // Alice's draft MUST NOT be deleted
  if (!mockLocalStorage[accountAKey13]) {
    throw new Error("startAgain() deleted Alice's account draft from an unauthenticated session!");
  }
  ctrl13.destroy();
  console.log("✓ TEST 13 PASSED: startAgain refuses to delete account draft without verified owner.\n");

  // -------------------------------------------------------------------------
  // Test 14: Deep Record Validation Rejects Malformed CV Snapshots
  // -------------------------------------------------------------------------
  console.log("[TEST 14] Deep record validation rejects malformed CV snapshots...");
  const malformedRecord = {
    schemaVersion: 1,
    draftId: "bad",
    owner: { kind: "guest" },
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshotVersion: 1,
    snapshot: { cvData: { projects: null, contact: null } },
  };
  const isValid = validateDraftRecord(malformedRecord, `${DRAFTS_KEY_PREFIX}guest`);
  if (isValid) {
    throw new Error("Deep validation falsely accepted malformed record with null contact and projects!");
  }
  console.log("✓ TEST 14 PASSED: Deep validation strictly rejected malformed CV snapshot.\n");

  // -------------------------------------------------------------------------
  // Test 15: Prepared Transaction Crash Recovery Rolls Back Partial Writes
  // -------------------------------------------------------------------------
  console.log("[TEST 15] Prepared transaction crash recovery rolls back partial writes...");
  let failSecond15 = true;
  const origSetItem15 = (global as any).localStorage.setItem;
  (global as any).localStorage.setItem = (k: string, v: string) => {
    if (k === "second_key" && failSecond15) {
      throw new Error("QuotaExceeded on second write");
    }
    origSetItem15(k, v);
  };

  try {
    executeTransactionSync({ set: { first_key: "value1", second_key: "value2" } });
  } catch {}

  failSecond15 = false;
  resolvePendingTransactions();

  if (mockLocalStorage["first_key"] !== undefined) {
    throw new Error(`first_key was not rolled back after failed transaction: '${mockLocalStorage["first_key"]}'`);
  }
  if (mockLocalStorage["second_key"] !== undefined) {
    throw new Error(`second_key exists after failed transaction: '${mockLocalStorage["second_key"]}'`);
  }
  const lingeringTxKeys = Object.keys(mockLocalStorage).filter((k) => k.includes("transaction:"));
  if (lingeringTxKeys.length > 0) {
    throw new Error(`Lingering transaction journals remain: ${lingeringTxKeys.join(", ")}`);
  }
  (global as any).localStorage.setItem = origSetItem15;
  console.log("✓ TEST 15 PASSED: Partial transaction rolled back cleanly; zero corrupt partial state.\n");

  // -------------------------------------------------------------------------
  // Test 16: Write-Once Legacy Backup and Raw Backup on Corrupt Legacy
  // -------------------------------------------------------------------------
  console.log("[TEST 16] Migration verifies write-once backup and rejects corrupt/mismatched existing backup...");
  const rawPayload16 = JSON.stringify({ state: { cvData: { contact: { fullName: "Legacy" } } }, version: 2 });
  const hash16 = sha256Hex(rawPayload16);
  const backupKey16 = `${DRAFTS_KEY_PREFIX}backup:legacy:${hash16}`;

  // 1. Existing backup with mismatched corrupt bytes throws WRITE_ONCE_BACKUP_MISMATCH
  mockLocalStorage[backupKey16] = "UNRELATED CORRUPT BYTES";
  let threwMismatch = false;
  try {
    createLegacyBackupSync(rawPayload16, 2);
  } catch (e: any) {
    if (e?.message?.includes("WRITE_ONCE_BACKUP_MISMATCH")) threwMismatch = true;
  }
  if (!threwMismatch) throw new Error("createLegacyBackupSync failed to reject mismatched existing backup!");

  // Migration barrier fails closed on mismatched backup
  mockLocalStorage[CV_STORE_KEY] = rawPayload16;
  let barrierFailed = false;
  try {
    await runMigrationBarrier();
  } catch {
    barrierFailed = true;
  }
  if (!barrierFailed) throw new Error("Migration barrier falsely accepted corrupt existing backup!");

  // 2. Clear corrupt backup and create valid backup
  delete mockLocalStorage[backupKey16];
  const validBackup = createLegacyBackupSync(rawPayload16, 2);
  if (!validBackup || validBackup.hash !== hash16) throw new Error("Valid backup creation failed");

  // Verify non-overwrite on valid preexisting backup
  const secondBackup = createLegacyBackupSync(rawPayload16, 2);
  if (secondBackup.hash !== hash16) throw new Error("Valid preexisting backup was not verified and returned");

  // 3. Corrupt unparseable legacy creates raw backup before conversion fails
  const corruptRaw16 = "{corrupt unparseable legacy json";
  mockLocalStorage[CV_STORE_KEY] = corruptRaw16;
  const corruptHash16 = sha256Hex(corruptRaw16);
  const corruptBackupKey16 = `${DRAFTS_KEY_PREFIX}backup:legacy:${corruptHash16}`;

  let migrationFailed = false;
  try {
    await runMigrationBarrier();
  } catch {
    migrationFailed = true;
  }
  if (!migrationFailed) {
    throw new Error("runMigrationBarrier did not throw on corrupt legacy payload!");
  }
  if (!mockLocalStorage[corruptBackupKey16]) {
    throw new Error("Raw backup was not preserved for corrupt legacy payload!");
  }
  console.log("✓ TEST 16 PASSED: Preexisting backup verified strictly; raw corrupt legacy backed up.\n");

  // -------------------------------------------------------------------------
  // Test 17: Persistent Guest Quota Failure Enters RECOVERY_BLOCKED
  // -------------------------------------------------------------------------
  console.log("[TEST 17] Persistent guest initialization fails closed on storage quota error...");
  resetSessionControllerForTesting();
  const ctrl17 = new DraftSessionController();
  const unbind17 = bindStoreToSession(ctrl17);

  const origSetItem17 = (global as any).localStorage.setItem;
  (global as any).localStorage.setItem = () => {
    throw new Error("QuotaExceeded");
  };

  await ctrl17.activateGuestOwner(false);

  (global as any).localStorage.setItem = origSetItem17;

  if (ctrl17.getState().state !== "RECOVERY_BLOCKED") {
    throw new Error(`Expected RECOVERY_BLOCKED on guest quota failure, got: ${JSON.stringify(ctrl17.getState())}`);
  }
  if (useCVStore.getState().saveStatus === "saved") {
    throw new Error("Store falsely claimed 'saved' when storage write failed!");
  }
  unbind17();
  ctrl17.destroy();
  console.log("✓ TEST 17 PASSED: Persistent guest fails closed into RECOVERY_BLOCKED.\n");

  // -------------------------------------------------------------------------
  // Test 18: Secure Crypto Capability Fail-Closed
  // -------------------------------------------------------------------------
  console.log("[TEST 18] getSecureRuntimeId fails closed when Web Crypto is unavailable...");
  const origCryptoDesc = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });

  let threwCryptoError = false;
  try {
    resetRuntimeIdForTesting();
    getSecureRuntimeId();
  } catch (e: any) {
    if (e?.message?.includes("SECURE_CRYPTO_UNAVAILABLE")) {
      threwCryptoError = true;
    }
  }

  if (origCryptoDesc) {
    Object.defineProperty(globalThis, "crypto", origCryptoDesc);
  }
  resetRuntimeIdForTesting("restored-test-runtime-id");

  if (!threwCryptoError) {
    throw new Error("getSecureRuntimeId did not fail closed with SECURE_CRYPTO_UNAVAILABLE!");
  }
  console.log("✓ TEST 18 PASSED: Secure runtime fails closed when crypto is missing.\n");

  // -------------------------------------------------------------------------
  // Test 19: Two-Runtime Broadcast Quiescence: No Echo Loops
  // -------------------------------------------------------------------------
  console.log("[TEST 19] Two-runtime broadcast quiescence: no echo loops on incoming invalidation...");
  resetSessionControllerForTesting();
  const ctrl19 = new DraftSessionController();
  mockSessionResponse = {
    authenticated: true,
    fresh: false,
    user: { id: 819, login: "quiescence_user", validatedProjects: [] },
  };
  await ctrl19.reconcileSession();

  let storagePublishes = 0;
  const origSet19 = (global as any).localStorage.setItem;
  (global as any).localStorage.setItem = (k: string, v: string) => {
    origSet19(k, v);
    if (k === `${DRAFTS_KEY_PREFIX}broadcast_event`) {
      const parsed = JSON.parse(v);
      if (parsed.type === "owner_changed") {
        storagePublishes++;
      }
    }
  };

  // Simulate remote tab broadcasting owner_changed for this same account
  (ctrl19 as any).handleBroadcastMessage({
    runtimeId: "remote-tab-runtime",
    operationId: generateOperationId(),
    type: "owner_changed",
    ownerKey: `${DRAFTS_KEY_PREFIX}account:42:819`,
    timestamp: Date.now(),
  });

  await new Promise((r) => setTimeout(r, 100));
  (global as any).localStorage.setItem = origSet19;

  if (storagePublishes > 0) {
    throw new Error(`Broadcast echo loop detected! Emitted ${storagePublishes} storage events on incoming broadcast.`);
  }
  ctrl19.destroy();
  console.log("✓ TEST 19 PASSED: Zero rebroadcast echo loops; quiescence verified.\n");

  // -------------------------------------------------------------------------
  // Test 20: Immediate Account Transition Gate & readSavedDraft Protection
  // -------------------------------------------------------------------------
  console.log("[TEST 20] Transitioning from A to B immediately gates A draft from readSavedDraft...");
  resetSessionControllerForTesting();
  const ctrl20 = new DraftSessionController();
  const unbind20 = bindStoreToSession(ctrl20);

  // Activate account A (101)
  await ctrl20.activateAccountOwner({ id: 101, login: "alice", validatedProjects: [] } as any, false);
  useCVStore.getState().updateContact({ fullName: "Alice Sensitive Data" });
  await ctrl20.flush();

  // Authoritative session changes to B (202), but B activation lock is held
  mockSessionResponse = {
    authenticated: true,
    fresh: false,
    user: { id: 202, login: "bob", validatedProjects: [] } as any,
  };

  let releaseLock20: () => void = () => {};
  const lockPromise20 = new Promise<void>((resolve) => {
    releaseLock20 = resolve;
  });

  const origRequest20 = (global as any).navigator.locks.request;
  (global as any).navigator.locks.request = async (_name: string, _opts: any, cb: any) => {
    const callback = typeof _opts === "function" ? _opts : cb;
    await lockPromise20;
    return await callback({});
  };

  const reconcilePromise20 = ctrl20.reconcileSession();
  await new Promise((r) => setTimeout(r, 50));

  // Verify: Auth state is B, controller transitioned out of A, and readSavedDraft() NEVER returns A!
  const savedDuringTransition = readSavedDraft();
  if (savedDuringTransition && savedDuringTransition.includes("Alice Sensitive Data")) {
    throw new Error("PRIVACY LEAK: readSavedDraft() returned Alice's draft while session was B!");
  }
  if (ctrl20.getCurrentOwner().kind === "account" && (ctrl20.getCurrentOwner() as any).studentId === 101) {
    throw new Error("Controller still pointed to account A during B transition!");
  }

  releaseLock20();
  await reconcilePromise20;
  (global as any).navigator.locks.request = origRequest20;
  unbind20();
  ctrl20.destroy();
  console.log("✓ TEST 20 PASSED: Immediate account transition gate prevents draft leakage.\n");

  // -------------------------------------------------------------------------
  // Test 21: Failed Flush in reconcileSession Preserves Local Edits in Memory
  // -------------------------------------------------------------------------
  console.log("[TEST 21] Failed flush in reconcileSession preserves unsaved edits in memory...");
  resetSessionControllerForTesting();
  const ctrl21 = new DraftSessionController();
  const unbind21 = bindStoreToSession(ctrl21);

  mockSessionResponse = {
    authenticated: true,
    fresh: false,
    user: { id: 301, login: "carol", validatedProjects: [] },
  };
  await ctrl21.reconcileSession();
  useCVStore.getState().updateContact({ fullName: "Carol Unsaved Changes" });

  const origSetItem21 = (global as any).localStorage.setItem;
  (global as any).localStorage.setItem = () => {
    throw new Error("QuotaExceeded");
  };

  await ctrl21.reconcileSession();
  (global as any).localStorage.setItem = origSetItem21;

  // Verify: edits remain in memory, controller enters RECOVERY_BLOCKED, store sets error
  if (useCVStore.getState().cvData.contact.fullName !== "Carol Unsaved Changes") {
    throw new Error("Unsaved in-memory edits were wiped out on failed flush!");
  }
  if (ctrl21.getState().state !== "RECOVERY_BLOCKED") {
    throw new Error("Controller did not enter RECOVERY_BLOCKED on failed flush!");
  }
  if (useCVStore.getState().saveStatus !== "error") {
    throw new Error("Store saveStatus was not 'error' after failed flush!");
  }
  unbind21();
  ctrl21.destroy();
  console.log("✓ TEST 21 PASSED: Failed flush preserves in-memory edits and fails closed.\n");

  // -------------------------------------------------------------------------
  // Test 22: Memory-Only Guest Preserved on Unauthenticated Revalidation With Zero Writes
  // -------------------------------------------------------------------------
  console.log("[TEST 22] Memory-only guest preserved on unauthenticated revalidation with zero writes...");
  resetSessionControllerForTesting();
  const ctrl22 = new DraftSessionController();
  const unbind22 = bindStoreToSession(ctrl22);

  let storageWrites22 = 0;
  const origSetItem22 = (global as any).localStorage.setItem;
  (global as any).localStorage.setItem = (k: string, v: string) => {
    storageWrites22++;
    origSetItem22(k, v);
  };

  await ctrl22.activateGuestOwner(true); // Memory-only guest
  if (storageWrites22 !== 0) {
    throw new Error(`Memory-only guest activation performed ${storageWrites22} localStorage writes!`);
  }

  useCVStore.getState().updateContact({ fullName: "Memory Only Guest Draft" });

  // Unauthenticated session revalidation (e.g. visibility change)
  mockSessionResponse = { authenticated: false, fresh: false, user: null };
  await ctrl22.reconcileSession();

  (global as any).localStorage.setItem = origSetItem22;

  if (!ctrl22.isMemoryOnlyGuest()) {
    throw new Error("Memory-only guest flag was improperly reset during unauthenticated reconciliation!");
  }
  if (useCVStore.getState().cvData.contact.fullName !== "Memory Only Guest Draft") {
    throw new Error("Memory-only guest edits were lost on unauthenticated reconciliation!");
  }
  if (storageWrites22 !== 0) {
    throw new Error(`Unauthenticated reconciliation wrote ${storageWrites22} keys to localStorage for memory guest!`);
  }
  unbind22();
  ctrl22.destroy();
  console.log("✓ TEST 22 PASSED: Memory-only guest completely preserved with zero storage writes.\n");

  // -------------------------------------------------------------------------
  // Test 23: Copy Serialization Cancels Pending Debounced Autosaves
  // -------------------------------------------------------------------------
  console.log("[TEST 23] Copy serialization cancels pending debounced autosaves...");
  resetSessionControllerForTesting();
  const ctrl23 = new DraftSessionController();
  const unbind23 = bindStoreToSession(ctrl23);

  mockSessionResponse = {
    authenticated: true,
    fresh: false,
    user: { id: 401, login: "dan", validatedProjects: [] },
  };
  await ctrl23.reconcileSession();

  // Queue a local edit with 300ms debounce
  useCVStore.getState().updateContact({ fullName: "OLD LOCAL EDIT" });

  // Simulate confirmed copy
  useCVStore.getState().cancelPendingAutosave();
  ctrl23.bumpGeneration();

  const copiedDraft: DraftRecord = {
    schemaVersion: 1,
    draftId: "copied-draft-id",
    owner: { kind: "account", provider: "42", studentId: 401 },
    revision: ctrl23.getCurrentRevision() + 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshotVersion: 1,
    snapshot: {
      cvData: {
        ...useCVStore.getState().extractSnapshot().cvData,
        contact: { ...useCVStore.getState().cvData.contact, fullName: "CONFIRMED COPIED SOURCE" },
      },
    },
    provenance: { source: "guest" },
  };

  await ctrl23.saveCurrentSnapshot(copiedDraft.snapshot, copiedDraft.provenance);
  useCVStore.getState().hydrateFromDraftRecord(copiedDraft);

  // Wait 400ms for old debounce timer to have fired if not cancelled
  await new Promise((r) => setTimeout(r, 400));

  const finalRecord23 = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:401`);
  if (!finalRecord23 || finalRecord23.snapshot.cvData.contact.fullName !== "CONFIRMED COPIED SOURCE") {
    throw new Error(`Pending autosave unexpectedly overwrote confirmed copy: '${finalRecord23?.snapshot.cvData.contact.fullName}'`);
  }
  unbind23();
  ctrl23.destroy();
  console.log("✓ TEST 23 PASSED: Confirmed copy safely serialized against pending debounced autosaves.\n");

  // -------------------------------------------------------------------------
  // Test 24: Prepared Crash Recovery Does Not Roll Back Newer Revisions
  // -------------------------------------------------------------------------
  console.log("[TEST 24] Prepared crash recovery does not roll back newer disk revisions...");
  const key24 = `${DRAFTS_KEY_PREFIX}account:42:501`;
  const newerRecord24: DraftRecord = {
    schemaVersion: 1,
    draftId: "newer-draft",
    owner: { kind: "account", provider: "42", studentId: 501 },
    revision: 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshotVersion: 1,
    snapshot: {
      cvData: {
        ...useCVStore.getState().extractSnapshot().cvData,
        contact: { ...useCVStore.getState().cvData.contact, fullName: "NEWER USER EDIT REV 3" },
      },
    },
  };
  mockLocalStorage[key24] = JSON.stringify(newerRecord24);

  // Prepared journal from older revision 1
  mockLocalStorage[`${DRAFTS_KEY_PREFIX}transaction:crashed_prep`] = JSON.stringify({
    journalVersion: 1,
    txId: "crashed_prep",
    state: "prepared",
    expectedRevisions: { [key24]: 1 },
    stagedRecords: { [key24]: { ...newerRecord24, revision: 2 } },
    previousValues: { [key24]: JSON.stringify({ ...newerRecord24, revision: 1, snapshot: { cvData: { contact: { fullName: "STALE REV 1" } } } }) },
    timestamp: Date.now(),
  });

  const journal24 = `${DRAFTS_KEY_PREFIX}transaction:crashed_prep`;
  const exactJournal24 = mockLocalStorage[journal24];
  const exactPrimary24 = mockLocalStorage[key24];
  let rejected24 = false;
  try { await withDraftsLock(async () => { resolvePendingTransactions(); }); }
  catch (error: any) { rejected24 = error.message.includes("CRASH_RECOVERY_FAILED"); }
  if (!rejected24 || mockLocalStorage[journal24] !== exactJournal24 || mockLocalStorage[key24] !== exactPrimary24) {
    throw new Error("Independent prepared-journal divergence must retain exact bytes and fail closed");
  }

  delete mockLocalStorage[journal24]; // Exact isolated test fixture only; production retains unresolved journals.
  const recordAfterRecovery24 = readDraftRecord(key24);
  if (!recordAfterRecovery24 || recordAfterRecovery24.revision !== 3) {
    throw new Error(`Crash recovery rolled disk back to revision ${recordAfterRecovery24?.revision}, expected 3!`);
  }
  if (!recordAfterRecovery24.snapshot.cvData.contact.fullName.includes("NEWER USER EDIT")) {
    throw new Error("Crash recovery overwrote newer user edit with stale previousValues!");
  }
  console.log("✓ TEST 24 PASSED: Prepared crash recovery protects newer user revisions.\n");

  // -------------------------------------------------------------------------
  // Test 25: Deep Record Validation Rejects Malformed Entries & Foreign Profiles
  // -------------------------------------------------------------------------
  console.log("[TEST 25] Deep record validation rejects malformed array entries and foreign profiles...");
  const validBase: DraftRecord = {
    schemaVersion: 1,
    draftId: "val-test",
    owner: { kind: "account", provider: "42", studentId: 601 },
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshotVersion: 1,
    snapshot: {
      studentProfile: { id: 601, login: "student601", email: "", displayname: "", image: "", campusName: "", campusId: 0, level: 0, grade: "", poolMonth: "", poolYear: null, coalition: "", beginAt: "", validatedProjects: [] },
      cvData: {
        targetRole: "Engineer",
        educationState: "STATE_A_CORE",
        showExperience: false,
        styleDensity: "standard",
        showExtracurriculars: false,
        sectionOrder: ["education", "experience", "projects", "skills", "coursework", "extracurriculars"],
        contact: { fullName: "Student 601", level: 1, email: "s@42.fr", phoneNumber: "123", githubUrl: "", linkedinUrl: "" },
        education: [{ id: "edu1", institution: "42", program: "Core", isCurrent: true, state: "STATE_A_CORE", startDate: "2024" }],
        experience: [{ id: "exp1", company: "Tech", role: "Dev", startDate: "2024", endDate: "", isCurrent: true, location: "", bulletPoints: ["Built system"] }],
        projects: [{ id: "p1", name: "Project", slug: "p1", is42Project: true, techStack: "", date: "", bulletPoints: ["Bullet 1"] }],
        skills: { languages: ["C"], developerTools: ["Git"], technologiesFrameworks: [], projectManagementTools: [] },
        coursework: [],
        extracurriculars: [],
      },
    },
  };

  if (!validateDraftRecord(validBase, `${DRAFTS_KEY_PREFIX}account:42:601`)) {
    throw new Error("Valid base record was falsely rejected by validateDraftRecord");
  }

  // 1. Null project in array
  const nullProj = JSON.parse(JSON.stringify(validBase));
  nullProj.snapshot.cvData.projects = [null];
  if (validateDraftRecord(nullProj, `${DRAFTS_KEY_PREFIX}account:42:601`)) {
    throw new Error("validateDraftRecord accepted null project in projects array!");
  }

  // 2. Non-string bullet point
  const badBullet = JSON.parse(JSON.stringify(validBase));
  badBullet.snapshot.cvData.projects = [{ id: "p1", bulletPoints: [123] }];
  if (validateDraftRecord(badBullet, `${DRAFTS_KEY_PREFIX}account:42:601`)) {
    throw new Error("validateDraftRecord accepted non-string bullet point!");
  }

  // 3. Foreign studentProfile (id 999 for account 601)
  const foreignProfile = JSON.parse(JSON.stringify(validBase));
  foreignProfile.snapshot.studentProfile = { id: 999, login: "foreign", email: "", displayname: "", image: "", campusName: "", campusId: 0, level: 0, grade: "", poolMonth: "", poolYear: null, coalition: "", beginAt: "", validatedProjects: [] };
  if (validateDraftRecord(foreignProfile, `${DRAFTS_KEY_PREFIX}account:42:601`)) {
    throw new Error("validateDraftRecord accepted foreign student profile belonging to another account!");
  }
  console.log("✓ TEST 25 PASSED: Strict element validation and profile-owner matching verified.\n");

  console.log("==================================================================");
  console.log("ALL 25 ADVANCED ACCOUNT ISOLATION TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

runComprehensiveAccountIsolationTests().catch((err) => {
  console.error("Account isolation test suite failed:", err);
  process.exit(1);
});
