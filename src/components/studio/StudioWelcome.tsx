"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PrintCVLogo } from "@/components/ui/PrintCVLogo";
import { LOGIN_URL } from "@/lib/auth-urls";
import { listKnownDrafts } from "@/lib/draft-repository";
import { type DraftRecord, hasSubstantiveWork } from "@/lib/draft-types";

interface StudioWelcomeProps {
  notice?: string | null;
  onContinueGuest: () => void;
  onReviewDraft?: (key: string) => void;
}

export function StudioWelcome({ notice, onContinueGuest, onReviewDraft }: StudioWelcomeProps) {
  const [knownSources, setKnownSources] = useState<Array<{ key: string; label: string }>>([]);

  useEffect(() => {
    try {
      const { legacy, guest } = listKnownDrafts();
      const sources: Array<{ key: string; label: string }> = [];
      if (guest && hasSubstantiveWork(guest.snapshot)) {
        sources.push({ key: "printcv_drafts_v1:guest", label: "Guest draft in this browser" });
      }
      if (legacy && legacy.length > 0) {
        sources.push({ key: `printcv_drafts_v1:legacy:${legacy[0].hash}`, label: "Previous session draft" });
      }
      setKnownSources(sources);
    } catch {}
  }, []);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-ground p-4">
      <div className="w-full max-w-[520px] rounded-sheet border border-edge bg-paper p-8 shadow-card sm:p-10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-control bg-mint">
            <PrintCVLogo className="h-6 w-6 text-ink" />
          </span>
          <div>
            <h1 className="text-app-title font-semibold text-ink">PrintCV</h1>
            <p className="text-app-sm text-muted">Single-page ATS CV for 42 students</p>
          </div>
        </div>

        {notice && (
          <div className="mt-6 rounded-control border border-amber-200 bg-amber-50 p-3 text-app-sm text-amber-900" role="alert">
            {notice}
          </div>
        )}

        <div className="mt-8 space-y-4">
          <a
            href={LOGIN_URL}
            className="flex h-12 w-full items-center justify-center rounded-control bg-ink px-4 text-app font-medium text-paper transition-colors hover:bg-[#444444] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            Log in with 42
          </a>

          <Button
            variant="secondary"
            className="h-12 w-full text-app font-medium"
            onClick={onContinueGuest}
          >
            Continue as Guest
          </Button>
        </div>

        {knownSources.length > 0 && onReviewDraft && (
          <div className="mt-8 border-t border-edge pt-6">
            <h2 className="text-app-sm font-medium text-ink">Previous drafts in this browser</h2>
            <p className="mt-1 text-app-sm text-muted">
              Found saved draft data from an earlier session on this computer.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {knownSources.map((s) => (
                <Button
                  key={s.key}
                  variant="ghost"
                  size="sm"
                  onClick={() => onReviewDraft(s.key)}
                  className="text-app-sm font-medium text-ink underline justify-start px-0"
                >
                  Review {s.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-app-xs text-muted">
          Your data is stored locally in this browser. PrintCV does not send your CV to a cloud database.
        </div>
      </div>
    </div>
  );
}
