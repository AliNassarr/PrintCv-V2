import assert from "node:assert/strict";
import { DraftSessionController } from "../src/lib/draft-session";
import { bindStoreToSession, useCVStore } from "../src/lib/store/cv-store";
import { createCoordinatorRepository, readDraftRecord, listRecoveryRecords } from "../src/lib/draft-repository";
import { ownerToKey, validateDraftRecord } from "../src/lib/draft-types";
import { setupDeterministicEnv } from "./helpers/deterministic-scheduling";
import { helperQuestions, buildBulletPrompt } from "../src/lib/bullet-helper";
const env=setupDeterministicEnv();
const A={id:101,login:"alice",validatedProjects:[]} as any,B={id:202,login:"bob",validatedProjects:[]} as any;
const owner={kind:"account",provider:"42",studentId:101} as const,key=ownerToKey(owner);
const project={id:"kept-project",name:"Truthful work",is42Project:false,techStack:"TS",date:"2025",bulletPoints:["Built actual software"]};
const tick=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
let passed=0,c:DraftSessionController,unbind:(()=>void)|undefined;
async function setup(){unbind?.();c?.destroy();env.reset();env.fetchManager.setUser(A);c=new DraftSessionController();unbind=bindStoreToSession(c);await c.reconcileSession();
 const initial=c.getCurrentDraft()!;useCVStore.getState().setCVData({...initial.snapshot.cvData,contact:{...initial.snapshot.cvData.contact,email:"private@example.invalid"},projects:[project]});assert(await c.flush());return c;}
