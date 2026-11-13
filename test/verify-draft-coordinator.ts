import assert from "node:assert/strict";
import type {
  DraftOwner,
  DraftSnapshot,
  DraftRecord,
} from "../src/lib/draft-types";
import { ownerMatches, ownerToKey } from "../src/lib/draft-types";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import {
  DraftCoordinator,
  ImmutableDraftOperation,
  DraftSlotState,
  CoordinatorRepositoryPort,
  deepClone,
} from "../src/lib/draft-coordinator";
import {
  DeterministicClock,
  DeterministicTaskScheduler,
  runSchedulerSelfCheck,
} from "./helpers/deterministic-scheduling";

/**
 * Creates an empty valid snapshot for testing.
 */
function createTestSnapshot(fullName = "Test User", targetRole = ""): DraftSnapshot {
  return {
    cvData: {
      ...createEmptyCV(),
      contact: { ...createEmptyCV().contact, fullName },
    },
    targetRole,
  };
}

/**
 * Microtask flushing helper avoiding wall sleeps.
 */
const tick = async (count = 20): Promise<void> => {
  for (let i = 0; i < count; i++) {
    await Promise.resolve();
  }
};

/**
 * Fake In-Memory Draft Repository for coordinator boundary testing.
 * Implements strict CAS, absence checks, verified backup before copy, and error injection.
 */
class FakeDraftRepository implements CoordinatorRepositoryPort {
  public records = new Map<string, DraftRecord>();
  public recoveries: Array<{ owner: DraftOwner; snapshot: DraftSnapshot; reason: string; draftId?: string }> = [];
  public callCounts = { read: 0, commit: 0, recovery: 0, copy: 0, reset: 0 };

  private heldCommits: Array<() => void> = [];
  private holdEnabled = false;
  private nextCommitError: Error | null = null;
  private nextRecoveryError: Error | null = null;
  public copyGate: { promise: Promise<any>; resolve: (v?: any) => void } | null = null;
  public resetGate: { promise: Promise<any>; resolve: (v?: any) => void } | null = null;
  public readGate: { promise: Promise<any>; resolve: (v?: any) => void } | null = null;
  public commandAcks = new Map<string, { operationId: string; revision: number; updatedAt: number; choiceWarning?: string }>();
  public choiceWrites = new Map<string, string>();
  public recoveryGate: ReturnType<typeof deferred<void>> | null = null;
  public lastCopyParams: any = null;
  public lastResetParams: any = null;

  setHold(enabled: boolean): void {
    this.holdEnabled = enabled;
  }

  releaseOneCommit(): boolean {
    const next = this.heldCommits.shift();
    if (next) {
      next();
      return true;
    }
    return false;
  }

  releaseAllCommits(): number {
    let count = 0;
    while (this.heldCommits.length > 0) {
      const next = this.heldCommits.shift();
      if (next) {
        next();
        count++;
      }
    }
    return count;
  }

  failNextCommit(err: Error): void {
    this.nextCommitError = err;
  }

  failNextRecovery(err: Error): void {
    this.nextRecoveryError = err;
  }

  seedRecord(record: DraftRecord): void {
    this.records.set(ownerToKey(record.owner), deepClone(record));
  }

  async readDraft(owner: DraftOwner, draftId?: string): Promise<DraftRecord | null> {
    this.callCounts.read++;
    if (this.readGate) {
      return this.readGate.promise;
    }
    const key = ownerToKey(owner);
    const rec = this.records.get(key);
    if (!rec) return null;
    if (draftId && rec.draftId !== draftId) return null;
    return deepClone(rec);
  }

