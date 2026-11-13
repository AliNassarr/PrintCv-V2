// Ways out of a broken saved draft, used by the error pages. No store import, so they still work when the store fails.
import { CV_STORE_KEY, DRAFTS_KEY_PREFIX, WORKSPACE_STORAGE_KEY } from "@/lib/cv-constants";
import { getSessionController } from "@/lib/draft-session";
import { createRecoveryRecordSync, withDraftsLock } from "@/lib/draft-repository";
import { ownerToKey, isValidStudentId, DraftOwner } from "@/lib/draft-types";

export function readSavedDraft(): string | null {
  try {
    const controller = getSessionController(), state = controller.getState(), owner = controller.getCurrentOwner();
    if (!["EDITING_ACCOUNT", "EDITING_GUEST", "RECOVERY_BLOCKED"].includes(state.state)) return null;
    const auth = controller.getAuthState();
    if (owner.kind === "unassigned" || owner.kind === "account" &&
      (auth.status !== "authenticated" || auth.user.id !== owner.studentId)) return null;
    const record = controller.getCurrentDraft();
    if (!record || ownerToKey(record.owner) !== ownerToKey(owner)) return null;
    return JSON.stringify(record);
  } catch { return null; }
}

/** Downloads the saved draft scoped to the current active workspace/guest, never bundling other accounts. */
export function downloadSavedDraft(): void {
  const saved = readSavedDraft();
  if (!saved) return;
  const url = URL.createObjectURL(new Blob([saved], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "printcv-draft.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Asks first, preserves recovery backup, then clears current draft and opens a fresh editor. */
export async function startAgain(): Promise<void> {
  if (!confirm("This resets your current CV draft in this browser. A backup copy will be preserved.")) return;
  const result = await getSessionController().resetDraft();
  if (!result.success && typeof alert === "function") alert(result.error || "Your draft could not be reset.");
}
