import { CV_STORE_KEY, DRAFTS_KEY_PREFIX } from "@/lib/cv-constants";
import {
  DraftRecord,
  DraftSnapshot,
  MigrationRecord,
  BackupRecord,
  validateDraftRecord,
} from "@/lib/draft-types";
import {
  sha256Hex,
  getSecureRuntimeId,
  generateOperationId,
  withDraftsLock,
  createLegacyBackupSync,
  executeTransactionSync,
  readDraftRecord,
  writeDraftRecordSync,
  resolvePendingTransactions,
} from "@/lib/draft-repository";
import {
  removeLegacySampleData,
  renameLegacyMainEducation,
  removeGuessedLinks,
  isLegacySampleProfile,
  isLegacySampleSlug,
  isLegacySampleRole,
  mergeIntraIntoCV,
  createEmptyCV,
} from "@/lib/intra/cv-from-intra";

function cleanLegacySnapshotCopy(persisted: any, version: number): DraftSnapshot {
  const empty = createEmptyCV();
  if (!persisted) {
    return { cvData: empty };
  }
  const next = { ...persisted };
  delete next.userGeminiKey;
  delete next.userGroqKey;
  let removed = false;

  if (next.cvData) {
    const result = removeLegacySampleData(renameLegacyMainEducation(next.cvData));
    const mergedCV = {
      ...empty,
      ...result.cv,
      contact: {
        ...empty.contact,
        ...(result.cv.contact || {}),
      },
      skills: {
        ...empty.skills,
        ...(result.cv.skills || {}),
      },
      projects: Array.isArray(result.cv.projects) ? result.cv.projects : empty.projects,
      education: Array.isArray(result.cv.education) ? result.cv.education : empty.education,
      experience: Array.isArray(result.cv.experience) ? result.cv.experience : empty.experience,
      coursework: Array.isArray(result.cv.coursework) ? result.cv.coursework : empty.coursework,
      extracurriculars: Array.isArray(result.cv.extracurriculars) ? result.cv.extracurriculars : empty.extracurriculars,
    };
    // Legacy schemas omitted presentation fields. Fill only absent structural
    // defaults; preserve user text/IDs and reject wrong types during validation.
    mergedCV.education = mergedCV.education.map((e: any) => ({ id: generateOperationId(), institution: "", program: "", startDate: "", isCurrent: false, state: mergedCV.educationState, ...e }));
    mergedCV.projects = mergedCV.projects.map((item: any) => ({ id: generateOperationId(), name: "", techStack: "", date: "", is42Project: false, bulletPoints: [], ...item }));
    mergedCV.experience = mergedCV.experience.map((e: any) => ({ id: generateOperationId(), company: "", role: "", location: "", startDate: "", endDate: "", isCurrent: false, bulletPoints: [], ...e }));
    mergedCV.coursework = mergedCV.coursework.map((c: any) => ({ id: generateOperationId(), title: "", date: "", ...c }));
    mergedCV.extracurriculars = mergedCV.extracurriculars.map((e: any) => ({ id: generateOperationId(), organization: "", role: "", startDate: "", isCurrent: false, bulletPoints: [], ...e }));
    next.cvData = mergedCV;
    removed = result.changed;
    next.showExperience = Boolean(mergedCV.showExperience);
    next.showExtracurriculars = Boolean(mergedCV.showExtracurriculars);
  } else {
    next.cvData = empty;
  }
  if (isLegacySampleProfile(next.studentProfile)) {
    next.studentProfile = null;
    removed = true;
  }
  if (next.cvData && next.studentProfile) {
    next.cvData = removeGuessedLinks(next.cvData, next.studentProfile.login);
    if (removed) {
      next.cvData = mergeIntraIntoCV(next.cvData, next.studentProfile);
      next.educationState = next.cvData.educationState;
    }
  }
  if (removed) next.selectedProjects = [];
  if (Array.isArray(next.selectedProjects)) {
    next.selectedProjects = next.selectedProjects.filter((p: any) => !isLegacySampleSlug(p?.slug));
  }
  if (Array.isArray(next.selectedCampusRoles)) {
    next.selectedCampusRoles = next.selectedCampusRoles.filter((r: string) => !isLegacySampleRole(r));
  }
  if (next.specializationTrack === "Advanced Software Architecture") next.specializationTrack = "";
  next.sampleDataRemovedNotice = removed;

  return next as DraftSnapshot;
}

export function parseLegacyDraftPayload(raw: string): { snapshot: DraftSnapshot; version: number } {
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object") {
    // Zustand persist envelope: { state: ..., version: ... }
    if ("state" in parsed && typeof parsed.state === "object") {
      const version = typeof parsed.version === "number" ? parsed.version : 0;
      return { snapshot: cleanLegacySnapshotCopy(parsed.state, version), version };
    }
    // Direct raw object envelope 0/1/2
    const version = typeof parsed.version === "number" ? parsed.version : 0;
    return { snapshot: cleanLegacySnapshotCopy(parsed, version), version };
  }
  return { snapshot: cleanLegacySnapshotCopy(parsed, 0), version: 0 };
}

