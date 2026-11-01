import fs from "fs"; import path from "path"; import JSZip from "jszip";
import { launch } from "./cdp"; import { testUser, TEST_PHONE } from "./fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
const ROOT = (process.env.BASE || "http://localhost:3100").replace(/\/$/, "");
const BASE = ROOT + (process.env.STUDIO_PATH ?? ""); const OUT = path.resolve(process.env.OUT || "qa/out");
const cv = createInitialCVFromIntra(testUser); cv.contact.phoneNumber = TEST_PHONE;
cv.projects[0].bulletPoints = ["Built a Bash-like shell in C with pipes and redirections, tested against 300 edge cases."];
(async () => {
  const { proc, page } = await launch(9336);
  try {
    fs.mkdirSync(OUT, { recursive: true });
    await page.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: OUT, eventsEnabled: true });
    await page.goto(BASE, 1500);
    await page.eval(`localStorage.setItem("printcv_draft_v1", ${JSON.stringify(JSON.stringify({ state: { cvData: cv }, version: 2 }))}); true`);
    await page.goto(BASE, 3000);
    const before = new Set(fs.readdirSync(OUT));
    await page.eval(`(document.querySelector('[data-test-id="word-button"]') || document.querySelector('button[aria-label="Download a Word file"]')).click(); true`);
    let file = "";
    for (let i = 0; i < 40 && !file; i++) { await new Promise((r) => setTimeout(r, 250)); file = fs.readdirSync(OUT).find((f) => f.endsWith(".docx") && !before.has(f)) || ""; }
    if (!file) throw new Error("no docx downloaded");
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(OUT, file)));
    const xml = (await zip.file("word/document.xml")!.async("string")).replace(/w:rsid\w*="[^"]*"/g, "");
    fs.writeFileSync(path.join(OUT, "document.xml"), xml);
    console.log("document.xml bytes:", xml.length);
  } finally { proc.kill(); }
})();
