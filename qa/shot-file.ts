// Screenshots a local HTML file. Usage: npx tsx qa/shot-file.ts <file.html> <outPrefix> [widths, default 390,1440]
import path from "path"; import { launch } from "./cdp";
const [file, prefix, widths = "390,1440"] = process.argv.slice(2);
(async () => {
  const { proc, page } = await launch(9342);
  try {
    for (const w of widths.split(",").map(Number)) {
      await page.viewport(w, 900, w < 640);
      await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), 800);
      await page.shot(`${prefix}-${w}.png`);
    }
  } finally { proc.kill(); }
})();
