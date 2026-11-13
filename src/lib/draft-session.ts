import { ControllerState, AuthState, DraftOwner, DraftRecord, DraftSnapshot, DraftProvenance,
  OwnerBoundPendingWork, ownerToKey, ownerMatches, isValidIntraProfile } from "./draft-types";
import { createCoordinatorRepository, generateOperationId, getSecureRuntimeId, withDraftsLock,
  readDraftRecordStrict, readWorkspaceState, writeWorkspaceState, clearWorkspaceState,
  subscribeBroadcastMessages, broadcastDraftMessage, resolvePendingTransactions } from "./draft-repository";
import { DraftCoordinator, deepClone, ActiveViewProjection, CapturedDraftAction } from "./draft-coordinator";
import { runMigrationBarrier } from "./draft-migrations";
import { IntraProfile, createEmptyCV, createInitialCVFromIntra } from "./intra/cv-from-intra";
import { DRAFTS_KEY_PREFIX } from "./cv-constants";

export interface PreservedUnsavedWork extends OwnerBoundPendingWork { baseDraft?: DraftRecord | null }
export interface SessionControllerListener {
  onStateChange: (state: ControllerState) => void;
  onDraftChange?: (record: DraftRecord | null) => void;
  onSaveStatusChange?: (status: "saved" | "saving" | "error" | "conflict" | "memory") => void;
}

/** Session verification owns authority, never an independent write candidate or timer. */
export class DraftSessionController {
  private state: ControllerState = { state: "BOOTSTRAPPING" };
  private authState: AuthState = { status: "unknown" };
  private currentOwner: DraftOwner = { kind: "unassigned" };
  private currentDraft: DraftRecord | null = null; // detached rendering projection only
  private generation = 0;
  private listeners = new Set<SessionControllerListener>();
  private unsubscribeBroadcast: (() => void) | null;
  private destroyed = false;
  private memoryOnlyGuest = false;
  private broadcastReconciling = false;
  private readonly coordinator: DraftCoordinator;

