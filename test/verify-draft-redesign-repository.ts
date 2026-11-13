import assert from "node:assert/strict";
import React from "react";
import { DraftCoordinator } from "../src/lib/draft-coordinator";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { createCoordinatorRepository, readDraftRecord, resolvePendingTransactions, withDraftsLock,
  listRecoveryRecords, sha256Hex } from "../src/lib/draft-repository";
import { DraftRecord, DraftSnapshot, ownerToKey, validateDraftRecord } from "../src/lib/draft-types";
import { DRAFTS_KEY_PREFIX as P, CV_STORE_KEY } from "../src/lib/cv-constants";
import { DraftSessionController } from "../src/lib/draft-session";
import { useCVStore, bindStoreToSession } from "../src/lib/store/cv-store";
import { runMigrationBarrier } from "../src/lib/draft-migrations";
import { setupDeterministicEnv } from "./helpers/deterministic-scheduling";
const env = setupDeterministicEnv();
const owner = { kind: "account", provider: "42", studentId: 101 } as const;
const key = ownerToKey(owner);
const snapshot = (name: string): DraftSnapshot => ({ cvData: { ...createEmptyCV(), contact: { ...createEmptyCV().contact, fullName: name } } });
const record = (name = "old", revision = 1): DraftRecord => ({ schemaVersion: 1, snapshotVersion: 1,
  owner, draftId: "target", revision, createdAt: 1, updatedAt: revision, snapshot: snapshot(name) });
