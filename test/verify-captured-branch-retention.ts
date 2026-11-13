import assert from "node:assert/strict";
import { DraftSessionController } from "../src/lib/draft-session";
import { bindStoreToSession, useCVStore as store } from "../src/lib/store/cv-store";
import { setupDeterministicEnv } from "./helpers/deterministic-scheduling";
import { DraftCoordinator, type CoordinatorRepositoryPort, type ImmutableDraftOperation } from "../src/lib/draft-coordinator";

const env = setupDeterministicEnv();
const A = { id: 101, login: "alice", validatedProjects: [] } as any;
const B = { id: 202, login: "bob", validatedProjects: [] } as any;
const owner = { kind: "account", provider: "42", studentId: 101 } as const;
const key = "printcv_drafts_v1:account:42:101";
let c: DraftSessionController, unbind: (() => void) | undefined;
let passed = 0, failed = 0;
async function setup() {
  unbind?.(); c?.destroy(); env.reset(); env.fetchManager.setUser(A);
  c = new DraftSessionController(); unbind = bindStoreToSession(c); await c.reconcileSession();
  store.getState().setCVData({ ...c.getCurrentDraft()!.snapshot.cvData,
    contact: { ...c.getCurrentDraft()!.snapshot.cvData.contact, email: "keep@example.invalid" },
    projects: [{ id: "p", name: "P", is42Project: false, techStack: "TS", date: "2025", bulletPoints: ["truth"] }] });
  assert(await c.flush());
}
async function remote() {
  const r = structuredClone(c.getCurrentDraft()!); r.revision++;
  r.snapshot.cvData.contact.email = "remote@example.invalid"; r.snapshot.cvData.projects = [];
  const raw = JSON.stringify(r); env.localStorage.setItem(key, raw); await c.reconcileActiveDraft(); return { r, raw };
}
async function check(name: string, run: () => Promise<void>) {
  try { await setup(); await run(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.error("FAIL " + name, e); }
}
async function main() {
  for (const order of ["current-first", "old-first"]) {
    await check(order + " conserves two complete branches and metadata", async () => {
      const old = store.getState().updateContact, origin = structuredClone(c.getCurrentDraft()!);
      const { r, raw } = await remote(), current = store.getState().setTargetRole;
      if (order === "current-first") current("remote role");
      old({ fullName: "old intent" });
      if (order === "old-first") current("remote role");
      old({ phoneNumber: "555" });
      assert.equal(await c.flush(), false); assert.equal(env.localStorage.getItem(key), raw);
      const branches = c.getPreservedBranches(owner);
      assert.equal(branches.length, 2);
      const local = branches.find(b => b.snapshot.cvData.contact.fullName === "old intent")!;
      const remoteBranch = branches.find(b => b.snapshot.targetRole === "remote role")!;
      assert(local); assert(remoteBranch); assert.notEqual(local.branchKey, remoteBranch.branchKey);
      assert.equal(local.baseRevision, origin.revision); assert.equal(local.originRevision, origin.revision);
      assert.deepEqual(local.originSnapshot, origin.snapshot); assert.deepEqual(local.owner, owner);
      assert.equal(local.draftId, origin.draftId); assert.equal(local.snapshot.cvData.contact.email, "keep@example.invalid");
      assert.equal(local.snapshot.cvData.projects[0].id, "p"); assert.equal(local.snapshot.cvData.contact.phoneNumber, "555");
      assert.equal(remoteBranch.baseRevision, r.revision); assert.deepEqual(remoteBranch.originSnapshot, JSON.parse(raw).snapshot);
      assert.equal(remoteBranch.snapshot.cvData.contact.email, "remote@example.invalid");
      assert.deepEqual(remoteBranch.snapshot.cvData.projects, []);
      assert.equal(remoteBranch.snapshot.cvData.targetRole, "remote role");
      assert.equal(c.getPreservedUnsavedWork(owner)!.snapshot.cvData.contact.email, "keep@example.invalid");
      assert.equal(c.getPreservedUnsavedWork(owner)!.baseRevision, origin.revision);
      for (const branch of branches) {
        assert(branch.operation.operationId); assert.equal(branch.operation.branchKey, branch.branchKey);
        assert.deepEqual(branch.operation.snapshot, branch.snapshot);
      }
      for (let i = 0; i < 20; i++) await Promise.resolve();
      const durable = c.getPreservedBranches(owner);
      const recoveryBytes = new Map<string, string>();
      for (const branch of durable) {
        assert(branch.recovery.length > 0);
        for (const recovery of branch.recovery) {
          assert.equal(recovery.state, "durable"); assert(recovery.recoveryKey);
          const bytes = env.localStorage.getItem(recovery.recoveryKey)!; assert(bytes);
          recoveryBytes.set(recovery.recoveryKey, bytes);
          const record = JSON.parse(bytes);
          assert.deepEqual(record.owner, owner);
          assert.equal(record.record.draftId, origin.draftId);
          assert.deepEqual(record.record.snapshot, JSON.parse(JSON.stringify(recovery.operation.snapshot)));
          const metadata = JSON.parse(record.reason.slice("CONFLICT_BRANCH:".length));
          assert.equal(metadata.operationId, recovery.operation.operationId);
          assert.equal(metadata.baseRevision, recovery.operation.baseRevision);
          assert.equal(metadata.branchKey, branch.branchKey);
          assert.equal(metadata.ownerKey, recovery.operation.ownerKey);
        }
      }
      console.log("BRANCH_CONSERVATION " + JSON.stringify({ order, branches: durable, remoteBytesUnchanged: env.localStorage.getItem(key) === raw }));
      branches[0].snapshot.cvData.contact.email = "alias";
      assert(!JSON.stringify(c.getPreservedBranches(owner)).includes('"alias"'));
      assert.deepEqual(c.getPreservedBranches({ kind: "account", provider: "42", studentId: 202 }), []);
      await c.activateAccountOwner(B, false); const bob = JSON.stringify(c.getCurrentDraft());
      old({ email: "" }); assert.equal(JSON.stringify(c.getCurrentDraft()), bob);
      await c.activateAccountOwner(A, false); assert.equal(c.getPreservedBranches(owner).length, 2);
      assert.equal(c.getPreservedBranches(owner).find(b => b.branchKey === local.branchKey)!.snapshot.cvData.contact.email, "");
      assert.equal(env.localStorage.getItem(key), raw);
      for (const [recoveryKey, bytes] of recoveryBytes) assert.equal(env.localStorage.getItem(recoveryKey), bytes);
    });
  }
  for (const phase of ["pending", "active", "failed"] as const) {
    for (const recoveryFails of [false, true]) {
      await check(`${phase} branch survives stale callback; recovery failure=${recoveryFails}`, async () => {
        let disk = structuredClone(c.getCurrentDraft()!), release!: () => void;
        let writes = 0;
        const recoveries: Array<{ owner: unknown; snapshot: unknown; reason: string }> = [];
        const gate = new Promise<void>(resolve => { release = resolve; });
        const port: CoordinatorRepositoryPort = {
          readDraft: async () => structuredClone(disk),
          commitDraft: async op => {
            writes++;
            if (phase === "active") await gate;
            throw new Error(phase === "failed" ? "QUOTA" : "CONFLICT_REMOTE");
          },
          createRecovery: async (o, snapshot, reason) => {
            if (recoveryFails) throw new Error("QUOTA_RECOVERY");
            recoveries.push({ owner: structuredClone(o), snapshot: structuredClone(snapshot), reason });
            return `recovery-${recoveries.length}`;
          },
          commitCopy: async () => { throw new Error("unused"); },
          commitReset: async () => { throw new Error("unused"); },
        };
        const core = new DraftCoordinator({ repository: port, debounceMs: phase === "pending" ? 100 : 0,
          scheduleTask: () => () => {} }, owner, disk.draftId);
        await core.switchView(owner, disk.draftId);
        const old = core.captureActionScope()!, origin = structuredClone(disk);
        disk.revision++; disk.snapshot.cvData.contact.email = "remote@example.invalid"; disk.snapshot.cvData.projects = [];
        assert(await core.acceptRemote(disk)); const raw = JSON.stringify(disk);
        const current = core.captureActionScope()!;
        current.apply(s => ({ ...s, targetRole: "remote intent", cvData: { ...s.cvData, targetRole: "remote intent" } }));
        if (phase === "failed") { assert.equal(await core.drain(), false); }
        const before = core.getSlot(owner, disk.draftId)!;
        const op: ImmutableDraftOperation = (before.pendingCandidate ?? before.activeOperation ?? before.retainedFailure?.operation)!;
        assert(op);
        old.apply(s => ({ ...s, cvData: { ...s.cvData, contact: { ...s.cvData.contact, fullName: "old intent" } } }));
        current.apply(s => ({ ...s, helperAnswers: { p: { q: "current branch answer" } } }));
        old.apply(s => ({ ...s, cvData: { ...s.cvData, contact: { ...s.cvData.contact, email: "" } } }));
        if (phase === "active") release();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        assert.equal(await core.drain(), false);
        const branches = core.getPreservedBranches(owner); assert.equal(branches.length, 2);
        const local = branches.find(b => b.originRevision === origin.revision)!;
        const newer = branches.find(b => b.originRevision === disk.revision)!;
        assert.equal(local.snapshot.cvData.contact.fullName, "old intent");
        assert.equal(local.snapshot.cvData.contact.email, ""); assert.equal(local.snapshot.cvData.projects[0].id, "p");
        assert.equal(newer.snapshot.targetRole, "remote intent"); assert.deepEqual(newer.snapshot.cvData.projects, []);
        assert.equal(newer.snapshot.cvData.contact.email, "remote@example.invalid");
        assert.equal(newer.snapshot.helperAnswers?.p.q, "current branch answer");
        assert.equal(newer.recovery.find(r => r.operation.operationId === op.operationId)!.operation.baseRevision, op.baseRevision);
        assert.deepEqual(newer.recovery.find(r => r.operation.operationId === op.operationId)!.operation.snapshot, op.snapshot);
        assert(branches.every(b => b.recovery.length > 0));
        assert(branches.every(b => b.recovery.every(r => r.state === (recoveryFails ? "memory" : "durable"))));
        assert.equal(JSON.stringify(disk), raw);
        assert.equal(writes, phase === "pending" ? 0 : 1);
        if (!recoveryFails) {
          assert(recoveries.some(r => JSON.stringify(r.snapshot) === JSON.stringify(local.snapshot)));
          const metadata = JSON.parse(recoveries.find(r => r.reason.startsWith("CONFLICT_BRANCH:"))!.reason.slice("CONFLICT_BRANCH:".length));
          assert.equal(metadata.ownerKey, op.ownerKey); assert.equal(metadata.draftId, op.draftId);
          assert.equal(metadata.branchKey, op.branchKey); assert(metadata.originSnapshot);
        }
        // New remote arrivals cannot silently advance either retained ancestry.
        disk.revision++; assert.equal(await core.acceptRemote(disk), false);
        assert.equal(core.getPreservedBranches(owner).find(b => b.branchKey === local.branchKey)!.originRevision, origin.revision);
        core.pauseScheduledSaves();
      });
    }
  }
  await check("memory-only incompatible branches never call persistence", async () => {
    const record = structuredClone(c.getCurrentDraft()!); let calls = 0;
    const forbidden = async (): Promise<any> => { calls++; throw new Error("memory persistence"); };
    const core = new DraftCoordinator({ repository: { readDraft: forbidden, commitDraft: forbidden,
      createRecovery: forbidden, commitCopy: forbidden, commitReset: forbidden } }, owner, record.draftId);
    await core.switchView(owner, record.draftId, true); core.submitEdit(record.snapshot); assert(await core.drain());
    const old = core.captureActionScope()!;
    record.revision += 10; record.snapshot.cvData.contact.email = "memory remote";
    assert(await core.acceptRemote(record)); const current = core.captureActionScope()!;
    old.apply(s => ({ ...s, targetRole: "old memory" }));
    current.apply(s => ({ ...s, targetRole: "current memory" }));
    assert.equal(core.getPreservedBranches(owner).length, 2);
    assert(core.getPreservedBranches(owner).every(b => b.recovery.every(r => r.state === "memory")));
    assert.equal(calls, 0); core.pauseScheduledSaves();
  });
  await check("direct hydrated edit records the original data before transformation", async () => {
    const record = structuredClone(c.getCurrentDraft()!);
    const unused = async (): Promise<any> => { throw new Error("unused"); };
    const core = new DraftCoordinator({ repository: { readDraft: async () => structuredClone(record),
      commitDraft: unused, createRecovery: unused, commitCopy: unused, commitReset: unused },
      debounceMs: 100, scheduleTask: () => () => {} }, owner, record.draftId);
    await core.switchView(owner, record.draftId);
    const next = structuredClone(record.snapshot); next.cvData.contact.email = "direct edit";
    core.submitEdit(next);
    const branch = core.getPreservedBranches(owner)[0];
    assert.deepEqual(branch.originSnapshot, record.snapshot);
    assert.equal(branch.originRevision, record.revision);
    assert.equal(branch.operation.originRevision, record.revision);
    assert.deepEqual(branch.operation.originSnapshot, record.snapshot);
    assert.equal(branch.snapshot.cvData.contact.email, "direct edit"); core.pauseScheduledSaves();
  });
  await check("old callback keeps immutable capture metadata across compatible own acknowledgements", async () => {
    const captured = structuredClone(c.getCurrentDraft()!), scope = c.captureActionScope()!;
    store.getState().setTargetRole("own acknowledged role"); assert(await c.flush());
    const { raw } = await remote();
    scope.apply(s => ({ ...s, cvData: { ...s.cvData, contact: { ...s.cvData.contact, fullName: "captured metadata" } } }));
    assert.equal(await c.flush(), false);
    const branch = c.getPreservedBranches(owner)[0];
    assert.equal(branch.operation.originRevision, captured.revision);
    assert.deepEqual(branch.operation.originSnapshot, captured.snapshot);
    assert.equal(branch.snapshot.targetRole, "own acknowledged role");
    assert.equal(branch.snapshot.cvData.contact.email, "keep@example.invalid");
    assert.equal(env.localStorage.getItem(key), raw);
  });
  // Exact expected-correct independent QA schedules, retained as permanent coverage.
  async function diverge() {
    const old = store.getState().updateContact, r = structuredClone(c.getCurrentDraft()!);
    r.revision++; r.snapshot.cvData.contact.email = "remote@example.invalid"; r.snapshot.cvData.projects = [];
    env.localStorage.setItem(key, JSON.stringify(r)); await c.reconcileActiveDraft();
    store.getState().setTargetRole("remote accepted intent"); old({ fullName: "old visible intent" }); return r;
  }
  await check("QA: new callback capture matches actual projected conflict snapshot", async () => {
    await diverge(); const view = c.getCurrentDraft()!.snapshot, scope = c.captureActionScope()!;
    assert.equal(view.cvData.contact.email, "keep@example.invalid"); assert.deepEqual(scope.capturedSnapshot, view);
  });
  await check("QA: actual current field callback preserves displayed old conflict branch", async () => {
    const r = await diverge(); assert.equal(store.getState().cvData.contact.fullName, "old visible intent");
    const current = store.getState().updateContact; current({ phoneNumber: "new displayed edit" });
    const kept = c.getPreservedBranches(owner).find(b => b.snapshot.cvData.contact.phoneNumber === "new displayed edit")!;
    assert.equal(kept.snapshot.cvData.contact.email, "keep@example.invalid");
    assert.equal(kept.snapshot.cvData.contact.fullName, "old visible intent"); assert.equal(env.localStorage.getItem(key), JSON.stringify(r));
    assert.equal(kept.snapshot.cvData.projects[0].id, "p"); assert.equal(c.getPreservedBranches(owner).length, 2);
  });
  await check("QA: direct submission preserves selected old branch base ancestry", async () => {
    await diverge(); const before = c.getPreservedBranches(owner).find(b => b.snapshot.cvData.contact.fullName === "old visible intent")!;
    const next = structuredClone(c.getCurrentDraft()!.snapshot); next.cvData.contact.phoneNumber = "direct"; c.submitSnapshot(next);
    const after = c.getPreservedBranches(owner).find(b => b.snapshot.cvData.contact.phoneNumber === "direct")!;
    assert.equal(after.baseRevision, before.baseRevision); assert.equal(after.operation.originRevision, before.operation.originRevision);
    assert.deepEqual(after.operation.originSnapshot, before.operation.originSnapshot);
  });
  await check("QA: synchronous recovery throw cannot discard arriving stale action", async () => {
    const disk = structuredClone(c.getCurrentDraft()!), unused = async (): Promise<any> => { throw Error("unused"); };
    const core = new DraftCoordinator({ repository: { readDraft: async () => structuredClone(disk), commitDraft: unused,
      createRecovery: () => { throw Error("SYNC_RECOVERY"); }, commitCopy: unused, commitReset: unused },
      debounceMs: 100, scheduleTask: () => () => {} }, owner, disk.draftId);
    await core.switchView(owner, disk.draftId); const old = core.captureActionScope()!, r = structuredClone(disk);
    r.revision++; r.snapshot.cvData.projects = []; await core.acceptRemote(r);
    core.captureActionScope()!.apply(x => ({ ...x, targetRole: "current" })); let thrown;
    try { old.apply(x => ({ ...x, targetRole: "old" })); } catch (e) { thrown = (e as Error).message; }
    assert.equal(thrown, undefined); assert(core.getPreservedBranches(owner).some(b => b.snapshot.targetRole === "old"));
    assert.equal(core.getPreservedBranches(owner).length, 2);
    assert(core.getPreservedBranches(owner).every(b => b.recovery.every(r => r.state === "memory" && r.recoveryKey === null)));
    core.pauseScheduledSaves();
  });
  await check("fresh captures follow repeated branch switches while older callbacks keep their original ancestry", async () => {
    const original = store.getState().updateContact, { raw } = await remote(), remoteContact = store.getState().updateContact;
    store.getState().setTargetRole("remote branch"); original({ fullName: "old selected" });
    const freshOld = store.getState().updateContact, oldScope = c.captureActionScope()!;
    remoteContact({ phoneNumber: "remote selected" });
    assert.equal(c.captureActionScope()!.capturedSnapshot.cvData.contact.email, "remote@example.invalid");
    store.getState().updateContact({ fullName: "fresh remote" });
    freshOld({ phoneNumber: "fresh old" });
    assert.equal(c.captureActionScope()!.lineageKey, oldScope.lineageKey);
    store.getState().updateContact({ email: "" });
    const branches = c.getPreservedBranches(owner), old = branches.find(b => b.branchKey === oldScope.lineageKey)!;
    assert.equal(branches.length, 2); assert.equal(old.snapshot.cvData.contact.fullName, "old selected");
    assert.equal(old.snapshot.cvData.contact.phoneNumber, "fresh old"); assert.equal(old.snapshot.cvData.contact.email, "");
    assert.equal(old.snapshot.cvData.projects[0].id, "p");
    const newer = branches.find(b => b.branchKey !== old.branchKey)!;
    assert.equal(newer.snapshot.cvData.contact.fullName, "fresh remote"); assert.equal(newer.snapshot.cvData.contact.phoneNumber, "remote selected");
    assert.equal(newer.snapshot.cvData.contact.email, "remote@example.invalid"); assert.deepEqual(newer.snapshot.cvData.projects, []);
    assert.equal(await c.flush(), false); assert.equal(env.localStorage.getItem(key), raw);
  });
  await check("direct submit preserves immutable callback capture after compatible own acknowledgement and divergence", async () => {
    const original = store.getState().updateContact;
    store.getState().setTargetRole("own acknowledged role"); assert(await c.flush());
    const { raw } = await remote(); original({ fullName: "old after own acknowledgement" });
    const before = c.getPreservedBranches(owner)[0], next = structuredClone(c.getCurrentDraft()!.snapshot);
    next.cvData.contact.phoneNumber = "direct later"; c.submitSnapshot(next);
    const after = c.getPreservedBranches(owner)[0];
    assert.equal(after.baseRevision, before.baseRevision); assert.equal(after.operation.originRevision, before.operation.originRevision);
    assert.deepEqual(after.operation.originSnapshot, before.operation.originSnapshot);
    assert.equal(after.snapshot.targetRole, "own acknowledged role"); assert.equal(after.snapshot.cvData.contact.email, "keep@example.invalid");
    assert.equal(await c.flush(), false); assert.equal(env.localStorage.getItem(key), raw);
  });
  for (const kind of ["copy", "reset"] as const) {
    for (const order of ["old", "compatible", "compatible-old", "old-compatible"] as const) {
      await check(`production held ${kind}: ${order} command ancestry`, async () => {
        store.getState().updateContact({ email: "original@example.invalid" }); assert(await c.flush());
        const origin = structuredClone(c.getCurrentDraft()!), old = store.getState().updateContact;
        const r = structuredClone(origin); r.revision++; r.snapshot.cvData.contact.email = "remote@example.invalid";
        env.localStorage.setItem(key, JSON.stringify(r)); await c.reconcileActiveDraft();
        const current = store.getState().updateContact;
        const source = structuredClone(origin); source.owner = { kind: "guest" }; source.draftId = "held-guest-source";
        source.snapshot.studentProfile = null; source.snapshot.cvData.contact.email = "copied@example.invalid";
        env.locks.setHold(true);
        const command = kind === "copy" ? c.executeCopy(source) : c.resetDraft();
        for (let i = 0; i < 30 && !env.locks.queuedCount; i++) await Promise.resolve();
        assert.equal(env.locks.queuedCount, 1);
        const oldName = `old during production ${kind === "copy" ? "Copy" : "Reset"}`;
        const oldEdit = () => old({ fullName: oldName });
        const currentEdit = () => current({ phoneNumber: "compatible during command" });
        if (order.startsWith("compatible")) currentEdit();
        if (order.includes("old")) oldEdit();
        if (order === "old-compatible") currentEdit();
        const before = c.getPreservedBranches(owner), oldBefore = before.find(b => b.snapshot.cvData.contact.fullName === oldName);
        env.locks.releaseOne(); const result = await command; assert(result.success);
        const after = c.getPreservedBranches(owner), oldAfter = after.find(b => b.snapshot.cvData.contact.fullName === oldName);
        if (order.includes("compatible")) {
          const prior = before.find(b => b.snapshot.cvData.contact.phoneNumber === "compatible during command")!;
          const derived = after.find(b => b.snapshot.cvData.contact.phoneNumber === "compatible during command" &&
            (kind === "copy" || b.draftId !== origin.draftId))!;
          assert(derived); assert.notEqual(derived.operation.operationId, prior.operation.operationId);
          assert.deepEqual(derived.operation.originSnapshot, prior.operation.originSnapshot);
          assert.equal(derived.operation.originRevision, prior.operation.originRevision);
          assert.equal(derived.operation.commandParent?.kind, kind);
          assert.equal(derived.operation.commandParent?.sourceDraftId, origin.draftId);
          assert.equal(derived.operation.commandParent?.sourceOperationId, prior.operation.operationId);
          assert.equal(derived.operation.commandParent?.branchKey, prior.branchKey);
          assert.equal(derived.operation.commandParent?.baseRevision, r.revision);
          assert.equal(derived.baseRevision, kind === "copy" ? r.revision + 1 : 1);
        }
        // Exact expected-correct production held-Copy and held-Reset QA assertions.
        if (kind === "copy" && oldBefore) assert.equal(oldAfter!.baseRevision, oldBefore.baseRevision, "Copy on remote lineage must not rebase accepted old callback");
        if (oldBefore) {
          assert(oldAfter); assert.equal(oldAfter.draftId, origin.draftId);
          assert.equal(oldAfter.operation.operationId, oldBefore.operation.operationId);
          assert.equal(oldAfter.baseRevision, oldBefore.baseRevision);
          assert.equal(oldAfter.operation.originRevision, oldBefore.operation.originRevision);
          assert.deepEqual(oldAfter.operation.originSnapshot, oldBefore.operation.originSnapshot);
          assert.equal(oldAfter.snapshot.cvData.contact.email, "original@example.invalid"); assert.equal(oldAfter.snapshot.cvData.projects[0].id, "p");
          assert(oldAfter.recovery.length > 0);
        }
        env.locks.setHold(false); env.locks.releaseAll(); for (let i = 0; i < 40; i++) await Promise.resolve();
        const flush = await c.flush(), disk = JSON.parse(env.localStorage.getItem(key)!);
        if (kind === "reset") {
          assert.notEqual(disk.draftId, origin.draftId);
          assert.notEqual(disk.snapshot.cvData.contact.fullName, oldName, "incompatible pre-remote callback must not silently rebase and persist into Reset identity");
          assert.equal(flush, true); assert.equal(disk.revision, order.includes("compatible") ? 2 : 1);
          if (order === "old") { assert.equal(disk.snapshot.cvData.contact.email, ""); assert.deepEqual(disk.snapshot.cvData.projects, []); }
          assert.equal(old({ fullName: "retired" }), false);
          const savedId = disk.draftId; await c.activateAccountOwner(B, false); await c.activateAccountOwner(A, false);
          assert.equal(c.getCurrentDraft()!.draftId, savedId); assert.equal(env.localStorage.getItem(key), JSON.stringify(disk));
        } else {
          assert.equal(disk.draftId, origin.draftId); assert.equal(flush, !order.includes("old"));
          assert.equal(disk.snapshot.cvData.contact.email, order === "compatible" ? "remote@example.invalid" : "copied@example.invalid");
        }
        if (order.includes("compatible")) {
          if (kind === "reset" || order === "compatible") assert.equal(disk.snapshot.cvData.contact.phoneNumber, "compatible during command");
          else {
            const compatible = c.getPreservedBranches(owner).find(b => b.snapshot.cvData.contact.phoneNumber === "compatible during command")!;
            assert(compatible); assert.equal(compatible.snapshot.cvData.contact.email, "remote@example.invalid");
            assert.equal(compatible.baseRevision, disk.revision);
          }
        }
        if (oldBefore) {
          const stillOld = c.getPreservedBranches(owner).find(b => b.branchKey === oldBefore.branchKey)!;
          assert(stillOld); assert.equal(stillOld.baseRevision, oldBefore.baseRevision);
          assert(stillOld.recovery.every(x => x.state === "durable"));
          for (const recovery of stillOld.recovery) {
            const durable = JSON.parse(env.localStorage.getItem(recovery.recoveryKey!)!);
            const metadata = JSON.parse(durable.reason.slice("CONFLICT_BRANCH:".length));
            assert.equal(metadata.baseRevision, recovery.operation.baseRevision);
            assert.equal(metadata.draftId, origin.draftId);
            assert.deepEqual(durable.record.snapshot, JSON.parse(JSON.stringify(recovery.operation.snapshot)));
          }
        }
      });
    }
  }
  for (const first of ["copy", "reset"] as const) for (const second of ["copy", "reset"] as const) {
    for (const incompatible of [false, true]) {
      await check(`FIFO ${first}/${second}, incompatible=${incompatible}: later compatible edits survive command drain`, async () => {
        const origin = structuredClone(c.getCurrentDraft()!), old = store.getState().updateContact;
        const { raw } = await remote(), current = store.getState().updateContact;
        const source = structuredClone(origin); source.owner = { kind: "guest" }; source.draftId = "fifo-guest";
        source.snapshot.studentProfile = null; source.snapshot.cvData.contact.email = "fifo copy";
        const command = (kind: "copy" | "reset") => kind === "copy" ? c.executeCopy(source) : c.resetDraft();
        env.locks.setHold(true); const one = command(first);
        for (let i = 0; i < 30 && !env.locks.queuedCount; i++) await Promise.resolve();
        assert.equal(env.locks.queuedCount, 1); const two = command(second);
        current({ phoneNumber: "later than both command invocations" }); current({ fullName: "compatible latest" });
        if (incompatible) old({ fullName: "FIFO old" });
        env.locks.setHold(false); env.locks.releaseAll();
        assert((await one).success); const next = await two;
        assert.equal(next.success, first === "copy" && !incompatible);
        const flush = await c.flush(), disk = JSON.parse(env.localStorage.getItem(key)!);
        if (incompatible && first === "copy") {
          assert.equal(flush, false); assert.equal(disk.snapshot.cvData.contact.email, "fifo copy");
          const branches = c.getPreservedBranches(owner);
          assert(branches.some(b => b.snapshot.cvData.contact.phoneNumber === "later than both command invocations"));
        } else {
          assert.equal(flush, true); assert.equal(disk.snapshot.cvData.contact.phoneNumber, "later than both command invocations");
          assert.equal(disk.snapshot.cvData.contact.fullName, "compatible latest");
          assert.equal(disk.snapshot.cvData.contact.email, "remote@example.invalid");
        }
        if (incompatible) {
          const branch = c.getPreservedBranches(owner).find(b => b.snapshot.cvData.contact.fullName === "FIFO old")!;
          assert(branch); assert.equal(branch.draftId, origin.draftId); assert.equal(branch.baseRevision, origin.revision);
          assert.equal(branch.snapshot.cvData.contact.email, "keep@example.invalid");
          assert.equal(branch.snapshot.cvData.projects[0].id, "p");
        }
        assert.notEqual(env.localStorage.getItem(key), raw);
      });
    }
  }
  await check("retired identity rejects both queued and idle command entry without a persistence call", async () => {
    let calls = 0; const forbidden = async (): Promise<any> => { calls++; throw Error("persistent"); };
    const record = structuredClone(c.getCurrentDraft()!);
    const core = new DraftCoordinator({ repository: { readDraft: forbidden, commitDraft: forbidden,
      createRecovery: forbidden, commitCopy: forbidden, commitReset: forbidden } }, owner, record.draftId);
    await core.switchView(owner, record.draftId, true); core.submitEdit(record.snapshot); assert(await core.drain());
    const reset = await core.executeResetCommand(record.snapshot); assert(reset.success);
    assert.equal(core.getOwnerSlot(owner)!.draftId, reset.newDraftId);
    await core.switchView(owner, record.draftId, true);
    assert.equal((await core.executeCopyCommand({ sourceDraft: record })).success, false);
    assert.equal((await core.executeResetCommand(record.snapshot)).success, false);
    assert.equal(calls, 0); core.pauseScheduledSaves();
  });
  unbind?.(); c.destroy(); console.log(`Captured branch retention: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch(e => { unbind?.(); c?.destroy(); console.error(e); process.exitCode = 1; });
