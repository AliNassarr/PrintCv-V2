import type { CoordinatorRepositoryPort, ImmutableDraftOperation } from "./draft-coordinator";
import { deepClone } from "./draft-coordinator";
import {
  CV_STORE_KEY,
  DRAFTS_LOCK_NAME,
  DRAFTS_KEY_PREFIX,
  WORKSPACE_STORAGE_KEY,
  BROADCAST_CHANNEL_NAME,
} from "@/lib/cv-constants";
import {
  DraftOwner,
  DraftRecord,
  DraftSnapshot,
  BackupRecord,
  RecoveryRecord,
  TransactionJournal,
  MigrationRecord,
  ChoicesRecord,
  DraftProvenance,
  WorkspaceState,
  DraftBroadcastMessage,
  ownerToKey,
  keyToOwner,
  isValidStudentId,
  validateDraftRecord,
} from "@/lib/draft-types";

// Standard synchronous SHA-256 implementation
export function sha256Hex(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = "";
  const words: number[] = [];
  // Convert UTF-8 string to binary string
  const utf8 = unescape(encodeURIComponent(ascii));
  const asciiBitLength = utf8.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 300; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);
  let s = utf8 + "\x80";
  while ((s.length % 64) - 56) s += "\x00";
  for (i = 0; i < s.length; i++) {
    j = s.charCodeAt(i);
    words[i >> 2] = (words[i >> 2] || 0) | (j << (((3 - i) % 4) * 8));
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0;
      const w2 = w[i - 2] || 0;
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] =
          i < 16
            ? w[i] || 0
            : ((w[i - 16] || 0) + s0 + (w[i - 7] || 0) + s1) | 0);
      const temp2 =
        (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) +
        maj;
      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return result;
}

// Secure runtime identifier generator (one cached ID per tab/runtime)
let runtimeIdInstance: string | null = null;

export function getSecureRuntimeId(): string {
  if (runtimeIdInstance) return runtimeIdInstance;
  runtimeIdInstance = generateOperationId();
  return runtimeIdInstance;
}

export function resetRuntimeIdForTesting(id?: string): string {
  runtimeIdInstance = id || null;
  return id || getSecureRuntimeId();
}

/** Fresh unique ID generator for every operation/journal/recovery record */
export function generateOperationId(): string {
  const c = typeof crypto !== "undefined" ? crypto : (globalThis as any).crypto;
  if (c) {
    if (typeof c.randomUUID === "function") {
      return c.randomUUID();
    }
    if (typeof c.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  throw new Error("SECURE_CRYPTO_UNAVAILABLE: Secure random ID creation failed.");
}

export class LockAcquisitionError extends Error {
  code: "LOCK_UNAVAILABLE" | "LOCK_DENIED" | "LOCK_TIMEOUT";
  constructor(message: string, code: "LOCK_UNAVAILABLE" | "LOCK_DENIED" | "LOCK_TIMEOUT") {
    super(message);
    this.name = "LockAcquisitionError";
    this.code = code;
  }
}

// BroadcastChannel abstraction with fallback for Node/testing
type MessageHandler = (msg: DraftBroadcastMessage) => void;
const broadcastListeners = new Set<MessageHandler>();
let broadcastChannel: any = null;
let storageListenerRegistered = false;
const seenOperationIds = new Set<string>();

export function markAndCheckOperationSeen(opId: string | undefined): boolean {
  if (!opId) return false;
  if (seenOperationIds.has(opId)) return true;
  if (seenOperationIds.size > 200) {
    const first = seenOperationIds.values().next().value;
    if (first) seenOperationIds.delete(first);
  }
  seenOperationIds.add(opId);
  return false;
}

function initBroadcastChannel() {
  if (typeof window !== "undefined" && typeof (window as any).BroadcastChannel === "function") {
    if (!broadcastChannel) {
      try {
        broadcastChannel = new (window as any).BroadcastChannel(BROADCAST_CHANNEL_NAME);
        broadcastChannel.onmessage = (ev: MessageEvent) => {
          const data = ev.data as DraftBroadcastMessage;
          if (data && data.runtimeId !== getSecureRuntimeId()) {
            if (markAndCheckOperationSeen(data.operationId)) return;
            for (const listener of broadcastListeners) {
              try { listener(data); } catch (e) { console.error("Broadcast listener error:", e); }
            }
          }
        };
      } catch {}
    }
  }

  // Cross-tab fallback via storage event
  if (typeof window !== "undefined" && typeof window.addEventListener === "function" && !storageListenerRegistered) {
    storageListenerRegistered = true;
    try {
      window.addEventListener("storage", (ev: StorageEvent) => {
        if (ev.key === `${DRAFTS_KEY_PREFIX}broadcast_event` && ev.newValue) {
          try {
            const data = JSON.parse(ev.newValue) as DraftBroadcastMessage;
            if (data && data.runtimeId !== getSecureRuntimeId()) {
              if (markAndCheckOperationSeen(data.operationId)) return;
              for (const listener of broadcastListeners) {
                try { listener(data); } catch (e) { console.error("Broadcast listener error:", e); }
              }
            }
          } catch {}
        }
      });
    } catch {}
  }
}

export function subscribeBroadcastMessages(handler: MessageHandler): () => void {
  initBroadcastChannel();
  broadcastListeners.add(handler);
  return () => {
    broadcastListeners.delete(handler);
  };
}

export function broadcastDraftMessage(msg: Omit<DraftBroadcastMessage, "runtimeId"> & { memoryOnly?: boolean }): void {
  const fullMsg: DraftBroadcastMessage = {
    ...msg,
    runtimeId: getSecureRuntimeId(),
  };
  markAndCheckOperationSeen(fullMsg.operationId);
  initBroadcastChannel();
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(fullMsg);
    } catch {}
  }
  // NEVER write broadcast_event to localStorage for memory-only mode! (Finding 5)
  if (!msg.memoryOnly) {
    try {
      const storage = getStorage();
      if (storage) {
        storage.setItem(
          `${DRAFTS_KEY_PREFIX}broadcast_event`,
          JSON.stringify({ ...fullMsg, _nonce: generateOperationId() })
        );
      }
    } catch {}
  }
}

