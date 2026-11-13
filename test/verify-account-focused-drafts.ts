import assert from "node:assert/strict";
import React from "react";
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
  readDraftRecord,
  listRecoveryRecords,
  createRecoveryRecordSync,
  withDraftsLock,
} from "../src/lib/draft-repository";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { DRAFTS_KEY_PREFIX } from "../src/lib/cv-constants";

// Memory storage helper
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
  location: { search: "", pathname: "/studio" },
  history: { replaceState: () => {} },
};
(global as any).document = { title: "QA" };

let globalLockHook: ((cb: (lock: any) => Promise<any>) => Promise<any>) | null = null;
Object.defineProperty(global, "navigator", {
  value: {
    locks: {
      request: async (_n: string, o: any, cb?: any) => {
        const callback = cb || o;
        if (globalLockHook) {
          return globalLockHook(callback);
        }
        return callback({});
      },
    },
  },
  configurable: true,
});

let currentUser: any = null;
let fetchOverride: ((url: string, opts?: any) => Promise<any>) | null = null;

(global as any).fetch = async (url: string, opts?: any) => {
  if (fetchOverride) {
    return fetchOverride(url, opts);
  }
  if (opts?.method === "DELETE") {
    return { ok: true, json: async () => ({ success: true }) };
  }
  return {
    ok: true,
    json: async () => ({ authenticated: Boolean(currentUser), user: currentUser }),
  };
};

const pause = (ms: number) => new Promise((res) => setTimeout(res, ms));

function resetTestEnv() {
  resetSessionControllerForTesting();
  mockLocalStorage.clear();
  mockSessionStorage.clear();
  globalLockHook = null;
  currentUser = null;
  fetchOverride = null;
  useCVStore.getState().resetToDefaults();
}

// =========================================================================
// CASE 1: Failed guest saves on B/offline outcomes
// =========================================================================
export async function runCase1() {
  console.log("\n--- [CASE 1] Failed guest saves on B/offline outcomes ---");

  // 1A: Failed guest save -> switch to verified B -> guest candidate survives and is restored when guest returns
  {
    console.log("[1A] Failed guest save followed by account switch to B...");
    resetTestEnv();
    const userB = { id: 202, login: "Bob", validatedProjects: [] };
    currentUser = userB;

    const controller = new DraftSessionController();
    const unbind = bindStoreToSession(controller);
    await controller.reconcileSession();
    assert.equal(controller.getState().state, "EDITING_ACCOUNT");

    // Activate guest
    await controller.activateGuestOwner(false);
    assert.equal(controller.getState().state, "EDITING_GUEST");

    useCVStore.getState().updateContact({ fullName: "GUEST FAILED MUST SURVIVE" });

    // Inject storage failure
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    let gets = 0;
    fetchOverride = async () => {
      gets++;
      return { ok: true, json: async () => ({ authenticated: true, user: userB }) };
    };

    await controller.reconcileSession();
    assert(gets > 0, "identity GET must execute despite failed save");

    mockLocalStorage.setItem = originalSetItem;
    fetchOverride = null;
    currentUser = null;

    // Bob is currently logged in: guest work must NOT have leaked into Bob!
    assert.equal(controller.getState().state, "EDITING_ACCOUNT");
    assert(
      !useCVStore.getState().cvData.contact.fullName.includes("GUEST FAILED MUST SURVIVE"),
      "Guest draft must not leak into verified Bob!"
    );
    const bobRescue = readSavedDraft();
    assert(
      !bobRescue || !bobRescue.includes("GUEST FAILED MUST SURVIVE"),
      "Bob's rescue must not expose guest draft!"
    );

    // Now return to guest: guest work MUST be restored
    await controller.activateGuestOwner(false);
    assert.equal(controller.getState().state, "EDITING_GUEST");
    assert.equal(
      useCVStore.getState().cvData.contact.fullName,
      "GUEST FAILED MUST SURVIVE",
      "Failed guest snapshot must remain recoverable after guest returns"
    );
    const guestRescue = readSavedDraft();
    assert(
      guestRescue && guestRescue.includes("GUEST FAILED MUST SURVIVE"),
      "Guest rescue must include failed guest snapshot"
    );

    unbind();
    controller.destroy();
    console.log("✓ [1A] PASSED: Failed guest write preserved safely across account switch to B and recovered.");
  }

  // 1B: Failed guest save -> offline network error -> returns to guest
  {
    console.log("[1B] Failed guest save followed by offline outcome...");
    resetTestEnv();
    const controller = new DraftSessionController();
    const unbind = bindStoreToSession(controller);
    await controller.activateGuestOwner(false);

    useCVStore.getState().updateContact({ fullName: "GUEST OFFLINE MUST SURVIVE" });

    // Storage failure
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    // Network throws offline
    fetchOverride = async () => {
      throw new Error("Offline network error");
    };

    await controller.reconcileSession();
    assert.equal(controller.getState().state, "SESSION_UNKNOWN");

    mockLocalStorage.setItem = originalSetItem;
    fetchOverride = null;

    // Reconcile once network returns (unauthenticated)
    await controller.reconcileSession();
    assert.equal(controller.getState().state, "EDITING_GUEST");
    assert.equal(
      useCVStore.getState().cvData.contact.fullName,
      "GUEST OFFLINE MUST SURVIVE",
      "Failed guest snapshot must remain recoverable after offline revalidation"
    );
    const guestRescue = readSavedDraft();
    assert(
      guestRescue && guestRescue.includes("GUEST OFFLINE MUST SURVIVE"),
      "Guest rescue must include offline failed guest snapshot"
    );

    unbind();
    controller.destroy();
    console.log("✓ [1B] PASSED: Failed guest write preserved safely across offline outcome and recovered.");
  }

  // 1C: Memory guest remains no-write across revalidation
  {
    console.log("[1C] Memory guest remains no-write across revalidation...");
    resetTestEnv();
    const controller = new DraftSessionController();
    const unbind = bindStoreToSession(controller);
    await controller.activateGuestOwner(true);
    assert.equal(controller.isMemoryOnlyGuest(), true);

    let writes = 0;
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = (k: string, v: string) => {
      writes++;
      originalSetItem(k, v);
    };

    useCVStore.getState().updateContact({ fullName: "MEMORY GUEST MUST SURVIVE" });
    await controller.reconcileSession();

    assert.equal(controller.isMemoryOnlyGuest(), true);
    assert.equal(useCVStore.getState().cvData.contact.fullName, "MEMORY GUEST MUST SURVIVE");
    assert.equal(writes, 0, "Memory-only guest must trigger ZERO localStorage writes");

    mockLocalStorage.setItem = originalSetItem;
    unbind();
    controller.destroy();
    console.log("✓ [1C] PASSED: Memory-only guest produces zero writes and survives revalidation.");
  }
}

