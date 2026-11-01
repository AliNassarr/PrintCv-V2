// Crops of real editor controls for the landing page, taken at DPR 2 from the demo CV only.
// This is a test browser profile: the script seeds localStorage itself; the studio code never imports
// sample-cv. Run with the server up:
//   MSYS2_ENV_CONV_EXCL=STUDIO_PATH STUDIO_PATH=/studio npx tsx qa/crop.ts [name ...]
// Each crop is the control's box, padded and widened to the shape of the slot it fills on the page.
// The hero cards and the How it works crops are taken at real size, so their text reads as it does in the editor.
import fs from "fs";
import { launch } from "./cdp";
import { DEMO_CV } from "../src/lib/sample-cv";
import type { CVData } from "../src/types/resume";

const ROOT = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
const STUDIO = ROOT + (process.env.STUDIO_PATH ?? "/studio");
const DIR = process.env.CROP_DIR || "public/landing";
const ONLY = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A made-up 42 profile for the demo student (the one on the landing page), with the 12 passed projects the hero
// mentions, so the editor shows its "Your other 42 projects" picker
const ines = DEMO_CV;
const passed = (id: number, name: string, markedAt: string) => ({ id, name, slug: name.toLowerCase(), finalMark: 100, validated: true, markedAt });
const PROFILE = {
  id: 1, login: "ines.sample", email: ines.contact.email, displayname: ines.contact.fullName, image: "", campusName: "", campusId: 0,
  level: 7.84, grade: "", poolMonth: "", poolYear: null, coalition: "", beginAt: "2024-10-01T00:00:00Z",
  validatedProjects: [
    passed(1, "ft_irc", "2026-06-10"), passed(2, "miniRT", "2025-11-12"), passed(3, "push_swap", "2025-03-05"),
    passed(4, "NetPractice", "2025-09-01"), passed(5, "philosophers", "2025-07-15"), passed(6, "minishell", "2025-06-20"),
    passed(7, "Born2beroot", "2025-01-20"), passed(8, "so_long", "2025-02-14"), passed(9, "pipex", "2025-02-01"),
    passed(10, "get_next_line", "2024-12-10"), passed(11, "ft_printf", "2024-11-25"), passed(12, "libft", "2024-11-05"),
  ],
};
// A line from the old shared list, so the editor shows "This is the same line many students have"
const SHARED_LINE = "Developed an RFC-compliant IRC server in C++ implementing non-blocking TCP socket multiplexing via poll().";