  async commitDraft(op: ImmutableDraftOperation): ReturnType<CoordinatorRepositoryPort["commitDraft"]> {
    this.callCounts.commit++;

    if (this.holdEnabled) {
      await new Promise<void>((resolve, reject) => {
        this.heldCommits.push(() => {
          if (this.nextCommitError) {
            const err = this.nextCommitError;
            this.nextCommitError = null;
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } else if (this.nextCommitError) {
      const err = this.nextCommitError;
      this.nextCommitError = null;
      throw err;
    }

    const key = op.ownerKey;
    const existing = this.records.get(key);

    // Strict CAS check under Web Lock:
    if (existing && existing.draftId !== op.draftId) {
      throw new Error(`CONFLICT_WRONG_DRAFT_IDENTITY: expected ${op.draftId}, disk has ${existing.draftId}`);
    }

    const currentRev = existing ? existing.revision : 0;
    if (currentRev !== op.baseRevision) {
      throw new Error(`CONFLICT_REMOTE_DRIFT: expected base ${op.baseRevision}, disk has ${currentRev}`);
    }

    const nextRev = currentRev + 1;
    const updatedAt = op.createdAt + 10;
    const updatedRecord: DraftRecord = {
      schemaVersion: 1,
      draftId: op.draftId,
      owner: deepClone(op.owner),
      revision: nextRev,
      createdAt: existing ? existing.createdAt : op.createdAt,
      updatedAt,
      snapshotVersion: 1,
      snapshot: deepClone(op.snapshot),
    };

    this.records.set(key, updatedRecord);
    return { operationId: op.operationId, revision: nextRev, updatedAt };
  }

  async createRecovery(
    owner: DraftOwner,
    snapshot: DraftSnapshot,
    reason: string,
    draftId?: string
  ): Promise<string> {
    this.callCounts.recovery++;
    if (this.recoveryGate) await this.recoveryGate.promise;
    if (this.nextRecoveryError) {
      const err = this.nextRecoveryError;
      this.nextRecoveryError = null;
      throw err;
    }
    this.recoveries.push({
      owner: deepClone(owner),
      snapshot: deepClone(snapshot),
      reason,
      draftId,
    });
    return `rec_${this.recoveries.length}`;
  }

  async commitCopy(params: Parameters<CoordinatorRepositoryPort["commitCopy"]>[0]): ReturnType<CoordinatorRepositoryPort["commitCopy"]> {
    const acknowledged = this.commandAcks.get(params.operationId);
    if (acknowledged) return deepClone(acknowledged);
    this.callCounts.copy++;
    this.lastCopyParams = params;

    if (this.copyGate) {
      await this.copyGate.promise;
    }

    // Verify commit-time auth guard inside locked boundary
    if (params.validateEpoch && !params.validateEpoch()) {
      throw new Error("ABORTED_AUTH_OR_TARGET_CHANGED");
    }
    if (params.isStillCurrent && !params.isStillCurrent()) {
      throw new Error("ABORTED_AUTH_OR_TARGET_CHANGED");
    }

    const targetKey = ownerToKey(params.targetOwner);
    const existing = this.records.get(targetKey);

    if (existing) {
      if (existing.draftId !== params.targetDraftId) {
        throw new Error(`CONFLICT_COPY_DRAFT_CHANGED: expected ${params.targetDraftId}, disk has ${existing.draftId}`);
      }
      if (existing.revision !== params.expectedBaseRevision) {
        throw new Error(`CONFLICT_REMOTE_DRIFT: expected ${params.expectedBaseRevision}, disk has ${existing.revision}`);
      }
    } else if (params.expectedBaseRevision > 0) {
      throw new Error(`CONFLICT_REMOTE_DRIFT: expected base ${params.expectedBaseRevision}, but draft absent`);
    }

    // 1. VERIFIED BACKUP FIRST
    if (existing) {
      await this.createRecovery(
        params.targetOwner,
        params.targetWorkingSnapshot ?? existing.snapshot,
        "PRE_COPY_TARGET_BACKUP",
        params.targetDraftId
      );
    }

    // Revalidate under the same modeled lock after every asynchronous stage.
    if (!params.validateEpoch() || !params.isStillCurrent()) throw new Error("ABORTED_AUTH_OR_TARGET_CHANGED");
    if (this.records.get(targetKey) !== existing) throw new Error("CONFLICT_REMOTE_DRIFT");
    // 2. PRIMARY RECORD
    const nextRev = (existing ? existing.revision : 0) + 1;
    const updatedAt = Date.now();
    const copiedSnapshot: DraftSnapshot = {
      ...deepClone(params.sourceDraft.snapshot),
      targetRole: params.targetRole ?? params.sourceDraft.snapshot.targetRole,
      studentProfile: params.studentProfile ?? params.sourceDraft.snapshot.studentProfile,
    };

    const newTargetRecord: DraftRecord = {
      schemaVersion: 1,
      draftId: params.targetDraftId,
      owner: deepClone(params.targetOwner),
      revision: nextRev,
      createdAt: existing ? existing.createdAt : updatedAt,
      updatedAt,
      snapshotVersion: 1,
      snapshot: copiedSnapshot,
      provenance: {
        copiedFrom: {
          owner: deepClone(params.sourceDraft.owner),
          draftId: params.sourceDraft.draftId,
          timestamp: updatedAt,
        },
      },
    };

    this.records.set(targetKey, newTargetRecord);

    let choiceWarning: string | undefined;
    if (params.choicePreference === "failing_preference") {
      choiceWarning = "PREFERENCE_FAILED";
    }

    if (params.choicePreference && !choiceWarning) this.choiceWrites.set(params.operationId, params.choicePreference);
    const acknowledgement = { operationId: params.operationId, revision: nextRev, updatedAt, choiceWarning, warning: choiceWarning };
    this.commandAcks.set(params.operationId, acknowledgement);
    return acknowledgement;
  }

  async commitReset(params: Parameters<CoordinatorRepositoryPort["commitReset"]>[0]): ReturnType<CoordinatorRepositoryPort["commitReset"]> {
    this.callCounts.reset++;
    this.lastResetParams = params;

    if (this.resetGate) {
      await this.resetGate.promise;
    }

    if (params.validateEpoch && !params.validateEpoch()) {
      throw new Error("ABORTED_AUTH_OR_TARGET_CHANGED");
    }

    const key = ownerToKey(params.owner);
    const existing = this.records.get(key);

    if (existing) {
      if (params.expectedOldDraftId && existing.draftId !== params.expectedOldDraftId) {
        throw new Error(`CONFLICT_WRONG_DRAFT_IDENTITY: expected ${params.expectedOldDraftId}, disk has ${existing.draftId}`);
      }
      if (params.expectedBaseRevision !== undefined && existing.revision !== params.expectedBaseRevision) {
        throw new Error(`CONFLICT_REMOTE_DRIFT: expected ${params.expectedBaseRevision}, disk has ${existing.revision}`);
      }
      await this.createRecovery(params.owner, params.targetWorkingSnapshot ?? existing.snapshot, "PRE_RESET_BACKUP", params.oldDraftId);
    } else if (params.expectedBaseRevision !== 0) {
      throw new Error("CONFLICT_ABSENT");
    }
    if (!params.validateEpoch() || !params.isStillCurrent()) throw new Error("ABORTED_AUTH_OR_TARGET_CHANGED");
    if (this.records.get(key) !== existing) throw new Error("CONFLICT_REMOTE_DRIFT");

    const updatedAt = Date.now();
    const newRecord: DraftRecord = {
      schemaVersion: 1,
      draftId: params.newDraftId,
      owner: deepClone(params.owner),
      revision: 1,
      createdAt: updatedAt,
      updatedAt,
      snapshotVersion: 1,
      snapshot: deepClone(params.initialSnapshot),
    };

    this.records.set(key, newRecord);
    return { operationId: params.operationId, revision: 1, draftId: params.newDraftId, updatedAt };
  }
}

// =========================================================================
// TEST SUITE: M1 Coordinator Invariant Verifications
// =========================================================================

async function testScenario1_CopyInflightSaveAndOwnerSwitch() {
  console.log("[Test 1] Category 1 boundary: Copy with inflight save + owner switch...");
  const clock = new DeterministicClock(1000);
  const repo = new FakeDraftRepository();

  const owner202: DraftOwner = { kind: "account", provider: "42", studentId: 202 };
  const owner303: DraftOwner = { kind: "account", provider: "42", studentId: 303 };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-202",
    owner: owner202,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Bob 202", "ROLE_202"),
  });
  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-303",
    owner: owner303,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Charlie 303", "ROLE_303"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, owner202, "draft-202");
  await coordinator.switchView(owner202, "draft-202");

  repo.setHold(true);

  coordinator.submitEdit(createTestSnapshot("Bob Inflight", "ROLE_202"));

  const guestSource: DraftRecord = {
    schemaVersion: 1,
    draftId: "guest-source-999",
    owner: { kind: "guest" },
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("GUEST SOURCE", "GUEST_ROLE"),
  };

  const copyPromise = coordinator.executeCopyCommand({
    sourceDraft: guestSource,
    targetRole: "GUEST_ROLE",
  });

  await coordinator.switchView(owner303, "draft-303");
  repo.releaseAllCommits();

  const copyRes = await copyPromise;
  assert.equal(copyRes.success, false);
  assert.equal(copyRes.error, "ABORTED_AUTH_OR_TARGET_CHANGED");

  const bobRecoveries = repo.recoveries.filter((r) => ownerMatches(r.owner, owner202));
  assert(!bobRecoveries.some((r) => JSON.stringify(r).includes("303")), "Bob recovery must not contain 303 data");

  const bobDisk = repo.records.get(ownerToKey(owner202));
  assert.equal(bobDisk?.snapshot.targetRole, "ROLE_202", "Bob disk targetRole must remain Bob's role");

  console.log("✓ PASS: Scenario 1 (Copy inflight save + owner switch privacy & abort)");
}

async function testScenario2_HeldTransitionFailureSurvival() {
  console.log("[Test 2] Category 2 boundary: Held transition candidate failure + auth switch + return...");
  const clock = new DeterministicClock(2000);
  const repo = new FakeDraftRepository();

  const ownerA: DraftOwner = { kind: "account", provider: "42", studentId: 803 };
  const ownerB: DraftOwner = { kind: "account", provider: "42", studentId: 903 };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-803",
    owner: ownerA,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("A803 Initial"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, ownerA, "draft-803");
  await coordinator.switchView(ownerA, "draft-803");

  repo.setHold(true);
  coordinator.submitEdit(createTestSnapshot("HELD PRIVATE CANDIDATE"));

  await coordinator.switchView(ownerB, "draft-903");

  repo.failNextCommit(new Error("QuotaExceededError"));
  repo.failNextRecovery(new Error("QuotaExceededError"));

  repo.releaseAllCommits();
  await tick();

  const viewB = coordinator.getActiveView();
  assert(ownerMatches(viewB.owner, ownerB));
  assert.notEqual(viewB.workingSnapshot?.cvData.contact.fullName, "HELD PRIVATE CANDIDATE");

  const viewA = await coordinator.switchView(ownerA, "draft-803");
  assert.equal(
    viewA.workingSnapshot?.cvData.contact.fullName,
    "HELD PRIVATE CANDIDATE",
    "Held candidate must survive failing write across auth switch and restore on return"
  );
  assert.equal(viewA.status, "error");

  console.log("✓ PASS: Scenario 2 (Held transition failure survival across auth switch)");
}

async function testScenario3_DraftIdentityProtection() {
  console.log("[Test 3] Category 3 boundary: Draft identity protection against rebound...");
  const clock = new DeterministicClock(3000);
  const repo = new FakeDraftRepository();

  const owner: DraftOwner = { kind: "account", provider: "42", studentId: 803 };
  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-ORIGINAL",
    owner,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Original", "ROLE_ORIGINAL"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, owner, "draft-ORIGINAL");
  await coordinator.switchView(owner, "draft-ORIGINAL");

  repo.setHold(true);
  coordinator.submitEdit(createTestSnapshot("OLD DRAFT CANDIDATE"));

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "DIFFERENT-STABLE-DRAFT",
    owner,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Remote", "DIFFERENT DRAFT REMOTE"),
  });

  repo.releaseAllCommits();
  await tick();

  const diskRecord = repo.records.get(ownerToKey(owner));
  assert.equal(diskRecord?.draftId, "DIFFERENT-STABLE-DRAFT");
  assert.equal(
    diskRecord?.snapshot.targetRole,
    "DIFFERENT DRAFT REMOTE",
    "Candidate must not be rebound to a different draft identity"
  );

  console.log("✓ PASS: Scenario 3 (Draft identity protection against rebound)");
}

async function testScenario4_TwoEditsAcrossOldAckLineage() {
  console.log("[Test 4] Two edits across old ack: explicit lineage advancement...");
  const clock = new DeterministicClock(4000);
  const repo = new FakeDraftRepository();
  const owner: DraftOwner = { kind: "guest" };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "guest-draft",
    owner,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Initial"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, owner, "guest-draft");
  await coordinator.switchView(owner, "guest-draft");

  repo.setHold(true);
  coordinator.submitEdit(createTestSnapshot("Edit 1"));
  coordinator.submitEdit(createTestSnapshot("Edit 2"));

  repo.releaseOneCommit();
  await tick();

  repo.releaseAllCommits();
  await tick();

  const disk = repo.records.get(ownerToKey(owner));
  assert.equal(disk?.revision, 3, "Committed revision must reach 3");
  assert.equal(disk?.snapshot.cvData.contact.fullName, "Edit 2");

  console.log("✓ PASS: Scenario 4 (Lineage advancement across sequential edits)");
}

async function testScenario5_OwnDrainVsExternalDrift() {
  console.log("[Test 5] Own-drain vs external drift: remote conflict detection...");
  const clock = new DeterministicClock(5000);
  const repo = new FakeDraftRepository();
  const owner: DraftOwner = { kind: "account", provider: "42", studentId: 505 };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-505",
    owner,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("User 505"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, owner, "draft-505");
  await coordinator.switchView(owner, "draft-505");

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-505",
    owner,
    revision: 5,
    createdAt: 1000,
    updatedAt: 2000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Remote Advanced Content"),
  });

  coordinator.submitEdit(createTestSnapshot("Local Dirty Content"));
  await coordinator.drain();

  const view = coordinator.getActiveView();
  assert.equal(view.status, "conflict");

  const disk = repo.records.get(ownerToKey(owner));
  assert.equal(disk?.revision, 5);
  assert.equal(disk?.snapshot.cvData.contact.fullName, "Remote Advanced Content");
  assert(repo.recoveries.some((r) => r.snapshot.cvData.contact.fullName === "Local Dirty Content"));

  console.log("✓ PASS: Scenario 5 (Own-drain vs external drift conflict)");
}

