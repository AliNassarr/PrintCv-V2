"use client";

import type { NextStep as NextStepData } from "@/lib/progress";
import { Button } from "@/components/ui/Button";

// The one next thing to fix, in one row under the section steps (§1.3). When nothing is left it says so;
// Download PDF is already in the top bar, so there is no button then.
export function NextStep({ next, onFix }: { next: NextStepData | null; onFix: () => void }) {
  return (
    <div data-test-id="next-step" className="flex min-h-11 items-center gap-3 px-4 py-1.5 text-app sm:px-6">
      {next ? (
        <>
          <p className="min-w-0 flex-1 text-ink">
            <span className="font-medium text-muted">Next:</span> {next.text}
          </p>
          <Button size="sm" onClick={onFix}>Fix it</Button>
        </>
      ) : (
        <p className="text-ink">Your CV is ready to send.</p>
      )}
    </div>
  );
}
