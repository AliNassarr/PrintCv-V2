// Re-encodes found pictures (jpg or png) as webp through a Chrome canvas. Drawing to a canvas keeps the
// pixels only, so EXIF and every other metadata block is dropped.
//   npx tsx qa/to-webp.ts scratch/assets/a.jpg [more files] [--to public/landing] [--width 1600] [--quality 0.82]
// Each file is saved as <to>/<name>.webp, scaled down to --width if it is wider.
import fs from "fs";
import path from "path";
import { launch } from "./cdp";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const TO = opt("to", "public/landing");
const WIDTH = Number(opt("width", "1600"));
const QUALITY = Number(opt("quality", "0.82"));
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

(async () => {
  if (args.length === 0) { console.log("usage: npx tsx qa/to-webp.ts <file.jpg> [...] [--to dir] [--width px] [--quality 0-1]"); process.exit(1); }
  fs.mkdirSync(TO, { recursive: true });
  const { proc, page } = await launch(9354);
  try {
    for (const file of args) {
      const type = TYPES[path.extname(file).toLowerCase()];
      if (!type) { console.log(`skip ${file}: not a jpg, png or webp`); continue; }
      const src = `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
      const out: { data: string; w: number; h: number } = await page.eval(`new Promise((done, fail) => {
        const img = new Image();
        img.onload = () => {
          const w = Math.min(img.naturalWidth, ${WIDTH}), h = Math.round(img.naturalHeight * w / img.naturalWidth);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
          done({ data: c.toDataURL('image/webp', ${QUALITY}).split(',')[1], w, h });
        };
        img.onerror = () => fail(new Error('could not load ' + ${JSON.stringify(file)}));
        img.src = ${JSON.stringify(src)};
      })`);
      const dest = path.join(TO, path.basename(file, path.extname(file)) + ".webp");
      fs.writeFileSync(dest, Buffer.from(out.data, "base64"));
      console.log(`${dest}  ${out.w}x${out.h}  ${(fs.statSync(dest).size / 1024).toFixed(1)} KB`);
    }
  } finally { proc.kill(); }
})();