async function testScenario6_FullDeletionTreatedAsDirtyWork() {
  console.log("[Test 6] Full deletion treated as dirty work...");
  const clock = new DeterministicClock(6000);
  const repo = new FakeDraftRepository();
  const owner: DraftOwner = { kind: "guest" };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "guest-draft",
    owner,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("To Be Cleared"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, owner, "guest-draft");
  await coordinator.switchView(owner, "guest-draft");

  const emptySnap: DraftSnapshot = {
    cvData: {
      ...createEmptyCV(),
      contact: { ...createEmptyCV().contact, fullName: "", email: "", phoneNumber: "" },
      projects: [],
      education: [],
      experience: [],
      skills: { languages: [], developerTools: [], technologiesFrameworks: [], projectManagementTools: [] },
      coursework: [],
      extracurriculars: [],
    },
    targetRole: "",
  };

  coordinator.submitEdit(emptySnap);
  await coordinator.drain();

  const disk = repo.records.get(ownerToKey(owner));
  assert.equal(disk?.revision, 2);
  assert.equal(disk?.snapshot.cvData.contact.fullName, "");
  assert.equal(disk?.snapshot.cvData.projects.length, 0);

  console.log("✓ PASS: Scenario 6 (Full deletion committed cleanly)");
}

async function testScenario7_ResetFencesOldQueuedWrites() {
  console.log("[Test 7] Reset command fences old queued writes...");
  const clock = new DeterministicClock(7000);
  const repo = new FakeDraftRepository();
  const owner: DraftOwner = { kind: "guest" };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "old-draft-id",
    owner,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Old Draft"),
  });

  const coordinator = new DraftCoordinator(
    { repository: repo, clock, generateId: () => "fresh-reset-draft-id", debounceMs: 0 },
    owner,
    "old-draft-id"
  );
  await coordinator.switchView(owner, "old-draft-id");

  const resetRes = await coordinator.executeResetCommand(createTestSnapshot("Reset Fresh"));
  assert.equal(resetRes.success, true);
  assert.equal(resetRes.newDraftId, "fresh-reset-draft-id");

  const disk = repo.records.get(ownerToKey(owner));
  assert.equal(disk?.draftId, "fresh-reset-draft-id");

  await assert.rejects(
    async () => {
      await repo.commitDraft({
        operationId: "stale-op",
        owner,
        ownerKey: ownerToKey(owner),
        draftId: "old-draft-id",
        baseRevision: 1,
        editSequence: 1,
        viewEpoch: 1,
        snapshot: createTestSnapshot("Stale Op"),
        createdAt: 7100,
      });
    },
    /CONFLICT_WRONG_DRAFT_IDENTITY/
  );

  console.log("✓ PASS: Scenario 7 (Reset fences stale writes)");
}

