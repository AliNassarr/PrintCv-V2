"use client";

import { AlertCircle } from "lucide-react";
import { cx } from "@/lib/cx";
import { LOGIN_URL } from "@/lib/auth-urls";

// A notice at the top of the sheet, above the section title (§7.9).
// "error": the login went wrong (role="alert", with "Try again"). "warn": the old sample CV was removed.
export function StudioNotice({ message, onClose, tone = "error" }: { message: string; onClose: () => void; tone?: "error" | "warn" }) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : undefined}
      className={cx(
        "mb-6 flex flex-wrap items-center gap-x-3 rounded-card px-4 py-1",
        error ? "bg-pill-bad text-app text-pill-bad-ink" : "border border-[#fde68a] bg-pill-warn text-[13px] leading-[18px] text-warn",
      )}
    >
      {error && <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-bad" />}
      <p className="min-w-0 flex-1 basis-48 py-2">{message}</p>
      <div className="ml-auto flex items-center gap-1">
        {error && (
          <a href={LOGIN_URL} className="inline-flex h-11 items-center rounded-control px-2 font-medium underline underline-offset-4 hover:bg-[#ffdcd6] sm:h-10">
            Try again
          </a>
        )}
        <button type="button" onClick={onClose} aria-label={error ? "Close the login message" : "Close the example CV message"}
          className={cx("inline-flex h-11 items-center rounded-control px-2 font-medium underline underline-offset-4 sm:h-10", error ? "hover:bg-[#ffdcd6]" : "hover:bg-[#fef3c7]")}>
          Close
        </button>
      </div>
    </div>
  );
}
