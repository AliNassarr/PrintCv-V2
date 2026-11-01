// The share image (Open Graph): the landing hero at 1200x630, DPR 1, with the PrintCV wordmark but without
// the rest of the top bar, the two links and the caption under the sheet. Run with the server up:  npx tsx qa/og.ts
// CDP screenshots carry no metadata. Reduced motion is emulated so nothing moves.
import fs from "fs";
import { launch } from "./cdp";

const ROOT = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
const PNG = "src/app/opengraph-image.png";
const ALT = "src/app/opengraph-image.alt.txt";
// Of the top bar (not the CV sheet's header) only the wordmark stays. In the hero the two links and the caption
// above the sheet are hidden; the headline, the line under it and the sheet stay as built.
const STYLE = [
  "html{scrollbar-width:none}",
  "header:not(.cv-sheet header) nav > :not(:first-child),#hero a,#hero-window{display:none!important}",
].join(" ");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { proc, page } = await launch(9356);
  try {
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await page.goto(ROOT + "/", 1500);
    await page.eval(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(STYLE)}; document.head.append(s); return true; })()`);
    await sleep(2000);
    const r = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
    fs.writeFileSync(PNG, Buffer.from(r.data, "base64"));
    fs.writeFileSync(ALT, "PrintCV: your 42 projects on one clean page");
    console.log(`${PNG}  ${(fs.statSync(PNG).size / 1024).toFixed(1)} KB`);
  } finally { proc.kill(); }
})();
