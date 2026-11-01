// Landing checks: hero sheet display per motion setting, five type steps, the hero headline largest, one heading size
// and left edge, few grounds, no sideways scroll. Run with the server up.
import fs from "fs"; import { launch } from "./cdp";
const ROOT = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
const OUT = process.env.OUT || "qa/out";
(async () => {
  const { proc, page } = await launch(9343);
  const out: Record<string, unknown> = {}; let fail = 0;
  const ok = (c: unknown, m: string) => { if (!c) { fail++; console.log("FAIL", m); } };
  const motion = (v: "reduce" | "no-preference") => page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: v }] });
  try {
    // 1. The hero is calm: one still sample sheet, no cards and no Pause button
    await motion("no-preference"); await page.viewport(1440, 900); await page.goto(ROOT + "/", 2000);
    const hero = JSON.parse(await page.eval(`JSON.stringify({ sheets: document.querySelectorAll('#hero .cv-sheet').length,
      lists: [...document.querySelectorAll('#hero ul')].filter((u) => !u.closest('.cv-sheet')).length, buttons: document.querySelectorAll('#hero button').length })`));
    out.hero = hero;
    ok(hero.sheets === 1, `hero shows one sample sheet (got ${hero.sheets})`);
    ok(hero.lists === 0 && hero.buttons === 0, `hero has no cards and no buttons (got ${hero.lists} lists, ${hero.buttons} buttons)`);
    // 2. Five type steps at most, 3. the hero headline is the largest text, 4. one heading size and one left edge
    // for every section heading, 5. three section grounds besides the mint field, 6. no sideways scroll
    await motion("reduce");
    for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
      await page.viewport(w, h, w < 640); await page.goto(ROOT + "/", 2000);
      const r = await page.eval(`(() => {
        const sizes = new Set();
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('.cv-sheet, [data-ui], script, style, svg, .sr-only')) continue;
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          sizes.add(getComputedStyle(el).fontSize);
        }
        const h1 = document.querySelector('#hero-title');
        const h1Size = parseFloat(getComputedStyle(h1).fontSize);
        const h1Lines = Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight));
        const heads = [...document.querySelectorAll('main section h2')].map((e) => ({ id: e.id, size: getComputedStyle(e).fontSize, left: Math.round(e.getBoundingClientRect().left) }));
        const grounds = new Set([...document.querySelectorAll('main > section, footer')].map((e) => getComputedStyle(e).backgroundColor));
        const margin = innerWidth >= 1024 ? 32 : innerWidth >= 768 ? 24 : 16;
        return { sizes: [...sizes], h1Size, h1Lines, largest: Math.max(...[...sizes].map(parseFloat)), heads, margin, grounds: [...grounds],
                 overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      })()`);
      out[`w${w}`] = r;
      ok(r.sizes.length <= 5, `${w}: at most 5 landing text sizes (got ${r.sizes.join(", ")})`);
      ok(r.h1Size >= r.largest, `${w}: the hero headline (${r.h1Size}px) is the largest text (largest ${r.largest}px)`);
      ok(r.h1Lines <= 2, `${w}: the hero headline uses ${r.h1Lines} lines (max 2)`);
      ok(new Set(r.heads.map((x: { size: string }) => x.size)).size === 1, `${w}: one size for every section heading (${r.heads.map((x: { id: string; size: string }) => `${x.id} ${x.size}`).join(", ")})`);
      ok(r.heads.every((x: { left: number }) => Math.abs(x.left - r.margin) <= 4), `${w}: every section heading starts on the ${r.margin}px margin (${r.heads.map((x: { id: string; left: number }) => `${x.id} ${x.left}`).join(", ")})`);
      ok(r.grounds.length <= 4, `${w}: at most 4 section grounds, mint included (got ${r.grounds.join(", ")})`);
      ok(r.overflow === 0, `${w}: no sideways scroll`);
    }
    fs.writeFileSync(`${OUT}/landing.json`, JSON.stringify(out, null, 2));
    console.log(fail ? `landing: ${fail} failed` : "landing: all passed");
    process.exitCode = fail ? 1 : 0;
  } finally { proc.kill(); }
})();