async function check(name:string,fn:()=>Promise<void>){await setup();await fn();passed++;console.log("PASS "+name);}
async function main(){
 for(const next of [A,B]) await check(`logout captures before flush and aborts generation change ${next.id}`,async()=>{
  await c.activateAccountOwner(B,false);await c.activateAccountOwner(A,false);
  const gate=env.locks.createQueuedHook();env.locks.setHook(gate.hook);
  useCVStore.getState().updateContact({fullName:"old A saved privately"});const saving=c.flush();await tick();
  let deletes=0;env.fetchManager.setOverride(async(_url,o)=>{if(o?.method==="DELETE"){deletes++;return{ok:true,json:async()=>({success:true})};}return{ok:true,json:async()=>({authenticated:true,user:next})};});
  const logout=c.logout();const verifying=c.reconcileSession();await tick();env.locks.setHook(null);gate.releaseAll();await saving;await verifying;
  const result=await logout;assert.equal(result.success,false);assert.equal(deletes,0);assert.equal((c.getCurrentOwner() as any).studentId,next.id);
  assert.equal(readDraftRecord(key)?.snapshot.cvData.contact.fullName,"old A saved privately");
 });
 await check("hidden multiple field intents preserve unrelated private sections/profile without revealing them",async()=>{
  const auth=env.fetchManager.delayNextAuth(),verifying=c.reconcileSession();
  assert.equal(useCVStore.getState().cvData.projects.length,0);assert.equal(useCVStore.getState().studentProfile,null);
  useCVStore.getState().updateContact({fullName:"one field"});useCVStore.getState().setTargetRole("Backend");useCVStore.getState().updateSkills({languages:["C"]});
  assert.equal(useCVStore.getState().cvData.projects.length,0);assert.equal(useCVStore.getState().cvData.contact.email,"");assert.equal(useCVStore.getState().studentProfile,null);
  auth.resolve(A);env.fetchManager.setOverride(null);await verifying;assert(await c.flush());
  const after=readDraftRecord(key)!.snapshot;assert.equal(after.cvData.projects[0].id,project.id);assert.equal(after.cvData.contact.email,"private@example.invalid");
  assert.equal(after.studentProfile?.id,101);assert.equal(after.cvData.contact.fullName,"one field");assert.equal(after.targetRole,"Backend");assert.deepEqual(after.cvData.skills.languages,["C"]);
 });
 await check("hidden explicit empty fields and ID-based deletion remain intentional",async()=>{
  const auth=env.fetchManager.delayNextAuth(),verifying=c.reconcileSession();
  useCVStore.getState().updateContact({email:""});useCVStore.getState().removeProjectFromCV(project.id);useCVStore.getState().setTargetRole("");
  auth.resolve(A);env.fetchManager.setOverride(null);await verifying;assert(await c.flush());
  const after=readDraftRecord(key)!.snapshot;assert.equal(after.cvData.contact.email,"");assert.deepEqual(after.cvData.projects,[]);assert.equal(after.studentProfile?.id,101);assert.equal(after.targetRole,"");
 });
 await check("captured old async callback updates A privately while B and visible projection remain untouched",async()=>{
  const delayed=useCVStore.getState().updateContact;
  await c.activateAccountOwner(B,false);const bob=c.getCurrentDraft()!,bobBytes=JSON.stringify(bob.snapshot),visible=JSON.stringify(useCVStore.getState().extractSnapshot());
  delayed({fullName:"old callback A"});assert.equal(JSON.stringify(useCVStore.getState().extractSnapshot()),visible);
  assert.equal(JSON.stringify(c.getCurrentDraft()!.snapshot),bobBytes);
  await c.activateAccountOwner(A,false);assert(await c.flush());const after=readDraftRecord(key)!.snapshot;
  assert.equal(after.cvData.contact.fullName,"old callback A");assert.equal(after.cvData.contact.email,"private@example.invalid");assert.equal(after.studentProfile?.id,101);assert.equal(after.cvData.projects.length,1);
 });
 await check("hidden action followed by a different verified owner preserves A and rejects foreign profile injection",async()=>{
  await c.activateAccountOwner(B,false);await c.activateAccountOwner(A,false);
  const auth=env.fetchManager.delayNextAuth(),verifying=c.reconcileSession();
  useCVStore.getState().updateProject(project.id,{name:"A async project"});
  const accepted=(useCVStore.getState().setStudentProfile as any)(B);assert.equal(accepted,false);
  auth.resolve(B);env.fetchManager.setOverride(null);await verifying;assert.equal((c.getCurrentOwner() as any).studentId,202);
  assert.notEqual(useCVStore.getState().cvData.projects[0]?.name,"A async project");
  await c.activateAccountOwner(A,false);assert(await c.flush());assert.equal(readDraftRecord(key)!.snapshot.cvData.projects[0].name,"A async project");assert.equal(readDraftRecord(key)!.snapshot.studentProfile?.id,101);
 });
 await check("captured callback conflicts with remote lineage without discarding the captured unrelated fields",async()=>{
  const delayed=useCVStore.getState().updateContact,current=c.getCurrentDraft()!;
  const remote={...current,revision:current.revision+1,snapshot:{...current.snapshot,cvData:{...current.snapshot.cvData,projects:[],contact:{...current.snapshot.cvData.contact,email:"remote@example.invalid"}}}};
  env.localStorage.setItem(key,JSON.stringify(remote));await c.reconcileActiveDraft();
  delayed({fullName:"stale async intent"});assert.equal(await c.flush(),false);
  assert.equal(env.localStorage.getItem(key),JSON.stringify(remote));
  const retained=c.getPreservedUnsavedWork(owner)!;assert.equal(retained.snapshot.cvData.projects[0]?.id,project.id);assert.equal(retained.snapshot.cvData.contact.email,"private@example.invalid");
  useCVStore.getState().setTargetRole("still local conflict");assert.equal(await c.flush(),false);
  assert.equal(env.localStorage.getItem(key),JSON.stringify(remote));
 });
 await check("bound visible delete and undo survives own save acknowledgement",async()=>{
  useCVStore.getState().removeProjectBullet(project.id,0);assert(await c.flush());
  assert(useCVStore.getState().lastDeletedBullet);assert(useCVStore.getState().undoLastBulletDeletion());assert(await c.flush());
  assert.deepEqual(readDraftRecord(key)!.snapshot.cvData.projects[0].bulletPoints,project.bulletPoints);
 });
 await check("nested answer/profile values reject before commit and hydrate; raw corruption remains recoverable",async()=>{
  const current=c.getCurrentDraft()!,target={kind:"project",item:project} as const,q=helperQuestions(target)[0].id;
  for(const mutate of [(s:any)=>s.helperAnswers={[project.id]:{[q]:42}},(s:any)=>s.projectAnswers={x:{q:{bad:true}}},(s:any)=>s.campusRoleAnswers={x:{q:["ok",5]}},
   (s:any)=>s.studentProfile={...A,validatedProjects:{}},(s:any)=>s.studentProfile={...A,displayname:42}]){
   const bad=structuredClone(current);mutate(bad.snapshot);assert.equal(validateDraftRecord(bad,key),false);
   await assert.rejects(createCoordinatorRepository().commitDraft({operationId:"malformed",owner,ownerKey:key,draftId:bad.draftId,baseRevision:bad.revision,editSequence:1,viewEpoch:1,createdAt:1,snapshot:bad.snapshot}),/INVALID_DRAFT/);
  }
  const valid=structuredClone(current);valid.snapshot.helperAnswers={[project.id]:{[q]:"I wrote the implementation",optional:["one","two"]}};assert(validateDraftRecord(valid,key));
  assert.doesNotThrow(()=>buildBulletPrompt({target,answers:valid.snapshot.helperAnswers![project.id],cv:valid.snapshot.cvData}));
  const bad=structuredClone(current);(bad.snapshot as any).helperAnswers={[project.id]:{[q]:42}};const raw=JSON.stringify(bad);env.localStorage.setItem(key,raw);
  unbind?.();c.destroy();c=new DraftSessionController();unbind=bindStoreToSession(c);await c.bootstrap();assert.equal(c.getState().state,"RECOVERY_BLOCKED");
  assert.equal(env.localStorage.getItem(key),raw);assert(listRecoveryRecords(owner).some(r=>r.raw===raw));assert.equal(useCVStore.getState().cvData.projects.length,0);
 });
 unbind?.();c.destroy();console.log(`M2 cycle1 regressions: ${passed} passed, 0 failed`);
}
main().catch(error=>{unbind?.();c?.destroy();console.error(error);process.exitCode=1;});
