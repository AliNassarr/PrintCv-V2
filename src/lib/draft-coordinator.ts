import type {
  DraftOwner,
  DraftSnapshot,
  DraftRecord,
} from "./draft-types";
import { ownerMatches, ownerToKey } from "./draft-types";

/**
 * Deep clone utility to prevent external callers, projections, or async callers
 * from mutating internal coordinator state via object reference aliasing.
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }
  const copy = {} as Record<string, any>;
  for (const [key, value] of Object.entries(obj)) {
    copy[key] = deepClone(value);
  }
  return copy as T;
}

/**
 * Complete immutable draft operation record passed to the repository.
 * Metadata and snapshots are owned privately and detached at every public/port boundary.
 */
export interface ImmutableDraftOperation {
  readonly commandParent?: {
    readonly operationId: string;
    readonly kind: "copy" | "reset";
    readonly branchKey: string;
    readonly sourceDraftId: string;
    readonly sourceOperationId: string;
    readonly baseRevision: number;
    readonly revision: number;
  };
  readonly branchKey?: string;
  /** Immutable callback capture; baseRevision may derive only from compatible own acknowledgements. */
  readonly originRevision?: number;
  readonly originSnapshot?: DraftSnapshot;
  readonly operationId: string;
  readonly owner: DraftOwner;
  readonly ownerKey: string;
  readonly draftId: string;
  readonly baseRevision: number;
  readonly editSequence: number;
  readonly viewEpoch: number;
  readonly snapshot: DraftSnapshot;
  readonly createdAt: number;
}

/**
 * Individual lifecycle slot for a specific (owner, draftId) pair.
 * Invariants allow committed baseline, active write/command, newer queued edit,
 * and retained failure to coexist independently.
 */
export interface DraftSlotState {
  readonly owner: DraftOwner;
  readonly ownerKey: string;
  readonly draftId: string;

  nextEditSequence: number;

  committed: {
    revision: number;
    draftId: string;
    snapshot: DraftSnapshot;
    updatedAt: number;
  } | null;

  latestWorkingSnapshot: DraftSnapshot | null;

  pendingCandidate: (ImmutableDraftOperation & {
    readonly parentSequence: number | null;
    readonly submittedAt: number;
  }) | null;

  activeOperation: ImmutableDraftOperation | null;
  activeCommand: "copy" | "reset" | null;

  retainedFailure: {
    operation: ImmutableDraftOperation;
    error: Error;
    failedAt: number;
    persistedToRecovery: boolean;
  } | null;

  isMemoryOnly: boolean;
}

/**
 * Active view state projected for UI adapters (e.g. Zustand store).
 */
export interface ActiveViewProjection {
  owner: DraftOwner;
  draftId: string;
  viewEpoch: number;
  status: "idle" | "saving" | "saved" | "error" | "conflict";
  workingSnapshot: DraftSnapshot | null;
  committedRevision: number;
  isMemoryOnly: boolean;
  hasRetainedFailure: boolean;
  hasPendingEdits: boolean;
}

/**
 * Storage boundary port for the coordinator.
 * Implemented by repository adapter in M2, or mock repository in M1 tests.
 */
export interface DraftAcknowledgement {
  readonly operationId: string;
  readonly revision: number;
  readonly updatedAt: number;
}

/**
 * Each acknowledgement belongs to exactly one invocation/operationId and follows
 * validated durable readback. Copy retries with the same operationId must return
 * the original primary acknowledgement without repeating backup/replacement.
 * A secondary preference failure is a warning on that successful primary.
 * Commands validate their mandatory guard under the shared lock before backup,
 * after every awaited stage, and immediately before primary replacement.
 * Missing records match only base zero; corrupt/unresolved data is never absence.
 */
export interface CoordinatorRepositoryPort {
  readDraft(owner: DraftOwner, draftId?: string): Promise<DraftRecord | null>;

  commitDraft(op: ImmutableDraftOperation): Promise<DraftAcknowledgement>;

  createRecovery(
    owner: DraftOwner,
    snapshot: DraftSnapshot,
    reason: string,
    draftId?: string
  ): Promise<string>;

  commitCopy(params: {
    sourceDraft: DraftRecord;
    targetOwner: DraftOwner;
    targetDraftId: string;
    expectedBaseRevision: number;
    targetRole?: string;
    studentProfile?: any;
    choicePreference?: string;
    operationId: string;
    editSequence: number;
    viewEpoch: number;
    targetWorkingSnapshot: DraftSnapshot | null;
    commandEpoch: number;
    validateEpoch: () => boolean;
    isStillCurrent: () => boolean;
  }): Promise<DraftAcknowledgement & { warning?: string; choiceWarning?: string }>;

  commitReset(params: {
    owner: DraftOwner;
    oldDraftId: string;
    expectedOldDraftId: string;
    expectedBaseRevision: number;
    newDraftId: string;
    initialSnapshot: DraftSnapshot;
    operationId: string;
    editSequence: number;
    viewEpoch: number;
    targetWorkingSnapshot: DraftSnapshot | null;
    commandEpoch: number;
    validateEpoch: () => boolean;
    isStillCurrent: () => boolean;
  }): Promise<DraftAcknowledgement & { draftId: string }>;
}

/**
 * Dependencies injected into the coordinator.
 */