// =========================================================================
// CASE 2: Delayed same-account GET with async state mutation
// =========================================================================
export async function runCase2() {
  console.log("\n--- [CASE 2] Delayed same-account GET with async state mutation ---");
  resetTestEnv();
  const user = { id: 803, login: "A803", validatedProjects: [] };
  currentUser = user;

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  let resolveFetch: any;
  fetchOverride = () =>
    new Promise((res) => {
      resolveFetch = res;
    });

  const pendingReconcile = controller.reconcileSession();
  await pause(10);

  // Mutate store during delayed auth fetch
  useCVStore.getState().updateContact({ fullName: "DURING AUTH" });

  // Resolve auth check with same user
  resolveFetch({
    ok: true,
    json: async () => ({ authenticated: true, user }),
  });

  await pendingReconcile;
  await pause(350); // wait for debounced autosave

  const diskRecord = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:803`);
  assert(diskRecord, "Account draft must exist on disk");
  assert.equal(
    diskRecord.snapshot.cvData.contact.fullName,
    "DURING AUTH",
    "Edit made during delayed same-account auth fetch must be durably saved"
  );
  assert.equal(
    useCVStore.getState().cvData.contact.fullName,
    "DURING AUTH",
    "Store must retain edit made during auth fetch"
  );

  unbind();
  controller.destroy();
  console.log("✓ [CASE 2] PASSED: Edit made during delayed auth fetch was durably saved.");
}

// =========================================================================
// CASE 3: Dirty local + remote revision conflict preservation
// =========================================================================
export async function runCase3() {
  console.log("\n--- [CASE 3] Dirty local + remote revision conflict preservation ---");
  resetTestEnv();
  const user = { id: 806, login: "A806", validatedProjects: [] };
  currentUser = user;

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  // Local pending edit
  useCVStore.getState().updateContact({ fullName: "LOCAL" });

  // Simulate remote modification to disk under lock
  const old = controller.getCurrentDraft();
  assert(old, "Draft must exist");
  await saveDraftRecord(old.owner, old.draftId, old.revision, {
    ...old.snapshot,
    targetRole: "REMOTE",
  });

  // Reconcile active draft to detect remote revision change
  await controller.reconcileActiveDraft();
  await pause(350);

  const key = `${DRAFTS_KEY_PREFIX}account:42:806`;
  const diskRecord = readDraftRecord(key);
  assert(diskRecord, "Disk record must exist");
  assert.equal(diskRecord.snapshot.targetRole, "REMOTE", "Remote edit must not be overwritten");

  const recoveries = listRecoveryRecords();
  const hasLocal = recoveries.some((v) => JSON.stringify(v).includes("LOCAL"));
  assert(hasLocal, "Pending LOCAL edit must be preserved in recovery record");

  unbind();
  controller.destroy();
  console.log("✓ [CASE 3] PASSED: Remote edit protected and dirty local preserved in recovery.");
}

// =========================================================================
// CASE 4: Actual component Copy while old save is held
// =========================================================================
export async function runCase4() {
  console.log("\n--- [CASE 4] Actual component Copy while old save is held ---");
  resetTestEnv();
  const originalReact = {
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
  };

  const user = { id: 202, login: "B", validatedProjects: [] };
  currentUser = user;

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  let stateIndex = 0;
  let effects: Array<() => any> = [];
  let callbacks: Array<Function> = [];
  let source: any = null;
  let available: any = [];
  let dialogClosed = false;
  let alerts: string[] = [];
  (global as any).alert = (msg: string) => alerts.push(msg);

  (React as any).useState = (initial: any) => {
    const slot = stateIndex++;
    return [
      slot === 3 ? source : slot === 4 ? available : initial,
      (val: any) => {
        if (slot === 3 && val === null) dialogClosed = true;
        if (slot === 4) available = typeof val === "function" ? val(available) : val;
      },
    ];
  };
  (React as any).useRef = (val: any) => ({ current: val });
  (React as any).useEffect = (fn: any) => effects.push(fn);
  (React as any).useCallback = (fn: any) => {
    callbacks.push(fn);
    return fn;
  };

  const Studio = require("../src/app/studio/StudioClient.tsx").default;
  const render = () => {
    stateIndex = 0;
    effects = [];
    callbacks = [];
    Studio();
  };

  render();

  // Create a guest source draft
  source = {
    schemaVersion: 1,
    draftId: "guest-source-123",
    owner: { kind: "guest" },
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: {
      cvData: {
        ...createEmptyCV(),
        contact: { ...createEmptyCV().contact, fullName: "COPY SOURCE" },
      },
    },
  };
  mockLocalStorage.setItem(`${DRAFTS_KEY_PREFIX}guest`, JSON.stringify(source));
  const rawSourceBytes = mockLocalStorage.getItem(`${DRAFTS_KEY_PREFIX}guest`);

  // Contention simulation: an old autosave is held in lock
  let queueCopy: Array<() => void> = [];
  globalLockHook = (cb) =>
    new Promise((res) => {
      queueCopy.push(() => {
        cb({}).then(res);
      });
    });

  const oldSnapshot = {
    ...controller.getCurrentDraft()!.snapshot,
    cvData: {
      ...controller.getCurrentDraft()!.snapshot.cvData,
      contact: {
        ...controller.getCurrentDraft()!.snapshot.cvData.contact,
        fullName: "INFLIGHT OLD",
      },
    },
  };

  const oldSavingPromise = controller.saveCurrentSnapshot(oldSnapshot);
  dialogClosed = false;
  alerts = [];

  render();
  const copyCallback = callbacks.find((fn) => String(fn).includes("copiedSnapshot"));
  assert(copyCallback, "Copy callback must be defined");

  // User confirms copy while old save is still in flight
  const copyPromise = copyCallback();

  // We should have serialized/drained: release old saving first
  assert(queueCopy.length >= 1, "At least one write queued in lock");
  const first = queueCopy.shift();
  if (first) first();
  await oldSavingPromise;

  // Release any subsequent lock requests as normal
  globalLockHook = async (cb) => cb({});
  while (queueCopy.length > 0) {
    const next = queueCopy.shift();
    if (next) next();
  }
  await copyPromise;

  assert.equal(alerts.length, 0, `Copy must not alert on error: ${alerts.join(", ")}`);
  assert.equal(dialogClosed, true, "Review dialog must be closed after successful copy");

  const targetDraft = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:202`);
  assert(targetDraft, "Target account draft must exist");
  assert.equal(
    targetDraft.snapshot.cvData.contact.fullName,
    "COPY SOURCE",
    "Target draft must contain copied source content"
  );
  assert.equal(
    targetDraft.provenance?.copiedFrom?.draftId,
    "guest-source-123",
    "Target draft must record copiedFrom provenance"
  );
  assert.equal(
    targetDraft.snapshot.studentProfile?.id,
    202,
    "Target profile must remain Bob (202)"
  );
  assert.equal(
    mockLocalStorage.getItem(`${DRAFTS_KEY_PREFIX}guest`),
    rawSourceBytes,
    "Source guest draft must remain unchanged"
  );

  // Reconcile must be clean and NOT enter RECOVERY_BLOCKED
  globalLockHook = null;
  await controller.reconcileSession();
  assert.notEqual(
    controller.getState().state,
    "RECOVERY_BLOCKED",
    "Controller must not enter RECOVERY_BLOCKED after copy"
  );

  Object.assign(React, originalReact);
  unbind();
  controller.destroy();
  console.log("✓ [CASE 4] PASSED: Inflight copy serialized cleanly, no retry conflict or RECOVERY_BLOCKED.");
}

