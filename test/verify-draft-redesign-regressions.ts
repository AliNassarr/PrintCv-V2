import assert from "node:assert/strict";
import React from "react";
import {
  DraftSessionController,
  resetSessionControllerForTesting,
} from "../src/lib/draft-session";
import { useCVStore, bindStoreToSession } from "../src/lib/store/cv-store";
import { readSavedDraft } from "../src/lib/draft-rescue";
import {
  readDraftRecord,
  listRecoveryRecords,
} from "../src/lib/draft-repository";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { DRAFTS_KEY_PREFIX } from "../src/lib/cv-constants";
import {
  setupDeterministicEnv,
  pause,
} from "./helpers/deterministic-scheduling";

const env = setupDeterministicEnv();

// =========================================================================
// Category 1A: Copy inflight owner switch - recovery privacy
// Based on c2-new-copy-recovery.ts case4
// =========================================================================
export async function runCategory1A_CopyRecoveryPrivacy(): Promise<void> {
  console.log("\n--- [Category 1A] Copy inflight owner switch: recovery privacy ---");
  env.reset();

  const originalReact = {
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
  };

  const user = { id: 202, login: "B", validatedProjects: [] };
  env.fetchManager.setUser(user);

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  await controller.activateAccountOwner({ id: 303, login: "OTHER303", validatedProjects: [] } as any, false);
  await controller.activateAccountOwner(user as any, false);

  const otherBefore = env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:303`);
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

  // Seed guest source draft
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
  env.localStorage.setItem(`${DRAFTS_KEY_PREFIX}guest`, JSON.stringify(source));
  const rawSourceBytes = env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}guest`);

  // Contention simulation: an old autosave is held in lock queue
  let queueCopy: Array<() => void> = [];
  env.locks.setHook((cb) =>
    new Promise((res) => {
      queueCopy.push(() => {
        cb({}).then(res);
      });
    })
  );

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

  (controller as any).authState = { status: "authenticated", user: { id: 303, login: "OTHER303", validatedProjects: [] } };
  await controller.activateAccountOwner({ id: 303, login: "OTHER303", validatedProjects: [] } as any, false);

  assert(queueCopy.length >= 1, "At least one write queued in lock");
  const first = queueCopy.shift();
  if (first) first();
  await oldSavingPromise;

  // Release subsequent lock requests
  env.locks.setHook(async (cb) => cb({}));
  while (queueCopy.length > 0) {
    const next = queueCopy.shift();
    if (next) next();
  }
  const copyResult = await copyPromise;

  try {
    assert(
      !listRecoveryRecords({ kind: "account", provider: "42", studentId: 202 }).some((v) =>
        JSON.stringify(v).includes("OTHER303")
      ),
      "Copy must not preserve owner303 content as owner202 recovery"
    );
    assert.equal(
      env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:303`),
      otherBefore,
      "Copy must not write a different owner after drain"
    );
    assert.equal(alerts.length, 0, `Copy must not alert on error: ${alerts.join(", ")}`);
    assert.equal(copyResult?.success, false, "Copy must explicitly abort after the owner changes");
    assert.equal(copyResult?.error, "ABORTED_AUTH_OR_TARGET_CHANGED");
    assert.equal(dialogClosed, false, "Aborted old command must not report success to the new view");

    const targetDraft = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:202`);
    assert(targetDraft, "Target account draft must exist");
    assert.equal(Boolean(targetDraft.provenance?.copiedFrom), false);
    assert.equal(env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}choices:42:202`), null);
    assert.equal(
      targetDraft.snapshot.cvData.contact.fullName,
      "INFLIGHT OLD",
      "Only the legitimate held ordinary save may update the old target"
    );
    assert.equal(
      targetDraft.provenance?.copiedFrom?.draftId,
      undefined,
      "Aborted Copy must not install provenance"
    );
    assert.equal(
      targetDraft.snapshot.studentProfile?.id,
      202,
      "Target profile must remain Bob (202)"
    );
    assert.equal(
      env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}guest`),
      rawSourceBytes,
      "Source guest draft must remain unchanged"
    );

    console.log("PASS: Category 1A (Copy recovery privacy)");
  } finally {
    Object.assign(React, originalReact);
    unbind();
    controller.destroy();
  }
}

