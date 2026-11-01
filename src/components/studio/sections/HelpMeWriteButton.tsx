"use client";

import React from "react";
import type { HelperTarget } from "@/lib/bullet-helper";
import { Button } from "@/components/ui/Button";
import type { SectionProps } from "./types";

// Opens the "Help me write" dialog for one project, job or activity.
// testId is passed only by the first project card (data-test-id="helper-button").
export function HelpMeWriteButton({
  kind,
  id,
  onOpenHelper,
  testId,
}: {
  kind: HelperTarget["kind"];
  id: string;
  onOpenHelper: SectionProps["onOpenHelper"];
  testId?: string;
}) {
  return (
    <Button size="sm" variant="secondary" testId={testId} onClick={() => onOpenHelper(kind, id)}>
      Help me write
    </Button>
  );
}