// =========================================================================
// CASE 5: Account switch during auth: A's transition edit must not leak to B
// =========================================================================
export async function runCase5() {
  console.log("\n--- [CASE 5] Account switch during auth: A's transition edit must not leak to B ---");
  resetTestEnv();

  const userA = { id: 803, login: "A803", validatedProjects: [] };
  const userB = { id: 903, login: "B903", validatedProjects: [] };
  currentUser = userA;

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  // Pre-seed B's record on disk, then reactivate A
  await controller.activateAccountOwner(userB as any, false);
  await controller.activateAccountOwner(userA as any, false);

  let resolveFetch: any;
  fetchOverride = () =>
    new Promise((res) => {
      resolveFetch = res;
    });

  const pendingReconcile = controller.reconcileSession();
  await pause(0);

  // Private edit made by user A while session verification is pending
  useCVStore.getState().updateContact({ fullName: "PRIVATE A DURING AUTH" });

  // Verification completes as user B
  currentUser = userB;
  resolveFetch({
    ok: true,
    json: async () => ({ authenticated: true, user: userB }),
  });

  await pendingReconcile;
  await pause(50);

  const bKey = `${DRAFTS_KEY_PREFIX}account:42:903`;
  const bDisk = readDraftRecord(bKey);
  assert(bDisk, "B disk record must exist");
  assert(
    !JSON.stringify(bDisk).includes("PRIVATE A DURING AUTH"),
    "A transition edit must NOT be persisted into B's disk record"
  );
  assert.notEqual(
    useCVStore.getState().cvData.contact.fullName,
    "PRIVATE A DURING AUTH",
    "A transition edit must NOT be loaded into B's store"
  );
  assert.equal(
    useCVStore.getState().cvData.contact.fullName,
    "B903",
    "B's store must display B's own profile/content"
  );

  // A's edit must be preserved privately under A's key
  const preservedA = (controller as any).getPreservedUnsavedWork?.({
    kind: "account",
    provider: "42",
    studentId: 803,
  });
  assert(
    preservedA && JSON.stringify(preservedA).includes("PRIVATE A DURING AUTH"),
    "A's transition edit must be preserved privately for A"
  );

  unbind();
  controller.destroy();
  console.log("✓ [CASE 5] PASSED: A's transition edit safely isolated from B and preserved privately.");
}