export async function withDraftsLock<T>(
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  const nav = typeof navigator !== "undefined" ? navigator : (globalThis as any).navigator;
  if (!nav || !nav.locks || typeof nav.locks.request !== "function") {
    throw new LockAcquisitionError("Web Locks API unavailable in this environment.", "LOCK_UNAVAILABLE");
  }

  const timeoutMs = options?.timeoutMs ?? 3500;
  let timedOut = false;
  let granted = false;
  let timer: any = null;
  const controller = new AbortController();

  if (options?.signal) {
    options.signal.addEventListener("abort", () => {
      controller.abort();
    });
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new LockAcquisitionError("Lock acquisition timed out.", "LOCK_TIMEOUT"));
    }, timeoutMs);
  });

  const lockPromise = nav.locks.request(
    DRAFTS_LOCK_NAME,
    { signal: controller.signal },
    async () => {
      if (timedOut) {
        throw new LockAcquisitionError("Late lock grant ignored after timeout.", "LOCK_TIMEOUT");
      }
      clearTimeout(timer);
      granted = true;
      return await fn();
    }
  ).catch((err: any) => {
    clearTimeout(timer);
    if (granted || err instanceof LockAcquisitionError) throw err;
    if (err?.name === "AbortError" && timedOut) {
      throw new LockAcquisitionError("Lock acquisition timed out.", "LOCK_TIMEOUT");
    }
    throw new LockAcquisitionError(err?.message || "Web Lock request denied.", "LOCK_DENIED");
  });

  return Promise.race([lockPromise, timeoutPromise]);
}

// Storage helpers
function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return null;
}

function getSessionStorage(): Storage | null {
  if (typeof window !== "undefined" && window.sessionStorage) return window.sessionStorage;
  if (typeof globalThis !== "undefined" && (globalThis as any).sessionStorage) return (globalThis as any).sessionStorage;
  return null;
}

export function readDraftRecord(key: string): DraftRecord | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try { const record: unknown = JSON.parse(raw); return validateDraftRecord(record, key) ? record : null; }
  catch { return null; }
}

export function writeDraftRecordSync(key: string, record: DraftRecord): void {
  const storage = getStorage();
  if (!storage) throw new Error("STORAGE_UNAVAILABLE");
  if (!validateDraftRecord(record, key)) throw new Error("INVALID_DRAFT_RECORD");
  const json = JSON.stringify(record);
  storage.setItem(key, json);
  const readback = storage.getItem(key);
  if (readback !== json) {
    throw new Error("DRAFT_WRITE_READBACK_FAILED");
  }
}

