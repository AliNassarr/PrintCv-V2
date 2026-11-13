import type { CVData, EducationState } from "@/types/resume";
import type { IntraProfile } from "@/lib/intra/cv-from-intra";
import type { HelperAnswers } from "@/lib/bullet-helper";
import { DRAFTS_KEY_PREFIX } from "@/lib/cv-constants";

export type StyleDensity = "standard" | "compact";

export type GuestOwner = { kind: "guest" };
export type AccountOwner = { kind: "account"; provider: "42"; studentId: number };
export type UnassignedOwner = { kind: "unassigned" };
export type DraftOwner = GuestOwner | AccountOwner | UnassignedOwner;

export function isValidStudentId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

export function isValidIntraProfile(user: unknown): user is IntraProfile {
  if (!user || typeof user !== "object") return false;
  const p = user as any;
  if (!isValidStudentId(p.id) || typeof p.login !== "string" || !p.login.trim()) return false;
  for (const field of ["email", "displayname", "image", "campusName", "grade", "poolMonth", "coalition", "beginAt"]) {
    if (p[field] !== undefined && typeof p[field] !== "string") return false;
  }
  for (const field of ["campusId", "level", "poolYear"]) {
    if (p[field] !== undefined && !(field === "poolYear" && p[field] === null) &&
      (typeof p[field] !== "number" || !Number.isFinite(p[field]))) return false;
  }
  if (p.validatedProjects !== undefined) {
    if (!Array.isArray(p.validatedProjects)) return false;
    for (const project of p.validatedProjects) {
      if (!project || typeof project !== "object" || Array.isArray(project) || typeof project.name !== "string" || typeof project.slug !== "string") return false;
      for (const field of ["markedAt", "date"]) if (project[field] !== undefined && typeof project[field] !== "string") return false;
      if (project.id !== undefined && !Number.isSafeInteger(project.id)) return false;
      if (project.validated !== undefined && typeof project.validated !== "boolean") return false;
      if (project.finalMark !== undefined && project.finalMark !== null && (typeof project.finalMark !== "number" || !Number.isFinite(project.finalMark))) return false;
    }
  }
  return true;
}

export function isAccountOwner(owner: DraftOwner): owner is AccountOwner {
  return owner.kind === "account";
}

export function isGuestOwner(owner: DraftOwner): owner is GuestOwner {
  return owner.kind === "guest";
}

export function isUnassignedOwner(owner: DraftOwner): owner is UnassignedOwner {
  return owner.kind === "unassigned";
}

export function ownerMatches(a: DraftOwner | null | undefined, b: DraftOwner | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.kind === "guest" && b.kind === "guest") return true;
  if (a.kind === "unassigned" && b.kind === "unassigned") return true;
  if (a.kind === "account" && b.kind === "account") {
    return a.provider === b.provider && a.studentId === b.studentId;
  }
  return false;
}

export function ownerToKey(owner: DraftOwner): string {
  if (owner.kind === "guest") return `${DRAFTS_KEY_PREFIX}guest`;
  if (owner.kind === "unassigned") return `${DRAFTS_KEY_PREFIX}unassigned`;
  return `${DRAFTS_KEY_PREFIX}account:${owner.provider}:${owner.studentId}`;
}

export function keyToOwner(key: string): DraftOwner | null {
  if (!key.startsWith(DRAFTS_KEY_PREFIX)) return null;
  const sub = key.slice(DRAFTS_KEY_PREFIX.length);
  if (sub === "guest") return { kind: "guest" };
  if (sub === "unassigned") return { kind: "unassigned" };
  const match = /^account:(42):(\d+)$/.exec(sub);
  if (match) {
    const id = parseInt(match[2], 10);
    if (isValidStudentId(id)) {
      return { kind: "account", provider: "42", studentId: id };
    }
  }
  return null;
}

