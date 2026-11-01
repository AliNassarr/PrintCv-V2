import fs from "fs"; import { launch } from "./cdp";
const [a, b] = process.argv.slice(2);
// The right-hand strip holds the browser scrollbar, whose look is a style choice, not CV output.
const IGNORE_RIGHT = Number(process.env.IGNORE_RIGHT ?? 16);
const url = (f: string) => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
(async () => {
  const { proc, page } = await launch(9340);
  try {
    const share: number = await page.eval(`(async () => {
      const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = s; });
      const [x, y] = await Promise.all([load(${JSON.stringify(url(a))}), load(${JSON.stringify(url(b))})]);
      if (x.width !== y.width || x.height !== y.height) return 1;
      const c = document.createElement('canvas'); c.width = x.width; c.height = x.height; const g = c.getContext('2d');
      g.drawImage(x, 0, 0); const p = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(y, 0, 0); const q = g.getImageData(0, 0, c.width, c.height).data;
      const w = Math.max(1, c.width - ${IGNORE_RIGHT});
      let d = 0;
      for (let i = 0; i < p.length; i += 4) {
        if ((i / 4) % c.width >= w) continue;
        if (Math.abs(p[i]-q[i]) + Math.abs(p[i+1]-q[i+1]) + Math.abs(p[i+2]-q[i+2]) > 24) d++;
      }
      return d / (w * c.height);
    })()`);
    console.log(JSON.stringify({ share }));
    process.exitCode = share <= Number(process.env.MAX_SHARE ?? 0.001) ? 0 : 1;
  } finally { proc.kill(); }
})();
