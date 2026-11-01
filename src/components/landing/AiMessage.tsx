import { buildBulletPrompt } from "@/lib/bullet-helper";
import { DEMO_CV } from "@/lib/sample-cv";

// The real "Help me write" message for the demo student's first project.
// Server component: the prompt builder never reaches the browser.
// data-copy-skip: the message is for the AI (it may say "bullet points"), so qa/copy-check.ts skips it.
export function AiMessage() {
  const cv = DEMO_CV;
  const item = cv.projects[0];
  const text = buildBulletPrompt({ target: { kind: "project", item }, answers: {}, cv });
  return (
    <div data-ui="" className="w-[440px] max-w-full rounded-card border border-line bg-paper font-sans text-ink">
      <dl className="border-b border-rule px-5 py-3 text-app">{/* taste-skill-ignore: rows inside this data-ui fragment */}
        <div className="flex gap-2"><dt className="w-14 text-muted">To</dt><dd>ChatGPT, Claude or Gemini</dd></div>
        <div className="mt-1 flex gap-2"><dt className="w-14 text-muted">About</dt><dd>Lines for {item.name}</dd></div>
      </dl>
      <pre data-copy-skip="" className="whitespace-pre-wrap px-5 py-4 font-sans text-app">{text}</pre>
    </div>
  );
}
