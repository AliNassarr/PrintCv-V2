// Compares two print-metrics.json files. Usage: npx tsx qa/print-compare.ts <beforeDir> <afterDir> [--allow-shadow]
import fs from "fs"; import path from "path";
const [beforeDir, afterDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const allowShadow = process.argv.includes("--allow-shadow");
const load = (dir: string) => {
  const m = JSON.parse(fs.readFileSync(path.join(dir, "print-metrics.json"), "utf8"));
  if (m.error || !(m.height > 1000) || !/calibri|arial/i.test(m.sheet?.fontFamily ?? "")) {
    console.log(`INVALID ${dir}: ${m.error ?? `height ${m.height}, font ${m.sheet?.fontFamily}`}`); process.exit(1);
  }
  return m;
};
const a = load(beforeDir), b = load(afterDir);
// --allow-shadow: Task 11 removes a screen-only shadow class; the class list may differ, nothing else may.
const clean = (html: string) => (allowShadow ? html.replace(/\sshadow-[\w\[\]\-.,()/]+/g, "") : html);
let diff = 0;
for (const k of ["sheet", "h1", "firstLi", "height", "text", "html"] as const) {
  const x = k === "html" ? clean(a[k]) : JSON.stringify(a[k]);
  const y = k === "html" ? clean(b[k]) : JSON.stringify(b[k]);
  if (x !== y) { console.log("DIFF", k); diff++; }
}
console.log(diff ? `${diff} difference(s)` : "PRINT-SAME");
process.exit(diff ? 1 : 0);