export function validateDraftRecord(record: unknown, expectedKey?: string): record is DraftRecord {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const r = record as any;
  if (r.schemaVersion !== 1 || typeof r.draftId !== "string" || !r.draftId) return false;
  if (!r.owner || typeof r.owner !== "object" || typeof r.owner.kind !== "string") return false;

  if (r.owner.kind === "account") {
    if (r.owner.provider !== "42" || !isValidStudentId(r.owner.studentId)) return false;
  } else if (r.owner.kind !== "guest" && r.owner.kind !== "unassigned") {
    return false;
  }

  if (expectedKey) {
    if (expectedKey.startsWith(`${DRAFTS_KEY_PREFIX}legacy:`)) {
      if (r.owner.kind !== "unassigned") return false;
    } else if (expectedKey === `${DRAFTS_KEY_PREFIX}guest`) {
      if (r.owner.kind !== "guest") return false;
    } else if (expectedKey.startsWith(`${DRAFTS_KEY_PREFIX}account:`)) {
      if (ownerToKey(r.owner) !== expectedKey) return false;
    } else if (ownerToKey(r.owner) !== expectedKey) {
      return false;
    }
  }

  if (typeof r.revision !== "number" || !Number.isSafeInteger(r.revision) || r.revision < 1) return false;
  if (typeof r.createdAt !== "number" || typeof r.updatedAt !== "number") return false;
  if (r.snapshotVersion !== 1 || !r.snapshot || typeof r.snapshot !== "object" || Array.isArray(r.snapshot)) return false;

  const snap = r.snapshot;
  if (!snap.cvData || typeof snap.cvData !== "object" || Array.isArray(snap.cvData)) return false;

  const cv = snap.cvData;
  if (!cv.contact || typeof cv.contact !== "object" || Array.isArray(cv.contact)) return false;
  if (cv.contact.fullName !== undefined && typeof cv.contact.fullName !== "string") {
    return false;
  }
  if (cv.contact.email !== undefined && typeof cv.contact.email !== "string") {
    return false;
  }
  if (cv.contact.phoneNumber !== undefined && typeof cv.contact.phoneNumber !== "string") {
    return false;
  }
  if (cv.contact.githubUrl !== undefined && typeof cv.contact.githubUrl !== "string") {
    return false;
  }
  if (cv.contact.linkedinUrl !== undefined && typeof cv.contact.linkedinUrl !== "string") {
    return false;
  }
  if ((cv.contact as any).location !== undefined && typeof (cv.contact as any).location !== "string") {
    return false;
  }

  if (!Array.isArray(cv.projects)) return false;
  for (const p of cv.projects) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return false;
    if (p.bulletPoints !== undefined) {
      if (!Array.isArray(p.bulletPoints) || !p.bulletPoints.every((b: any) => typeof b === "string")) {
        return false;
      }
    }
    if (p.name !== undefined && typeof p.name !== "string") return false;
    if (p.slug !== undefined && typeof p.slug !== "string") return false;
  }

  if (!Array.isArray(cv.education)) return false;
  for (const edu of cv.education) {
    if (!edu || typeof edu !== "object" || Array.isArray(edu)) return false;
  }

  if (!Array.isArray(cv.experience)) return false;
  for (const exp of cv.experience) {
    if (!exp || typeof exp !== "object" || Array.isArray(exp)) return false;
    if (exp.bulletPoints !== undefined) {
      if (!Array.isArray(exp.bulletPoints) || !exp.bulletPoints.every((b: any) => typeof b === "string")) {
        return false;
      }
    }
  }

  if (!cv.skills || typeof cv.skills !== "object" || Array.isArray(cv.skills)) return false;
  if (
    !Array.isArray(cv.skills.languages) ||
    !cv.skills.languages.every((s: any) => typeof s === "string") ||
    !Array.isArray(cv.skills.developerTools) ||
    !cv.skills.developerTools.every((s: any) => typeof s === "string") ||
    !Array.isArray(cv.skills.technologiesFrameworks) ||
    !cv.skills.technologiesFrameworks.every((s: any) => typeof s === "string") ||
    !Array.isArray(cv.skills.projectManagementTools) ||
    !cv.skills.projectManagementTools.every((s: any) => typeof s === "string")
  ) {
    return false;
  }

  if (!Array.isArray(cv.coursework)) return false;
  for (const cw of cv.coursework) {
    if (!cw || typeof cw !== "object" || Array.isArray(cw)) return false;
  }

  if (!Array.isArray(cv.extracurriculars)) return false;
  for (const ex of cv.extracurriculars) {
    if (!ex || typeof ex !== "object" || Array.isArray(ex)) return false;
    if (ex.bulletPoints !== undefined) {
      if (!Array.isArray(ex.bulletPoints) || !ex.bulletPoints.every((b: any) => typeof b === "string")) {
        return false;
      }
    }
  }

  // Validate the fields actually consumed by CVSheet, inline editors and exports.
  const object = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
  const strings = (v: any, names: string[], optional: string[] = []) => object(v) &&
    names.every(k => typeof v[k] === "string") && optional.every(k => v[k] === undefined || typeof v[k] === "string");
  const bullets = (v: any) => Array.isArray(v) && v.every(x => typeof x === "string");
  const level = (v: any) => v === undefined || typeof v === "string" || typeof v === "number" && Number.isFinite(v);
  const educationStates = ["STATE_A_CORE", "STATE_B_SPECIALIZATION", "STATE_C_ALUMNUS"];
  if (!strings(cv.contact, ["fullName", "email", "phoneNumber", "githubUrl", "linkedinUrl"], ["location"]) || !level(cv.contact.level)) return false;
  if (typeof cv.targetRole !== "string" || !educationStates.includes(cv.educationState) || typeof cv.showExperience !== "boolean") return false;
  if (!cv.projects.every((p: any) => strings(p, ["id", "name", "techStack", "date"], ["slug"]) && typeof p.is42Project === "boolean" && bullets(p.bulletPoints))) return false;
  if (!cv.education.every((e: any) => strings(e, ["id", "institution", "program", "startDate"], ["degree", "endDate", "specializationTrack"]) &&
    typeof e.isCurrent === "boolean" && educationStates.includes(e.state) && level(e.level))) return false;
  if (!cv.experience.every((e: any) => strings(e, ["id", "company", "role", "location", "startDate", "endDate"], ["rawNotes"]) &&
    typeof e.isCurrent === "boolean" && bullets(e.bulletPoints))) return false;
  if (!cv.coursework.every((c: any) => strings(c, ["id", "title", "date"], ["institution"]))) return false;
  if (!cv.extracurriculars.every((e: any) => strings(e, ["id", "organization", "role", "startDate"], ["endDate"]) && typeof e.isCurrent === "boolean" && bullets(e.bulletPoints))) return false;
  if (!Number.isFinite(r.createdAt) || !Number.isFinite(r.updatedAt)) return false;
  for (const field of ["targetRole", "specializationTrack", "currentStep"]) if (snap[field] !== undefined && typeof snap[field] !== "string") return false;
  for (const field of ["showExperience", "showExtracurriculars", "sampleDataRemovedNotice"]) if (snap[field] !== undefined && typeof snap[field] !== "boolean") return false;
  for (const field of ["selectedCampusRoles", "selectedCoursework"]) if (snap[field] !== undefined && !bullets(snap[field])) return false;
  for (const field of ["selectedProjects", "customProjects"]) if (snap[field] !== undefined && (!Array.isArray(snap[field]) || !snap[field].every((p: any) =>
    strings(p, ["name", "slug"], ["techStack", "date"]) && typeof p.is42Project === "boolean"))) return false;
  const sections = ["education", "experience", "projects", "skills", "coursework", "extracurriculars"];
  if (cv.sectionOrder !== undefined && (!Array.isArray(cv.sectionOrder) || !cv.sectionOrder.every((v: any) => sections.includes(v)))) return false;
  for (const data of [cv, snap]) {
    if (data.styleDensity !== undefined && !["standard", "compact"].includes(data.styleDensity)) return false;
    if (data.educationState !== undefined && !educationStates.includes(data.educationState)) return false;
  }
  if (r.copyReceipt !== undefined && (!object(r.copyReceipt) || typeof r.copyReceipt.operationId !== "string" ||
    !Number.isSafeInteger(r.copyReceipt.revision) || r.copyReceipt.revision < 1 || !Number.isFinite(r.copyReceipt.updatedAt) || typeof r.copyReceipt.fingerprint !== "string" || typeof r.copyReceipt.requestHash !== "string")) return false;

  // All answer consumers expect a per-item map of question -> string or string[].
  for (const field of ["helperAnswers", "projectAnswers", "campusRoleAnswers"]) {
    const answers = snap[field];
    if (answers === undefined) continue;
    if (!object(answers)) return false;
    for (const item of Object.values(answers)) {
      if (!object(item)) return false;
      for (const answer of Object.values(item as Record<string, unknown>)) {
        if (typeof answer !== "string" && !bullets(answer)) return false;
      }
    }
  }

  // Validate optional snapshot arrays / records if present
  if (snap.selectedProjects !== undefined && !Array.isArray(snap.selectedProjects)) return false;
  if (snap.customProjects !== undefined && !Array.isArray(snap.customProjects)) return false;
  if (snap.selectedCampusRoles !== undefined && !Array.isArray(snap.selectedCampusRoles)) return false;
  if (snap.selectedCoursework !== undefined && !Array.isArray(snap.selectedCoursework)) return false;
  if (snap.projectAnswers !== undefined && (typeof snap.projectAnswers !== "object" || snap.projectAnswers === null || Array.isArray(snap.projectAnswers))) return false;
  if (snap.campusRoleAnswers !== undefined && (typeof snap.campusRoleAnswers !== "object" || snap.campusRoleAnswers === null || Array.isArray(snap.campusRoleAnswers))) return false;
  if (snap.helperAnswers !== undefined && (typeof snap.helperAnswers !== "object" || snap.helperAnswers === null || Array.isArray(snap.helperAnswers))) return false;
  if (snap.studentProfile !== undefined && snap.studentProfile !== null) {
    if (!isValidIntraProfile(snap.studentProfile)) return false;
    if (r.owner.kind === "account" && snap.studentProfile.id !== r.owner.studentId) {
      return false;
    }
  }

  return true;
}

