"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { runLineChecks } from "@/lib/line-checks";

const START = "I worked on minishell with my team";

export function LineCheck() {
  const id = useId();
  const [text, setText] = useState(START);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState(() => summarize(START));
  useEffect(() => setReady(true), []);
  const checks = useMemo(() => runLineChecks(text), [text]);
  // Announce the count only after typing stops
  useEffect(() => { const t = setTimeout(() => setSummary(summarize(text)), 400); return () => clearTimeout(t); }, [text]);
  return (
    <div id="check" data-ui="" className="rounded-card border border-line bg-paper p-6">
      <label htmlFor={id} className="block text-step-lead font-medium">Try it: write a line about one of your projects</label>
      <textarea id={id} rows={3} value={text} readOnly={!ready} onChange={(e) => setText(e.target.value)}
        className="mt-4 w-full resize-none rounded-control border border-field bg-paper p-3 text-step-body focus:border-ink" />
      <ul className="mt-4 divide-y divide-rule">{/* taste-skill-ignore: rows inside this data-ui fragment */}
        {checks.map((c) => (
          <li key={c.question} className="flex min-h-11 items-center justify-between gap-4 py-2 text-step-small">
            <span>{c.question}</span>
            <span className={c.pass ? "rounded-full bg-pill-pos px-2.5 py-0.5 font-medium text-pill-pos-ink" : "rounded-full bg-pill-bad px-2.5 py-0.5 font-medium text-pill-bad-ink"}>{c.pass ? "Yes" : "No"}</span>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-4 text-step-small text-muted">{summary}</p>
    </div>
  );
}

function summarize(text: string) {
  const r = runLineChecks(text); const n = r.filter((c) => c.pass).length; const first = r.find((c) => !c.pass);
  return `${n} of 5 checks pass.${first ? ` ${first.hint}` : ""}`;
}