async function testScenario8_NoAliasMutation() {
  console.log("[Test 8] No alias mutation on getWorkingSnapshot and getSlot...");
  const clock = new DeterministicClock(8000);
  const repo = new FakeDraftRepository();
  const owner: DraftOwner = { kind: "guest" };

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, owner, "draft-1");
  coordinator.submitEdit(createTestSnapshot("Original Name"));

  const snapshot1 = coordinator.getWorkingSnapshot();
  assert(snapshot1);
  snapshot1.cvData.contact.fullName = "CORRUPTED OUTSIDE";

  const snapshot2 = coordinator.getWorkingSnapshot();
  assert.equal(
    snapshot2?.cvData.contact.fullName,
    "Original Name",
    "getWorkingSnapshot must return detached deep clone"
  );

  const slot1 = coordinator.getSlot(owner, "draft-1");
  assert(slot1?.latestWorkingSnapshot);
  slot1.latestWorkingSnapshot.targetRole = "CORRUPTED_SLOT";

  const slot2 = coordinator.getSlot(owner, "draft-1");
  assert.notEqual(
    slot2?.latestWorkingSnapshot?.targetRole,
    "CORRUPTED_SLOT",
    "getSlot must return detached deep clone"
  );

  console.log("✓ PASS: Scenario 8 (No alias mutation on working snapshots and slots)");
}