// =========================================================================
// CASE 6: Failed transition write: truthful status and rescue retention
// =========================================================================
export async function runCase6() {
  console.log("\n--- [CASE 6] Failed transition write: truthful status and rescue retention ---");
  resetTestEnv();

  const user = { id: 803, login: "A803", validatedProjects: [] };
  currentUser = user;

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  let resolveFetch: any;
  fetchOverride = () =>
    new Promise((res) => {
      resolveFetch = res;
    });

  const pendingReconcile = controller.reconcileSession();
  await pause(0);

  // Edit made during auth fetch
  useCVStore.getState().updateContact({ fullName: "FAILED DURING AUTH" });

  // Inject storage failure after initial flush
  const originalSetItem = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };

  resolveFetch({
    ok: true,
    json: async () => ({ authenticated: true, user }),
  });

  await pendingReconcile;
  await pause(50);

  assert.notEqual(
    useCVStore.getState().saveStatus,
    "saved",
    "Failed delayed transition write must not claim saved"
  );

  const rescue = readSavedDraft();
  assert(
    rescue && rescue.includes("FAILED DURING AUTH"),
    "Rescue record must retain failed transition edit"
  );

  mockLocalStorage.setItem = originalSetItem;
  unbind();
  controller.destroy();
  console.log("✓ [CASE 6] PASSED: Failed transition write reports truthful status and retains rescue record.");
}