// =========================================================================
// Category 1B: Copy inflight owner switch - role isolation
// Based on c2-new-copy-role.ts case4
// =========================================================================
export async function runCategory1B_CopyRoleIsolation(): Promise<void> {
  console.log("\n--- [Category 1B] Copy inflight owner switch: role isolation ---");
  env.reset();

  const originalReact = {
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
  };

  const user = { id: 202, login: "B", validatedProjects: [] };
  env.fetchManager.setUser(user);

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  await controller.activateAccountOwner({ id: 303, login: "OTHER303", validatedProjects: [] } as any, false);
  await controller.activateAccountOwner(user as any, false);

  const otherBefore = env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:303`);
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
  env.localStorage.setItem(`${DRAFTS_KEY_PREFIX}guest`, JSON.stringify(source));
  const rawSourceBytes = env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}guest`);

  let queueCopy: Array<() => void> = [];
  env.locks.setHook((cb) =>
    new Promise((res) => {
      queueCopy.push(() => {
        cb({}).then(res);
      });
    })
  );

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

  const copyPromise = copyCallback();

  (controller as any).authState = { status: "authenticated", user: { id: 303, login: "OTHER303", validatedProjects: [] } };
  await controller.activateAccountOwner({ id: 303, login: "OTHER303", validatedProjects: [] } as any, false);
  useCVStore.getState().updateTargetRole("PRIVATE OWNER303 ROLE");

  assert(queueCopy.length >= 1, "At least one write queued in lock");
  const first = queueCopy.shift();
  if (first) first();
  await oldSavingPromise;

  env.locks.setHook(async (cb) => cb({}));
  while (queueCopy.length > 0) {
    const next = queueCopy.shift();
    if (next) next();
  }
  const copyResult = await copyPromise;

  try {
    assert.notEqual(
      readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:202`)?.snapshot.targetRole,
      "PRIVATE OWNER303 ROLE",
      "Copy must not transfer new owner role into old owner disk"
    );
    assert(
      !listRecoveryRecords({ kind: "account", provider: "42", studentId: 202 }).some((v) =>
        JSON.stringify(v).includes("OTHER303")
      ),
      "Copy must not preserve owner303 content as owner202 recovery"
    );
    assert.equal(
      env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:303`),
      otherBefore,
      "Copy must not write a different owner after drain"
    );
    assert.equal(alerts.length, 0, `Copy must not alert on error: ${alerts.join(", ")}`);
    assert.equal(copyResult?.success, false, "Copy must explicitly abort after the owner changes");
    assert.equal(copyResult?.error, "ABORTED_AUTH_OR_TARGET_CHANGED");
    assert.equal(dialogClosed, false, "Aborted old command must not report success to the new view");

    const targetDraft = readDraftRecord(`${DRAFTS_KEY_PREFIX}account:42:202`);
    assert(targetDraft, "Target account draft must exist");
    assert.equal(Boolean(targetDraft.provenance?.copiedFrom), false);
    assert.equal(env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}choices:42:202`), null);
    assert.equal(
      targetDraft.snapshot.cvData.contact.fullName,
      "INFLIGHT OLD",
      "Only the legitimate held ordinary save may update the old target"
    );

    console.log("PASS: Category 1B (Copy role isolation)");
  } finally {
    Object.assign(React, originalReact);
    unbind();
    controller.destroy();
  }
}

// =========================================================================
// Category 2: Held transition candidate durability across failing revalidation
// Based on c2-new-held-transition-failure.cjs
// =========================================================================
export async function runCategory2_HeldTransitionFailure(): Promise<void> {
  console.log("\n--- [Category 2] Held transition candidate durability across failing revalidation ---");
  env.reset();

  const a = { id: 803, login: "A803", validatedProjects: [] };
  const b = { id: 903, login: "B903", validatedProjects: [] };

  env.fetchManager.setUser(a);
  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  await controller.activateAccountOwner(b as any, false);
  await controller.activateAccountOwner(a as any, false);

  let resolveAuth: (u?: any) => void;
  env.fetchManager.setOverride(() => new Promise((res) => { resolveAuth = res; }));

  const p = controller.reconcileSession();
  await pause(0);

  useCVStore.getState().updateContact({ fullName: "HELD PRIVATE CANDIDATE" });

  let releaseLock: () => void;
  env.locks.setHook((cb) => new Promise((res) => { releaseLock = () => res(cb({})); }));

  resolveAuth!({ ok: true, json: async () => ({ authenticated: true, user: a }) });
  await pause(0);

  env.fetchManager.setOverride(null);
  env.fetchManager.setUser(b);

  const switching = controller.reconcileSession();
  await pause(0);

  env.localStorage.failNextSetItem(new Error("one quota"));
  releaseLock!();
  await p;

  env.locks.setHook(async (cb) => cb({}));
  await switching;

  env.fetchManager.setUser(a);
  await controller.reconcileSession();

  const fullName = useCVStore.getState().cvData.contact.fullName;
  const status = useCVStore.getState().saveStatus;
  const preserved = controller.getPreservedUnsavedWork({ kind: "account", provider: "42", studentId: 803 });
  console.log("RETURN", fullName, "STATUS", status, "PRESERVED", preserved);

  try {
    const rawDisk = env.localStorage.getItem(`${DRAFTS_KEY_PREFIX}account:42:803`);
    const savedDraft = readSavedDraft();
    const recoveryRecords = listRecoveryRecords();

    assert(
      JSON.stringify(rawDisk).includes("HELD PRIVATE CANDIDATE") ||
      Boolean(savedDraft && savedDraft.includes("HELD PRIVATE CANDIDATE")) ||
      recoveryRecords.some((v) => JSON.stringify(v).includes("HELD PRIVATE CANDIDATE")),
      "Held candidate must survive failing write across revalidation"
    );

    console.log("PASS: Category 2 (Held transition failure)");
  } finally {
    unbind();
    controller.destroy();
  }
}

// =========================================================================
// Category 3: Draft identity and generation protection against rebound
// Based on c2-new-draft-identity.cjs
// =========================================================================
export async function runCategory3_DraftIdentityProtection(): Promise<void> {
  console.log("\n--- [Category 3] Draft identity and generation protection against rebound ---");
  env.reset();

  const user = { id: 803, login: "A803", validatedProjects: [] };
  env.fetchManager.setUser(user);

  const controller = new DraftSessionController();
  const unbind = bindStoreToSession(controller);
  await controller.reconcileSession();

  let resolveAuth: (u?: any) => void;
  env.fetchManager.setOverride(() => new Promise((res) => { resolveAuth = res; }));

  const p = controller.reconcileSession();
  await pause(0);

  useCVStore.getState().updateContact({ fullName: "OLD DRAFT CANDIDATE" });

  const key = `${DRAFTS_KEY_PREFIX}account:42:803`;
  const d = readDraftRecord(key);
  assert(d, "Initial disk record must exist for account:42:803");
  env.localStorage.setItem(
    key,
    JSON.stringify({
      ...d,
      draftId: "DIFFERENT-STABLE-DRAFT",
      snapshot: { ...d.snapshot, targetRole: "DIFFERENT DRAFT REMOTE" },
    })
  );

  resolveAuth!({ ok: true, json: async () => ({ authenticated: true, user }) });
  await p;

  const finalRecord = readDraftRecord(key);
  console.log("DRAFT", finalRecord?.draftId, "REMOTE", finalRecord?.snapshot?.targetRole);

  try {
    assert.equal(
      finalRecord?.snapshot?.targetRole,
      "DIFFERENT DRAFT REMOTE",
      "Candidate must not be rebound to a different draft identity"
    );

    console.log("PASS: Category 3 (Draft identity protection)");
  } finally {
    unbind();
    controller.destroy();
  }
}

// =========================================================================
// CLI Runner
// =========================================================================
async function main() {
  const arg = process.argv[2]?.toLowerCase();

  const tests: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "category1a", run: runCategory1A_CopyRecoveryPrivacy },
    { name: "category1b", run: runCategory1B_CopyRoleIsolation },
    { name: "category2", run: runCategory2_HeldTransitionFailure },
    { name: "category3", run: runCategory3_DraftIdentityProtection },
  ];

  if (arg && arg !== "all") {
    const match = tests.find((t) =>
      t.name === arg ||
      (arg.includes("1a") && t.name === "category1a") ||
      (arg.includes("1b") && t.name === "category1b") ||
      (arg.includes("copy-recovery") && t.name === "category1a") ||
      (arg.includes("copy-role") && t.name === "category1b") ||
      ((arg.includes("category2") || arg.includes("held")) && t.name === "category2") ||
      ((arg.includes("category3") || arg.includes("identity")) && t.name === "category3")
    );
    if (!match) {
      console.error(`Unknown test target: ${arg}. Valid targets: category1a, category1b, category2, category3, all`);
      process.exit(1);
    }
    await match.run();
    return;
  }

  // Run all tests, reporting results for each and exiting 1 if any fail
  console.log("Running all redesign regressions against current codebase...");
  let failCount = 0;
  for (const t of tests) {
    try {
      await t.run();
    } catch (err: any) {
      failCount++;
      console.error(`FAIL: ${t.name} => ${err.message}`);
    }
  }

  console.log(`\nRegression suite completed: ${tests.length - failCount} passed, ${failCount} failed.`);
  if (failCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Runner error:", err);
    process.exit(1);
  });
}