export async function runMigrationBarrier(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{
  migrated: boolean;
  hash?: string;
  unassignedKey?: string;
  draft?: DraftRecord;
}> {
  const storage = typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : typeof globalThis !== "undefined" && (globalThis as any).localStorage
    ? (globalThis as any).localStorage
    : null;

  if (!storage) return { migrated: false };

  const raw = storage.getItem(CV_STORE_KEY);
  if (!raw || !raw.trim()) {
    return { migrated: false };
  }

  const hash = sha256Hex(raw);
  const migrationKey = `${DRAFTS_KEY_PREFIX}migration:${hash}`;
  const unassignedKey = `${DRAFTS_KEY_PREFIX}legacy:${hash}`;

  // Under Web Lock: exact raw read -> hash -> create/validate write-once backup -> readback verify -> release barrier -> convert COPY -> validate/journal/publish unassigned -> verify/mark complete
  return withDraftsLock(async () => {
    resolvePendingTransactions();
    // Re-verify under lock without recursive lock re-acquisition (avoids nested-lock deadlocks)
    const activeRaw = storage.getItem(CV_STORE_KEY);
    if (!activeRaw || !activeRaw.trim()) {
      return { migrated: false };
    }

    const activeHash = sha256Hex(activeRaw);
    const activeMigrationKey = `${DRAFTS_KEY_PREFIX}migration:${activeHash}`;
    const activeUnassignedKey = `${DRAFTS_KEY_PREFIX}legacy:${activeHash}`;

    // Fast check under lock
    const existingActive = storage.getItem(activeMigrationKey);
    if (existingActive) {
      try {
        const parsed = JSON.parse(existingActive) as MigrationRecord;
        if (parsed.migrationVersion === 1 && parsed.completedAt) {
          const draft = readDraftRecord(activeUnassignedKey);
          const backupBytes = storage.getItem(parsed.backupKey);
          if (draft && backupBytes) {
            const parsedBackup = JSON.parse(backupBytes) as BackupRecord;
            if (parsedBackup && parsedBackup.raw === activeRaw && sha256Hex(parsedBackup.raw) === activeHash) {
              return { migrated: false, hash: activeHash, unassignedKey: activeUnassignedKey, draft };
            }
          }
        }
      } catch {}
    }

    // 1. Create and validate write-once backup of raw bytes FIRST before any parsing!
    const backupRecord = createLegacyBackupSync(activeRaw, 0);
    if (!backupRecord || backupRecord.hash !== activeHash) {
      throw new Error("MIGRATION_BARRIER_FAILED: Backup verification failed. Barrier closed.");
    }

    const backupStorageKey = `${DRAFTS_KEY_PREFIX}backup:legacy:${activeHash}`;
    const durableBackupRaw = storage.getItem(backupStorageKey);
    if (!durableBackupRaw) {
      throw new Error("MIGRATION_BARRIER_FAILED: Backup missing from storage.");
    }
    const parsedDurable = JSON.parse(durableBackupRaw) as BackupRecord;
    if (!parsedDurable || parsedDurable.raw !== activeRaw || sha256Hex(parsedDurable.raw) !== activeHash) {
      throw new Error("MIGRATION_BARRIER_FAILED: Durable backup does not match raw legacy bytes.");
    }

    // 2. Parse legacy payload now that raw bytes are backed up
    const { snapshot, version } = parseLegacyDraftPayload(activeRaw);
    if (version !== 0 && backupRecord.version === 0) {
      backupRecord.version = version;
    }

    // 3. Convert COPY to DraftRecord (always unassigned, unique draftId)
    const draftRecord: DraftRecord = {
      schemaVersion: 1,
      draftId: generateOperationId(),
      owner: { kind: "unassigned" },
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      snapshotVersion: 1,
      snapshot,
      provenance: {
        migratedFrom: CV_STORE_KEY,
        source: "legacy",
        legacyFingerprint: `legacy:${activeHash}`,
      },
    };

    if (!validateDraftRecord(draftRecord, activeUnassignedKey)) {
      throw new Error("MIGRATION_CONVERTED_RECORD_INVALID");
    }

    // 4. Validate / journal / publish unassigned and mark migration complete
    const migrationRecord: MigrationRecord = {
      migrationVersion: 1,
      legacyHash: activeHash,
      backupKey: `${DRAFTS_KEY_PREFIX}backup:legacy:${activeHash}`,
      unassignedKey: activeUnassignedKey,
      completedAt: Date.now(),
    };

    // Destination is verified before publishing the separate completion marker.
    const existingBytes = storage.getItem(activeUnassignedKey);
    let verifiedDraft: DraftRecord | null = null;
    if (existingBytes !== null) {
      verifiedDraft = readDraftRecord(activeUnassignedKey);
      if (!verifiedDraft) throw new Error("MIGRATION_DESTINATION_INVALID");
    } else {
      writeDraftRecordSync(activeUnassignedKey, draftRecord);
      verifiedDraft = readDraftRecord(activeUnassignedKey);
    }
    if (!verifiedDraft) throw new Error("MIGRATION_PUBLISH_VERIFICATION_FAILED");
    const marker = JSON.stringify(migrationRecord);
    storage.setItem(activeMigrationKey, marker);
    if (storage.getItem(activeMigrationKey) !== marker) throw new Error("MIGRATION_MARKER_READBACK_FAILED");

    return {
      migrated: true,
      hash: activeHash,
      unassignedKey: activeUnassignedKey,
      draft: verifiedDraft,
    };
  }, options);
}