export interface DraftSnapshot {
  currentStep?: string;
  studentProfile?: IntraProfile | null;
  targetRole?: string;
  educationState?: EducationState;
  specializationTrack?: string;
  showExperience?: boolean;
  styleDensity?: StyleDensity;
  showExtracurriculars?: boolean;
  selectedProjects?: any[];
  customProjects?: any[];
  projectAnswers?: Record<string, any>;
  selectedCampusRoles?: string[];
  campusRoleAnswers?: Record<string, any>;
  selectedCoursework?: string[];
  cvData: CVData;
  lastSavedTimestamp?: number;
  sampleDataRemovedNotice?: boolean;
  helperAnswers?: Record<string, HelperAnswers>;
  [key: string]: any;
}

export interface DraftProvenance {
  legacyFingerprint?: string;
  source?: string;
  importedAt?: number;
  migratedFrom?: string;
  copiedFrom?: {
    owner: DraftOwner;
    draftId: string;
    timestamp: number;
  };
  cachedProfileProvenance?: {
    id: number;
    login: string;
    extractedAt?: number;
  } | null;
}

export interface OwnerBoundPendingWork {
  owner: DraftOwner;
  snapshot: DraftSnapshot;
  baseDraftId?: string;
  baseRevision?: number;
  generation?: number;
  timestamp: number;
}

