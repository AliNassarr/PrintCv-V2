import type { CSSProperties } from "react";
import { DEMO_CV } from "@/lib/sample-cv";
import { OutputIndex } from "./OutputIndex";
import { ScoreReceipt } from "./ScoreReceipt";
import { AiMessage } from "./AiMessage";
import { AFTER_HEADING, HEADING, PAGE, SECTION, WRAP } from "./frame";

const at = (n: number) => ({ "--i": n }) as CSSProperties;

// A stage caption sits above each object
function Panel({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="max-w-full">
      <figcaption className="mb-4 text-step-small text-muted">{caption}</figcaption>
      {children}
    </figure>
  );
}

// The demo CV rendered as a high-resolution, pixel-perfect A4 page preview.
// Scales fluidly up to 560px without layout distortion or bottom cutoff across all devices.
function PdfPanel() {
  return (
    <Panel caption="One A4 page, ready to send.">
      <div className="mx-auto w-full max-w-[560px]">
        <img
          src="/landing/sample-cv.webp"
          alt={`Sample CV for ${DEMO_CV.contact.fullName}, ${DEMO_CV.targetRole}, on one clean A4 page`}
          width={794}
          height={1123}
          className="block h-auto w-full rounded-card border border-line bg-paper shadow-sm"
          loading="lazy"
          decoding="async"
        />
      </div>
    </Panel>
  );
}

export function Showcase() {
  return (
    <section id="sample" aria-labelledby="sample-title" className={`${PAGE} ${SECTION} ${WRAP}`}>
      <h2 id="sample-title" data-reveal="" style={at(0)} className={HEADING}>What you get</h2>
      <div data-reveal="" style={at(1)} className={AFTER_HEADING}>
        <OutputIndex
          names={["The PDF", "The score", "The AI message"]}
          panels={[
            <PdfPanel key="pdf" />,
            <Panel key="score" caption="Your score, with the next thing to fix."><ScoreReceipt /></Panel>,
            <Panel key="ai" caption="Paste this into any AI chat. Then paste the answer back."><AiMessage /></Panel>,
          ]}
        />
      </div>
    </section>
  );
}