const source: DraftRecord = { ...record("source"), owner: { kind: "guest" }, draftId: "source" };
let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  env.reset(); await fn(); passed++; console.log(`PASS ${name}`);
}
function seed(r = record()) { env.localStorage.setItem(key, JSON.stringify(r)); }
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function params(id = "copy-op") {
  return { sourceDraft: structuredClone(source), targetOwner: owner, targetDraftId: "target", expectedBaseRevision: 1,
    operationId: id, editSequence: 2, viewEpoch: 1, commandEpoch: 1, targetWorkingSnapshot: snapshot("captured distinct"),
    studentProfile: { id: 101, login: "target" }, targetRole: "", choicePreference: "source", validateEpoch: () => true, isStillCurrent: () => true };
}
async function main() {
  await check("ordinary save validates identity, revision, absence and exact durable ack without journal", async () => {
    seed(); const port = createCoordinatorRepository();
    const op = { operationId: "save", owner, ownerKey: key, draftId: "target", baseRevision: 1, editSequence: 1,
      viewEpoch: 1, createdAt: 1, snapshot: snapshot("new") };
    const ack = await port.commitDraft(op); assert.equal(ack.operationId, "save"); assert.equal(ack.revision, 2);
    assert.equal(readDraftRecord(key)?.snapshot.cvData.contact.fullName, "new");
    await assert.rejects(port.commitDraft({ ...op, draftId: "other", baseRevision: 2 }), /CONFLICT/);
    await assert.rejects(port.commitDraft(op), /CONFLICT/);
    env.localStorage.removeItem(key); await assert.rejects(port.commitDraft({ ...op, baseRevision: 2 }), /CONFLICT/);
    env.localStorage.setItem(key, "corrupt"); await assert.rejects(port.commitDraft({ ...op, baseRevision: 0 }), /CORRUPT/);
    assert.equal(env.localStorage.getItem(key), "corrupt");
    assert(!Array.from({length:env.localStorage.length},(_,i)=>env.localStorage.key(i)).some(k=>k?.includes(":transaction:")));
  });
  await check("missing lock never writes", async () => {
    seed(); const before = env.localStorage.getItem(key); const nav = (global as any).navigator;
    const locks = nav.locks; nav.locks = undefined;
    try { await assert.rejects(createCoordinatorRepository().commitCopy(params()), /Locks|LOCK|lock/); }
    finally { nav.locks = locks; }
    assert.equal(env.localStorage.getItem(key), before);
  });
  await check("Copy backs both actual replaced record and distinct captured work; receipt retries survive reload", async () => {
    seed(); const p = params(); const port = createCoordinatorRepository(); const ack = await port.commitCopy(p);
    const backups = listRecoveryRecords(owner); assert.equal(backups.length, 2);
    assert(backups.some(r=>r.record?.snapshot.cvData.contact.fullName === "old"));
    assert(backups.some(r=>r.record?.snapshot.cvData.contact.fullName === "captured distinct"));
    const bytes = env.localStorage.getItem(key); const again = await createCoordinatorRepository().commitCopy(p);
    assert.equal(again.operationId, ack.operationId); assert.equal(again.revision, ack.revision);
    assert.equal(env.localStorage.getItem(key), bytes); assert.equal(listRecoveryRecords(owner).length, 2);
    assert.equal(readDraftRecord(key)?.provenance?.copiedFrom?.draftId, "source");
    assert.equal(readDraftRecord(key)?.snapshot.studentProfile?.id, 101);
    assert.equal(readDraftRecord(key)?.snapshot.targetRole, "");
    await assert.rejects(createCoordinatorRepository().commitCopy({ ...p, targetRole: "changed intent" }), /OPERATION_IDENTITY_REUSE/);
  });
  await check("secondary failure is truthful successful primary, idempotent retry writes only choice", async () => {
    seed(); const set = env.localStorage.setItem.bind(env.localStorage);
    env.localStorage.setItem = (k,v) => { if(k.includes(":choices:")) throw new Error("choice quota"); set(k,v); };
    try {
      const p = params(); const ack = await createCoordinatorRepository().commitCopy(p);
      assert(ack.warning?.includes("PREFERENCE_FAILED")); assert.equal(readDraftRecord(key)?.revision, 2);
      env.localStorage.setItem = set;
      const again = await createCoordinatorRepository().commitCopy(p); assert.equal(again.warning, undefined);
      assert.equal(again.revision, 2); assert.equal(listRecoveryRecords(owner).length, 2);
      assert(env.localStorage.getItem(`${P}choices:42:101`)?.includes("copied"));
    } finally { env.localStorage.setItem = set; }
  });
  await check("locked and post-backup auth invalidation abort Copy and Reset", async () => {
    for (const kind of ["copy", "reset"] as const) {
      env.localStorage.clear(); seed(); let valid = true;
      const set = env.localStorage.setItem.bind(env.localStorage);
      env.localStorage.setItem = (k,v)=>{set(k,v);if(k.includes(":recovery:")) valid=false;};
      try {
        const p = { ...params(kind), validateEpoch: ()=>valid, isStillCurrent: ()=>valid };
        const port = createCoordinatorRepository();
        const pending = kind === "copy" ? port.commitCopy(p) : port.commitReset({ ...p, owner, oldDraftId: "target", expectedOldDraftId: "target", newDraftId: "new", initialSnapshot: snapshot("reset") });
        await assert.rejects(pending, /ABORTED/);
        assert.equal(readDraftRecord(key)?.revision, 1); assert.equal(readDraftRecord(key)?.draftId, "target");
      } finally { env.localStorage.setItem = set; }
    }
    seed(); env.locks.setHold(true); let valid = true;
    const pending = createCoordinatorRepository().commitCopy({ ...params(), validateEpoch: ()=>valid });
    valid=false; env.locks.releaseOne(); await assert.rejects(pending,/ABORTED/); env.locks.setHold(false);
  });
  await check("backup failure never replaces; nonzero missing Reset rejects; old saves cannot resurrect", async () => {
    seed(); const port = createCoordinatorRepository(); env.localStorage.failNextSetItem(new Error("backup quota"));
    await assert.rejects(port.commitCopy(params()), /quota/); assert.equal(readDraftRecord(key)?.revision,1);
    const reset = { ...params(), owner, oldDraftId: "target", expectedOldDraftId: "target", newDraftId: "fresh", initialSnapshot: snapshot("reset") };
    env.localStorage.removeItem(key); await assert.rejects(port.commitReset(reset), /CONFLICT/); seed();
    await port.commitReset(reset);
    await assert.rejects(port.commitDraft({ operationId: "stale", owner, ownerKey: key, draftId: "target", baseRevision: 1,
      editSequence: 1, viewEpoch: 1, createdAt: 1, snapshot: snapshot("stale") }), /CONFLICT/);
    assert.equal(readDraftRecord(key)?.draftId,"fresh");
  });
  await check("prepared own staged bytes rollback coherently; independent bytes and malformed journals stay blocked", async () => {
    const a=key,b=ownerToKey({kind:"guest"}); const old=record(), staged=record("staged",2);
    const guest = { ...record("guest"), owner: {kind:"guest"} };
    const journal={journalVersion:1,txId:"partial",state:"prepared",stagedRecords:{[a]:staged,[b]:guest},
      previousValues:{[a]:JSON.stringify(old),[b]:null},expectedRevisions:{[a]:1,[b]:0},timestamp:1};
    const tx=`${P}transaction:partial`; env.localStorage.setItem(a,JSON.stringify(staged));env.localStorage.setItem(tx,JSON.stringify(journal));
    await withDraftsLock(async()=>resolvePendingTransactions());assert.equal(env.localStorage.getItem(a),JSON.stringify(old));assert.equal(env.localStorage.getItem(b),null);
    env.localStorage.setItem(a,JSON.stringify(record("independent",3)));env.localStorage.setItem(tx,JSON.stringify(journal));
    await assert.rejects(withDraftsLock(async()=>resolvePendingTransactions()),/CRASH_RECOVERY_FAILED/);
    assert(env.localStorage.getItem(tx));assert.equal(readDraftRecord(a)?.snapshot.cvData.contact.fullName,"independent");
    env.localStorage.setItem(tx,"broken");await assert.rejects(withDraftsLock(async()=>resolvePendingTransactions()),/CRASH_RECOVERY_FAILED/);assert.equal(env.localStorage.getItem(tx),"broken");
  });
  await check("committed compatibility journals reconcile idempotently and refuse invalid staged draft publication", async () => {
    seed();const original=env.localStorage.getItem(key),staged=record("committed",2),tx=`${P}transaction:committed`;
    const journal={journalVersion:1,txId:"committed",state:"committed",stagedRecords:{[key]:staged},
      previousValues:{[key]:original},expectedRevisions:{[key]:1},timestamp:1};
    env.localStorage.setItem(tx,JSON.stringify(journal));
    await withDraftsLock(async()=>resolvePendingTransactions());
    assert.equal(env.localStorage.getItem(key),JSON.stringify(staged));assert.equal(env.localStorage.getItem(tx),null);
    await withDraftsLock(async()=>resolvePendingTransactions());assert.equal(env.localStorage.getItem(key),JSON.stringify(staged));
    const bad={...journal,previousValues:{[key]:JSON.stringify(staged)},stagedRecords:{[key]:{...staged,snapshot:{...staged.snapshot,cvData:{...staged.snapshot.cvData,projects:[{}]}}}}};
    const exact=JSON.stringify(bad);env.localStorage.setItem(tx,exact);
    await assert.rejects(withDraftsLock(async()=>resolvePendingTransactions()),/CRASH_RECOVERY_FAILED/);
    assert.equal(env.localStorage.getItem(key),JSON.stringify(staged));assert.equal(env.localStorage.getItem(tx),exact);
  });
  await check("migration preserves source, verified write-once backup and destination before marker", async () => {
    const raw=JSON.stringify({state:snapshot("legacy"),version:2});env.localStorage.setItem(CV_STORE_KEY,raw);
    const set=env.localStorage.setItem.bind(env.localStorage);let verifiedDestination=false;
    env.localStorage.setItem=(k,v)=>{ if(k.includes(":migration:")) { assert(verifiedDestination);throw new Error("marker quota"); }
      set(k,v);if(k.includes(":legacy:")&&!k.includes(":backup:")) verifiedDestination=!!env.localStorage.getItem(k); };
    try { await assert.rejects(runMigrationBarrier(),/marker quota/); }
    finally { env.localStorage.setItem=set; }
    const hash=sha256Hex(raw),dest=env.localStorage.getItem(`${P}legacy:${hash}`);assert(dest);
    await runMigrationBarrier();assert.equal(env.localStorage.getItem(`${P}legacy:${hash}`),dest);
    assert.equal(env.localStorage.getItem(CV_STORE_KEY),raw); assert(env.localStorage.getItem(`${P}backup:legacy:${hash}`)?.includes("legacy"));
  });
  await check("renderer-invalid nested shapes reject without forbidding optional degree or empty edits", async () => {
    const valid=record();assert(validateDraftRecord(valid,key));
    for(const mutate of [(r:any)=>r.snapshot.cvData.projects=[{}],(r:any)=>r.snapshot.cvData.education[0].institution=4,
      (r:any)=>r.snapshot.cvData.sectionOrder=[{}],(r:any)=>r.snapshot.targetRole=4]) {
      const bad=structuredClone(valid);mutate(bad);assert.equal(validateDraftRecord(bad,key),false);
    }
  });
  await check("actual component same-epoch held-save Copy succeeds with backup/profile/provenance/source preservation", async () => {
    env.fetchManager.setUser({id:101,login:"target",validatedProjects:[]});
    const controller=new DraftSessionController(),unbind=bindStoreToSession(controller);
    await controller.reconcileSession();
    env.localStorage.setItem(`${P}guest`,JSON.stringify(source));const sourceBytes=env.localStorage.getItem(`${P}guest`);
    const original={useState:React.useState,useRef:React.useRef,useEffect:React.useEffect,useCallback:React.useCallback};
    let index=0;const callbacks:Function[]=[];let closed=false;
    (React as any).useState=(value:any)=>{const slot=index++;return [slot===3?source:slot===4?[]:value,(v:any)=>{if(slot===3&&v===null)closed=true;}];};
    (React as any).useRef=(v:any)=>({current:v});(React as any).useEffect=()=>{};
    (React as any).useCallback=(fn:Function)=>{callbacks.push(fn);return fn;};
    try {
      env.locks.setHold(true);const saving=controller.saveCurrentSnapshot(snapshot("pre-copy dirty"));await tick();
      const Studio=require("../src/app/studio/StudioClient.tsx").default;Studio();
      const copy=callbacks.find(fn=>String(fn).includes("copiedSnapshot"));assert(copy);const pending=copy();
      env.locks.setHold(false);env.locks.releaseAll();assert((await saving).success);const result=await pending;
      assert(result.success);assert(closed);
      const target=readDraftRecord(key)!;assert.equal(target.snapshot.cvData.contact.fullName,"source");
      assert.equal(target.snapshot.studentProfile?.id,101);assert.equal(target.provenance?.copiedFrom?.draftId,"source");
      assert.equal(env.localStorage.getItem(`${P}guest`),sourceBytes);
      assert(listRecoveryRecords(owner).some(r=>r.record?.snapshot.cvData.contact.fullName==="pre-copy dirty"));
    } finally { Object.assign(React,original);unbind();controller.destroy(); }
  });
  await check("remote notification cannot rebase a reserved Copy onto unseen storage", async () => {
    env.fetchManager.setUser({id:101,login:"target",validatedProjects:[]});
    const controller=new DraftSessionController(),unbind=bindStoreToSession(controller);
    try {
      await controller.reconcileSession();
      const current=controller.getCurrentDraft()!;
      const copy=controller.executeCopy(source);
      env.localStorage.setItem(key,JSON.stringify({ ...current, revision: current.revision+1, snapshot:snapshot("unseen remote") }));
      await controller.reconcileActiveDraft();
      assert.equal((await copy).success,false);
      assert.equal(readDraftRecord(key)?.snapshot.cvData.contact.fullName,"unseen remote");
    } finally { unbind();controller.destroy(); }
    // Deliver a completed locked read before the reserved command continuation.
    env.localStorage.clear(); seed();
    const c=new DraftCoordinator({repository:createCoordinatorRepository()},owner,"target");
    await c.switchView(owner,"target");
    const command=c.executeCopyCommand({sourceDraft:source,studentProfile:{id:101,login:"target"}});
    const remote=record("unseen notification",5);env.localStorage.setItem(key,JSON.stringify(remote));
    await c.acceptRemote(remote);
    assert.equal((await command).success,false);
    assert.equal(readDraftRecord(key)?.snapshot.cvData.contact.fullName,"unseen notification");
  });
  await check("explicit null target profile stays null in memory and durable Copy projections", async () => {
    const guest={kind:"guest"} as const;
    const c=new DraftCoordinator({repository:createCoordinatorRepository()},guest,"memory");
    await c.switchView(guest,"memory",true);
    const sourceWithCachedProfile={...source,snapshot:{...source.snapshot,studentProfile:{id:999,login:"source-profile"} as any}};
    assert((await c.executeCopyCommand({sourceDraft:sourceWithCachedProfile,studentProfile:null})).success);
    assert.equal(c.getWorkingSnapshot()?.studentProfile,null);
  });
  await check("WELCOME Copy aborts if guest initialization yields to another verified account", async () => {
    const controller=new DraftSessionController(),unbind=bindStoreToSession(controller);
    env.fetchManager.setUser({id:101,login:"target",validatedProjects:[]});await controller.reconcileSession();
    const targetBefore=env.localStorage.getItem(key);
    env.fetchManager.setUser(null);await controller.reconcileSession();assert.equal(controller.getState().state,"WELCOME");
    const legacy={...source,owner:{kind:"unassigned"} as const,draftId:"legacy-review"};
    env.localStorage.setItem(`${P}legacy:welcome-test`,JSON.stringify(legacy));
    const original={useState:React.useState,useRef:React.useRef,useEffect:React.useEffect,useCallback:React.useCallback};
    let index=0;const callbacks:Function[]=[];
    (React as any).useState=(value:any)=>{const slot=index++;return [slot===3?legacy:slot===4?[]:value,()=>{}];};
    (React as any).useRef=(v:any)=>({current:v});(React as any).useEffect=()=>{};
    (React as any).useCallback=(fn:Function)=>{callbacks.push(fn);return fn;};
    try {
      env.locks.setHold(true);require("../src/app/studio/StudioClient.tsx").default();
      const callback=callbacks.find(fn=>String(fn).includes("copiedSnapshot"));assert(callback);const pending=callback();await tick();
      await controller.activateAccountOwner({id:101,login:"target",validatedProjects:[]} as any,false);
      env.locks.setHold(false);env.locks.releaseAll();const result=await pending;
      assert.equal(result?.success,false);assert.equal(result?.error,"ABORTED_AUTH_OR_TARGET_CHANGED");
      assert.equal(env.localStorage.getItem(key),targetBefore);
    } finally { Object.assign(React,original);env.locks.setHold(false);env.locks.releaseAll();unbind();controller.destroy(); }
  });
  console.log(`Production repository/component checks: ${passed} passed, 0 failed`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
