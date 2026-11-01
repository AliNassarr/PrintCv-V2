import { Pill } from "@/components/ui/Pill";
import { scoreCV, scoreLabel } from "@/lib/cv-score";
import { DEMO_CV } from "@/lib/sample-cv";

// The score for the demo student, worked out on the server with the editor's own code.
// The four group subtotals add up to the total; the open tips are what to fix next.
export function ScoreReceipt() {
  const cv = DEMO_CV;
  const score = scoreCV(cv, { fitsOnePage: true, allowSampleLines: true });
  const tips = score.groups.flatMap((g) => g.checks).map((c) => c.tip).filter((t): t is string => Boolean(t));
  return (
    <div data-ui="" className="w-[300px] rounded-card border border-line bg-paper p-5 font-sans text-ink">
      <p className="text-app-sm text-muted">CV score for {cv.contact.fullName}</p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="text-app-kpi tabular-nums">{score.total}</span>
        <span className="text-app text-muted">/100</span>
        <Pill tone="positive" className="ml-auto self-center">{scoreLabel(score.total)}</Pill>
      </p>
      <div className="mt-3 h-2 bg-bar"><div className="h-full bg-data" style={{ width: `${score.total}%` }} /></div>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">{/* taste-skill-ignore: rows inside this data-ui fragment */}
        {score.groups.map((g) => (
          <li key={g.id} className="flex min-h-10 items-center justify-between gap-3 py-2 text-app">
            <span>{g.title}</span>
            <span className="tabular-nums text-muted">{g.score}/{g.max}</span>
          </li>
        ))}
        <li className="flex min-h-10 items-center justify-between py-2 text-app font-medium">
          <span>Total</span>
          <span className="tabular-nums">{score.total}/100</span>
        </li>
      </ul>
      <p className="mt-4 text-app-sm font-medium text-muted">Next to fix</p>
      <ul className="mt-1 space-y-1">
        {tips.map((t) => <li key={t} className="text-app">{t}</li>)}
      </ul>
    </div>
  );
}
