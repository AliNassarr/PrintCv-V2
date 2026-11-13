"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { DialogFrame } from "@/components/ui/DialogFrame";
import type { DraftRecord } from "@/lib/draft-types";

interface DraftOwnershipDialogProps {
  isOpen: boolean;
  sourceRecord: DraftRecord | null;
  targetHasSubstantiveWork?: boolean;
  onClose: () => void;
  onKeepSeparate: () => void;
  onConfirmCopy: () => void;
}

export function DraftOwnershipDialog({
  isOpen,
  sourceRecord,
  targetHasSubstantiveWork,
  onClose,
  onKeepSeparate,
  onConfirmCopy,
}: DraftOwnershipDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !sourceRecord) return null;

  const snap = sourceRecord.snapshot;
  const fullName = snap.cvData?.contact?.fullName || "Unnamed CV";
  const projectCount = snap.cvData?.projects?.length || 0;
  const expCount = snap.cvData?.experience?.length || 0;

  return (
    <DialogFrame
      open={isOpen}
      title="Review Browser Draft"
      titleId="draft-ownership-dialog-title"
      closeLabel="Close draft review dialog"
      onClose={onClose}
      width={560}
    >
      <div className="space-y-4 p-4 text-app text-ink">
        <div className="rounded-control border border-amber-200 bg-amber-50 p-3 text-app-sm text-amber-900">
          <strong>Important:</strong> This draft was found on this computer and may belong to another student who used this browser.
        </div>

        <div className="rounded-control border border-edge bg-ground p-4">
          <h3 className="text-app-sm font-semibold text-ink">Draft Summary</h3>
          <p className="mt-1 text-app font-medium">{fullName}</p>
          <ul className="mt-2 list-inside list-disc text-app-sm text-muted">
            <li>{projectCount} project{projectCount === 1 ? "" : "s"}</li>
            {expCount > 0 && <li>{expCount} work experience item{expCount === 1 ? "" : "s"}</li>}
          </ul>
        </div>

        {targetHasSubstantiveWork && (
          <div className="rounded-control border border-red-200 bg-red-50 p-3 text-app-sm text-red-900">
            <strong>Warning:</strong> Your current CV already has saved work. Copying this draft will replace your current editor content. A recovery backup of your existing draft will be saved before replacing.
          </div>
        )}

        <p className="text-app-sm text-muted">
          Do you want to copy this draft into your current workspace, or keep it separate?
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-edge pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onKeepSeparate}>
            Keep Separate
          </Button>
          <Button variant="primary" onClick={onConfirmCopy}>
            Copy to Workspace
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
