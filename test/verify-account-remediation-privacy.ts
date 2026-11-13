import assert from "node:assert/strict";
import {
  DraftSessionController,
  resetSessionControllerForTesting,
} from "../src/lib/draft-session";
import { useCVStore, bindStoreToSession } from "../src/lib/store/cv-store";
import { readSavedDraft } from "../src/lib/draft-rescue";
import {
  DraftOwner,
  DraftRecord,
  DraftSnapshot,
  ownerToKey,
} from "../src/lib/draft-types";
import {
  saveDraftRecord,
  writeWorkspaceState,
  clearWorkspaceState,
} from "../src/lib/draft-repository";
import { CV_STORE_KEY, DRAFTS_KEY_PREFIX, WORKSPACE_STORAGE_KEY } from "../src/lib/cv-constants";

// In-memory mock storage
function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
  };
}

let mockLocalStorage = createMockStorage();
let mockSessionStorage = createMockStorage();

(global as any).localStorage = mockLocalStorage;
(global as any).sessionStorage = mockSessionStorage;
(global as any).window = {
  localStorage: mockLocalStorage,
  sessionStorage: mockSessionStorage,
};

Object.defineProperty(global, "navigator", {
  value: {
    locks: {
      request: async (_n: string, o: any, cb?: any) => {
        const callback = cb || o;
        return callback({});
      },
    },
  },
  configurable: true,
});

let currentUser: any = null;
let currentAuthenticated = true;
let sessionFetchCount = 0;
let fetchDelayMs = 0;
let fetchShouldFail = false;

(global as any).fetch = async (url: string, opts?: any) => {
  if (url.includes("/api/auth/session")) {
    sessionFetchCount++;
    if (fetchDelayMs > 0) {
      await new Promise((r) => setTimeout(r, fetchDelayMs));
    }
    if (fetchShouldFail) {
      throw new Error("NetworkError: fetch failed");
    }
    if (opts?.method === "DELETE") {
      currentUser = null;
      currentAuthenticated = false;
      return { ok: true, json: async () => ({ success: true }) };
    }
    return {
      ok: true,
      json: async () => ({
        authenticated: currentAuthenticated,
        fresh: false,
        user: currentUser,
      }),
    };
  }
  return { ok: true, json: async () => ({}) };
};

function resetEnvironment() {
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  resetSessionControllerForTesting();
  useCVStore.getState().resetToDefaults();
  currentUser = null;
  currentAuthenticated = true;
  sessionFetchCount = 0;
  fetchDelayMs = 0;
  fetchShouldFail = false;
}