export interface DraftRecord {
  copyReceipt?: { operationId: string; revision: number; updatedAt: number; fingerprint: string; requestHash: string };
  schemaVersion: 1;
  draftId: string;
  owner: DraftOwner;
  revision: number;
  createdAt: number;
  updatedAt: number;
  snapshotVersion: 1;
  snapshot: DraftSnapshot;
  provenance?: DraftProvenance;
}

export interface BackupRecord {
  backupVersion: 1;
  raw: string;
  sourceKey: string;
  version: number;
  timestamp: number;
  hash: string;
}

export interface RecoveryRecord {
  recoveryVersion: 1;
  record?: DraftRecord;
  raw?: string;
  sourceKey: string;
  owner: DraftOwner;
  reason: string;
  timestamp: number;
  hash: string;
}

export interface TransactionJournal {
  journalVersion: 1;
  txId: string;
  state: "prepared" | "committed" | "failed";
  expectedRevisions: Record<string, number | null>;
  stagedRecords: Record<string, DraftRecord | BackupRecord | RecoveryRecord | string>;
  stagedRemovals?: string[];
  previousValues?: Record<string, string | null>;
  timestamp: number;
}

export interface MigrationRecord {
  migrationVersion: 1;
  legacyHash: string;
  backupKey: string;
  unassignedKey: string;
  completedAt: number;
}

