import type { CSSProperties } from "react";
import { CVSheet } from "@/components/templates/CVSheet";
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

// The demo CV at a true 560px where the stage has room. Where it has less (phones) the sheet shrinks to
// the stage's width less its 16px inset, so no printed line is cut at its right edge. The box keeps the A4 shape,
// so the whole page shows and the scaled sheet leaves no empty space below it.
// --pdf-scale = sheet width / 793.7px (the A4 width at 96 dpi), with the same tan(atan2(a, b)) = a / b
// trick as the hero; 100cqw is the stage's width (OutputIndex makes it a container).
const FIT = "[--pdf-w:min(560px,100cqw_-_32px)] md:[--pdf-w:min(560px,100cqw_-_64px)] [--pdf-scale:tan(atan2(var(--pdf-w),793.7px))]";
function PdfPanel() {
  return (
    <Panel caption="One A4 page, ready to send.">
      <div className={`aspect-[210/297] w-[var(--pdf-w)] overflow-hidden bg-paper ${FIT}`}>
        <div className="w-[210mm] origin-top-left" style={{ transform: "scale(var(--pdf-scale))" }}>
          <CVSheet data={DEMO_CV} nameAs="p" dataUi />
        </div>
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