  constructor() {
    globalSessionController = this;
    this.coordinator = new DraftCoordinator({ repository: createCoordinatorRepository(),
      generateId: generateOperationId, debounceMs: 300, onViewChange: view => this.project(view) }, { kind: "unassigned" }, "hidden");
    this.unsubscribeBroadcast = subscribeBroadcastMessages(msg => this.handleBroadcastMessage(msg));
  }
  private handleBroadcastMessage(msg: any): void {
      if (msg.runtimeId === getSecureRuntimeId() || this.destroyed) return;
      if (msg.type === "draft_updated" && msg.ownerKey === ownerToKey(this.currentOwner)) {
        if ((msg.revision ?? 0) > this.getCurrentRevision()) void this.reconcileActiveDraft();
      } else if ((msg.type === "logout" || msg.type === "owner_changed") && !this.broadcastReconciling) {
        this.broadcastReconciling = true;
        void this.reconcileSession().finally(() => { this.broadcastReconciling = false; });
      }
  }
  public getGeneration(): number { return this.generation; }
  public bumpGeneration(): number { this.coordinator.invalidateView(); return ++this.generation; }
  public getState(): ControllerState { return deepClone(this.state); }
  public getAuthState(): AuthState { return deepClone(this.authState); }
  public getCurrentOwner(): DraftOwner { return deepClone(this.currentOwner); }
  public getCurrentDraft(): DraftRecord | null { return deepClone(this.currentDraft); }
  public getCurrentRevision(): number { return this.currentDraft?.revision ?? 0; }
  public isMemoryOnlyGuest(): boolean { return this.memoryOnlyGuest; }
  public isLastSaveFailed(): boolean { return ["error", "conflict"].includes(this.coordinator.getActiveView().status); }
  public getTransitioningFromOwner(): DraftOwner | null { return this.coordinator.getActiveView().owner; }
  public getTransitioningFromDraft(): DraftRecord | null {
    const view = this.coordinator.getActiveView(); return this.recordFromView(view);
  }
  public subscribe(listener: SessionControllerListener): () => void {
    this.listeners.add(listener); listener.onStateChange(this.getState()); listener.onDraftChange?.(this.getCurrentDraft());
    return () => { this.listeners.delete(listener); };
  }
  private notifyState(state: ControllerState): void {
    this.state = state; for (const listener of this.listeners) listener.onStateChange(deepClone(state));
  }
  private notifyDraft(record: DraftRecord | null): void {
    this.currentDraft = deepClone(record);
    for (const listener of this.listeners) listener.onDraftChange?.(deepClone(record));
  }
  private notifySaveStatus(status: "saved" | "saving" | "error" | "conflict" | "memory"): void {
    for (const listener of this.listeners) listener.onSaveStatusChange?.(status);
  }
  private recordFromView(view: ActiveViewProjection): DraftRecord | null {
    if (!view.workingSnapshot) return null;
    const slot = this.coordinator.getSlot(view.owner, view.draftId);
    let disk: DraftRecord | null = null;
    if (!view.isMemoryOnly) { try { disk = readDraftRecordStrict(ownerToKey(view.owner)); } catch { /* retain local projection */ } }
    if (disk && (disk.draftId !== view.draftId || disk.revision !== view.committedRevision)) disk = null;
    return { ...disk, schemaVersion: 1, snapshotVersion: 1, owner: deepClone(view.owner), draftId: view.draftId,
      revision: view.committedRevision, createdAt: disk?.createdAt ?? slot?.committed?.updatedAt ?? Date.now(),
      updatedAt: slot?.committed?.updatedAt ?? Date.now(), snapshot: deepClone(view.workingSnapshot) };
  }
  private project(view = this.coordinator.getActiveView()): void {
    if (this.destroyed || !ownerMatches(view.owner, this.currentOwner) ||
      !["EDITING_ACCOUNT", "EDITING_GUEST", "RECOVERY_BLOCKED"].includes(this.state.state)) return;
    this.notifyDraft(this.recordFromView(view));
    this.notifySaveStatus(view.isMemoryOnly ? "memory" : view.status === "idle" ? "saving" : view.status);
  }
  private hide(to = "verifying"): void {
    const prior = ownerToKey(this.currentOwner);
    this.coordinator.invalidateView(); this.currentOwner = { kind: "unassigned" }; this.authState = { status: "unknown" };
    this.notifyDraft(null); this.notifyState({ state: "TRANSITIONING", from: prior, to });
  }
  private blocked(error: unknown): void {
    this.notifyState({ state: "RECOVERY_BLOCKED", message: error instanceof Error ? error.message : String(error) });
    this.project(); this.notifySaveStatus("error");
  }
  private assertNoJournal(): void {
    const storage = typeof localStorage !== "undefined" ? localStorage : null;
    if (!storage) throw new Error("STORAGE_UNAVAILABLE");
    for (let i = 0; i < storage.length; i++) {
      if (storage.key(i)?.startsWith(`${DRAFTS_KEY_PREFIX}transaction:`)) throw new Error("CRASH_RECOVERY_REQUIRED");
    }
  }
  public async bootstrap(): Promise<void> {
    this.notifyState({ state: "BOOTSTRAPPING" });
    try {
      getSecureRuntimeId();
      await withDraftsLock(async () => { resolvePendingTransactions(); });
      await runMigrationBarrier();
    } catch (error) { this.blocked(error); return; }
    await this.reconcileSession();
  }
  public async reconcileSession(locksSupported = true): Promise<void> {
    const previous = this.coordinator.getActiveView();
    const wasMemory = this.memoryOnlyGuest && previous.owner.kind === "guest";
    const token = ++this.generation;
    this.hide();
    // Auth GET is never skipped or delayed indefinitely behind a failed/held save.
    const drained = this.coordinator.drain(previous.owner, previous.draftId);
    let body: any;
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not verify login session.");
      body = await response.json();
    } catch (error) {
      if (this.generation === token) this.notifyState({ state: "SESSION_UNKNOWN", message: "Could not verify login session. Please check your connection." });
      return;
    }
    if (this.generation !== token || this.destroyed) return;
    if (body.authenticated) {
      if (!isValidIntraProfile(body.user)) { this.notifyState({ state: "SESSION_UNKNOWN", message: "Invalid session profile." }); return; }
      this.authState = { status: "authenticated", user: deepClone(body.user) };
      if (!locksSupported) { this.blocked(new Error("Web Locks unavailable. Persistent editing is disabled.")); return; }
      await this.activateAccountOwner(body.user, !!body.fresh);
    } else {
      this.authState = { status: "unauthenticated" };
      if (wasMemory) await this.activateGuestOwner(true);
      else if (previous.owner.kind === "guest" || readWorkspaceState()?.mode === "guest") await this.activateGuestOwner(false);
      else { this.memoryOnlyGuest = false; clearWorkspaceState(); this.notifyState({ state: "WELCOME" }); }
    }
    // Await only this completed verification's own owner drain. Another owner's
    // held write must not block the newly verified account from becoming active.
    if (ownerMatches(previous.owner, this.currentOwner)) {
      const okay = await drained;
      if (this.generation === token + 1 && !okay && this.isLastSaveFailed() && ownerMatches(previous.owner, this.currentOwner)) {
        this.blocked(new Error("Could not save pending edits. Local changes remain in memory."));
      }
    }
  }

  private async activate(owner: DraftOwner, snapshot: DraftSnapshot, memory: boolean): Promise<void> {
    const token = ++this.generation;
    this.coordinator.invalidateView();
    const oldKey = ownerToKey(this.currentOwner);
    this.currentOwner = { kind: "unassigned" }; this.notifyDraft(null);
    this.notifyState({ state: "TRANSITIONING", from: oldKey, to: ownerToKey(owner) });
    try {
      if (!memory) this.assertNoJournal();
      const known = this.coordinator.getOwnerSlot(owner, memory);
      let disk: DraftRecord | null = null;
      if (!memory) {
        try { disk = readDraftRecordStrict(ownerToKey(owner)); }
        catch (error) {
          // Corrupt hydration must preserve raw bytes through the locked repository boundary.
          if (error instanceof Error && error.message === "CORRUPT_DRAFT_RECORD") await createCoordinatorRepository().readDraft(owner);
          throw error;
        }
      }
      const hasWork = !!(known?.activeOperation || known?.pendingCandidate || known?.retainedFailure);
      const draftId = hasWork ? known!.draftId : disk?.draftId ?? (memory ? known?.draftId : undefined) ?? generateOperationId();
      if (disk && !hasWork) await this.coordinator.acceptRemote(disk);
      if (this.generation !== token) return;
      await this.coordinator.switchView(owner, draftId, memory);
      if (this.generation !== token) return;
      // Revalidate the port readiness before enabling a persistent editor.
      if (!memory && ["error", "conflict"].includes(this.coordinator.getActiveView().status) && !hasWork) {
        throw new Error("Persistent draft is not ready.");
      }
      if (!this.coordinator.getWorkingSnapshot()) {
        this.coordinator.submitEdit(deepClone(snapshot));
        if (!await this.coordinator.drain(owner, draftId)) throw new Error("Could not initialize persistent draft.");
      }
      if (this.generation !== token) return;
      this.currentOwner = deepClone(owner); this.memoryOnlyGuest = memory;
      this.notifyState(owner.kind === "account" ? { state: "EDITING_ACCOUNT", studentId: owner.studentId }
        : { state: "EDITING_GUEST", memoryOnly: memory });
      this.project();
      if (!memory) writeWorkspaceState({ workspaceVersion: 1, mode: owner.kind === "account" ? "account" : "guest", activeKey: ownerToKey(owner) });
      if (hasWork) {
        this.coordinator.retryFailedSave();
        const okay = await this.coordinator.drain(owner, draftId);
        if (this.generation === token && !okay) this.blocked(new Error("Local changes remain unsaved; download your draft before closing this tab."));
      }
      if (!this.broadcastReconciling && !memory && oldKey !== ownerToKey(owner)) {
        broadcastDraftMessage({ operationId: generateOperationId(), type: "owner_changed", ownerKey: ownerToKey(owner), timestamp: Date.now() });
      }
    } catch (error) {
      if (this.generation === token) {
        const view = this.coordinator.getActiveView();
        if (ownerMatches(view.owner, owner) && view.workingSnapshot) this.currentOwner = deepClone(owner);
        this.blocked(error);
      }
    }
  }
  public async activateGuestOwner(memory = false, initialSnapshotOverride?: DraftSnapshot | null): Promise<void> {
    this.authState = { status: "unauthenticated" };
    await this.activate({ kind: "guest" }, initialSnapshotOverride ?? { cvData: createEmptyCV() }, memory);
  }
  public async activateAccountOwner(user: IntraProfile, fresh: boolean, priorKey?: string): Promise<void> {
    if (!isValidIntraProfile(user)) { this.notifyState({ state: "SESSION_UNKNOWN", message: "Invalid account profile." }); return; }
    const safe: IntraProfile = { ...user, displayname: user.displayname || user.login,
      email: user.email || "", image: user.image || "", campusName: user.campusName || "", campusId: user.campusId || 0,
      level: typeof user.level === "number" ? user.level : 0, grade: user.grade || "", poolMonth: user.poolMonth || "",
      poolYear: user.poolYear ?? null, coalition: user.coalition || "", beginAt: user.beginAt || "",
      validatedProjects: Array.isArray(user.validatedProjects) ? user.validatedProjects : [] };
    this.authState = { status: "authenticated", user: deepClone(safe) };
    this.memoryOnlyGuest = false;
    await this.activate({ kind: "account", provider: "42", studentId: user.id },
      { studentProfile: safe, cvData: createInitialCVFromIntra(safe), currentStep: "SETUP" }, false);
  }

  public captureActionScope(): (CapturedDraftAction & { canProject(): boolean }) | null {
    if (!["EDITING_ACCOUNT", "EDITING_GUEST", "TRANSITIONING", "RECOVERY_BLOCKED"].includes(this.state.state)) return null;
    const scope = this.coordinator.captureActionScope();
    if (!scope) return null;
    return { ...scope, canProject: () => !this.destroyed && ownerMatches(scope.owner, this.currentOwner) &&
      this.currentDraft?.draftId === scope.draftId && ["EDITING_ACCOUNT", "EDITING_GUEST"].includes(this.state.state) };
  }

  public submitSnapshot(snapshot: DraftSnapshot): void {
    if (!["EDITING_ACCOUNT", "EDITING_GUEST", "TRANSITIONING", "RECOVERY_BLOCKED"].includes(this.state.state)) return;
    const view = this.coordinator.getActiveView();
    if (view.owner.kind === "unassigned") return;
    // Hidden async mutations remain bound to the exact old coordinator slot.
    if (view.owner.kind === "account" && snapshot.studentProfile && snapshot.studentProfile.id !== view.owner.studentId) return;
    this.coordinator.submitEdit(deepClone(snapshot));
  }
  public async saveCurrentSnapshot(snapshot: DraftSnapshot, provenance?: DraftProvenance, expectedRevision?: number): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
    if (!this.currentDraft) return { success: false, error: "No verified active draft." };
    if (expectedRevision !== undefined && expectedRevision !== this.getCurrentRevision()) return { success: false, conflict: true, error: "CONFLICT_STALE_BASE" };
    this.submitSnapshot(snapshot);
    const success = await this.coordinator.drainEdits();
    return { success, conflict: this.coordinator.getActiveView().status === "conflict", error: success ? undefined : "DRAFT_SAVE_FAILED" };
  }
  public drainPendingSave(): Promise<boolean> { return this.coordinator.drainEdits(); }
  public flush(): Promise<boolean> { return this.coordinator.drain(); }
  public capturePendingWork(): OwnerBoundPendingWork | null {
    const view = this.coordinator.getActiveView();
    const slot = this.coordinator.getSlot(view.owner, view.draftId);
    if (!slot?.latestWorkingSnapshot || !(slot.pendingCandidate || slot.activeOperation || slot.retainedFailure)) return null;
    return { owner: deepClone(slot.owner), snapshot: deepClone(slot.latestWorkingSnapshot), baseDraftId: slot.draftId,
      baseRevision: slot.pendingCandidate?.baseRevision ?? slot.retainedFailure?.operation.baseRevision ?? slot.activeOperation?.baseRevision ?? slot.committed?.revision ?? 0,
      generation: this.generation, timestamp: Date.now() };
  }
  public captureUnsavedSnapshot(): DraftSnapshot | null { return this.capturePendingWork()?.snapshot ?? null; }
  public getPreservedUnsavedWork(owner: DraftOwner): PreservedUnsavedWork | null {
    const slot = this.coordinator.getOwnerSlot(owner);
    if (!slot?.latestWorkingSnapshot || !(slot.pendingCandidate || slot.activeOperation || slot.retainedFailure)) return null;
    return { owner: deepClone(owner), snapshot: deepClone(slot.latestWorkingSnapshot), baseDraftId: slot.draftId,
      baseRevision: slot.pendingCandidate?.baseRevision ?? slot.retainedFailure?.operation.baseRevision ?? slot.activeOperation?.baseRevision ?? slot.committed?.revision ?? 0,
      timestamp: Date.now() };
  }
  public getPreservedBranches(owner: DraftOwner) { return this.coordinator.getPreservedBranches(owner); }
  // Legacy registrations are intentionally inert: no store/extractor may own an alternate lifecycle.
  public clearPreservedUnsavedWork(owner: DraftOwner): void { /* only exact acknowledgement retires work */ }
  public registerSnapshotExtractor(fn: () => DraftSnapshot | null): () => void { return () => {}; }
  public registerPendingWorkExtractor(fn: () => OwnerBoundPendingWork | null): () => void { return () => {}; }
  public registerClearPendingWorkHandler(fn: () => void): () => void { return () => {}; }
  public registerFlushHandler(fn: () => Promise<boolean>): () => void { return () => {}; }
  public clearPendingWork(): void { /* cancellation cannot erase accepted edits */ }

  public async reconcileActiveDraft(): Promise<void> {
    const owner = deepClone(this.currentOwner), token = this.generation;
    if (owner.kind === "unassigned" || this.memoryOnlyGuest) return;
    try {
      const record = await createCoordinatorRepository().readDraft(owner);
      if (token !== this.generation || !ownerMatches(owner, this.currentOwner)) return;
      if (record) {
        const accepted = await this.coordinator.acceptRemote(record);
        if (accepted) await this.coordinator.switchView(owner, record.draftId);
        this.project();
      }
    } catch (error) { if (token === this.generation) this.blocked(error); }
  }
  public executeCopy(sourceDraft: DraftRecord, fingerprint?: string) {
    const view = this.coordinator.getActiveView();
    const auth = this.authState;
    if (!this.currentDraft || !ownerMatches(view.owner, this.currentOwner) ||
        view.owner.kind === "account" && (auth.status !== "authenticated" || auth.user.id !== view.owner.studentId)) {
      return Promise.resolve({ success: false, error: "ABORTED_AUTH_OR_TARGET_CHANGED", warning: undefined });
    }
    return this.coordinator.executeCopyCommand({ sourceDraft: deepClone(sourceDraft),
      targetRole: view.workingSnapshot?.targetRole ?? view.workingSnapshot?.cvData.targetRole ?? "",
      studentProfile: view.owner.kind === "account" && auth.status === "authenticated" ? deepClone(auth.user) : null,
      choicePreference: fingerprint });
  }
  public async resetDraft(): Promise<{ success: boolean; error?: string }> {
    if (!["EDITING_ACCOUNT", "EDITING_GUEST"].includes(this.state.state)) return { success: false, error: "No verified active draft." };
    const profile = this.currentOwner.kind === "account" && this.authState.status === "authenticated" ? this.authState.user : null;
    const result = await this.coordinator.executeResetCommand({ cvData: createEmptyCV(), studentProfile: profile });
    if (result.success) this.project();
    return result;
  }
  public async logout(): Promise<{ success: boolean; error?: string }> {
    const owner = deepClone(this.currentOwner), draftId = this.currentDraft?.draftId;
    const requestingGeneration = this.generation, auth = deepClone(this.authState);
    const stillRequested = () => !this.destroyed && this.generation === requestingGeneration &&
      ownerMatches(owner, this.currentOwner) && this.currentDraft?.draftId === draftId &&
      this.authState.status === auth.status && (auth.status !== "authenticated" ||
        this.authState.status === "authenticated" && this.authState.user.id === auth.user.id);
    if (!draftId || !stillRequested()) return { success: false, error: "Session changed." };
    const flushed = await this.coordinator.drain(owner, draftId);
    if (!stillRequested()) return { success: false, error: "Session changed." };
    if (!flushed) return { success: false, error: "Could not save pending edits before logout." };
    const token = ++this.generation; this.hide("logout"); this.notifyState({ state: "LOGOUT_PENDING" });
    if (this.generation !== token || this.destroyed) return { success: false, error: "Session changed." };
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (token !== this.generation || this.destroyed) return { success: false, error: "Session changed." };
      const body = response.ok && await response.json();
      if (token !== this.generation || this.destroyed) return { success: false, error: "Session changed." };
      if (body?.success === true) { this.authState = { status: "unauthenticated" }; this.memoryOnlyGuest = false;
        clearWorkspaceState(); this.notifyState({ state: "WELCOME", notice: "You have been logged out." });
        broadcastDraftMessage({ operationId: generateOperationId(), type: "logout", timestamp: Date.now() });
        return { success: true }; }
    } catch { /* Verify the actual session below, never fabricate successful logout. */ }
    if (token === this.generation && !this.destroyed) await this.reconcileSession();
    return { success: false, error: "Could not confirm logout with the server." };
  }
  public handleSessionExpiry(): void {
    this.bumpGeneration(); this.hide(); clearWorkspaceState(); this.authState = { status: "unauthenticated" };
    this.notifyState({ state: "WELCOME", notice: "Your session expired. Please log in again." });
  }
  public reviewSource(sourceKey: string, returnTo: "WELCOME" | "EDITING_GUEST" | "EDITING_ACCOUNT"): void { this.notifyState({ state: "REVIEWING_SOURCE", sourceKey, returnTo }); }
  public cancelReview(returnTo: "WELCOME" | "EDITING_GUEST" | "EDITING_ACCOUNT"): void {
    if (returnTo === "WELCOME") this.notifyState({ state: "WELCOME" });
    else if (returnTo === "EDITING_GUEST") this.notifyState({ state: "EDITING_GUEST", memoryOnly: this.memoryOnlyGuest });
    else if (this.currentOwner.kind === "account") this.notifyState({ state: "EDITING_ACCOUNT", studentId: this.currentOwner.studentId });
  }
  public destroy(): void { this.destroyed = true; this.coordinator.pauseScheduledSaves(); this.coordinator.invalidateView(); this.unsubscribeBroadcast?.(); this.unsubscribeBroadcast = null; this.listeners.clear(); }
}
let globalSessionController: DraftSessionController | null = null;
export function getSessionController(): DraftSessionController { return globalSessionController ?? new DraftSessionController(); }
export function resetSessionControllerForTesting(): void { globalSessionController?.destroy(); globalSessionController = null; }
