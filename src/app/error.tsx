"use client";
import { useEffect, useState } from "react";
import { downloadSavedDraft, readSavedDraft, startAgain } from "@/lib/draft-rescue";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {
    // Log only the code, never CV or profile data
    console.error("PrintCV error", error.digest ?? "");
  }, [error]);
  useEffect(() => setHasDraft(Boolean(readSavedDraft())), []);
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-ground p-4">
      <div className="w-full max-w-[480px] rounded-sheet border border-edge bg-paper p-8">
        <h1 className="text-app-title text-ink">Something went wrong</h1>
        <p className="mt-2 text-app text-muted">Your CV is still saved in this browser.</p>
        <p className="mt-2 text-app text-muted">If &quot;Try again&quot; keeps failing, save a copy of your CV. Then start again.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => reset()} className="h-11 rounded-control bg-ink px-4 text-app font-medium text-paper sm:h-10">Try again</button>
          <button type="button" onClick={() => location.reload()} className="h-11 rounded-control border border-control bg-paper px-4 text-app font-medium text-ink sm:h-10">Reload the page</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {hasDraft && (
            <button type="button" onClick={downloadSavedDraft} className="h-11 rounded-control border border-control bg-paper px-4 text-app font-medium text-ink sm:h-10">Save a copy of my CV</button>
          )}
          <button type="button" onClick={startAgain} className="h-11 rounded-control border border-control bg-paper px-4 text-app font-medium text-ink sm:h-10">Start again</button>
        </div>
      </div>
    </main>
  );
}