// =========================================================================
// CASE 7: Intentional empty edits survive transitions and failures
// =========================================================================
export async function runCase7() {
  console.log("\n--- [CASE 7] Intentional empty edits survive transitions and failures ---");

  // 7A: Same-account intentional empty edit survives delayed GET
  {
    console.log("[7A] Same-account intentional empty edit survives delayed GET...");
    resetTestEnv();
    const user = { id: 803, login: "A803", validatedProjects: [] };
    currentUser = user;

    const controller = new DraftSessionController();
    const unbind = bindStoreToSession(controller);
    await controller.reconcileSession();

    let resolveFetch: any;
    fetchOverride = () =>
      new Promise((res) => {
        resolveFetch = res;
      });

    const pendingReconcile = controller.reconcileSession();
    await pause(0);

    // Explicitly delete/empty fullName
    useCVStore.getState().updateContact({ fullName: "" });

    resolveFetch({
      ok: true,
      json: async () => ({ authenticated: true, user }),
    });

    await pendingReconcile;
    await pause(350);

    const aKey = `${DRAFTS_KEY_PREFIX}account:42:803`;
    const aDisk = readDraftRecord(aKey);
    assert(aDisk, "Account disk record must exist");
    assert.equal(
      aDisk.snapshot.cvData.contact.fullName,
      "",
      "Intentional empty edit must survive delayed GET and save to disk"
    );
    assert.equal(
      useCVStore.getState().cvData.contact.fullName,
      "",
      "Store must retain intentional empty edit"
    );

    unbind();
    controller.destroy();
    console.log("✓ [7A] PASSED: Same-account intentional empty edit survived delayed GET.");
  }

  // 7B: Intentional guest deletion survives failed write and revalidation
  {
    console.log("[7B] Intentional guest deletion survives failed write and revalidation...");
    resetTestEnv();
    const controller = new DraftSessionController();
    const unbind = bindStoreToSession(controller);
    await controller.activateGuestOwner(false);

    useCVStore.getState().updateContact({ fullName: "OLD GUEST" });
    await controller.flush();

    // Intentional deletion
    useCVStore.getState().updateContact({ fullName: "" });

    // Quota failure on write
    const originalSetItem = mockLocalStorage.setItem;
    mockLocalStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    // Offline network failure
    fetchOverride = async () => {
      throw new Error("offline");
    };

    await controller.reconcileSession();
    assert.equal(controller.getState().state, "SESSION_UNKNOWN");

    // Network returns, unauthenticated
    mockLocalStorage.setItem = originalSetItem;
    fetchOverride = null;
    currentUser = null;

    await controller.reconcileSession();
    assert.equal(
      useCVStore.getState().cvData.contact.fullName,
      "",
      "Intentional guest deletion must survive failed write and revalidation"
    );

    unbind();
    controller.destroy();
    console.log("✓ [7B] PASSED: Intentional guest deletion survived failed write and revalidation.");
  }
}

