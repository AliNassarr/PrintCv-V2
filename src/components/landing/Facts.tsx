import type { CSSProperties } from "react";
import { AFTER_HEADING, GRID, HEADING, PAGE, SECTION, STAGE, WRAP } from "./frame";
import lineFlag from "../../../public/landing/line-flag.webp";

const at = (n: number) => ({ "--i": n }) as CSSProperties;

// The picture is a plain <img> served as it is, so its #efeee8 edge (the --stage tone) melts into the stage exactly.
// It grows from scale 1 to 1.04 as it crosses the screen (.mosaic-zoom in globals.css), only where the
// browser has view timelines and only when the reader has not asked for less motion. Everyone else sees it still.

// One picture on columns 1-6; on columns 7-12, what comes from Intra (large), then four short facts.
// From 768 to 1023 the picture runs full width and the two lists sit side by side under it.
export function Facts() {
  return (
    <section id="features" aria-labelledby="features-title" className={`${PAGE} ${SECTION} ${WRAP}`}>
      <h2 id="features-title" data-reveal="" style={at(0)} className={HEADING}>Made for 42 work</h2>
      <div className={`${AFTER_HEADING} ${GRID} gap-y-10`}>
        <div data-reveal="" style={at(1)} className={`${STAGE} relative aspect-[4/3] overflow-hidden lg:col-span-6`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lineFlag.src} width={lineFlag.width} height={lineFlag.height} loading="lazy" decoding="async"
            className="mosaic-zoom absolute inset-0 h-full w-full object-contain"
            alt="A project card in the editor with the note: This is the same line many students have." />
        </div>

        <div className="flex flex-col justify-between gap-10 md:grid md:grid-cols-2 md:gap-6 lg:col-span-6 lg:col-start-7 lg:flex lg:gap-10">
          <ul data-reveal="" style={at(2)} className="space-y-1 text-step-lead font-medium">
            <li>Name and email from Intra</li>
            <li>Campus from Intra</li>
            <li>Passed projects from Intra</li>
            <li>Everything else from you</li>
          </ul>
          <ul data-reveal="" style={at(3)} className="max-w-[44ch] space-y-5 text-step-body tracking-text">
            <li>1 page, always. If it spills over, Make it fit makes the spacing smaller.</li>
            <li>No AI runs here. Help me write gives you a message to paste into any AI chat.</li>
            <li>Your CV is saved in this browser only.</li>
            <li>A4 PDF from the print window, or a .docx you can edit.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