export function createLegacyBackupSync(raw: string, version: number): BackupRecord {
  const storage = getStorage();
  if (!storage) throw new Error("STORAGE_UNAVAILABLE");
  const hash = sha256Hex(raw);
  const backupKey = `${DRAFTS_KEY_PREFIX}backup:legacy:${hash}`;

  // Check if existing backup is present without triggering 'getItem before setItem' when absent
  let hasKey = false;
  try {
    if (typeof (storage as any).key === "function" && typeof storage.length === "number") {
      for (let i = 0; i < storage.length; i++) {
        if (storage.key(i) === backupKey) {
          hasKey = true;
          break;
        }
      }
    }
  } catch {}

  if (hasKey) {
    const existing = storage.getItem(backupKey);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as BackupRecord;
        if (parsed && typeof parsed === "object" && parsed.raw === raw && sha256Hex(parsed.raw) === hash) {
          return parsed;
        }
      } catch (e: any) {
        if (e?.message?.includes("WRITE_ONCE_BACKUP_MISMATCH")) throw e;
      }
      throw new Error("WRITE_ONCE_BACKUP_MISMATCH: Existing backup does not match legacy source raw bytes.");
    }
  }

  const backup: BackupRecord = {
    backupVersion: 1,
    raw,
    sourceKey: CV_STORE_KEY,
    version,
    timestamp: Date.now(),
    hash,
  };
  const json = JSON.stringify(backup);
  storage.setItem(backupKey, json);
  const readback = storage.getItem(backupKey);
  if (readback !== json) {
    throw new Error("WRITE_ONCE_BACKUP_READBACK_FAILED");
  }
  return backup;
}

export function createRecoveryRecordSync(
  sourceKey: string,
  owner: DraftOwner,
  reason: string,
  record?: DraftRecord,
  raw?: string
): string {
  const storage = getStorage();
  if (!storage) throw new Error("STORAGE_UNAVAILABLE");
  const uuid = generateOperationId();
  const recoveryKey = `${DRAFTS_KEY_PREFIX}recovery:${uuid}`;
  const payloadToHash = record ? JSON.stringify(record) : (raw || "");
  const hash = sha256Hex(payloadToHash);

  const recovery: RecoveryRecord = {
    recoveryVersion: 1,
    record,
    raw,
    sourceKey,
    owner,
    reason,
    timestamp: Date.now(),
    hash,
  };
  const json = JSON.stringify(recovery);
  storage.setItem(recoveryKey, json);
  const readback = storage.getItem(recoveryKey);
  if (readback !== json) {
    throw new Error("RECOVERY_WRITE_READBACK_FAILED");
  }
  return recoveryKey;
}

export function listRecoveryRecords(filterOwner?: DraftOwner): RecoveryRecord[] {
  const storage = getStorage();
  if (!storage) return [];
  const results: RecoveryRecord[] = [];
  const prefix = `${DRAFTS_KEY_PREFIX}recovery:`;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(prefix)) {
      try {
        const val = storage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val) as RecoveryRecord;
          if (parsed && parsed.recoveryVersion === 1) {
            if (!filterOwner) {
              results.push(parsed);
            } else if (filterOwner.kind === parsed.owner.kind) {
              if (filterOwner.kind === "account" && parsed.owner.kind === "account") {
                if (filterOwner.studentId === parsed.owner.studentId) results.push(parsed);
              } else {
                results.push(parsed);
              }
            }
          }
        }
      } catch {}
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp);
}