// =========================================================================
// CASE 8: Restored return-to-A candidate durability
// =========================================================================
export async function runCase8() {
  console.log("\n--- [CASE 8] Restored return-to-A candidate durability ---");
  resetTestEnv();
  const a = { id: 803, login: "A803", validatedProjects: [] };
  const b = { id: 903, login: "B903", validatedProjects: [] };
  currentUser = a;
  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  await controller.activateAccountOwner(b as any, false);
  await controller.activateAccountOwner(a as any, false);

  let resolveFetch: any;
  fetchOverride = () => new Promise((res) => (resolveFetch = res));
  const p = controller.reconcileSession();
  await pause(0);
  useCVStore.getState().updateContact({ fullName: "PRIVATE RETAIN" });
  resolveFetch({ ok: true, json: async () => ({ authenticated: true, user: b }) });
  await p;

  fetchOverride = null;
  currentUser = a;
  await controller.reconcileSession();

  const aDisk = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:803`);
  assert(
    aDisk?.snapshot.cvData.contact.fullName === "PRIVATE RETAIN" ||
      (useCVStore.getState().saveStatus !== "saved" && readSavedDraft()?.includes("PRIVATE RETAIN")),
    "Returned owner candidate must be durable or explicitly recoverable"
  );
  unbind();
  controller.destroy();
  console.log("✓ [CASE 8] PASSED: Restored return-to-A candidate is durable or explicitly recoverable.");
}

// =========================================================================
// CASE 9: Remote edit during delayed GET conflict preservation
// =========================================================================
export async function runCase9() {
  console.log("\n--- [CASE 9] Remote edit during delayed GET conflict preservation ---");
  resetTestEnv();
  const user = { id: 803, login: "A803", validatedProjects: [] };
  currentUser = user;
  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  let resolveFetch: any;
  fetchOverride = () => new Promise((res) => (resolveFetch = res));
  const p = controller.reconcileSession();
  await pause(0);
  useCVStore.getState().updateContact({ fullName: "LOCAL DURING GET" });

  const disk = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:803`)!;
  await saveDraftRecord(disk.owner, disk.draftId, disk.revision, {
    ...disk.snapshot,
    targetRole: "REMOTE DURING GET",
  });

  resolveFetch({ ok: true, json: async () => ({ authenticated: true, user }) });
  await p;

  const diskAfter = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:803`)!;
  assert.equal(
    diskAfter.snapshot.targetRole,
    "REMOTE DURING GET",
    "Transition candidate must not silently overwrite advanced remote revision"
  );
  assert(
    listRecoveryRecords().some((v) => JSON.stringify(v).includes("LOCAL DURING GET")),
    "LOCAL requires conflict recovery"
  );
  unbind();
  controller.destroy();
  console.log("✓ [CASE 9] PASSED: Remote edit preserved on conflict during delayed GET.");
}

// =========================================================================
// CASE 10: Stale A conflict must not alter B revision or status
// =========================================================================
export async function runCase10() {
  console.log("\n--- [CASE 10] Stale A conflict must not alter B revision or status ---");
  resetTestEnv();
  const a = { id: 803, login: "A803", validatedProjects: [] };
  const b = { id: 903, login: "B903", validatedProjects: [] };
  currentUser = a;
  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  await controller.activateAccountOwner(b as any, false);
  await controller.activateAccountOwner(a as any, false);

  const old = controller.getCurrentDraft()!;
  for (let n = 0; n < 3; n++) {
    const d = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:803`)!;
    await saveDraftRecord(d.owner, d.draftId, d.revision, d.snapshot);
  }

  let releaseLock: any;
  globalLockHook = (cb) => new Promise((res) => (releaseLock = () => res(cb({}))));
  const p = controller.saveCurrentSnapshot(old.snapshot);
  await controller.activateAccountOwner(b as any, false);
  const rev = controller.getCurrentRevision();

  releaseLock();
  await p;
  globalLockHook = null;

  assert.equal(controller.getCurrentRevision(), rev, "Stale A conflict must not alter B revision");
  unbind();
  controller.destroy();
  console.log("✓ [CASE 10] PASSED: Stale A conflict did not alter B revision.");
}