export interface CoordinatorDependencies {
  repository: CoordinatorRepositoryPort;
  clock?: { now(): number };
  generateId?: () => string;
  onViewChange?: (view: ActiveViewProjection) => void;
  debounceMs?: number;
  scheduleTask?: (fn: () => void, delayMs: number) => () => void;
}

/** A command is reserved synchronously; only its queue head may enter storage. */
type CommandJob = {
  kind: "copy" | "reset";
  run: () => Promise<void>;
};
export interface CapturedDraftAction {
  readonly key: string;
  readonly lineageKey: string;
  readonly owner: DraftOwner;
  readonly draftId: string;
  readonly capturedRevision: number;
  readonly capturedSnapshot: DraftSnapshot;
  apply(transform: (snapshot: DraftSnapshot) => DraftSnapshot | null): boolean;
}

type Readiness = "unknown" | "loading" | "ready" | "error" | "conflict";
type Status = ActiveViewProjection["status"];

/** One compatible local ancestry, owned and inspectable only by the coordinator. */
export interface PreservedDraftBranch {
  branchKey: string;
  owner: DraftOwner;
  draftId: string;
  originRevision: number;
  originSnapshot: DraftSnapshot;
  baseRevision: number;
  snapshot: DraftSnapshot;
  operation: ImmutableDraftOperation;
  recovery: Array<{ operation: ImmutableDraftOperation; recoveryKey: string | null; state: "pending" | "durable" | "memory" }>;
}
type ActionBranch = {
  lineage: number; branchKey: string; originRevision: number; originSnapshot: DraftSnapshot;
  snapshot: DraftSnapshot; operation: ImmutableDraftOperation | null;
  // Last accepted edit receipt, including an edit acknowledged during a queued
  // command's drain. It is ancestry evidence, not another save queue or writer.
  latestEdit: ImmutableDraftOperation | null;
  recovery: PreservedDraftBranch["recovery"];
};

export class DraftCoordinator {
  private readonly repository: CoordinatorRepositoryPort;
  private readonly clock: { now(): number };
  private readonly generateId: () => string;
  private readonly debounceMs: number;
  private readonly scheduleTask: NonNullable<CoordinatorDependencies["scheduleTask"]>;
  private readonly onViewChange?: CoordinatorDependencies["onViewChange"];
  private currentOwner: DraftOwner;
  private currentDraftId: string;
  private currentViewEpoch = 1;
  private slots = new Map<string, DraftSlotState>();
  private retiredSlots = new WeakSet<DraftSlotState>();
  // Captured scopes share only explicitly compatible local ancestry. All branch
  // candidates and recovery observations live here, never in adapter closures.
  private actionBranches = new Map<DraftSlotState, Map<number, ActionBranch>>();
  private selectedBranches = new Map<DraftSlotState, ActionBranch>();
  private readiness = new Map<DraftSlotState, Readiness>();
  private hydration = new Map<DraftSlotState, Promise<void>>();
  private statuses = new Map<DraftSlotState, Status>();
  private debounceCancelers = new Map<DraftSlotState, () => void>();
  private queues = new Map<DraftSlotState, CommandJob[]>();
  private committing = new Set<DraftSlotState>();
  // Separate completion observations for saves and for the complete public lifecycle.
  private saveWaiters = new Map<DraftSlotState, Array<(ok: boolean) => void>>();
  private drainWaiters = new Map<DraftSlotState, Array<(ok: boolean) => void>>();
  // Only exact, locally acknowledged operation sequences can derive a new base.
  private ownAcks = new Map<DraftSlotState, { sequence: number; revision: number }>();
  private latestSequence = new Map<DraftSlotState, number>();
  private remoteLineage = new Map<DraftSlotState, number>();

