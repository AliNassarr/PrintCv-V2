import { PrintCVLogo } from "@/components/ui/PrintCVLogo";
import { STUDIO_SECTIONS } from "@/lib/studio-sections";
import { cx } from "@/lib/cx";

// The studio shell with flat grey bars, before the saved draft is read (§7.9). Same frame as ReziStudioLayout:
// the top bar, the editor column (section steps, the next step, the sheet) and, from 1024px, the preview beside it.
// Server-safe: no hooks, so loading.tsx and StudioClient can both render it.
// "login": the 42 login is still running.
const Bar = ({ className }: { className: string }) => <div className={`rounded-control bg-bar ${className}`} />;

export function StudioLoading({ mode = "open" }: { mode?: "open" | "login" }) {
  const login = mode === "login";
  return (
    <div aria-busy="true"
      className="flex h-[100dvh] flex-col overflow-hidden bg-ground text-ink lg:grid lg:grid-cols-[clamp(480px,42vw,640px)_1fr] lg:grid-rows-[48px_1fr]">
      {!login && <p className="sr-only">Opening your CV</p>}
      {login && <p role="status" className="sr-only">Getting your 42 projects</p>}

      {/* Top bar: Score, Word, PDF, then the account from 1024px */}
      <div className="flex h-12 shrink-0 items-center gap-3 px-4 lg:col-span-full lg:row-start-1">
        <div className="flex shrink-0 items-center gap-2 lg:pr-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-control bg-mint">
            <PrintCVLogo className="h-4 w-4 text-ink" />
          </span>
          <span className="hidden text-app-md font-medium lg:inline">PrintCV</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Bar className="h-11 w-11 sm:h-8" />
          <Bar className="h-11 w-11 sm:h-8 sm:w-24" />
          <Bar className="h-11 w-14 sm:h-8 sm:w-32" />
          <Bar className="hidden h-8 w-28 lg:block" />
        </div>
      </div>

      {/* The editor column: one white card from 1024px */}
      <div className="contents lg:col-start-1 lg:row-start-2 lg:mb-2 lg:ml-2 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:rounded-sheet lg:border lg:border-edge lg:bg-paper">
        <div className="shrink-0 lg:border-b lg:border-edge">
          {/* The section steps with the real labels: a tab row below 1024px, six steps from 1024px */}
          <div className="mx-4 flex h-11 shrink-0 items-stretch overflow-hidden lg:mx-0 lg:grid lg:h-auto lg:grid-cols-[repeat(6,auto)] lg:px-1">
            {STUDIO_SECTIONS.map((s, i) => (
              <div key={s.id}
                className={cx(
                  "relative isolate flex shrink-0 items-center gap-2 whitespace-nowrap px-3 text-app lg:flex-col lg:gap-1.5 lg:whitespace-normal lg:px-1 lg:pb-3 lg:pt-3 lg:text-center lg:text-app-sm lg:font-medium",
                  s.id === "PROJECTS" ? "font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-ink" : "text-muted",
                )}>
                <span aria-hidden="true"
                  className={cx("absolute top-[22px] hidden h-px bg-edge lg:block", i === 0 ? "left-1/2" : "left-0", i === STUDIO_SECTIONS.length - 1 ? "right-1/2" : "right-0")} />
                <span>{s.label}</span>
                <span className="relative z-[1] flex h-5 shrink-0 items-center lg:order-first lg:bg-paper lg:px-1.5">
                  <span className="h-4 w-4 rounded-full border-[1.5px] border-field" />
                </span>
              </div>
            ))}
          </div>
          {/* The next step */}
          <div className="flex min-h-11 items-center px-4 py-1.5 sm:px-6">
            <Bar className="h-4 w-2/3" />
          </div>
        </div>

        {/* Sheet */}
        <div className="min-h-0 flex-1 overflow-hidden bg-paper px-4 py-6 sm:px-6">
          {login ? (
            <>
              <h1 className="text-app-title">Getting your 42 projects</h1>
              <p className="mt-1 text-app text-muted">This takes a few seconds.</p>
            </>
          ) : (
            <Bar className="h-6 w-48" />
          )}
          <div className="mt-6 flex flex-col gap-3">
            <Bar className="h-12 w-full" />
            <Bar className="h-12 w-full" />
            <Bar className="h-12 w-full" />
            {!login && <Bar className="mt-3 h-10 w-full" />}
          </div>
        </div>
      </div>

      {/* Preview zone (1024px and up): the empty A4 filling the zone's width, as the preview opens. The gutter keeps room
          for the scrollbar the real preview has, so the page does not jump. */}
      <div className="hidden min-h-0 flex-col lg:col-start-2 lg:row-start-2 lg:flex">
        <div className="h-11 shrink-0" />
        <div className="min-h-0 flex-1 overflow-hidden p-6 [scrollbar-gutter:stable]">
          <div className="mx-auto aspect-[210/297] w-full max-w-[793.7px] border border-edge bg-paper" />
        </div>
      </div>

      {/* Bottom bar below 1024px */}
      <div className="fixed inset-x-0 bottom-0 h-[calc(56px+env(safe-area-inset-bottom))] border-t border-edge bg-ground lg:hidden print:hidden" />
    </div>
  );
}
