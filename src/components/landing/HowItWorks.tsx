import type { CSSProperties, ReactNode } from "react";
import { FileText } from "lucide-react";
import { LineCheck } from "./LineCheck";
import { AFTER_HEADING, FLOW, HEADING, PAGE, SECTION, STAGE, WRAP } from "./frame";
import projectsList from "../../../public/landing/projects-list.webp";
import helperQuestions from "../../../public/landing/helper-questions.webp";

const at = (n: number) => ({ "--i": n }) as CSSProperties;

// The four steps as one workflow: a numbered node for each step on a rail down the left, joined by a thin line.
// Where the browser has view timelines and the reader has not asked for less motion, the line fills with orange
// as it crosses the screen (.flow-fill in globals.css); everyone else sees the thin line alone.
// From 1024 up each step is one row of the 12-column grid: the node on column 1, the words on columns 2-6, the
// editor piece on columns 7-12. Below 1024 the words and the piece stack to the right of the rail, and each
// piece stays no wider than 560px, so the crops are never shown much bigger than in the editor.
function Step({ i, lead, rest, note, children }: { i: number; lead: string; rest: string; note?: string; children: ReactNode }) {
  const last = i === FLOW.length - 1;
  return (
    <li className={`relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 md:gap-x-6 lg:grid-cols-12 ${last ? "" : "pb-12 lg:pb-16"}`}>
      {!last && (
        <span aria-hidden="true" className="flow-line absolute bottom-0 left-5 top-10 w-px -translate-x-1/2 bg-line-strong">
          <span className="flow-fill block h-full w-full origin-top bg-accent" />
        </span>
      )}
      <span aria-hidden="true" className={`relative flex h-10 w-10 items-center justify-center rounded-full ${FLOW[i].tone} text-step-body font-medium text-ink lg:col-span-1`}>
        {i + 1}
      </span>
      <div data-reveal="" style={at(0)} className="lg:col-span-5 lg:pr-6">
        <p className="max-w-[36ch] pt-0.5 text-step-lead">
          <strong className="font-medium">{lead}</strong> {rest}
        </p>
        {note && <p className="mt-4 max-w-[44ch] text-step-small text-muted">{note}</p>}
      </div>
      <div data-reveal="" style={at(1)}
        className={`${STAGE} col-start-2 mt-6 max-w-[560px] p-4 md:p-6 lg:col-span-6 lg:col-start-7 lg:mt-0 lg:max-w-none lg:p-8`}>
        {children}
      </div>
    </li>
  );
}

// Every editor piece fills the stage inside its padding, up to 460px. The two crops are 1144px wide (2.2 times their real size),
// so they stay sharp at up to 460px.
const CROP = "mx-auto block h-auto w-full max-w-[460px] rounded-card border border-line bg-paper";

// The last step drawn in HTML, like the line check: the page bar when the CV is too long, with Make it fit, then the two
// download buttons, in the editor's own colours. It is a picture of the editor, so it holds no controls and a
// screen reader hears it as one image.
const CONTROL = "inline-flex h-10 items-center gap-2 rounded-control px-4";
function PageFit() {
  return (
    <div data-ui="" role="img" className="rounded-card border border-line bg-paper p-6"
      aria-label="The page bar in the editor. Longer than 1 page, with the Make it fit button. Then the Word and Download PDF buttons.">
      <div aria-hidden="true" className="space-y-5 text-step-small font-medium">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-pill-bad px-2.5 py-0.5 text-pill-bad-ink">Longer than 1 page · 104%</span>
          <span className={`${CONTROL} border border-control`}>Make it fit</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span className={`${CONTROL} border border-control`}><FileText className="h-4 w-4" />Word</span>
            <span className={`${CONTROL} bg-ink text-paper`}>Download PDF</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={`${PAGE} ${SECTION} ${WRAP}`}>
      <h2 id="how-title" data-reveal="" style={at(0)} className={HEADING}>From login to PDF</h2>
      <ol className={AFTER_HEADING}>
        <Step i={0} lead="To begin," note="Not at 42? Skip the login and fill it in by hand."
          rest="log in with 42. PrintCV reads your name, email, campus and passed projects from Intra and puts them on the page.">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={projectsList.src} width={projectsList.width} height={projectsList.height} loading="lazy" decoding="async" className={CROP}
            alt="The Projects part of the editor: ft_irc, miniRT and push_swap came from Intra, and more passed projects wait below." />
        </Step>
        <Step i={1} lead="Then,"
          rest="pick 2 to 4 projects. Answer a few short questions about each one: what you built, what broke, and how you tested it.">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={helperQuestions.src} width={helperQuestions.width} height={helperQuestions.height} loading="lazy" decoding="async" className={CROP}
            alt="The Help me write window for ft_irc, with poll() and three parts of the project picked and a short answer typed in." />
        </Step>
        <Step i={2} lead="After that," note="Your line stays on this page. Nothing is sent."
          rest="write each line in your own words. Five quick checks run on every line while you type.">
          <LineCheck />
        </Step>
        <Step i={3} lead="Last," rest="if the page spills over, press Make it fit. Then download a PDF or a Word file.">
          <PageFit />
        </Step>
      </ol>
    </section>
  );
}
