import { CREDITS } from "./credits";
import { GRID, HEADING, WRAP } from "./frame";

const LINK = "inline-flex h-11 items-center underline-offset-4 hover:underline";

// A short close on the cream page, under a thin line: "Make your CV" at the section heading size on the margin, the two notes on
// column 7, then one row of small links. Sized to its content.
export function Footer() {
  return (
    <footer className={`border-t border-line bg-canvas pb-6 pt-16 text-ink md:pb-8 md:pt-20 lg:pt-24 ${WRAP}`}>
      <div className={`${GRID} gap-y-8 md:grid-cols-12`}>
        <p className={`${HEADING} md:col-span-6`}>
          <a href="/studio" data-contact="" className="text-ink underline-offset-[0.12em] hover:underline">Make your CV</a>
        </p>
        <div className="space-y-1 text-step-small text-muted md:col-span-6 md:col-start-7 md:self-end">
          <p>PrintCV is a free CV builder for 42 students.</p>
          <p>PrintCV is not made by or linked to 42.</p>
        </div>
      </div>

      <div className="mt-16 text-step-small text-muted lg:mt-24">
        <div className={`${GRID} items-center gap-y-2 md:grid-cols-12`}>
          <p className="flex gap-6 md:col-span-6">
            <a href="/studio" className={LINK}>Editor</a>
            <a href="#hero" className={LINK}>Back to top</a>
          </p>
          <p className="md:col-span-6 md:col-start-7">2026</p>
        </div>
        {CREDITS.length > 0 && (
          <>
            <p id="credits-title" className="mt-4">Photo credits</p>
            <ul aria-labelledby="credits-title" className="mt-1 space-y-1">
              {CREDITS.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </>
        )}
      </div>
    </footer>
  );
}
