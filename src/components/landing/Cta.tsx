import type { CSSProperties } from "react";
import { ACTION, GRID, WRAP } from "./frame";

const at = (n: number) => ({ "--i": n }) as CSSProperties;

// One white card with a thin line on the cream page: the closing line and the action on columns 1-6, the two
// plain facts on columns 7-12, level with the action's bottom edge (from 768 up). The closing line is a statement, so it is a <p> at the lead size.
export function Cta() {
  return (
    <section id="start" aria-labelledby="start-title" className={`pb-12 md:pb-20 lg:pb-24 ${WRAP}`}>
      <div className={`${GRID} gap-y-10 rounded-xl border border-line bg-paper p-6 md:grid-cols-12 md:p-10 lg:p-14`}>
        <div data-reveal="" style={at(0)} className="md:col-span-6">
          <p id="start-title" className="max-w-[30ch] text-step-lead font-medium">
            You already did the hard part: the projects. Now put them on one page.
          </p>
          <a href="/api/auth/42/login"
            className={`mt-8 ${ACTION} h-12 px-6 text-step-body`}>
            Log in with 42
          </a>
        </div>
        <div data-reveal="" style={at(1)} className="space-y-1 text-step-small text-muted md:col-span-6 md:col-start-7 md:self-end">
          <p>Free. No card. Your CV stays in your browser.</p>
          <p>Not at 42? Open the editor and fill it in by hand.</p>
        </div>
      </div>
    </section>
  );
}