async function testScenario9_MemoryOnlyZeroRepositoryCalls() {
  console.log("[Test 9] Memory-only mode produces zero repository calls across all operations...");
  const clock = new DeterministicClock(9000);
  const repo = new FakeDraftRepository();
  const guest: DraftOwner = { kind: "guest" };

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, guest, "guest-mem");
  await coordinator.switchView(guest, "guest-mem", true);

  coordinator.submitEdit(createTestSnapshot("Memory Only 1"));
  await coordinator.drain();

  // Execute copy in memory mode
  const copyRes = await coordinator.executeCopyCommand({
    sourceDraft: {
      schemaVersion: 1,
      draftId: "source-mem",
      owner: { kind: "guest" },
      revision: 1,
      createdAt: 1000,
      updatedAt: 1000,
      snapshotVersion: 1,
      snapshot: createTestSnapshot("Copied Memory"),
    },
  });
  assert.equal(copyRes.success, true);

  // Execute reset in memory mode
  const resetRes = await coordinator.executeResetCommand(createTestSnapshot("Reset Memory"));
  assert.equal(resetRes.success, true);

  assert.equal(repo.callCounts.read, 0, "Zero read calls");
  assert.equal(repo.callCounts.commit, 0, "Zero commit calls");
  assert.equal(repo.callCounts.recovery, 0, "Zero recovery calls");
  assert.equal(repo.callCounts.copy, 0, "Zero copy calls");
  assert.equal(repo.callCounts.reset, 0, "Zero reset calls");

  const view = coordinator.getActiveView();
  assert.equal(view.isMemoryOnly, true);
  assert.equal(view.status, "saved");

  console.log("✓ PASS: Scenario 9 (Memory-only produces zero repository calls)");
}