type Box = { x: number; y: number; width: number; height: number };

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const { proc, page } = await launch(9353);
  const want = (name: string) => ONLY.length === 0 || ONLY.includes(name);

  const open = async (cv: CVData, opts: { profile?: boolean; width?: number; height?: number; css?: string } = {}) => {
    await page.send("Emulation.setDeviceMetricsOverride", { width: opts.width ?? 1440, height: opts.height ?? 900, deviceScaleFactor: 2, mobile: false });
    await page.goto(STUDIO, 1500);
    const state = { cvData: cv, ...(opts.profile ? { studentProfile: PROFILE } : {}) };
    await page.eval(`localStorage.clear(); localStorage.setItem("printcv_draft_v1", ${JSON.stringify(JSON.stringify({ state, version: 2 }))}); true`);
    await page.goto(STUDIO, 3000);
    // Hides the text cursor and scrollbars, and may narrow the editor column; the controls are untouched.
    // Text boxes then grow to their text again, the same way the editor's TextArea does.
    const css = `*{caret-color:transparent!important;scrollbar-width:none!important} ::-webkit-scrollbar{width:0!important;height:0!important} ${opts.css ?? ""}`;
    await page.eval(`(() => {
      const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.append(s);
      for (const t of document.querySelectorAll('textarea')) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
      return true;
    })()`);
    await sleep(300);
  };
  const run = (js: string) => page.eval(`(async () => { ${js} })()`);
  const rect = (js: string): Promise<Box> => page.eval(`(() => { const el = (${js}); if (!el) throw new Error('crop target not found: ' + ${JSON.stringify(js)}); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  // Pads the box, then grows its shorter side until it has the slot's shape (width / height)
  const shape = (b: Box, pad: number, ratio: number, anchor: "center" | "bottom" | "top" = "center"): Box => {
    let x = b.x - pad, y = b.y - pad, width = b.width + 2 * pad, height = b.height + 2 * pad;
    if (width / height > ratio) {
      const h = width / ratio;
      y = anchor === "bottom" ? y + height - h : anchor === "top" ? y : y - (h - height) / 2;
      height = h;
    } else { const w = height * ratio; x -= (w - width) / 2; width = w; }
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
  };
  // scale renders the clip larger or smaller than DPR 2 (1.5 gives DPR 3 for close-ups)
  const capture = async (name: string, clip: Box, scale = 1) => {
    const r = await page.send("Page.captureScreenshot", { format: "webp", quality: 82, clip: { ...clip, scale } });
    const file = `${DIR}/${name}.webp`;
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    console.log(`${file}  ${Math.round(clip.width * 2 * scale)}x${Math.round(clip.height * 2 * scale)}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
  };
  const clickText = (text: string) => run(`const b = [...document.querySelectorAll('button')].find((e) => e.innerText.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('no button ' + ${JSON.stringify(text)}); b.click();`);

  try {
    // How it works (a) and (b) share one scale: 520px wide at real size (the content is 472px with 24px white on
    // every side), taken at DPR 2.2 so they stay sharp when the page shows them at about 600px.
    const HOW = 520, HOW_SCALE = 1.1, PAD = 24;
    // (a): the projects that came in from 42, folded, then the picker
    if (want("projects-list")) {
      const fresh = { ...ines, projects: ines.projects.map((p) => ({ ...p, bulletPoints: [] })) };
      await open(fresh, { profile: true, css: `#studio-sheet > div{max-width:${HOW}px;margin:0 auto}` });
      await run(`document.querySelectorAll('[data-test-id="item-header"] button[aria-expanded="true"]').forEach((b) => b.click()); await new Promise((r) => setTimeout(r, 400));`);
      const col = await rect(`document.querySelector('#studio-sheet > div')`);
      const top = await rect(`document.querySelector('#studio-sheet h1')`);
      const end = await rect(`[...document.querySelectorAll('#studio-sheet button')].find((b) => b.innerText.includes('Add a project yourself'))`);
      const y = Math.round(top.y - PAD);
      await capture("projects-list", { x: Math.round(col.x), y, width: HOW, height: Math.round(end.y + end.height + PAD) - y }, HOW_SCALE);
    }

    // (b): step 1 of "Help me write", with a few answers picked, down to the first answer box.
    // The window is made 522px wide (520 inside its 1px edge) with square corners; the crop is taken inside the edge.
    if (want("helper-questions")) {
      await open(ines, { height: 1400, css: `[role="dialog"]{max-width:${HOW + 2}px!important;border-radius:0!important}` });
      await run(`document.querySelector('[data-test-id="helper-button"]').click(); await new Promise((r) => setTimeout(r, 700));`);
      for (const t of ["poll()", "Login (PASS, NICK, USER)", "Channels (JOIN, PART, PRIVMSG, TOPIC)", "Operator commands (KICK, INVITE, MODE)", "With 1 other student"]) await clickText(t);
      await run(`const ta = document.querySelector('[role="dialog"] textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ta, 'The poll() loop and the channel commands. My partner wrote the parser.'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.blur();`);
      await sleep(300);
      // What comes after the first answer box is hidden, so nothing of the next question peeks in at the bottom
      await run(`const ta = document.querySelector('[role="dialog"] textarea'); const end = ta.getBoundingClientRect().bottom;
        for (const el of document.querySelectorAll('[role="dialog"] *')) if (!el.contains(ta) && el.getBoundingClientRect().top > end) el.style.visibility = 'hidden';`);
      const d = await rect(`document.querySelector('[role="dialog"]')`);
      const ta = await rect(`document.querySelector('[role="dialog"] textarea')`);
      const y = Math.round(d.y + 1);
      await capture("helper-questions", { x: Math.round(d.x + 1), y, width: HOW, height: Math.round(ta.y + ta.height + PAD) - y }, HOW_SCALE);
    }

    // Facts picture (4:3): a project card whose line many other students also have
    if (want("line-flag")) {
      const shared = { ...ines, projects: [{ ...ines.projects[0], bulletPoints: [SHARED_LINE] }, ines.projects[1]] };
      await open(shared, { css: "#studio-sheet > div{max-width:560px}" });
      // The card alone on the landing's stage colour (--stage), as the Facts picture shows it: its parents get the stage colour, the cards after it are hidden
      await run(`const card = document.querySelector('[data-test-id="item-header"]').parentElement;
        for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) el.style.background = '#efeee8';
        let next = card.nextElementSibling; while (next) { next.style.visibility = 'hidden'; next = next.nextElementSibling; }
        for (const el of document.querySelectorAll('#studio-sheet > div > *')) if (!el.contains(card)) el.style.visibility = 'hidden';`);
      const card = await rect(`document.querySelector('[data-test-id="item-header"]').parentElement`);
      await capture("line-flag", shape(card, 20, 4 / 3));
    }
  } finally { proc.kill(); }
})();