// Transaction Journal
export function executeTransactionSync(
  staged: { set?: Record<string, any>; remove?: string[] },
  expectedRevisions?: Record<string, number | null>
): void {
  const storage = getStorage();
  if (!storage) throw new Error("STORAGE_UNAVAILABLE");
  const txId = generateOperationId();
  const txKey = `${DRAFTS_KEY_PREFIX}transaction:${txId}`;

  // 1. Capture previous values for rollback
  const previousValues: Record<string, string | null> = {};
  if (staged.set) {
    for (const k of Object.keys(staged.set)) {
      previousValues[k] = storage.getItem(k);
    }
  }
  if (staged.remove) {
    for (const k of staged.remove) {
      previousValues[k] = storage.getItem(k);
    }
  }

  const journal: TransactionJournal = {
    journalVersion: 1,
    txId,
    state: "prepared",
    expectedRevisions: expectedRevisions || {},
    stagedRecords: staged.set || {},
    stagedRemovals: staged.remove || [],
    previousValues,
    timestamp: Date.now(),
  };

  // Stage journal
  storage.setItem(txKey, JSON.stringify(journal));

  // Perform writes under rollback protection
  try {
    if (staged.set) {
      for (const [k, v] of Object.entries(staged.set)) {
        const valStr = typeof v === "string" ? v : JSON.stringify(v);
        storage.setItem(k, valStr);
        if (storage.getItem(k) !== valStr) {
          throw new Error(`TRANSACTION_FAILED: readback mismatch for ${k}`);
        }
      }
    }
    if (staged.remove) {
      for (const k of staged.remove) {
        storage.removeItem(k);
      }
    }

    // All writes succeeded: mark committed before cleanup
    journal.state = "committed";
    storage.setItem(txKey, JSON.stringify(journal));
    storage.removeItem(txKey);
  } catch (err) {
    // Write failed mid-transaction: roll back partial writes immediately
    let rollbackFailed = false;
    for (const [k, prev] of Object.entries(previousValues)) {
      try {
        if (prev === null) {
          storage.removeItem(k);
        } else {
          storage.setItem(k, prev);
        }
      } catch {
        rollbackFailed = true;
      }
    }
    if (rollbackFailed) {
      // Retain failed journal in storage so crash recovery can retry!
      try {
        journal.state = "failed";
        storage.setItem(txKey, JSON.stringify(journal));
      } catch {}
      throw err;
    }
    try {
      storage.removeItem(txKey);
    } catch {}
    throw err;
  }
}