async function testScenario10_OldOwnerOutcomesDoNotAffectActiveView() {
  console.log("[Test 10] Old owner outcomes do not affect active view...");
  const clock = new DeterministicClock(10000);
  const repo = new FakeDraftRepository();

  const ownerA: DraftOwner = { kind: "account", provider: "42", studentId: 101 };
  const ownerB: DraftOwner = { kind: "account", provider: "42", studentId: 202 };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-A",
    owner: ownerA,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Owner A"),
  });
  repo.seedRecord({
    schemaVersion: 1,
    draftId: "draft-B",
    owner: ownerB,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Owner B"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, ownerA, "draft-A");
  await coordinator.switchView(ownerA, "draft-A");

  repo.setHold(true);
  coordinator.submitEdit(createTestSnapshot("Owner A Edit"));

  await coordinator.switchView(ownerB, "draft-B");
  const viewBBefore = coordinator.getActiveView();

  repo.failNextCommit(new Error("Network Error on A"));
  repo.releaseAllCommits();
  await tick();

  const viewBAfter = coordinator.getActiveView();
  assert.equal(viewBAfter.owner.kind, "account");
  assert.equal((viewBAfter.owner as any).studentId, 202);
  assert.equal(viewBAfter.status, viewBBefore.status);
  assert.equal(viewBAfter.workingSnapshot?.cvData.contact.fullName, "Owner B");

  console.log("✓ PASS: Scenario 10 (Old owner outcomes fenced from active view)");
}

async function testScenario11_CopySecondaryChoiceFailureReported() {
  console.log("[Test 11] Copy secondary choice warning reported without primary failure...");
  const clock = new DeterministicClock(11000);
  const repo = new FakeDraftRepository();
  const owner: DraftOwner = { kind: "account", provider: "42", studentId: 707 };

  repo.seedRecord({
    schemaVersion: 1,
    draftId: "target-707",
    owner,
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Target Base"),
  });

  const coordinator = new DraftCoordinator({ repository: repo, clock, debounceMs: 0 }, owner, "target-707");
  await coordinator.switchView(owner, "target-707");

  const sourceDraft: DraftRecord = {
    schemaVersion: 1,
    draftId: "source-guest",
    owner: { kind: "guest" },
    revision: 1,
    createdAt: 1000,
    updatedAt: 1000,
    snapshotVersion: 1,
    snapshot: createTestSnapshot("Source Content"),
  };

  const copyRes = await coordinator.executeCopyCommand({
    sourceDraft,
    choicePreference: "failing_preference",
  });

  assert.equal(copyRes.success, true);
  assert.equal(copyRes.warning, "PREFERENCE_FAILED");

  const disk = repo.records.get(ownerToKey(owner));
  assert.equal(disk?.revision, 2);
  assert.equal(disk?.snapshot.cvData.contact.fullName, "Source Content");

  console.log("✓ PASS: Scenario 11 (Copy secondary choice warning reported without primary failure)");
}


function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function testCycle2LifecycleRegressions() {
  const owner: DraftOwner = { kind: "guest" };
  const source: DraftRecord = { schemaVersion: 1, owner, draftId: "source", revision: 1,
    createdAt: 1, updatedAt: 1, snapshotVersion: 1, snapshot: createTestSnapshot("source", "source") };
  async function setup() {
    const repo = new FakeDraftRepository();
    repo.seedRecord({ ...source, draftId: "target", snapshot: createTestSnapshot("target") });
    let id = 0;
    const c = new DraftCoordinator({ repository: repo, generateId: () => `unique-${++id}` }, owner, "target");
    await c.switchView(owner, "target");
    return { repo, c };
  }
  // Actual held save, including a newer queued candidate, must finish before Reset.
  {
    const { repo, c } = await setup();
    repo.setHold(true); c.submitEdit(createTestSnapshot("first"));
    c.submitEdit(createTestSnapshot("second"));
    const reset = c.executeResetCommand(createTestSnapshot("reset"));
    await tick(); assert.equal(repo.callCounts.reset, 0);
    assert.equal(c.getSlot(owner, "target")?.pendingCandidate?.snapshot.cvData.contact.fullName, "second");
    repo.releaseOneCommit(); await tick(); assert.equal(repo.callCounts.reset, 0);
    repo.setHold(false); repo.releaseAllCommits();
    assert.equal((await reset).success, true);
  }
  // Reservation is atomic, completion wakes both command and public drain waiters.
  {
    const { repo, c } = await setup(); repo.copyGate = deferred();
    const a = c.executeCopyCommand({ sourceDraft: source });
    const b = c.executeCopyCommand({ sourceDraft: source, targetRole: "" });
    await tick(); assert.equal(repo.callCounts.copy, 1);
    let drained = false; const drain = c.drain().then(ok => { assert(ok); drained = true; });
    repo.copyGate.resolve(); await a; await b; await drain;
    assert(drained); assert.equal(c.getWorkingSnapshot()?.targetRole, "");
  }
  // A newer edit during Reset belongs to the replacement working projection.
  {
    const { repo, c } = await setup(); repo.resetGate = deferred();
    const reset = c.executeResetCommand(createTestSnapshot("reset"));
    c.submitEdit(createTestSnapshot("later")); repo.resetGate.resolve(); await reset;
    assert.equal(c.getWorkingSnapshot()?.cvData.contact.fullName, "later");
    assert.equal(await c.drain(), true);
  }
  // Nonzero debounce: cancellation, coalescing, and synchronous memory completion.
  {
    const repo = new FakeDraftRepository(), scheduler = new DeterministicTaskScheduler();
    const c = new DraftCoordinator({ repository: repo, debounceMs: 25, scheduleTask: scheduler.schedule }, owner, "mem");
    await c.switchView(owner, "mem", true);
    c.submitEdit(createTestSnapshot("old")); c.submitEdit(createTestSnapshot("latest"));
    scheduler.advance(24); assert.equal(c.getActiveView().committedRevision, 0);
    assert.equal(await c.drain(), true); scheduler.advance(100);
    assert.equal(c.getActiveView().committedRevision, 1);
    assert.equal(c.getWorkingSnapshot()?.cvData.contact.fullName, "latest");
    assert.equal(repo.callCounts.commit, 0);
  }
  // The injected timer also triggers actual persistent coalesced saves and pending-only Reset.
  {
    const repo = new FakeDraftRepository(), scheduler = new DeterministicTaskScheduler();
    repo.seedRecord({ ...source, draftId: "target" });
    let id = 0;
    const c = new DraftCoordinator({ repository: repo, debounceMs: 25, scheduleTask: scheduler.schedule,
      generateId: () => `scheduled-${++id}` }, owner, "target");
    await c.switchView(owner, "target");
    c.submitEdit(createTestSnapshot("coalesced-old")); c.submitEdit(createTestSnapshot("coalesced-new"));
    scheduler.advance(24); assert.equal(repo.callCounts.commit, 0);
    scheduler.advance(1); await tick(); assert.equal(repo.callCounts.commit, 1);
    assert.equal(repo.records.get(ownerToKey(owner))?.snapshot.cvData.contact.fullName, "coalesced-new");
    c.submitEdit(createTestSnapshot("pending-only"));
    assert.equal((await c.executeResetCommand(createTestSnapshot("reset"))).success, true);
    assert.equal(repo.callCounts.commit, 2); assert.equal(repo.callCounts.reset, 1);
    scheduler.advance(100); await tick(); assert.equal(repo.callCounts.commit, 2);
    assert.equal(repo.recoveries[repo.recoveries.length - 1]?.snapshot.cvData.contact.fullName, "pending-only");
  }
  // Failed reads and unseen late hydration cannot authorize persistent writes.
  {
    const repo = new FakeDraftRepository(), scheduler = new DeterministicTaskScheduler();
    repo.readGate = deferred();
    const c = new DraftCoordinator({ repository: repo, debounceMs: 25, scheduleTask: scheduler.schedule }, owner, "target");
    const read = c.switchView(owner, "target"); c.submitEdit(createTestSnapshot("local"));
    repo.readGate.resolve({ ...source, draftId: "target", revision: 5 }); await read;
    scheduler.advance(25); await tick(); assert.equal(repo.callCounts.commit, 0);
    assert.equal(await c.drain(), false);
    assert.equal(c.getWorkingSnapshot()?.cvData.contact.fullName, "local");
  }
  {
    const { repo, c } = await setup(); repo.setHold(true);
    c.submitEdit(createTestSnapshot("immutable"));
    const op = c.getSlot(owner, "target")?.activeOperation;
    assert(op?.operationId); assert.equal(op?.snapshot.cvData.contact.fullName, "immutable");
    repo.releaseAllCommits(); await c.drain();
  }
  // Boundary operation mutation cannot alter the authoritative active snapshot.
  {
    const { repo, c } = await setup();
    const gate = deferred<Awaited<ReturnType<CoordinatorRepositoryPort["commitDraft"]>>>();
    let received!: ImmutableDraftOperation;
    repo.commitDraft = async op => { received = op; return gate.promise; };
    c.submitEdit(createTestSnapshot("immutable"));
    received.snapshot.targetRole = "hostile port mutation";
    assert.equal(c.getSlot(owner, "target")?.activeOperation?.snapshot.targetRole, "");
    gate.resolve({ operationId: received.operationId, revision: 2, updatedAt: 2 }); assert(await c.drain());
    assert.equal(c.getSlot(owner, "target")?.committed?.snapshot.targetRole, "");
  }
  // An acknowledgement for a different operation cannot retire this candidate.
  {
    const { repo, c } = await setup();
    repo.commitDraft = async () => ({ operationId: "foreign-ack", revision: 2, updatedAt: 2 });
    c.submitEdit(createTestSnapshot("unacknowledged")); assert.equal(await c.drain(), false);
    const slot = c.getSlot(owner, "target");
    assert.equal(slot?.committed?.revision, 1);
    assert.equal(slot?.retainedFailure?.operation.snapshot.cvData.contact.fullName, "unacknowledged");
  }
  // Old recovery completions certify only the exact failed candidate.
  for (const newerFails of [false, true]) {
    const { repo, c } = await setup();
    const recovery = deferred<string>(); let count = 0;
    repo.createRecovery = async () => ++count === 1 ? recovery.promise : Promise.reject(new Error("quota"));
    repo.failNextCommit(new Error("old quota")); c.submitEdit(createTestSnapshot("old")); await tick();
    if (newerFails) repo.failNextCommit(new Error("new quota"));
    c.submitEdit(createTestSnapshot("new")); await tick();
    const status = c.getActiveView().status;
    recovery.resolve("old-only-backup"); await tick();
    assert.equal(c.getActiveView().status, status);
    if (newerFails) {
      const failure: DraftSlotState["retainedFailure"] | undefined = c.getSlot(owner, "target")?.retainedFailure;
      assert.equal(failure?.operation.snapshot.cvData.contact.fullName, "new");
      assert.equal(failure?.persistedToRecovery, false);
    } else assert.equal(status, "saved");
  }
  // Auth is checked after the awaited backup, before either primary replacement.
  for (const command of ["copy", "reset"] as const) {
    const { repo, c } = await setup(); repo.recoveryGate = deferred();
    const result = command === "copy" ? c.executeCopyCommand({ sourceDraft: source })
      : c.executeResetCommand(createTestSnapshot("reset"));
    await tick(); assert.equal(repo.callCounts.recovery, 1);
    await c.switchView({ kind: "account", provider: "42", studentId: 999 }, "foreign", true);
    repo.recoveryGate.resolve(); assert.equal((await result).success, false);
    assert.equal(repo.records.get(ownerToKey(owner))?.draftId, "target");
  }
  // Nonzero-base disappearance rejects both destructive commands.
  for (const command of ["copy", "reset"] as const) {
    const { repo, c } = await setup(); repo.records.delete(ownerToKey(owner));
    const result = command === "copy" ? await c.executeCopyCommand({ sourceDraft: source })
      : await c.executeResetCommand(createTestSnapshot("reset"));
    assert.equal(result.success, false); assert.equal(repo.records.size, 0);
  }
  // Backup comes from the captured target working state; secondary retries use the same identity.
  {
    const { repo, c } = await setup(); repo.setHold(true);
    c.submitEdit(createTestSnapshot("captured target"));
    const copy = c.executeCopyCommand({ sourceDraft: source, choicePreference: "failing_preference" });
    repo.setHold(false); repo.releaseAllCommits(); const result = await copy;
    assert(result.success); assert.equal(result.warning, "PREFERENCE_FAILED");
    const params = repo.lastCopyParams as Parameters<CoordinatorRepositoryPort["commitCopy"]>[0];
    assert(params.operationId); assert(params.editSequence > 0); assert.equal(params.viewEpoch, params.commandEpoch);
    assert.equal(params.targetWorkingSnapshot?.cvData.contact.fullName, "captured target");
    assert.equal(repo.recoveries[0].snapshot.cvData.contact.fullName, "captured target");
    const before = { copies: repo.callCounts.copy, backups: repo.callCounts.recovery, revision: result.revision };
    const ack = await repo.commitCopy(params);
    assert.equal(ack.revision, before.revision); assert.equal(repo.callCounts.copy, before.copies);
    assert.equal(repo.callCounts.recovery, before.backups); assert.equal(repo.choiceWrites.size, 0);
  }
  {
    const { repo, c } = await setup(); repo.readDraft = async () => { throw new Error("unreadable"); };
    await c.switchView(owner, "new-unreadable"); c.submitEdit(createTestSnapshot("local"));
    assert.equal(await c.drain(), false); assert.equal(repo.callCounts.commit, 0);
  }
  console.log("PASS: Cycle2 lifecycle, command reservation, Reset transfer and nonzero debounce regressions");
}

// =========================================================================
// Main Runner
// =========================================================================
async function runAllCoordinatorTests() {
  console.log("=== Running M1 Draft Coordinator Verification Suite ===\n");

  await testCycle2LifecycleRegressions();
  await runSchedulerSelfCheck();
  console.log("✓ PASS: Deterministic scheduler self-check");

  await testScenario1_CopyInflightSaveAndOwnerSwitch();
  await testScenario2_HeldTransitionFailureSurvival();
  await testScenario3_DraftIdentityProtection();
  await testScenario4_TwoEditsAcrossOldAckLineage();
  await testScenario5_OwnDrainVsExternalDrift();
  await testScenario6_FullDeletionTreatedAsDirtyWork();
  await testScenario7_ResetFencesOldQueuedWrites();
  await testScenario8_NoAliasMutation();
  await testScenario9_MemoryOnlyZeroRepositoryCalls();
  await testScenario10_OldOwnerOutcomesDoNotAffectActiveView();
  await testScenario11_CopySecondaryChoiceFailureReported();

  console.log("\nAll M1 coordinator tests PASSED (12 existing checks plus Cycle2 regressions).");
}

if (require.main === module) {
  runAllCoordinatorTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}