export interface ChoicesRecord {
  choiceVersion: 1;
  studentId: number;
  choices: Record<string, { choice: "keep-separate" | "copied"; timestamp: number }>;
}

export interface WorkspaceState {
  workspaceVersion: 1;
  mode: "welcome" | "guest" | "account" | "review";
  activeKey?: string;
  revisionPreference?: number;
}

export type ControllerState =
  | { state: "BOOTSTRAPPING" }
  | { state: "WELCOME"; notice?: string | null }
  | { state: "EDITING_GUEST"; memoryOnly?: boolean }
  | { state: "EDITING_ACCOUNT"; studentId: number }
  | { state: "REVIEWING_SOURCE"; sourceKey: string; returnTo: "WELCOME" | "EDITING_GUEST" | "EDITING_ACCOUNT" }
  | { state: "TRANSITIONING"; from: string; to: string }
  | { state: "LOGOUT_PENDING" }
  | { state: "SESSION_UNKNOWN"; message?: string }
  | { state: "RECOVERY_BLOCKED"; message: string };

export type AuthStatus = "unknown" | "unauthenticated" | "authenticated";

export type AuthState =
  | { status: "unknown" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: IntraProfile };

export interface DraftBroadcastMessage {
  runtimeId: string;
  operationId: string;
  type: "draft_updated" | "owner_changed" | "logout";
  revision?: number;
  ownerKey?: string;
  timestamp: number;
}

/** Nonempty detects substantive CV/setup/helper work, not defaults or name alone. */
export function hasSubstantiveWork(snapshot: DraftSnapshot | null | undefined): boolean {
  if (!snapshot || !snapshot.cvData) return false;
  const cv = snapshot.cvData;

  // Projects with bullet points or custom descriptions
  if (Array.isArray(cv.projects) && cv.projects.some((p) => Array.isArray(p.bulletPoints) && p.bulletPoints.some((b) => b && b.trim().length > 0))) {
    return true;
  }
  // Experience entries with content
  if (Array.isArray(cv.experience) && cv.experience.some((e) => (e.company && e.company.trim()) || (e.role && e.role.trim()) || (Array.isArray(e.bulletPoints) && e.bulletPoints.length > 0))) {
    return true;
  }
  // Custom projects
  if (Array.isArray(snapshot.customProjects) && snapshot.customProjects.length > 0) {
    return true;
  }
  // Helper answers
  if (snapshot.helperAnswers && Object.keys(snapshot.helperAnswers).length > 0) {
    for (const k of Object.keys(snapshot.helperAnswers)) {
      const ans = snapshot.helperAnswers[k];
      if (ans && Object.keys(ans).length > 0) return true;
    }
  }
  // Extracurriculars
  if (Array.isArray(cv.extracurriculars) && cv.extracurriculars.some((ex) => (ex.organization && ex.organization.trim()) || (Array.isArray(ex.bulletPoints) && ex.bulletPoints.length > 0))) {
    return true;
  }
  // Coursework
  if ((Array.isArray(snapshot.selectedCoursework) && snapshot.selectedCoursework.length > 0) || (Array.isArray(cv.coursework) && cv.coursework.length > 0)) {
    return true;
  }
  // Customized skills
  if (cv.skills) {
    const totalSkills =
      (cv.skills.languages?.length || 0) +
      (cv.skills.developerTools?.length || 0) +
      (cv.skills.technologiesFrameworks?.length || 0) +
      (cv.skills.projectManagementTools?.length || 0);
    if (totalSkills > 0) return true;
  }
  // Non-default contact fields (summary or links)
  if (
    cv.contact?.email?.trim() ||
    cv.contact?.phoneNumber?.trim() ||
    cv.contact?.linkedinUrl?.trim() ||
    cv.contact?.githubUrl?.trim() ||
    (cv.contact as any)?.location?.trim()
  ) {
    return true;
  }

  return false;
}
