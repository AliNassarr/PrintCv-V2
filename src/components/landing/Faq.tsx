import type { CSSProperties } from "react";
import { AFTER_HEADING, HEADING, PAGE, SECTION, WRAP } from "./frame";

const at = (n: number) => ({ "--i": n }) as CSSProperties;

// Every answer is always visible. The login answer matches src/lib/auth-session.ts and the
// IntraProfile from src/lib/intra/extract-profile.ts: the whole profile (name, login, user id,
// email, photo link, campus, level, grade, pool and start dates, passed projects with marks and
// dates) sits in a signed, httpOnly cookie for 24 hours, and the server keeps no copy.
const QUESTIONS = [
  { q: "Is PrintCV free?", a: "Yes. No card, no trial and no paid plan." },
  { q: "Is PrintCV made by 42?", a: "No. PrintCV is not made by or linked to 42. It is an independent project." },
  { q: "What does Log in with 42 read?", a: "Your name, login, 42 user number, email, photo link and campus. Also your level, grade, pool and start dates, and the projects you passed with their marks and dates. They pass through the PrintCV server during login. Then they sit in a signed cookie in your browser for up to 24 hours. The server keeps no copy." },
  { q: "Where is my CV saved?", a: "In this browser only. Nothing is sent to a server. Clearing your browser data deletes it, so download a PDF when you finish." },
  { q: "Does it use AI?", a: "No AI runs here. Help me write gives you a message to paste into ChatGPT, Claude or Gemini. You paste the answer back and edit it." },
  { q: "Why one page?", a: "One page is quick to read. It shows your best projects first, with nothing to scroll." },
  { q: "Can I use it without 42?", a: "Yes. Open the editor and fill it in by hand. Your saved CV opens there too." },
];

// The cream page with a thin line above: the heading, then every question with its answer right under it,
// in two balanced columns from 768 up (the second starts on column 7).
export function Faq() {
  return (
    <section id="questions" aria-labelledby="questions-title" className={`${PAGE} border-t border-line ${SECTION} ${WRAP}`}>
      <h2 id="questions-title" data-reveal="" style={at(0)} className={HEADING}>Questions</h2>
      <div className={`${AFTER_HEADING} -mb-10 gap-x-6 md:columns-2 lg:-mb-12`}>
        {QUESTIONS.map(({ q, a }) => (
          <div key={q} data-reveal="" style={at(1)} className="mb-10 break-inside-avoid lg:mb-12">
            <h3 className="text-step-lead font-medium">{q}</h3>
            <p className="mt-2 max-w-[56ch] text-step-body tracking-text">{a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