// =========================================================================
// CASE 11: Older write completion must not cancel newer edit
// =========================================================================
export async function runCase11() {
  console.log("\n--- [CASE 11] Older write completion must not cancel newer edit ---");
  resetTestEnv();
  const user = { id: 803, login: "A803", validatedProjects: [] };
  currentUser = user;
  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  useCVStore.getState().updateContact({ fullName: "FIRST WRITE" });
  const heldLocks: Array<() => void> = [];
  globalLockHook = cb => new Promise((resolve, reject) => {
    heldLocks.push(() => { Promise.resolve(cb({})).then(resolve, reject); });
  });
  const p = controller.flush();
  await pause(0);
  assert.equal(heldLocks.length, 1, "First write must be held at its repository lock.");
  useCVStore.getState().updateContact({ fullName: "SECOND LATEST" });
  heldLocks.shift()!();
  // The newer candidate must acquire a second lock after the first commit is
  // acknowledged. Release that actual write too; otherwise this fake leaves
  // the correct serialized implementation blocked until its lock timeout.
  for (let i = 0; i < 20 && Number(heldLocks.length) === 0; i++) await pause(0);
  assert.equal(heldLocks.length, 1, "Newer candidate must acquire its own repository lock.");
  heldLocks.shift()!();
  await p;
  globalLockHook = null;

  const disk = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:803`)!;
  assert.equal(
    disk.snapshot.cvData.contact.fullName,
    "SECOND LATEST",
    "Older write completion must not cancel newer edit"
  );
  unbind();
  controller.destroy();
  console.log("✓ [CASE 11] PASSED: Older write completion did not cancel newer edit.");
}

// =========================================================================
// CASE 12: Copy callback revalidation after drain
// =========================================================================
export async function runCase12() {
  console.log("\n--- [CASE 12] Copy callback revalidation after drain ---");
  resetTestEnv();
  const originalReact = {
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
  };

  const user = { id: 202, login: "B", validatedProjects: [] };
  currentUser = user;

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  await controller.activateAccountOwner({ id: 303, login: "OTHER303", validatedProjects: [] } as any, false);
  await controller.activateAccountOwner(user as any, false);
  const otherBefore = mockLocalStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:303`);

  let stateIndex = 0;
  let effects: Array<() => any> = [];
  let callbacks: Array<Function> = [];
  let source: any = null;
  let available: any = [];
  let dialogClosed = false;
  let alerts: string[] = [];
  (global as any).alert = (msg: string) => alerts.push(msg);

  (React as any).useState = (initial: any) => {
    const slot = stateIndex++;
    return [
      slot === 3 ? source : slot === 4 ? available : initial,
      (val: any) => {
        if (slot === 3 && val === null) dialogClosed = true;
        if (slot === 4) available = typeof val === "function" ? val(available) : val;
      },
    ];
  };
  (React as any).useRef = (val: any) => ({ current: val });
  (React as any).useEffect = (fn: any) => effects.push(fn);
  (React as any).useCallback = (fn: any) => {
    callbacks.push(fn);
    return fn;
  };

  const Studio = require("../src/app/studio/StudioClient.tsx").default;
  const render = () => {
    stateIndex = 0;
    effects = [];
    callbacks = [];
    Studio();
  };

  render();

  source = {
    schemaVersion: 1,
    draftId: "guest-source-123",
    owner: { kind: "guest" },
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: {
      cvData: {
        ...createEmptyCV(),
        contact: { ...createEmptyCV().contact, fullName: "COPY SOURCE" },
      },
    },
  };
  mockLocalStorage.setItem(`${DRAFTS_KEY_PREFIX}guest`, JSON.stringify(source));

  let queueCopy: Array<() => void> = [];
  globalLockHook = (cb) =>
    new Promise((res) => {
      queueCopy.push(() => {
        cb({}).then(res);
      });
    });

  const oldSnapshot = {
    ...controller.getCurrentDraft()!.snapshot,
    cvData: {
      ...controller.getCurrentDraft()!.snapshot.cvData,
      contact: {
        ...controller.getCurrentDraft()!.snapshot.cvData.contact,
        fullName: "INFLIGHT OLD",
      },
    },
  };

  const oldSavingPromise = controller.saveCurrentSnapshot(oldSnapshot);
  render();
  const copyCallback = callbacks.find((fn) => String(fn).includes("copiedSnapshot"));
  assert(copyCallback, "Copy callback must be defined");

  const copyPromise = copyCallback();

  (controller as any).authState = {
    status: "authenticated",
    user: { id: 303, login: "OTHER303", validatedProjects: [] },
  };
  await controller.activateAccountOwner({ id: 303, login: "OTHER303", validatedProjects: [] } as any, false);

  assert(queueCopy.length >= 1, "At least one write queued in lock");
  const first = queueCopy.shift();
  if (first) first();
  await oldSavingPromise;

  globalLockHook = async (cb) => cb({});
  while (queueCopy.length > 0) {
    const next = queueCopy.shift();
    if (next) next();
  }
  await copyPromise;

  assert.equal(
    mockLocalStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:303`),
    otherBefore,
    "Copy must not write a different owner after drain"
  );

  Object.assign(React, originalReact);
  unbind();
  controller.destroy();
  console.log("✓ [CASE 12] PASSED: Copy did not write to different owner after drain.");
}

// =========================================================================
// CASE 13: Copy preserves failed old save/dirty work in recovery
// =========================================================================
export async function runCase13() {
  console.log("\n--- [CASE 13] Copy preserves failed old save/dirty work in recovery ---");
  resetTestEnv();
  const originalReact = {
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
  };

  const user = { id: 202, login: "B", validatedProjects: [] };
  currentUser = user;

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  let stateIndex = 0;
  let effects: Array<() => any> = [];
  let callbacks: Array<Function> = [];
  let source: any = null;
  let available: any = [];
  let dialogClosed = false;
  let alerts: string[] = [];
  (global as any).alert = (msg: string) => alerts.push(msg);

  (React as any).useState = (initial: any) => {
    const slot = stateIndex++;
    return [
      slot === 3 ? source : slot === 4 ? available : initial,
      (val: any) => {
        if (slot === 3 && val === null) dialogClosed = true;
        if (slot === 4) available = typeof val === "function" ? val(available) : val;
      },
    ];
  };
  (React as any).useRef = (val: any) => ({ current: val });
  (React as any).useEffect = (fn: any) => effects.push(fn);
  (React as any).useCallback = (fn: any) => {
    callbacks.push(fn);
    return fn;
  };

  const Studio = require("../src/app/studio/StudioClient.tsx").default;
  const render = () => {
    stateIndex = 0;
    effects = [];
    callbacks = [];
    Studio();
  };

  render();

  source = {
    schemaVersion: 1,
    draftId: "guest-source-123",
    owner: { kind: "guest" },
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: {
      cvData: {
        ...createEmptyCV(),
        contact: { ...createEmptyCV().contact, fullName: "COPY SOURCE" },
      },
    },
  };
  mockLocalStorage.setItem(`${DRAFTS_KEY_PREFIX}guest`, JSON.stringify(source));

  let queueCopy: Array<() => void> = [];
  globalLockHook = (cb) =>
    new Promise((res, reject) => {
      queueCopy.push(() => {
        cb({}).then(res, reject);
      });
    });

  const oldSnapshot = {
    ...controller.getCurrentDraft()!.snapshot,
    cvData: {
      ...controller.getCurrentDraft()!.snapshot.cvData,
      contact: {
        ...controller.getCurrentDraft()!.snapshot.cvData.contact,
        fullName: "INFLIGHT OLD",
      },
    },
  };

  useCVStore.getState().updateContact({ fullName: "INFLIGHT OLD" });
  const oldSavingPromise = controller.saveCurrentSnapshot(oldSnapshot);

  render();
  const copyCallback = callbacks.find((fn) => String(fn).includes("copiedSnapshot"));
  assert(copyCallback, "Copy callback must be defined");

  const origSetter = mockLocalStorage.setItem;
  mockLocalStorage.setItem = () => {
    mockLocalStorage.setItem = origSetter;
    throw Error("quota");
  };
  const copyPromise = copyCallback();

  assert(queueCopy.length >= 1, "At least one write queued in lock");
  const first = queueCopy.shift();
  if (first) first();
  await oldSavingPromise;
  mockLocalStorage.setItem = origSetter;

  globalLockHook = async (cb) => cb({});
  while (queueCopy.length > 0) {
    const next = queueCopy.shift();
    if (next) next();
  }
  await copyPromise;

  assert(
    listRecoveryRecords().some((v) => JSON.stringify(v).includes("INFLIGHT OLD")),
    "Failed old save must be recoverable if Copy proceeds"
  );

  Object.assign(React, originalReact);
  unbind();
  controller.destroy();
  console.log("✓ [CASE 13] PASSED: Copy preserved failed dirty work in recovery.");
}

// =========================================================================
// CASE 14: Foreign profile candidate not consumed under mismatched owner
// =========================================================================
export async function runCase14() {
  console.log("\n--- [CASE 14] Foreign profile candidate not consumed under mismatched owner ---");
  resetTestEnv();
  const user = { id: 803, login: "A803", validatedProjects: [] };
  currentUser = user;
  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  let resolveFetch: any;
  fetchOverride = () => new Promise((res) => (resolveFetch = res));
  const p = controller.reconcileSession();
  await pause(0);
  useCVStore.getState().setCVData({
    ...createEmptyCV(),
    contact: { ...createEmptyCV().contact, fullName: "MISMATCH" },
  });
  useCVStore.setState({
    studentProfile: { id: 903, login: "PRIVATE B", validatedProjects: [] } as any,
  });
  useCVStore.getState().updateContact({ email: "new@local.test" });
  resolveFetch({ ok: true, json: async () => ({ authenticated: true, user }) });
  await p;

  const d = JSON.parse(mockLocalStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:803`) || "{}");
  assert(d.snapshot.studentProfile?.id !== 903, "Foreign profile must not persist under A owner");
  unbind();
  controller.destroy();
  console.log("✓ [CASE 14] PASSED: Foreign profile candidate not persisted under A owner.");
}

async function main() {
  const arg = process.argv[2];
  if (arg === "case1") {
    await runCase1();
  } else if (arg === "case2") {
    await runCase2();
  } else if (arg === "case3") {
    await runCase3();
  } else if (arg === "case4") {
    await runCase4();
  } else if (arg === "case5") {
    await runCase5();
  } else if (arg === "case6") {
    await runCase6();
  } else if (arg === "case7") {
    await runCase7();
  } else if (arg === "case8") {
    await runCase8();
  } else if (arg === "case9") {
    await runCase9();
  } else if (arg === "case10") {
    await runCase10();
  } else if (arg === "case11") {
    await runCase11();
  } else if (arg === "case12") {
    await runCase12();
  } else if (arg === "case13") {
    await runCase13();
  } else if (arg === "case14") {
    await runCase14();
  } else {
    await runCase1();
    await runCase2();
    await runCase3();
    await runCase4();
    await runCase5();
    await runCase6();
    await runCase7();
    await runCase8();
    await runCase9();
    await runCase10();
    await runCase11();
    await runCase12();
    await runCase13();
    await runCase14();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
