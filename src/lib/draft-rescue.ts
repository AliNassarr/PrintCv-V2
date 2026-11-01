// Ways out of a broken saved draft, used by the error pages. No store import, so they still work when the store fails.
import { CV_STORE_KEY } from "@/lib/cv-constants";

export function readSavedDraft(): string | null {
  try {
    return localStorage.getItem(CV_STORE_KEY);
  } catch {
    return null;
  }
}

/** Downloads the saved draft exactly as stored, as printcv-draft.json. */
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

/** Asks first, then clears the saved draft and opens a fresh editor. */
export function startAgain(): void {
  if (!confirm("This clears the CV saved in this browser.")) return;
  try {
    localStorage.removeItem(CV_STORE_KEY);
  } catch {
    // Nothing more we can do; the editor will still open
  }
  location.assign("/studio");
}