async function runB1PrivacyRegressions() {
  console.log("==================================================================");
  console.log("B1 PRIVACY REGRESSION SUITE: BLOCKER 1 EXPECTED BEHAVIOR");
  console.log("==================================================================\n");

  // -------------------------------------------------------------------------
  // TEST 1: Failed A save must not stop authoritative session revalidation
  //         nor expose A through recovery download/UI after remote switch to B
  // -------------------------------------------------------------------------
  console.log("[TEST 1] Failed A save -> remote switch to B: auth revalidation & privacy isolation...");
  resetEnvironment();

  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;

  const ctrl1 = new DraftSessionController();
  const unbind1 = bindStoreToSession(ctrl1);

  await ctrl1.reconcileSession();
  assert.equal(ctrl1.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl1.getCurrentOwner() as any).studentId, 101);

  // Alice makes unsaved edit
  useCVStore.getState().updateContact({ fullName: "Alice Unsaved Sensitive Work" });

  const baselineGets = sessionFetchCount;

  // Block storage writes (e.g. quota exceeded)
  const origSetItem = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    throw new Error("QuotaExceededError: storage write blocked");
  };

  // Remote session changes authoritatively to Bob (202)
  currentUser = { id: 202, login: "Bob", validatedProjects: [] };

  // Deliver owner_changed broadcast for Bob
  (ctrl1 as any).handleBroadcastMessage({
    type: "owner_changed",
    runtimeId: "remote_runtime",
    operationId: "op-switch-to-B",
    ownerKey: "printcv_drafts_v1:account:42:202",
  });

  await new Promise((r) => setTimeout(r, 50));
  mockLocalStorage.setItem = origSetItem;

  // 1. Authoritative session revalidation MUST NOT be skipped!
  assert(
    sessionFetchCount > baselineGets,
    `FAILED: Authoritative auth GET was skipped on remote switch! (gets: ${sessionFetchCount}, baseline: ${baselineGets})`
  );

  // 2. Controller must NOT be stuck claiming active ownership of A
  const currentOwner = ctrl1.getCurrentOwner();
  assert(
    currentOwner.kind !== "account" || currentOwner.studentId !== 101,
    `FAILED: Controller still claims active ownership of Alice (101) after switch to Bob!`
  );

  // 3. UI / cv-store must NOT render Alice's sensitive data under Bob!
  const renderedName = useCVStore.getState().cvData.contact.fullName;
  assert(
    !renderedName.includes("Alice"),
    `FAILED: Alice's unsaved name '${renderedName}' is exposed in store after switch to Bob!`
  );

  // 4. readSavedDraft() must NOT return Alice's draft to Bob!
  const rescuedDraft = readSavedDraft();
  if (rescuedDraft) {
    assert(
      !rescuedDraft.includes("AliceSensitive") && !rescuedDraft.includes("Alice Unsaved Sensitive Work"),
      `FAILED: readSavedDraft() returned Alice's sensitive data after switch to Bob!`
    );
  }

  unbind1();
  ctrl1.destroy();
  console.log("✓ TEST 1 PASSED: Failed A save did not stop B revalidation and Alice data was not exposed.\n");

  // -------------------------------------------------------------------------
  // TEST 2: Failed A save -> unauthenticated or network failure (unknown)
  //         must gate rendered data and never expose A
  // -------------------------------------------------------------------------
  console.log("[TEST 2] Failed A save -> unauthenticated/unknown: gate rendered data & no leakage...");
  resetEnvironment();

  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;

  const ctrl2 = new DraftSessionController();
  const unbind2 = bindStoreToSession(ctrl2);
  await ctrl2.reconcileSession();

  useCVStore.getState().updateContact({ fullName: "Alice Private Unsaved" });

  // 2A: Session becomes unauthenticated
  const origSetItem2 = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };

  currentUser = null;
  currentAuthenticated = false;

  (ctrl2 as any).handleBroadcastMessage({
    type: "logout",
    runtimeId: "remote_runtime",
    operationId: "op-logout",
  });

  await new Promise((r) => setTimeout(r, 50));
  mockLocalStorage.setItem = origSetItem2;

  // Verify Alice's data not rendered and not downloadable
  assert(
    !useCVStore.getState().cvData.contact.fullName.includes("Alice"),
    `FAILED: Alice's contact info remains rendered after unauthenticated invalidation!`
  );
  const rescuedUnauth = readSavedDraft();
  if (rescuedUnauth) {
    assert(
      !rescuedUnauth.includes("AliceSensitive") && !rescuedUnauth.includes("Alice Private Unsaved"),
      `FAILED: readSavedDraft() leaked Alice's draft to unauthenticated session!`
    );
  }

  // 2B: Network failure -> SESSION_UNKNOWN
  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;
  await ctrl2.reconcileSession();
  useCVStore.getState().updateContact({ fullName: "Alice Network Test" });

  fetchShouldFail = true;
  await ctrl2.reconcileSession();
  fetchShouldFail = false;

  assert.equal(ctrl2.getState().state, "SESSION_UNKNOWN");
  assert(
    !useCVStore.getState().cvData.contact.fullName.includes("Alice"),
    `FAILED: Store renders Alice's data while controller is in SESSION_UNKNOWN!`
  );
  const rescuedUnknown = readSavedDraft();
  if (rescuedUnknown) {
    assert(
      !rescuedUnknown.includes("AliceSensitive") && !rescuedUnknown.includes("Alice Network Test"),
      `FAILED: readSavedDraft() returned Alice's draft while controller is in SESSION_UNKNOWN!`
    );
  }

  unbind2();
  ctrl2.destroy();
  console.log("✓ TEST 2 PASSED: Unauthenticated/unknown session gates rendered data and blocks leakage.\n");

  // -------------------------------------------------------------------------
  // TEST 3: Delayed transition gates rendered data immediately
  // -------------------------------------------------------------------------
  console.log("[TEST 3] Delayed transition gates rendered data immediately upon invalidation...");
  resetEnvironment();

  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;

  const ctrl3 = new DraftSessionController();
  const unbind3 = bindStoreToSession(ctrl3);
  await ctrl3.reconcileSession();

  assert.equal(useCVStore.getState().studentProfile?.login, "AliceSensitive");

  // Delay the next session fetch by 150ms
  fetchDelayMs = 150;
  currentUser = { id: 202, login: "Bob", validatedProjects: [] };

  // Trigger invalidation broadcast
  (ctrl3 as any).handleBroadcastMessage({
    type: "owner_changed",
    runtimeId: "remote_tab",
    operationId: "delayed-switch",
    ownerKey: "printcv_drafts_v1:account:42:202",
  });

  // Check IMMEDIATELY (10ms into the 150ms delay)
  await new Promise((r) => setTimeout(r, 10));

  // The controller and store MUST immediately gate Alice's rendered data during the transition!
  const stateDuringTransition = ctrl3.getState().state;
  const renderedProfileDuringTransition = useCVStore.getState().studentProfile;
  const rescuedDuringTransition = readSavedDraft();

  assert(
    stateDuringTransition === "TRANSITIONING" || stateDuringTransition === "BOOTSTRAPPING",
    `FAILED: Expected controller state to immediately be TRANSITIONING, got: ${stateDuringTransition}`
  );
  assert(
    renderedProfileDuringTransition === null || renderedProfileDuringTransition.id !== 101,
    `FAILED: Alice's profile was not immediately gated during pending transition!`
  );
  if (rescuedDuringTransition) {
    assert(
      !rescuedDuringTransition.includes("AliceSensitive"),
      `FAILED: Alice's draft was accessible via readSavedDraft() during transition!`
    );
  }

  // Await transition completion
  await new Promise((r) => setTimeout(r, 200));
  fetchDelayMs = 0;

  unbind3();
  ctrl3.destroy();
  console.log("✓ TEST 3 PASSED: Transition gated immediately before delayed network completion.\n");

  // -------------------------------------------------------------------------
  // TEST 4: Preserved unsaved work for A: not exposed to B, but safely
  //         recoverable when verified A returns
  // -------------------------------------------------------------------------
  console.log("[TEST 4] Preserve A unsaved work privately; returning verified A recovers it...");
  resetEnvironment();

  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;

  const ctrl4 = new DraftSessionController();
  const unbind4 = bindStoreToSession(ctrl4);
  await ctrl4.reconcileSession();

  // Alice performs substantive unsaved edits
  useCVStore.getState().updateContact({
    fullName: "Alice Special Unsaved Work",
    email: "alice.unsaved@example.com",
  });

  // Storage writes fail
  const origSetItem4 = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };

  // Remote switch to Bob
  currentUser = { id: 202, login: "Bob", validatedProjects: [] };
  (ctrl4 as any).handleBroadcastMessage({
    type: "owner_changed",
    runtimeId: "remote_tab",
    operationId: "switch-to-bob",
    ownerKey: "printcv_drafts_v1:account:42:202",
  });

  await new Promise((r) => setTimeout(r, 50));
  mockLocalStorage.setItem = origSetItem4;

  // Bob is active. Bob must NOT see or access Alice's unsaved work!
  assert(
    !useCVStore.getState().cvData.contact.fullName.includes("Alice Special Unsaved Work"),
    `FAILED: Bob sees Alice's unsaved work!`
  );
  const bobRescue = readSavedDraft();
  if (bobRescue) {
    assert(
      !bobRescue.includes("Alice Special Unsaved Work"),
      `FAILED: Bob's readSavedDraft() exposed Alice's unsaved work!`
    );
  }

  // Now Bob logs out and verified Alice returns!
  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  await ctrl4.reconcileSession();

  // Verified Alice is back!
  assert.equal(ctrl4.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl4.getCurrentOwner() as any).studentId, 101);

  // Safe recovery path: Alice's unsaved work was retained privately and can be recovered!
  const aliceRescued = readSavedDraft() || (ctrl4 as any).getPreservedUnsavedSnapshot?.(ctrl4.getCurrentOwner());
  const aliceHasUnsaved =
    (typeof aliceRescued === "string" && aliceRescued.includes("Alice Special Unsaved Work")) ||
    useCVStore.getState().cvData.contact.fullName === "Alice Special Unsaved Work" ||
    (aliceRescued && (aliceRescued as any).cvData?.contact?.fullName === "Alice Special Unsaved Work");

  assert(
    aliceHasUnsaved,
    `FAILED: Returning verified Alice had no recovery path for retained unsaved work!`
  );

  unbind4();
  ctrl4.destroy();
  console.log("✓ TEST 4 PASSED: A's unsaved work preserved privately and recovered by verified A.\n");

  // -------------------------------------------------------------------------
  // TEST 5: Rescue requires verified matching current identity in every state,
  //         never stale sessionStorage
  // -------------------------------------------------------------------------
  console.log("[TEST 5] Rescue requires verified matching current identity in every state...");
  resetEnvironment();

  // Populate localStorage with Alice's sensitive draft
  const aliceKey = `${DRAFTS_KEY_PREFIX}account:42:101`;
  const aliceRecord: DraftRecord = {
    schemaVersion: 1,
    draftId: "alice-draft-uuid",
    owner: { kind: "account", provider: "42", studentId: 101 },
    revision: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    snapshotVersion: 1,
    snapshot: {
      cvData: {
        ...useCVStore.getState().cvData,
        contact: { ...useCVStore.getState().cvData.contact, fullName: "Alice Sensitive Account Draft" },
      },
    },
  };
  mockLocalStorage.setItem(aliceKey, JSON.stringify(aliceRecord));

  // Stale sessionStorage from a prior session pointing to Alice's account
  writeWorkspaceState({
    workspaceVersion: 1,
    mode: "account",
    activeKey: aliceKey,
  });

  // State: Controller not yet settled or unauthenticated
  const ctrl5 = new DraftSessionController();
  // Controller auth is currently unknown / unauthenticated
  assert.equal(ctrl5.getAuthState().status, "unknown");

  // readSavedDraft() MUST NOT return Alice's draft from stale sessionStorage!
  const unverifiedRescue = readSavedDraft();
  assert(
    !unverifiedRescue || !unverifiedRescue.includes("Alice Sensitive Account Draft"),
    `FAILED: readSavedDraft() returned Alice's draft based on stale sessionStorage without verified auth!`
  );

  // Even if controller enters RECOVERY_BLOCKED, it must not return Alice's draft unless verified auth matches!
  (ctrl5 as any).state = { state: "RECOVERY_BLOCKED", message: "Storage error" };
  const blockedUnverifiedRescue = readSavedDraft();
  assert(
    !blockedUnverifiedRescue || !blockedUnverifiedRescue.includes("Alice Sensitive Account Draft"),
    `FAILED: readSavedDraft() returned Alice's draft in RECOVERY_BLOCKED without verified auth!`
  );

  ctrl5.destroy();
  console.log("✓ TEST 5 PASSED: Rescue strictly requires verified matching identity, rejects stale sessionStorage.\n");

  // -------------------------------------------------------------------------
  // TEST 6: Direct delayed session verification immediately gates editor,
  //         store, and rescue before auth fetch settles (Finding 1)
  // -------------------------------------------------------------------------
  console.log("[TEST 6] Direct delayed session verification gates editor & rescue before auth fetch...");
  resetEnvironment();

  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;

  const ctrl6 = new DraftSessionController();
  const unbind6 = bindStoreToSession(ctrl6);

  await ctrl6.reconcileSession();
  assert.equal(ctrl6.getState().state, "EDITING_ACCOUNT");

  // Alice saves sensitive draft
  useCVStore.getState().updateContact({ fullName: "Alice PRIVATE" });
  await ctrl6.flush();
  assert.equal(useCVStore.getState().cvData.contact.fullName, "Alice PRIVATE");

  // Authoritative session changes on server to Bob (202), and GET is delayed
  currentUser = { id: 202, login: "Bob", validatedProjects: [] };
  fetchDelayMs = 150;

  // Direct reconcileSession call (e.g. BFCache pageshow or visibility change, NO broadcast)
  const pendingDirectReconcile = ctrl6.reconcileSession();

  // Inspect state IMMEDIATELY during the delay (20ms into 150ms fetch)
  await new Promise((r) => setTimeout(r, 20));

  const stateDuringDirectDelay = ctrl6.getState().state;
  const storeNameDuringDirectDelay = useCVStore.getState().cvData.contact.fullName;
  const rescueDuringDirectDelay = readSavedDraft();
  const authDuringDirectDelay = ctrl6.getAuthState();

  // Assertions for Finding 1:
  assert.equal(
    stateDuringDirectDelay,
    "TRANSITIONING",
    `FAILED Finding 1: Expected controller state to immediately be TRANSITIONING during direct delayed verification, got '${stateDuringDirectDelay}'`
  );
  assert(
    !storeNameDuringDirectDelay.includes("Alice PRIVATE"),
    `FAILED Finding 1: Store still shows '${storeNameDuringDirectDelay}' during direct delayed verification!`
  );
  assert(
    rescueDuringDirectDelay === null || !rescueDuringDirectDelay.includes("Alice PRIVATE"),
    `FAILED Finding 1: readSavedDraft() leaked Alice PRIVATE during direct delayed verification!`
  );
  assert(
    authDuringDirectDelay.status !== "authenticated" || (authDuringDirectDelay as any).user?.id !== 101,
    `FAILED Finding 1: Stale Alice authentication trusted during direct delayed verification!`
  );

  // Await fetch completion -> Bob activates
  await pendingDirectReconcile;
  fetchDelayMs = 0;

  assert.equal(ctrl6.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl6.getCurrentOwner() as any).studentId, 202);
  assert(!useCVStore.getState().cvData.contact.fullName.includes("Alice PRIVATE"));
  const bobRescued = readSavedDraft();
  assert(!bobRescued || !bobRescued.includes("Alice PRIVATE"));

  // Verified Alice returns -> Alice safely recovers her saved draft
  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  await ctrl6.reconcileSession();
  assert.equal(ctrl6.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl6.getCurrentOwner() as any).studentId, 101);
  assert.equal(useCVStore.getState().cvData.contact.fullName, "Alice PRIVATE");

  // Direct delayed verification with failed flush + unauthenticated outcome
  useCVStore.getState().updateContact({ fullName: "Alice DELAYED FAILED FLUSH" });
  const origSetItem6 = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };

  currentUser = null;
  currentAuthenticated = false;
  fetchDelayMs = 150;

  const pendingDirectUnauth = ctrl6.reconcileSession();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(
    ctrl6.getState().state,
    "TRANSITIONING",
    `FAILED Finding 1: State not TRANSITIONING during direct delayed unauth verification!`
  );
  assert(
    !useCVStore.getState().cvData.contact.fullName.includes("Alice DELAYED FAILED FLUSH"),
    `FAILED Finding 1: Store still exposed unsaved Alice work during direct delayed unauth verification!`
  );
  assert(
    readSavedDraft() === null,
    `FAILED Finding 1: readSavedDraft() leaked Alice draft during direct delayed unauth verification!`
  );

  await pendingDirectUnauth;
  fetchDelayMs = 0;
  mockLocalStorage.setItem = origSetItem6;

  assert.equal(ctrl6.getState().state, "WELCOME");
  assert.equal(useCVStore.getState().cvData.contact.fullName, "");

  // Returning verified Alice recovers retained unsaved work
  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;
  await ctrl6.reconcileSession();
  assert.equal(ctrl6.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl6.getCurrentOwner() as any).studentId, 101);
  assert.equal(useCVStore.getState().cvData.contact.fullName, "Alice DELAYED FAILED FLUSH");

  unbind6();
  ctrl6.destroy();
  console.log("✓ TEST 6 PASSED: Direct delayed session verification gates editor & rescue immediately.\n");

  // -------------------------------------------------------------------------
  // TEST 7: SESSION_UNKNOWN followed by repeated invalidation retains
  //         immutable owner-scoped dirty work without overwriting with
  //         cleared defaults (Finding 2)
  // -------------------------------------------------------------------------
  console.log("[TEST 7] SESSION_UNKNOWN followed by invalidation retains unsaved work...");
  resetEnvironment();

  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;

  const ctrl7 = new DraftSessionController();
  const unbind7 = bindStoreToSession(ctrl7);

  await ctrl7.reconcileSession();
  assert.equal(ctrl7.getState().state, "EDITING_ACCOUNT");

  // Alice makes unsaved edit
  useCVStore.getState().updateContact({ fullName: "Alice UNSAVED MUST SURVIVE" });

  // Quota-block writes and reject GET
  const origSetItem7 = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  fetchShouldFail = true;

  await ctrl7.reconcileSession();
  assert.equal(ctrl7.getState().state, "SESSION_UNKNOWN");

  const ownerA: DraftOwner = { kind: "account", provider: "42", studentId: 101 };
  const preservedInUnknown = ctrl7.getPreservedUnsavedWork(ownerA);
  assert(preservedInUnknown !== null, "Preserved work for A was not captured on failed save/SESSION_UNKNOWN!");
  assert.equal(
    preservedInUnknown.snapshot.cvData.contact.fullName,
    "Alice UNSAVED MUST SURVIVE",
    `Expected preserved name 'Alice UNSAVED MUST SURVIVE', got '${preservedInUnknown.snapshot.cvData.contact.fullName}'`
  );
  // Store in SESSION_UNKNOWN is reset to defaults
  assert.equal(useCVStore.getState().cvData.contact.fullName, "");

  // Restore storage and fetch
  mockLocalStorage.setItem = origSetItem7;
  fetchShouldFail = false;

  // Deliver remote owner_changed(B) broadcast while in SESSION_UNKNOWN
  currentUser = { id: 202, login: "Bob", validatedProjects: [] };
  (ctrl7 as any).handleBroadcastMessage({
    type: "owner_changed",
    runtimeId: "remote_runtime",
    operationId: "after-offline",
    ownerKey: "printcv_drafts_v1:account:42:202",
  });
  await new Promise((r) => setTimeout(r, 20));

  // Assert Finding 2: Invalidation MUST NOT have overwritten preserved unsaved work with cleared defaults!
  const preservedAfterB = ctrl7.getPreservedUnsavedWork(ownerA);
  assert(preservedAfterB !== null, "FAILED Finding 2: Preserved work for A was deleted after owner_changed(B)!");
  assert.equal(
    preservedAfterB.snapshot.cvData.contact.fullName,
    "Alice UNSAVED MUST SURVIVE",
    `FAILED Finding 2: Preserved work for A was overwritten with cleared defaults! Got: '${preservedAfterB.snapshot.cvData.contact.fullName}'`
  );

  // Deliver repeated invalidation (logout broadcast)
  (ctrl7 as any).handleBroadcastMessage({
    type: "logout",
    runtimeId: "remote_runtime",
    operationId: "logout-after-offline",
  });
  await new Promise((r) => setTimeout(r, 20));

  const preservedAfterLogout = ctrl7.getPreservedUnsavedWork(ownerA);
  assert(preservedAfterLogout !== null, "FAILED Finding 2: Preserved work for A was deleted after logout!");
  assert.equal(
    preservedAfterLogout.snapshot.cvData.contact.fullName,
    "Alice UNSAVED MUST SURVIVE",
    `FAILED Finding 2: Preserved work for A was overwritten with cleared defaults after logout!`
  );

  // Bob must not see or access Alice's unsaved work
  assert(!useCVStore.getState().cvData.contact.fullName.includes("Alice UNSAVED MUST SURVIVE"));
  const rescueUnderB = readSavedDraft();
  assert(!rescueUnderB || !rescueUnderB.includes("Alice UNSAVED MUST SURVIVE"));

  // Verified Alice returns -> Alice safely recovers her retained unsaved work!
  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  await ctrl7.reconcileSession();
  assert.equal(ctrl7.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl7.getCurrentOwner() as any).studentId, 101);
  assert.equal(
    useCVStore.getState().cvData.contact.fullName,
    "Alice UNSAVED MUST SURVIVE",
    `FAILED Finding 2: Returning verified Alice did not recover retained unsaved work! Got: '${useCVStore.getState().cvData.contact.fullName}'`
  );

  unbind7();
  ctrl7.destroy();
  console.log("✓ TEST 7 PASSED: SESSION_UNKNOWN followed by invalidation retains unsaved work safely.\n");

  // -------------------------------------------------------------------------
  // TEST 8: Revalidation from authenticated RECOVERY_BLOCKED with unassigned owner
  //         synchronously gates all prior authenticated account authority (Finding 1)
  // -------------------------------------------------------------------------
  console.log("[TEST 8] Authenticated RECOVERY_BLOCKED revalidation synchronously gates authority...");
  resetEnvironment();

  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;

  const ctrl8 = new DraftSessionController();
  const unbind8 = bindStoreToSession(ctrl8);

  await ctrl8.reconcileSession();
  assert.equal(ctrl8.getState().state, "EDITING_ACCOUNT");

  useCVStore.getState().updateContact({ fullName: "PRIVATE BLOCKED OWNER" });
  await ctrl8.flush();

  // Simulate missing Web Locks -> enters RECOVERY_BLOCKED with unassigned owner & authenticated auth
  await ctrl8.reconcileSession(false);
  assert.equal(ctrl8.getState().state, "RECOVERY_BLOCKED");
  assert.equal(ctrl8.getCurrentOwner().kind, "unassigned");
  assert.equal(ctrl8.getAuthState().status, "authenticated");
  assert.equal((ctrl8.getAuthState() as any).user?.id, 101);

  // Now, server switches to B, but GET is delayed
  currentUser = { id: 202, login: "Bob", validatedProjects: [] };
  fetchDelayMs = 150;

  const pendingBlockedReconcile = ctrl8.reconcileSession();
  await new Promise((r) => setTimeout(r, 20));

  // SYNCHRONOUS ASSERTIONS: All authenticated account authority MUST be gated!
  assert.equal(
    ctrl8.getState().state,
    "TRANSITIONING",
    `FAILED Finding 1: State must be TRANSITIONING during reverification from RECOVERY_BLOCKED, got '${ctrl8.getState().state}'`
  );
  assert.equal(
    ctrl8.getAuthState().status,
    "unknown",
    `FAILED Finding 1: Auth status must be 'unknown' during reverification from RECOVERY_BLOCKED, got '${ctrl8.getAuthState().status}'`
  );
  assert.equal(
    ctrl8.getCurrentOwner().kind,
    "unassigned",
    `FAILED Finding 1: Owner must be 'unassigned' during reverification from RECOVERY_BLOCKED`
  );
  assert.equal(
    useCVStore.getState().studentProfile,
    null,
    `FAILED Finding 1: Store studentProfile must be cleared during reverification from RECOVERY_BLOCKED`
  );
  assert.equal(
    readSavedDraft(),
    null,
    `FAILED Finding 1: readSavedDraft() leaked Alice draft during reverification from RECOVERY_BLOCKED!`
  );

  await pendingBlockedReconcile;
  fetchDelayMs = 0;

  // Bob activates
  assert.equal(ctrl8.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl8.getCurrentOwner() as any).studentId, 202);
  const bobRescue8 = readSavedDraft();
  assert(!bobRescue8 || !bobRescue8.includes("PRIVATE BLOCKED OWNER"), "Alice private draft exposed under Bob!");

  // Returning verified Alice recovers safely
  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  await ctrl8.reconcileSession();
  assert.equal(ctrl8.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl8.getCurrentOwner() as any).studentId, 101);
  assert.equal(useCVStore.getState().cvData.contact.fullName, "PRIVATE BLOCKED OWNER");

  unbind8();
  ctrl8.destroy();
  console.log("✓ TEST 8 PASSED: Revalidation from RECOVERY_BLOCKED synchronously gates all account authority.\n");

  // -------------------------------------------------------------------------
  // TEST 9: Truthful persistence and preservation of queued guest edits
  //         (persistent guest, guest-to-account, failed storage, memory guest) (Finding 2)
  // -------------------------------------------------------------------------
  console.log("[TEST 9] Truthful persistence/preservation of queued guest edits across revalidation...");
  resetEnvironment();

  // Variant A: Persistent guest queued edit + immediate unauthenticated reconcileSession
  currentUser = null;
  currentAuthenticated = false;

  const ctrl9 = new DraftSessionController();
  const unbind9 = bindStoreToSession(ctrl9);

  await ctrl9.activateGuestOwner(false);
  assert.equal(ctrl9.getState().state, "EDITING_GUEST");

  useCVStore.getState().updateContact({ fullName: "GUEST PENDING EDITS" });
  // Immediately reconcile before 300ms debounce timer fires
  await ctrl9.reconcileSession();

  assert.equal(ctrl9.getState().state, "EDITING_GUEST");
  assert.equal(
    useCVStore.getState().cvData.contact.fullName,
    "GUEST PENDING EDITS",
    `FAILED Finding 2: Queued persistent guest edit lost after unauthenticated revalidation! Got: '${useCVStore.getState().cvData.contact.fullName}'`
  );
  const guestRescue = readSavedDraft();
  assert(
    guestRescue && guestRescue.includes("GUEST PENDING EDITS"),
    "FAILED Finding 2: Saved draft does not include queued persistent guest edit!"
  );

  // Variant B: Guest-to-account switch variant
  useCVStore.getState().updateContact({ fullName: "GUEST PRE-LOGIN EDIT" });
  // Server now authenticates Alice
  currentUser = { id: 101, login: "AliceSensitive", validatedProjects: [] };
  currentAuthenticated = true;
  await ctrl9.reconcileSession();

  assert.equal(ctrl9.getState().state, "EDITING_ACCOUNT");
  assert.equal((ctrl9.getCurrentOwner() as any).studentId, 101);
  assert(
    !useCVStore.getState().cvData.contact.fullName.includes("GUEST PRE-LOGIN EDIT"),
    "Guest edits leaked into authenticated account store!"
  );

  // Check guest storage: guest edit was truthfully persisted to guest draft
  const diskGuest = mockLocalStorage.getItem(`${DRAFTS_KEY_PREFIX}guest`);
  assert(
    diskGuest && diskGuest.includes("GUEST PRE-LOGIN EDIT"),
    "Guest edit was not flushed/persisted to guest storage before switching to account!"
  );

  // Variant C: Persistent guest failed-storage variant (identity verification not skipped)
  // Logout back to guest
  currentUser = null;
  currentAuthenticated = false;
  await ctrl9.activateGuestOwner(false);
  assert.equal(ctrl9.getState().state, "EDITING_GUEST");

  useCVStore.getState().updateContact({ fullName: "GUEST FAILED STORAGE WORK" });

  const origSetItem9 = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };

  // Reconcile with unauthenticated session while storage is failing
  let verifyFetchExecuted = false;
  const origFetch = (global as any).fetch;
  (global as any).fetch = async (url: string, opts?: any) => {
    if (url.includes("/api/auth/session")) {
      verifyFetchExecuted = true;
    }
    return origFetch(url, opts);
  };

  await ctrl9.reconcileSession();
  (global as any).fetch = origFetch;
  mockLocalStorage.setItem = origSetItem9;

  assert(
    verifyFetchExecuted,
    "FAILED Finding 2: Storage failure skipped auth identity verification during revalidation!"
  );
  assert.equal(
    useCVStore.getState().cvData.contact.fullName,
    "GUEST FAILED STORAGE WORK",
    "FAILED Finding 2: Guest in-memory work was wiped on failed storage revalidation!"
  );

  // Variant D: Memory guest remains no-write and preserves in-memory work
  await ctrl9.activateGuestOwner(true);
  assert.equal(ctrl9.getState().state, "EDITING_GUEST");
  assert(ctrl9.isMemoryOnlyGuest());

  let storageWriteAttempted = false;
  mockLocalStorage.setItem = () => {
    storageWriteAttempted = true;
  };

  useCVStore.getState().updateContact({ fullName: "MEMORY GUEST WORK" });
  await ctrl9.reconcileSession();
  mockLocalStorage.setItem = origSetItem9;

  assert(!storageWriteAttempted, "Memory guest triggered storage write during revalidation!");
  assert.equal(
    useCVStore.getState().cvData.contact.fullName,
    "MEMORY GUEST WORK",
    "Memory guest work was lost during revalidation!"
  );

  unbind9();
  ctrl9.destroy();
  console.log("✓ TEST 9 PASSED: Truthful persistence and preservation of queued guest edits verified.\n");

  console.log("==================================================================");
  console.log("ALL B1 PRIVACY REGRESSION TESTS PASSED!");
  console.log("==================================================================");
}

runB1PrivacyRegressions().catch((err) => {
  console.error("\nTEST SUITE FAILED WITH ERROR:\n", err);
  process.exitCode = 1;
});