export function resolvePendingTransactions(): void {
  const storage = getStorage();
  if (!storage) throw new Error("STORAGE_UNAVAILABLE");
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
    .filter((key): key is string => !!key && key.startsWith(`${DRAFTS_KEY_PREFIX}transaction:`));
  for (const key of keys) {
    try {
      const raw = storage.getItem(key);
      const journal = raw && JSON.parse(raw) as TransactionJournal;
      if (!journal || journal.journalVersion !== 1 || !journal.previousValues ||
          !["prepared", "failed", "committed"].includes(journal.state)) throw new Error("INVALID_JOURNAL");
      const affected = new Set([...Object.keys(journal.stagedRecords || {}), ...(journal.stagedRemovals || [])]);
      const actions: Array<{ key: string; from: string | null; to: string | null }> = [];
      for (const target of affected) {
        if (!target.startsWith(DRAFTS_KEY_PREFIX) || !(target in journal.previousValues)) throw new Error("INVALID_JOURNAL_TARGET");
        const previous = journal.previousValues[target];
        const staged = (journal.stagedRemovals || []).includes(target) ? null
          : typeof journal.stagedRecords[target] === "string" ? journal.stagedRecords[target] as string
          : JSON.stringify(journal.stagedRecords[target]);
        if (previous !== null && typeof previous !== "string" || staged === undefined) throw new Error("INVALID_JOURNAL_BYTES");
        const current = storage.getItem(target);
        // Revision equality cannot distinguish an own partially staged write from
        // an independent replacement. Only the exact captured bytes can do so.
        if (current !== previous && current !== staged) throw new Error("JOURNAL_INDEPENDENT_CHANGE");
        const desired = journal.state === "committed" ? staged : previous;
        if (desired !== null && (keyToOwner(target) || target.startsWith(`${DRAFTS_KEY_PREFIX}legacy:`))) {
          let candidate: unknown;
          try { candidate = JSON.parse(desired); } catch { throw new Error("INVALID_JOURNAL_DRAFT"); }
          if (!validateDraftRecord(candidate, target)) throw new Error("INVALID_JOURNAL_DRAFT");
        }
        if (desired === null && /:(backup|recovery|legacy):/.test(target)) throw new Error("JOURNAL_PROTECTED_REMOVAL");
        actions.push({ key: target, from: current, to: desired });
      }
      for (const action of actions) {
        if (storage.getItem(action.key) !== action.from) throw new Error("JOURNAL_INDEPENDENT_CHANGE");
        if (action.to === null) storage.removeItem(action.key); else storage.setItem(action.key, action.to);
        if (storage.getItem(action.key) !== action.to) throw new Error("JOURNAL_READBACK_FAILED");
      }
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw new Error("JOURNAL_CLEANUP_FAILED");
    } catch (error) {
      // Never erase a corrupt, ambiguous or incompletely reconciled journal.
      throw new Error(`CRASH_RECOVERY_FAILED: ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Choices
export function getChoices(studentId: number): ChoicesRecord {
  const storage = getStorage();
  const defaultRecord: ChoicesRecord = { choiceVersion: 1, studentId, choices: {} };
  if (!storage || !isValidStudentId(studentId)) return defaultRecord;
  const key = `${DRAFTS_KEY_PREFIX}choices:42:${studentId}`;
  const raw = storage.getItem(key);
  if (!raw) return defaultRecord;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.choiceVersion === 1 && parsed.studentId === studentId && parsed.choices) {
      return parsed as ChoicesRecord;
    }
    return defaultRecord;
  } catch {
    return defaultRecord;
  }
}

export function recordChoice(studentId: number, sourceFingerprint: string, choice: "keep-separate" | "copied"): void {
  const storage = getStorage();
  if (!storage || !isValidStudentId(studentId)) return;
  const current = getChoices(studentId);
  current.choices[sourceFingerprint] = { choice, timestamp: Date.now() };
  const key = `${DRAFTS_KEY_PREFIX}choices:42:${studentId}`;
  const bytes = JSON.stringify(current);
  storage.setItem(key, bytes);
  if (storage.getItem(key) !== bytes) throw new Error("CHOICE_READBACK_FAILED");
}

// Workspace Session state
export function readWorkspaceState(): WorkspaceState | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  // Ignore/remove old tabId if present
  try {
    storage.removeItem("printcv_tab_id");
  } catch {}
  const raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.workspaceVersion === 1 && typeof parsed.mode === "string") {
      return parsed as WorkspaceState;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeWorkspaceState(state: WorkspaceState): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem("printcv_tab_id");
    storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function clearWorkspaceState(): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem("printcv_tab_id");
    storage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {}
}

// Namespace enumeration
export function listKnownDrafts(): {
  guest: DraftRecord | null;
  accounts: Record<number, DraftRecord>;
  legacy: Array<{ hash: string; draft: DraftRecord }>;
} {
  const storage = getStorage();
  const result: {
    guest: DraftRecord | null;
    accounts: Record<number, DraftRecord>;
    legacy: Array<{ hash: string; draft: DraftRecord }>;
  } = {
    guest: null,
    accounts: {},
    legacy: [],
  };
  if (!storage) return result;

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(DRAFTS_KEY_PREFIX)) continue;
    const sub = key.slice(DRAFTS_KEY_PREFIX.length);

    if (sub === "guest") {
      result.guest = readDraftRecord(key);
    } else if (sub.startsWith("account:42:")) {
      const idStr = sub.slice("account:42:".length);
      const id = parseInt(idStr, 10);
      if (isValidStudentId(id)) {
        const record = readDraftRecord(key);
        if (record) result.accounts[id] = record;
      }
    } else if (sub.startsWith("legacy:")) {
      const hash = sub.slice("legacy:".length);
      const record = readDraftRecord(key);
      if (record) result.legacy.push({ hash, draft: record });
    }
  }

  return result;
}

/** Strict reads used by every production mutation; corrupt bytes are not absence. */
export function readDraftRecordStrict(key: string): DraftRecord | null {
  const storage = getStorage();
  if (!storage) throw new Error("STORAGE_UNAVAILABLE");
  const raw = storage.getItem(key);
  if (raw === null) return null;
  let record: unknown;
  try { record = JSON.parse(raw); } catch { throw new Error("CORRUPT_DRAFT_RECORD"); }
  if (!validateDraftRecord(record, key)) throw new Error("CORRUPT_DRAFT_RECORD");
  return record;
}

/** Call only while holding DRAFTS_LOCK_NAME. */
function readLockedDraft(key: string): DraftRecord | null {
  try { return readDraftRecordStrict(key); }
  catch (error) {
    if (error instanceof Error && error.message === "CORRUPT_DRAFT_RECORD") {
      const raw = getStorage()?.getItem(key);
      if (raw !== null && raw !== undefined) createRecoveryRecordSync(key, keyToOwner(key) ?? { kind: "unassigned" }, "corrupt_record_preserved", undefined, raw);
    }
    throw error;
  }
}

function checkCAS(key: string, draftId: string, base: number): DraftRecord | null {
  const existing = readLockedDraft(key);
  if (!Number.isSafeInteger(base) || base < 0 ||
      (existing ? existing.draftId !== draftId || existing.revision !== base : base !== 0)) {
    throw new Error("CONFLICT_DRAFT_IDENTITY_OR_REVISION");
  }
  return existing;
}
function publish(record: DraftRecord): void {
  writeDraftRecordSync(ownerToKey(record.owner), record);
  broadcastDraftMessage({ operationId: generateOperationId(), type: "draft_updated",
    revision: record.revision, ownerKey: ownerToKey(record.owner), timestamp: Date.now() });
}
function backupReplacement(existing: DraftRecord | null, working: DraftSnapshot | null,
  owner: DraftOwner, draftId: string, reason: string): void {
  const key = ownerToKey(owner);
  if (existing) createRecoveryRecordSync(key, owner, reason, existing);
  if (working && (!existing || JSON.stringify(existing.snapshot) !== JSON.stringify(working))) {
    createRecoveryRecordSync(key, owner, `${reason}_working`, {
      schemaVersion: 1, snapshotVersion: 1, owner, draftId,
      revision: existing?.revision || 1, createdAt: Date.now(), updatedAt: Date.now(), snapshot: deepClone(working),
    });
  }
}
export function sourceFingerprint(record: DraftRecord): string {
  const source = record.provenance?.legacyFingerprint;
  if (record.owner.kind === "unassigned" && typeof source === "string") return source;
  if (record.owner.kind === "unassigned") {
    const legacy = listKnownDrafts().legacy.find(entry => entry.draft.draftId === record.draftId);
    if (legacy) return `legacy:${legacy.hash}`;
  }
  return record.draftId;
}

/** One production mutation boundary; all callbacks execute under the existing global lock. */
export function createCoordinatorRepository(): CoordinatorRepositoryPort {
  return {
    readDraft: async (owner, draftId) => withDraftsLock(async () => {
      resolvePendingTransactions();
      const record = readLockedDraft(ownerToKey(owner));
      if (record && draftId && record.draftId !== draftId) throw new Error("CONFLICT_DRAFT_IDENTITY");
      return deepClone(record);
    }),
    commitDraft: async op => withDraftsLock(async () => {
      resolvePendingTransactions();
      const key = ownerToKey(op.owner);
      if (op.ownerKey !== key || op.owner.kind === "unassigned") throw new Error("INVALID_OPERATION_OWNER");
      const existing = checkCAS(key, op.draftId, op.baseRevision);
      const record: DraftRecord = {
        ...existing, schemaVersion: 1, snapshotVersion: 1, draftId: op.draftId,
        owner: deepClone(op.owner), revision: op.baseRevision + 1,
        createdAt: existing?.createdAt ?? op.createdAt, updatedAt: Date.now(), snapshot: deepClone(op.snapshot),
      };
      publish(record);
      return { operationId: op.operationId, revision: record.revision, updatedAt: record.updatedAt };
    }),
    createRecovery: async (owner, snapshot, reason, draftId) => withDraftsLock(async () =>
      createRecoveryRecordSync(ownerToKey(owner), owner, reason, {
        schemaVersion: 1, snapshotVersion: 1, owner, draftId: draftId || generateOperationId(),
        revision: 1, createdAt: Date.now(), updatedAt: Date.now(), snapshot: deepClone(snapshot),
      })),
    commitCopy: async params => withDraftsLock(async () => {
      const valid = () => { if (!params.validateEpoch() || !params.isStillCurrent()) throw new Error("ABORTED_AUTH_OR_TARGET_CHANGED"); };
      valid(); resolvePendingTransactions(); valid();
      const key = ownerToKey(params.targetOwner);
      const current = readLockedDraft(key);
      const requestHash = sha256Hex(JSON.stringify({ source: params.sourceDraft, owner: params.targetOwner,
        draftId: params.targetDraftId, base: params.expectedBaseRevision, sequence: params.editSequence,
        epoch: params.viewEpoch, snapshot: params.targetWorkingSnapshot, role: params.targetRole,
        profile: params.studentProfile, choice: params.choicePreference }));
      const receipt = current?.copyReceipt;
      if (receipt?.operationId === params.operationId) {
        if (receipt.requestHash !== requestHash) throw new Error("CONFLICT_OPERATION_IDENTITY_REUSE");
        // The primary record itself is the durable receipt; ordinary saves retain it.
        let warning: string | undefined;
        try {
          valid();
          if (params.targetOwner.kind === "account") recordChoice(params.targetOwner.studentId, receipt.fingerprint, "copied");
        } catch (error) { warning = `PREFERENCE_FAILED: ${String(error)}`; }
        return { operationId: params.operationId, revision: receipt.revision, updatedAt: receipt.updatedAt, warning };
      }
      const existing = checkCAS(key, params.targetDraftId, params.expectedBaseRevision);
      if (!validateDraftRecord(params.sourceDraft)) throw new Error("INVALID_COPY_SOURCE");
      valid();
      backupReplacement(existing, params.targetWorkingSnapshot, params.targetOwner, params.targetDraftId, "replaced_by_copy");
      valid();
      const snapshot = { ...deepClone(params.sourceDraft.snapshot),
        targetRole: params.targetRole ?? params.sourceDraft.snapshot.targetRole,
        studentProfile: params.studentProfile === undefined ? params.sourceDraft.snapshot.studentProfile : deepClone(params.studentProfile) };
      snapshot.cvData.targetRole = snapshot.targetRole ?? snapshot.cvData.targetRole;
      const updatedAt = Date.now(), revision = params.expectedBaseRevision + 1;
      const fingerprint = params.choicePreference ?? sourceFingerprint(params.sourceDraft);
      const record: DraftRecord = { schemaVersion: 1, snapshotVersion: 1, owner: deepClone(params.targetOwner),
        draftId: params.targetDraftId, revision, createdAt: existing?.createdAt ?? updatedAt, updatedAt, snapshot,
        provenance: { ...params.sourceDraft.provenance, copiedFrom: { owner: deepClone(params.sourceDraft.owner), draftId: params.sourceDraft.draftId, timestamp: updatedAt } },
        copyReceipt: { operationId: params.operationId, revision, updatedAt, fingerprint, requestHash },
      };
      valid(); publish(record);
      let warning: string | undefined;
      try { valid(); if (params.targetOwner.kind === "account") recordChoice(params.targetOwner.studentId, fingerprint, "copied"); }
      catch (error) { warning = `PREFERENCE_FAILED: ${String(error)}`; }
      return { operationId: params.operationId, revision, updatedAt, warning };
    }),
    commitReset: async params => withDraftsLock(async () => {
      const valid = () => { if (!params.validateEpoch() || !params.isStillCurrent()) throw new Error("ABORTED_AUTH_OR_TARGET_CHANGED"); };
      valid(); resolvePendingTransactions(); valid();
      if (params.oldDraftId !== params.expectedOldDraftId || params.oldDraftId === params.newDraftId) throw new Error("INVALID_RESET_IDENTITY");
      const existing = checkCAS(ownerToKey(params.owner), params.expectedOldDraftId, params.expectedBaseRevision);
      backupReplacement(existing, params.targetWorkingSnapshot, params.owner, params.oldDraftId, "start_again");
      valid();
      const record: DraftRecord = { schemaVersion: 1, snapshotVersion: 1, owner: deepClone(params.owner),
        draftId: params.newDraftId, revision: 1, createdAt: Date.now(), updatedAt: Date.now(), snapshot: deepClone(params.initialSnapshot) };
      valid(); publish(record);
      return { operationId: params.operationId, draftId: record.draftId, revision: record.revision, updatedAt: record.updatedAt };
    }),
  };
}

/** Compatibility entrypoint; no debounce, pending ownership or journal is introduced here. */
export async function saveDraftRecord(owner: DraftOwner, draftId: string, baseRevision: number,
  snapshot: DraftSnapshot, provenance?: DraftProvenance,
  options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{ success: boolean; newRevision?: number; conflict?: boolean; error?: string }> {
  try {
    const op: ImmutableDraftOperation = { operationId: generateOperationId(), owner: deepClone(owner), ownerKey: ownerToKey(owner),
      draftId, baseRevision, editSequence: 1, viewEpoch: 0, snapshot: deepClone(snapshot), createdAt: Date.now() };
    const result = await createCoordinatorRepository().commitDraft(op);
    return { success: true, newRevision: result.revision };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, conflict: message.includes("CONFLICT"), error: message };
  }
}
