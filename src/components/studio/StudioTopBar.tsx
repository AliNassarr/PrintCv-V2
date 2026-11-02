"use client";

import React from "react";
import { FileText } from "lucide-react";
import { PrintCVLogo } from "@/components/ui/PrintCVLogo";
import { Button } from "@/components/ui/Button";
import { scoreLabel } from "@/lib/cv-score";
import { cx } from "@/lib/cx";
import { LOGIN_URL } from "@/lib/auth-urls";
import { AccountMenu, MoreMenu } from "./MoreMenu";

// Two letters for the account circle, from the 42 display name or the login
const initialsOf = (displayname?: string, login?: string) => {
  const words = (displayname || "").trim().split(/\s+/).filter(Boolean);
  const letters = words.length ? words.slice(0, 2).map((w) => w[0]).join("") : (login || "").slice(0, 2);
  return letters.toUpperCase();
};

// The 48px top bar: part of the grey frame, no rule under it (§7.2).
// Tab order: Score, Word, PDF, then the account (Log in with 42 or the account circle) from 1024px, or More below 1024px.
export function StudioTopBar({
  cvName,
  score,
  onOpenScore,
  firstRun,
  isExportingDocx,
  onExportDocx,
  onPrintPDF,
  account,
  onOpenOrder,
  onLogout,
}: {
  cvName: string;
  score: number;
  onOpenScore: () => void;
  firstRun: boolean;
  isExportingDocx: boolean;
  onExportDocx: () => void;
  onPrintPDF: () => void;
  account: { login: string; displayname?: string } | null;
  onOpenOrder: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 sm:gap-3 bg-ground px-3 sm:px-4 lg:col-span-full lg:row-start-1 print:hidden">
      {/* Logo tile, then "PrintCV" from 1024px */}
      <div className="flex shrink-0 items-center gap-2 lg:pr-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-control bg-mint">
          <PrintCVLogo className="h-4 w-4 text-ink" />
        </span>
        <span className="hidden text-app-md font-medium lg:inline">PrintCV</span>
      </div>

      {/* CV name and the saved line */}
      <div className="hidden min-w-0 flex-1 items-baseline gap-3 sm:flex">
        <p className="truncate text-app-md font-medium">{cvName}</p>
        <p className="hidden shrink-0 text-app-sm text-muted lg:block">Saved in this browser</p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button type="button" data-test-id="score-button" title="See your CV score" onClick={onOpenScore}
          className="inline-flex h-11 min-w-9 items-center justify-center gap-1.5 rounded-control px-2 sm:px-3 hover:bg-active sm:h-8 sm:min-w-0">
          {/* Below md the bare number gets its scale; screen readers hear "out of 100" instead of "slash 100" */}
          <span className="text-app font-medium tabular-nums">
            {score}
            <span className="hidden min-[360px]:inline font-normal text-muted md:hidden">
              <span aria-hidden="true">/100</span>
              <span className="sr-only"> out of 100</span>
            </span>
          </span>
          <span className="hidden text-app text-muted md:inline">{scoreLabel(score)}</span>
          <span className="sr-only">. See your CV score</span>
        </button>

        <Button variant="secondary" size="sm" testId="word-button" aria-label="Download a Word file" onClick={onExportDocx}
          disabled={isExportingDocx} className="min-w-11">
          <FileText aria-hidden="true" className="h-4 w-4" />
          <span className="hidden sm:inline">Word</span>
        </Button>

        {/* On a first run "Log in with 42" is the one ink button, so Download PDF stays secondary */}
        <Button variant={firstRun ? "secondary" : "primary"} size="sm" testId="pdf-button" aria-label="Download PDF" onClick={onPrintPDF}>
          <span className="sm:hidden">PDF</span>
          <span className="hidden sm:inline">Download PDF</span>
        </Button>

        {/* The account from 1024px */}
        <div className="hidden lg:block">
          {account ? (
            <AccountMenu login={account.login} initials={initialsOf(account.displayname, account.login)} onLogout={onLogout} />
          ) : (
            <a href={LOGIN_URL}
              className={cx(
                "inline-flex h-8 items-center justify-center rounded-control px-3 text-app font-medium transition-colors duration-150",
                firstRun ? "bg-ink text-paper hover:bg-[#444444]" : "border border-control bg-paper text-ink hover:bg-raised",
              )}>
              Log in with 42
            </a>
          )}
        </div>

        {/* Below 1024px: Order and the account live in More */}
        <div className="lg:hidden">
          <MoreMenu loggedIn={!!account} onOrder={onOpenOrder} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
