import { launch } from "./cdp";
const ROOT = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
(async () => {
  const { proc, page } = await launch(9341);
  try {
    await page.goto(ROOT + "/fonts/OFL-Jost.txt", 800);
    const r = await page.eval(`(async () => {
      const j = new FontFace("Jost", "url(/fonts/jost-latin.woff2)", { weight: "400 500" });
      const b = new FontFace("Bodoni Moda", "url(/fonts/bodoni-moda-latin.woff2)", { weight: "500" });
      await Promise.all([j.load(), b.load()]); document.fonts.add(j); document.fonts.add(b);
      const w = (font, text, extra) => { const s = document.createElement('span'); s.style.cssText = 'position:absolute;white-space:nowrap;font:' + font + ';' + (extra||''); s.textContent = text; document.body.append(s); const x = s.getBoundingClientRect().width; s.remove(); return x; };
      return {
        tnum: w('15px Jost', '1111', 'font-variant-numeric:tabular-nums') === w('15px Jost', '0000', 'font-variant-numeric:tabular-nums'),
        opsz: w('500 48px "Bodoni Moda"', 'Hamburgefonts', 'font-variation-settings:"opsz" 6') !== w('500 48px "Bodoni Moda"', 'Hamburgefonts', 'font-variation-settings:"opsz" 96'),
      };
    })()`);
    console.log(JSON.stringify(r)); process.exitCode = r.opsz ? 0 : 1;
  } finally { proc.kill(); }
})();
