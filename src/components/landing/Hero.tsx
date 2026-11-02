import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { DEMO_CV } from "@/lib/sample-cv";
import { ACTION, FLOW, GRID, WRAP } from "./frame";

const at = (n: number) => ({ "--i": n }) as CSSProperties;

// What happened to the demo CV, one short line per step, in the step colours the workflow below uses
const LOG = [
  "Name, email and 12 passed projects came in from Intra",
  "3 projects picked for the page",
  "13 lines written and checked",
  "Fits on 1 page, saved as a PDF",
];

// From 1024 up: the text, the actions and the four steps that made the demo CV on columns 1-5, and a window
// with the whole A4 page on columns 6-12, both on the same top edge. Below 1024 everything stacks in that order.
// The page is at most 480px wide and scales to that width: 100cqw / 793.7px (the A4 width at 96 dpi), with
// tan(atan2(a, b)) = a / b, which works in every current browser. It holds still, so a screen reader reads it
// as it is. CVSheet gets no onSectionClick here, so it renders no handlers.
export function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title" className={`bg-canvas pb-12 pt-24 text-ink md:pb-16 md:pt-28 lg:pb-20 lg:pt-32 ${WRAP}`}>
      <div className={`${GRID} gap-y-10`}>
        <div className="lg:col-span-5">
          <h1 id="hero-title" className="text-display font-normal tracking-hero">
            <span className="block overflow-hidden pb-[0.06em]"><span className="hero-rise block" style={at(0)}>Your 42 projects,</span></span>{" "}
            <span className="block overflow-hidden pb-[0.06em]"><span className="hero-rise block" style={at(1)}>on one clean page</span></span>
          </h1>
          <p className="mt-6 max-w-[40ch] overflow-hidden text-step-body tracking-text text-muted">
            <span className="hero-rise block" style={at(2)}>
              A free CV builder for 42 students. Log in with 42, write each line in your own words, and download a one-page PDF.
            </span>
          </p>
          <div className="-m-1 mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden p-1">
            <a href="/api/auth/42/login" style={at(3)} className={`hero-rise ${ACTION} h-12 px-6 text-step-body`}>
              Log in with 42
            </a>
            <a href="/studio" style={at(3)}
              className="hero-rise group inline-flex h-12 items-center gap-2 rounded-landing border border-line-strong bg-paper px-6 text-step-body font-medium text-ink transition-colors duration-150 hover:bg-stage">
              Open the editor
              <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
          </div>
          <ol aria-label="How the sample CV was made" className="mt-10 grid gap-x-6 gap-y-4 text-step-small sm:grid-cols-2 lg:mt-14 lg:grid-cols-1">
            {FLOW.map((step, i) => (
              <li key={step.label} className="flex items-start gap-3">
                <span aria-hidden="true" className={`flex h-6 w-6 flex-none items-center justify-center rounded-full ${step.tone} font-medium text-ink`}>{i + 1}</span>
                <span><span className="font-medium">{step.label}.</span> {LOG[i]}</span>
              </li>
            ))}
          </ol>
        </div>

        <figure aria-labelledby="hero-window" className="overflow-hidden rounded-xl border border-line bg-paper lg:col-span-7 lg:col-start-6">
          <div className="flex min-h-11 items-center border-b border-line px-4 py-2 text-step-small">
            <p id="hero-window">Sample CV: {DEMO_CV.contact.fullName}</p>
          </div>
          <div className="bg-stage p-4 md:p-6">
            <div className="mx-auto max-w-[480px]">
              <picture>
                <source srcSet="/landing/sample-cv.webp" type="image/webp" />
                <img
                  src="/landing/sample-cv.png"
                  alt={`Sample CV for ${DEMO_CV.contact.fullName}, ${DEMO_CV.targetRole}, on one clean A4 page`}
                  width={794}
                  height={1123}
                  className="block h-auto w-full rounded-card border border-line bg-paper shadow-sm"
                  loading="eager"
                  decoding="async"
                />
              </picture>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