  constructor(deps: CoordinatorDependencies, owner: DraftOwner = { kind: "guest" }, draftId = "default") {
    this.repository = deps.repository;
    this.clock = deps.clock ?? { now: () => Date.now() };
    this.generateId = deps.generateId ?? (() => `draft_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    this.debounceMs = deps.debounceMs ?? 0;
    this.scheduleTask = deps.scheduleTask ?? ((fn, delay) => {
      const timer = setTimeout(fn, delay); return () => clearTimeout(timer);
    });
    this.onViewChange = deps.onViewChange;
    this.currentOwner = deepClone(owner); this.currentDraftId = draftId;
    this.slot(owner, draftId);
  }

  private key(owner: DraftOwner, draftId: string): string { return `${ownerToKey(owner)}::${draftId}`; }
  private slot(owner: DraftOwner, draftId: string, memory = false): DraftSlotState {
    const key = this.key(owner, draftId);
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { owner: deepClone(owner), ownerKey: ownerToKey(owner), draftId, nextEditSequence: 1,
        committed: null, latestWorkingSnapshot: null, pendingCandidate: null, activeOperation: null,
        activeCommand: null, retainedFailure: null, isMemoryOnly: memory };
      this.slots.set(key, slot); this.readiness.set(slot, memory ? "ready" : "unknown");
      this.latestSequence.set(slot, 0);
    }
    if (memory) {
      slot.isMemoryOnly = true;
      if (this.readiness.get(slot) === "unknown") this.readiness.set(slot, "ready");
    }
    return slot;
  }
  public getSlot(owner: DraftOwner, draftId: string): Readonly<DraftSlotState> | undefined {
    const slot = this.slots.get(this.key(owner, draftId)); return slot ? deepClone(slot) : undefined;
  }
  private current(slot: DraftSlotState): boolean {
    return ownerMatches(slot.owner, this.currentOwner) && slot.draftId === this.currentDraftId;
  }
  private status(slot: DraftSlotState, status: Status): void {
    this.statuses.set(slot, status); if (this.current(slot)) this.notifyView();
  }
  private notifyView(): void { this.onViewChange?.(this.getActiveView()); }
  private cancel(slot: DraftSlotState): void {
    this.debounceCancelers.get(slot)?.(); this.debounceCancelers.delete(slot);
  }
  private ready(slot: DraftSlotState): boolean {
    return this.readiness.get(slot) === "ready";
  }

  private branch(slot: DraftSlotState, lineage = this.remoteLineage.get(slot) ?? 0, initialSnapshot?: DraftSnapshot): ActionBranch {
    let branches = this.actionBranches.get(slot);
    if (!branches) { branches = new Map(); this.actionBranches.set(slot, branches); }
    let branch = branches.get(lineage);
    if (!branch) {
      const snapshot = deepClone((slot.latestWorkingSnapshot ?? initialSnapshot)!);
      branch = { lineage, branchKey: `${this.key(slot.owner, slot.draftId)}::${lineage}`,
        originRevision: slot.committed?.revision ?? 0, originSnapshot: deepClone(snapshot),
        snapshot, operation: null, latestEdit: null, recovery: [] };
      branches.set(lineage, branch);
    }
    return branch;
  }

  private retainBranch(slot: DraftSlotState, branch: ActionBranch): void {
    const op = branch.operation;
    if (!op || branch.recovery.some(r => r.operation.operationId === op.operationId)) return;
    const retained: PreservedDraftBranch["recovery"][number] = {
      operation: deepClone(op), recoveryKey: null, state: slot.isMemoryOnly ? "memory" : "pending" };
    branch.recovery.push(retained);
    if (slot.isMemoryOnly) return;
    // Existing recovery port allocates a fresh key and validates durable readback.
    // The reason carries immutable ancestry metadata; the record carries exact data.
    const { snapshot: _snapshot, ...metadata } = op;
    try {
      void Promise.resolve(this.repository.createRecovery(deepClone(slot.owner), deepClone(op.snapshot),
        `CONFLICT_BRANCH:${JSON.stringify({ ...metadata, branchOriginRevision: branch.originRevision, branchOriginSnapshot: branch.originSnapshot })}`,
        slot.draftId)).then(key => { retained.recoveryKey = key; retained.state = "durable"; },
        () => { retained.state = "memory"; });
    } catch { retained.state = "memory"; }
  }

  /** Detached owner-scoped export of every accepted, unacknowledged branch. */
  public getPreservedBranches(owner: DraftOwner): PreservedDraftBranch[] {
    const result: PreservedDraftBranch[] = [];
    for (const [slot, branches] of this.actionBranches) {
      if (!ownerMatches(slot.owner, owner)) continue;
      for (const branch of branches.values()) {
        if (!branch.operation) continue;
        const op = branch.operation;
        if (slot.committed?.revision === op.baseRevision + 1 &&
          JSON.stringify(slot.committed.snapshot) === JSON.stringify(op.snapshot) && !branch.recovery.length) continue;
        result.push(deepClone({ branchKey: branch.branchKey, owner: slot.owner, draftId: slot.draftId,
          originRevision: branch.originRevision, originSnapshot: branch.originSnapshot,
          baseRevision: op.baseRevision, snapshot: branch.snapshot, operation: op, recovery: branch.recovery }));
      }
    }
    return result;
  }

  public async switchView(owner: DraftOwner, draftId: string, memory = false): Promise<ActiveViewProjection> {
    this.currentViewEpoch++; this.currentOwner = deepClone(owner); this.currentDraftId = draftId;
    const slot = this.slot(owner, draftId, memory);
    this.notifyView(); // Hide the previous owner's projection before any read can wait.
    if (!this.ready(slot) && this.readiness.get(slot) !== "conflict") {
      if (!this.hydration.has(slot)) {
        this.readiness.set(slot, "loading");
        const loading = this.hydrate(slot);
        this.hydration.set(slot, loading);
      }
      await this.hydration.get(slot);
    }
    return this.getActiveView();
  }
  private async hydrate(slot: DraftSlotState): Promise<void> {
    try {
      const record = await this.repository.readDraft(deepClone(slot.owner), slot.draftId);
      if (record && (!ownerMatches(record.owner, slot.owner) || record.draftId !== slot.draftId)) {
        throw new Error("CONFLICT_HYDRATION_IDENTITY");
      }
      // A local edit captured without seeing this record may never inherit its base.
      if (record && (this.latestSequence.get(slot) ?? 0) > 0) {
        this.readiness.set(slot, "conflict"); this.status(slot, "conflict");
      } else {
        if (record) {
          slot.committed = { revision: record.revision, draftId: record.draftId,
            snapshot: deepClone(record.snapshot), updatedAt: record.updatedAt };
          slot.latestWorkingSnapshot = deepClone(record.snapshot);
        }
        this.readiness.set(slot, "ready"); this.status(slot, slot.pendingCandidate ? "idle" : "saved");
        if (slot.pendingCandidate && !this.debounceCancelers.has(slot)) void this.save(slot);
      }
    } catch (error) {
      this.readiness.set(slot, "error"); this.status(slot, "error");
    } finally {
      this.hydration.delete(slot);
      if (!this.ready(slot)) this.signal(slot, false);
    }
  }

  public submitEdit(snapshot: DraftSnapshot): void {
    this.submitForSlot(this.slot(this.currentOwner, this.currentDraftId), snapshot, this.currentViewEpoch);
  }
  private submitForSlot(slot: DraftSlotState, snapshot: DraftSnapshot, viewEpoch: number,
    baseRevision?: number, allowParent = true,
    capture?: { revision: number; snapshot: DraftSnapshot }): void {
    const branch = this.selectedBranches.get(slot) ?? this.branch(slot, this.remoteLineage.get(slot) ?? 0, snapshot);
    slot.latestWorkingSnapshot = deepClone(snapshot);
    this.selectedBranches.set(slot, branch);
    branch.snapshot = deepClone(snapshot);
    const sequence = slot.nextEditSequence++;
    this.latestSequence.set(slot, sequence);
    const parent = allowParent && slot.activeOperation?.branchKey === branch.branchKey ? slot.activeOperation.editSequence : null;
    slot.pendingCandidate = { operationId: this.generateId(), editSequence: sequence,
      commandParent: branch.operation?.commandParent,
      owner: deepClone(slot.owner), ownerKey: slot.ownerKey, draftId: slot.draftId, createdAt: this.clock.now(),
      branchKey: branch.branchKey, originRevision: capture?.revision ?? branch.operation?.originRevision ?? branch.originRevision,
      originSnapshot: deepClone(capture?.snapshot ?? branch.operation?.originSnapshot ?? branch.originSnapshot),
      baseRevision: baseRevision ?? branch.operation?.baseRevision ?? branch.originRevision, parentSequence: parent,
      viewEpoch, snapshot: deepClone(snapshot), submittedAt: this.clock.now() };
    branch.operation = deepClone(slot.pendingCandidate);
    branch.latestEdit = deepClone(slot.pendingCandidate);
    if (this.readiness.get(slot) === "conflict") this.retainBranch(slot, branch);
    this.status(slot, this.ready(slot) ? "idle" : this.readiness.get(slot) === "conflict" ? "conflict" : "error");
    this.cancel(slot);
    if (!slot.activeOperation && !this.committing.has(slot)) {
      if (this.debounceMs <= 0) void this.save(slot);
      else this.debounceCancelers.set(slot, this.scheduleTask(() => {
        this.debounceCancelers.delete(slot); void this.save(slot);
      }, this.debounceMs));
    }
  }

  /** Compatibility save callers await edit completion, not commands submitted later. */
  public drainEdits(owner = this.currentOwner, draftId = this.currentDraftId): Promise<boolean> {
    return this.drainSaves(this.slot(owner, draftId));
  }

  public drain(owner = this.currentOwner, draftId = this.currentDraftId): Promise<boolean> {
    const slot = this.slots.get(this.key(owner, draftId));
    if (!slot) return Promise.resolve(true);
    this.cancel(slot);
    // Observe first: a memory save can finish synchronously inside save().
    return new Promise(resolve => {
      const waiters = this.drainWaiters.get(slot) ?? []; waiters.push(resolve); this.drainWaiters.set(slot, waiters);
      if (!this.committing.has(slot)) void this.save(slot);
      this.settleIdle(slot);
    });
  }
  private signal(slot: DraftSlotState, ok: boolean, savesOnly = false): void {
    const saves = this.saveWaiters.get(slot) ?? []; this.saveWaiters.delete(slot);
    for (const resolve of saves) resolve(ok);
    if (!savesOnly) {
      const drains = this.drainWaiters.get(slot) ?? []; this.drainWaiters.delete(slot);
      for (const resolve of drains) resolve(ok);
    }
  }
  private settleIdle(slot: DraftSlotState): void {
    if (slot.activeOperation || this.committing.has(slot)) return;
    if (this.retiredSlots.has(slot)) {
      this.signal(slot, this.ready(slot) && !slot.pendingCandidate && !slot.retainedFailure, !!this.queues.get(slot)?.length);
      return;
    }
    if (!this.ready(slot)) { this.signal(slot, false); return; }
    if (slot.pendingCandidate) return;
    this.signal(slot, !slot.retainedFailure, !!this.queues.get(slot)?.length);
  }
  private drainSaves(slot: DraftSlotState): Promise<boolean> {
    this.cancel(slot);
    if (!slot.activeOperation && !slot.pendingCandidate) return Promise.resolve(this.ready(slot) && !slot.retainedFailure);
    return new Promise(resolve => {
      const waiters = this.saveWaiters.get(slot) ?? []; waiters.push(resolve); this.saveWaiters.set(slot, waiters);
      void this.save(slot);
    });
  }
  private acknowledge(slot: DraftSlotState, sequence: number, revision: number): void {
    this.ownAcks.set(slot, { sequence, revision });
    const pending = slot.pendingCandidate;
    if (pending?.parentSequence === sequence) {
      // Derive, never mutate a submitted candidate's identity or base in place.
      slot.pendingCandidate = { ...pending, baseRevision: revision, parentSequence: null };
    }
  }
  private async save(slot: DraftSlotState): Promise<void> {
    if (this.retiredSlots.has(slot)) { this.settleIdle(slot); return; }
    if (slot.activeOperation || this.committing.has(slot)) return;
    if (!this.ready(slot)) { this.signal(slot, false); return; }
    const candidate = slot.pendingCandidate;
    if (!candidate) { this.settleIdle(slot); return; }
    const ownAck = this.ownAcks.get(slot);
    const ownBase = ownAck?.sequence === candidate.parentSequence ? ownAck.revision : undefined;
    const op: ImmutableDraftOperation = {
      commandParent: deepClone(candidate.commandParent),
      branchKey: candidate.branchKey,
      originRevision: candidate.originRevision, originSnapshot: deepClone(candidate.originSnapshot),
      operationId: candidate.operationId, owner: deepClone(slot.owner), ownerKey: slot.ownerKey,
      draftId: slot.draftId, baseRevision: ownBase ?? candidate.baseRevision,
      editSequence: candidate.editSequence, viewEpoch: candidate.viewEpoch,
      snapshot: deepClone(candidate.snapshot), createdAt: candidate.submittedAt,
    };
    slot.pendingCandidate = null; slot.activeOperation = op; this.status(slot, "saving");
    try {
      // A detached boundary prevents even a hostile port from mutating authority.
      const result = slot.isMemoryOnly ? { operationId: op.operationId, revision: op.baseRevision + 1, updatedAt: this.clock.now() }
        : await this.repository.commitDraft(deepClone(op));
      if (result.operationId !== op.operationId || result.revision !== op.baseRevision + 1) throw new Error("INVALID_DRAFT_ACKNOWLEDGEMENT");
      if (slot.activeOperation !== op) throw new Error("INTERNAL_OPERATION_OWNERSHIP");
      slot.committed = { revision: result.revision, draftId: slot.draftId,
        snapshot: deepClone(op.snapshot), updatedAt: result.updatedAt };
      slot.activeOperation = null;
      if (!slot.retainedFailure || slot.retainedFailure.operation.editSequence <= op.editSequence) slot.retainedFailure = null;
      this.acknowledge(slot, op.editSequence, result.revision);
      const branch = [...(this.actionBranches.get(slot)?.values() ?? [])].find(b => b.branchKey === op.branchKey);
      if (branch && (!branch.latestEdit || branch.latestEdit.editSequence <= op.editSequence)) branch.latestEdit = deepClone(op);
      if (branch && branch.lineage === (this.remoteLineage.get(slot) ?? 0) && this.ready(slot)) {
        branch.originRevision = result.revision; branch.originSnapshot = deepClone(op.snapshot);
        // A new candidate may have arrived while commitDraft was awaited.
        const queued = (slot as DraftSlotState).pendingCandidate;
        branch.operation = queued?.branchKey === branch.branchKey ? deepClone(queued) : null;
      }
      this.status(slot, slot.pendingCandidate ? "idle" : "saved");
      if (slot.pendingCandidate) void this.save(slot); else this.settleIdle(slot);
    } catch (error) {
      slot.activeOperation = null;
      const err = error instanceof Error ? error : new Error(String(error));
      const failure = { operation: op, error: err, failedAt: this.clock.now(), persistedToRecovery: false };
      slot.retainedFailure = failure;
      if ((this.latestSequence.get(slot) ?? 0) === op.editSequence) this.status(slot, err.message.includes("CONFLICT") ? "conflict" : "error");
      this.signal(slot, false);
      // Recovery has its own exact object lifetime. It never settles another save or changes current status.
      try {
        await this.repository.createRecovery(deepClone(op.owner), deepClone(op.snapshot), err.message, op.draftId);
        failure.persistedToRecovery = true;
      } catch { /* The exact failed candidate remains in memory, without a durability claim. */ }
    }
  }

  private enqueue(slot: DraftSlotState, kind: CommandJob["kind"], run: () => Promise<void>): void {
    const queue = this.queues.get(slot) ?? [];
    const job = { kind, run }; queue.push(job); this.queues.set(slot, queue);
    // This reservation happens before run() can yield, including on an idle slot.
    if (queue.length === 1) { slot.activeCommand = kind; void this.runCommand(slot, job); }
  }
  private async runCommand(slot: DraftSlotState, job: CommandJob): Promise<void> {
    try { await job.run(); }
    finally {
      this.committing.delete(slot);
      const queue = this.queues.get(slot)!; queue.shift();
      if (queue.length) { slot.activeCommand = queue[0].kind; void this.runCommand(slot, queue[0]); }
      else {
        this.queues.delete(slot); slot.activeCommand = null;
        if (slot.pendingCandidate) void this.save(slot);
        this.settleIdle(slot);
      }
    }
  }
  private guard(slot: DraftSlotState, epoch: number): () => boolean {
    return () => this.currentViewEpoch === epoch && this.current(slot);
  }
  private async prepare(slot: DraftSlotState, kind: CommandJob["kind"], valid: () => boolean): Promise<string | null> {
    if (this.retiredSlots.has(slot)) return "ABORTED_AUTH_OR_TARGET_CHANGED";
    // Copy has an asynchronous drain boundary even when initially idle. A newly
    // accepted edit must be drained before the command takes storage ownership.
    if (kind === "copy" || slot.activeOperation || slot.pendingCandidate) {
      if (!await this.drainSaves(slot)) return "DRAIN_FAILED";
      // Recheck after every completion; a prior idle observation is not ownership.
      while (slot.activeOperation || slot.pendingCandidate) {
        if (!await this.drainSaves(slot)) return "DRAIN_FAILED";
      }
    }
    if (!valid()) return "ABORTED_AUTH_OR_TARGET_CHANGED";
    if (!this.ready(slot) || slot.retainedFailure) return "DRAIN_FAILED";
    this.committing.add(slot); return null;
  }
  private preserveLater(slot: DraftSlotState, branch: ActionBranch, sequence: number, revision: number,
    snapshot: DraftSnapshot, operationId: string, baseRevision: number): void {
    const queued = branch.operation ?? branch.latestEdit;
    branch.originRevision = revision; branch.originSnapshot = deepClone(snapshot);
    if (!queued || queued.editSequence <= sequence) {
      branch.snapshot = deepClone(snapshot); branch.operation = null; branch.latestEdit = null;
      if (this.selectedBranches.get(slot) === branch) slot.latestWorkingSnapshot = deepClone(snapshot);
      return;
    }
    // Only this command's compatible branch may inherit its acknowledgement.
    // Retain both the original and derived immutable versions when conflicted.
    if (!this.ready(slot)) this.retainBranch(slot, branch);
    const derived = { ...deepClone(queued), operationId: this.generateId(), baseRevision: revision,
      parentSequence: null, submittedAt: queued.createdAt,
      commandParent: { operationId, kind: "copy" as const, branchKey: branch.branchKey,
        sourceDraftId: slot.draftId, sourceOperationId: queued.operationId, baseRevision, revision } };
    branch.operation = derived;
    branch.latestEdit = deepClone(derived);
    if (slot.pendingCandidate?.operationId === queued.operationId ||
      !slot.pendingCandidate && this.selectedBranches.get(slot) === branch) slot.pendingCandidate = deepClone(derived);
    if (this.selectedBranches.get(slot) === branch) slot.latestWorkingSnapshot = deepClone(branch.snapshot);
    if (!this.ready(slot)) this.retainBranch(slot, branch);
  }

  private captureCommandBranch(slot: DraftSlotState, initialSnapshot: DraftSnapshot): ActionBranch {
    const branch = this.selectedBranches.get(slot) ?? this.branch(slot, this.remoteLineage.get(slot) ?? 0, initialSnapshot);
    this.selectedBranches.set(slot, branch);
    return branch;
  }

  public executeCopyCommand(params: {
    sourceDraft: DraftRecord; targetRole?: string; studentProfile?: any; choicePreference?: string;
  }): Promise<{ success: boolean; revision?: number; warning?: string; error?: string }> {
    const payload = deepClone(params);
    const slot = this.slot(this.currentOwner, this.currentDraftId);
    const snapshot = { ...deepClone(payload.sourceDraft.snapshot),
      targetRole: payload.targetRole ?? payload.sourceDraft.snapshot.targetRole,
      studentProfile: payload.studentProfile === undefined ? payload.sourceDraft.snapshot.studentProfile : payload.studentProfile };
    snapshot.cvData.targetRole = snapshot.targetRole ?? snapshot.cvData.targetRole;
    const commandBranch = this.captureCommandBranch(slot, snapshot);
    const epoch = this.currentViewEpoch, sequence = slot.nextEditSequence++, operationId = this.generateId();
    const targetWorkingSnapshot = deepClone(slot.latestWorkingSnapshot);
    const valid = this.guard(slot, epoch);
    return new Promise(resolve => this.enqueue(slot, "copy", async () => {
      try {
        const error = await this.prepare(slot, "copy", valid);
        if (error) { resolve({ success: false, error }); return; }
        const base = slot.committed?.revision ?? 0;
        const result = slot.isMemoryOnly ? { operationId, revision: base + 1, updatedAt: this.clock.now(), warning: undefined, choiceWarning: undefined }
          : await this.repository.commitCopy({ ...deepClone(payload), targetOwner: deepClone(slot.owner),
            targetDraftId: slot.draftId, expectedBaseRevision: base, operationId, editSequence: sequence,
            viewEpoch: epoch, commandEpoch: epoch, targetWorkingSnapshot: deepClone(targetWorkingSnapshot),
            validateEpoch: valid, isStillCurrent: valid });
        if (result.operationId !== operationId || result.revision !== base + 1) throw new Error("INVALID_COPY_ACKNOWLEDGEMENT");
        slot.committed = { revision: result.revision, draftId: slot.draftId, snapshot: deepClone(snapshot), updatedAt: result.updatedAt };
        this.acknowledge(slot, sequence, result.revision);
        this.preserveLater(slot, commandBranch, sequence, result.revision, snapshot, operationId, base);
        if (slot.retainedFailure?.operation.branchKey === commandBranch.branchKey &&
          slot.retainedFailure.operation.editSequence <= sequence) slot.retainedFailure = null;
        this.status(slot, this.ready(slot) ? slot.pendingCandidate ? "idle" : "saved" : "conflict");
        resolve({ success: true, revision: result.revision, warning: result.choiceWarning ?? result.warning });
      } catch (error) {
        this.status(slot, "error"); this.signal(slot, false);
        resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }));
  }

  public executeResetCommand(initialSnapshot: DraftSnapshot): Promise<{ success: boolean; newDraftId?: string; error?: string }> {
    const slot = this.slot(this.currentOwner, this.currentDraftId);
    const snapshot = deepClone(initialSnapshot), targetWorkingSnapshot = deepClone(slot.latestWorkingSnapshot);
    const commandBranch = this.captureCommandBranch(slot, snapshot);
    const epoch = this.currentViewEpoch, sequence = slot.nextEditSequence++, operationId = this.generateId();
    const newDraftId = this.generateId(), valid = this.guard(slot, epoch);
    return new Promise(resolve => this.enqueue(slot, "reset", async () => {
      try {
        if (this.retiredSlots.has(slot)) { resolve({ success: false, error: "ABORTED_AUTH_OR_TARGET_CHANGED" }); return; }
        // The idle Reset path reserves storage synchronously. Busy paths await actual saves.
        if (slot.activeOperation || slot.pendingCandidate) {
          const error = await this.prepare(slot, "reset", valid);
          if (error) { resolve({ success: false, error }); return; }
        } else {
          if (!valid()) { resolve({ success: false, error: "ABORTED_AUTH_OR_TARGET_CHANGED" }); return; }
          if (!this.ready(slot) || slot.retainedFailure) { resolve({ success: false, error: "DRAIN_FAILED" }); return; }
          this.committing.add(slot);
        }
        const base = slot.committed?.revision ?? 0;
        const result = slot.isMemoryOnly ? { operationId, revision: 1, draftId: newDraftId, updatedAt: this.clock.now() }
          : await this.repository.commitReset({ owner: deepClone(slot.owner), oldDraftId: slot.draftId,
            expectedOldDraftId: slot.draftId, expectedBaseRevision: base, newDraftId,
            initialSnapshot: deepClone(snapshot), operationId, editSequence: sequence, viewEpoch: epoch,
            commandEpoch: epoch, targetWorkingSnapshot: deepClone(targetWorkingSnapshot), validateEpoch: valid, isStillCurrent: valid });
        if (result.operationId !== operationId || result.draftId !== newDraftId || result.revision !== 1) throw new Error("INVALID_RESET_ACKNOWLEDGEMENT");
        const replacement = this.slot(slot.owner, newDraftId, slot.isMemoryOnly);
        this.readiness.set(replacement, "ready");
        replacement.committed = { revision: result.revision, draftId: newDraftId, snapshot: deepClone(snapshot), updatedAt: result.updatedAt };
        replacement.latestWorkingSnapshot = deepClone(snapshot);
        // Archive original identities before deriving any compatible transfer.
        // Other branches never become ready or acquire the replacement identity.
        const pending = commandBranch.operation ?? commandBranch.latestEdit;
        if (pending && pending.editSequence > sequence && !commandBranch.operation) commandBranch.operation = deepClone(pending);
        for (const branch of this.actionBranches.get(slot)?.values() ?? []) this.retainBranch(slot, branch);
        if (pending && pending.editSequence > sequence) {
          this.latestSequence.set(replacement, pending.editSequence);
          replacement.nextEditSequence = slot.nextEditSequence;
          const branch = this.branch(replacement);
          this.selectedBranches.set(replacement, branch);
          branch.snapshot = deepClone(pending.snapshot);
          replacement.latestWorkingSnapshot = deepClone(pending.snapshot);
          replacement.pendingCandidate = { operationId: this.generateId(), editSequence: pending.editSequence,
            branchKey: branch.branchKey, originRevision: pending.originRevision, originSnapshot: deepClone(pending.originSnapshot),
            commandParent: { operationId, kind: "reset", branchKey: commandBranch.branchKey,
              sourceDraftId: slot.draftId, sourceOperationId: pending.operationId, baseRevision: base, revision: result.revision },
            owner: deepClone(replacement.owner), ownerKey: replacement.ownerKey, draftId: newDraftId, createdAt: this.clock.now(),
            baseRevision: result.revision, parentSequence: null, viewEpoch: epoch,
            snapshot: deepClone(pending.snapshot), submittedAt: pending.createdAt };
          branch.operation = deepClone(replacement.pendingCandidate);
          branch.latestEdit = deepClone(replacement.pendingCandidate);
          // Only the exact transferred queue entry retires; its original remains archived.
          if (slot.pendingCandidate?.operationId === pending.operationId) slot.pendingCandidate = null;
        }
        this.cancel(slot);
        this.statuses.set(replacement, replacement.pendingCandidate ? "idle" : "saved");
        this.retiredSlots.add(slot);
        if (valid()) { this.currentDraftId = newDraftId; this.notifyView(); }
        if (replacement.pendingCandidate) void this.save(replacement);
        resolve({ success: true, newDraftId });
      } catch (error) {
        this.status(slot, "error"); this.signal(slot, false);
        resolve({ success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }));
  }

  /** An opaque action scope captures identity/base without exporting a second working-state owner. */
  public captureActionScope(): CapturedDraftAction | null {
    const slot = this.slot(this.currentOwner, this.currentDraftId);
    if (slot.owner.kind === "unassigned" || !slot.latestWorkingSnapshot) return null;
    const branch = this.selectedBranches.get(slot) ?? this.branch(slot);
    const lineage = branch.lineage;
    const epoch = this.currentViewEpoch;
    const capture = { revision: branch.operation?.baseRevision ?? branch.originRevision,
      snapshot: deepClone(branch.snapshot) };
    return {
      key: `${branch.branchKey}::${capture.revision}::${slot.nextEditSequence}`,
      lineageKey: `${this.key(slot.owner, slot.draftId)}::${lineage}`,
      owner: deepClone(slot.owner), draftId: slot.draftId,
      capturedRevision: capture.revision, capturedSnapshot: deepClone(capture.snapshot),
      apply: transform => {
        if (this.retiredSlots.has(slot)) return false;
        const sameLineage = (this.remoteLineage.get(slot) ?? 0) === lineage;
        const next = transform(deepClone(branch.snapshot));
        if (!next) return false;
        if (slot.owner.kind === "account" && next.studentProfile && next.studentProfile.id !== slot.owner.studentId) return false;
        // An old callback cannot silently turn remote content into its own ancestry.
        const selected = this.selectedBranches.get(slot);
        if (!sameLineage || (selected && selected !== branch && selected.operation)) {
          this.readiness.set(slot, "conflict");
          if (selected) this.retainBranch(slot, selected);
        }
        this.selectedBranches.set(slot, branch);
        const ownLineage = sameLineage && this.ready(slot);
        this.submitForSlot(slot, deepClone(next), epoch,
          ownLineage ? slot.committed?.revision ?? 0 : branch.operation?.baseRevision ?? branch.originRevision, ownLineage, capture);
        return true;
      },
    };
  }

  /** Stop adapter timers at teardown without erasing accepted private candidates. */
  public pauseScheduledSaves(): void { for (const slot of this.slots.values()) this.cancel(slot); }

  /** Invalidate command authority synchronously while session verification hides the view. */
  public invalidateView(): void { this.currentViewEpoch++; }

  /** Explicit retry uses the retained local base; remote reads never rebase it. */
  public retryFailedSave(): void {
    const slot = this.slot(this.currentOwner, this.currentDraftId);
    if (!slot.activeOperation && !slot.pendingCandidate && slot.retainedFailure && this.ready(slot) &&
      !slot.retainedFailure.error.message.includes("CONFLICT") && slot.latestWorkingSnapshot) {
      this.submitEdit(deepClone(slot.latestWorkingSnapshot));
    }
  }

  /** Owner-scoped adapter inspection; not an export/authentication grant. */
  public getOwnerSlot(owner: DraftOwner, memory?: boolean): Readonly<DraftSlotState> | undefined {
    const matching = [...this.slots.values()].filter(slot => !this.retiredSlots.has(slot) && ownerMatches(slot.owner, owner) && (memory === undefined || slot.isMemoryOnly === memory));
    const dirty = matching.find(slot => slot.pendingCandidate || slot.activeOperation || slot.activeCommand || slot.retainedFailure);
    const slot = dirty ?? matching[matching.length - 1];
    return slot ? deepClone(slot) : undefined;
  }

  /** External changes never advance a dirty candidate's base or replace its working snapshot. */
  public async acceptRemote(record: DraftRecord): Promise<boolean> {
    const slot = this.slot(record.owner, record.draftId);
    const prior = this.getOwnerSlot(record.owner);
    if (prior && (prior.pendingCandidate || prior.activeOperation || prior.activeCommand || prior.retainedFailure)) {
      const actual = this.slot(prior.owner, prior.draftId);
      if (prior.committed?.revision === record.revision && prior.draftId === record.draftId) return true;
      this.readiness.set(actual, "conflict"); this.status(actual, "conflict");
      if (actual.latestWorkingSnapshot && !actual.isMemoryOnly) {
        try { await this.repository.createRecovery(deepClone(actual.owner), deepClone(actual.latestWorkingSnapshot), "CONFLICT_REMOTE_CHANGE", actual.draftId); } catch { /* memory is authoritative */ }
      }
      return false;
    }
    if (slot.committed && (slot.committed.revision !== record.revision || JSON.stringify(slot.committed.snapshot) !== JSON.stringify(record.snapshot))) {
      this.remoteLineage.set(slot, (this.remoteLineage.get(slot) ?? 0) + 1);
    }
    slot.committed = { revision: record.revision, draftId: record.draftId, snapshot: deepClone(record.snapshot), updatedAt: record.updatedAt };
    slot.latestWorkingSnapshot = deepClone(record.snapshot); this.readiness.set(slot, "ready");
    this.selectedBranches.set(slot, this.branch(slot));
    this.status(slot, "saved");
    return true;
  }

  public getWorkingSnapshot(): DraftSnapshot | null { return this.getActiveView().workingSnapshot; }
  public getActiveView(): ActiveViewProjection {
    const slot = this.slot(this.currentOwner, this.currentDraftId);
    return { owner: deepClone(this.currentOwner), draftId: this.currentDraftId, viewEpoch: this.currentViewEpoch,
      status: this.statuses.get(slot) ?? "saved", workingSnapshot: deepClone(slot.latestWorkingSnapshot),
      committedRevision: slot.committed?.revision ?? 0, isMemoryOnly: slot.isMemoryOnly,
      hasRetainedFailure: !!slot.retainedFailure,
      hasPendingEdits: !!(slot.pendingCandidate || slot.activeOperation || slot.activeCommand) };
  }
}
