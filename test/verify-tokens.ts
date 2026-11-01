// Checks the colour pairs we use for text and edges. Run: npx tsx test/verify-tokens.ts
import fs from "fs";
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const css = fs.readFileSync("src/app/globals.css", "utf8");
const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
const t: Record<string, string> = {};
for (const m of root.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) t[m[1]] = m[2].toLowerCase();
const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const pairs: [string, string, number][] = [
  ["ink", "paper", 4.5], ["ink", "ground", 4.5], ["ink", "active", 4.5], ["ink", "raised", 4.5], ["ink", "mint", 4.5],
  ["muted", "paper", 4.5], ["muted", "ground", 4.5], ["muted", "active", 4.5], ["muted", "raised", 4.5],
  ["muted-on-ink", "ink", 4.5], ["paper", "ink", 4.5], ["mint", "ink", 4.5],
  ["data", "paper", 4.5], ["data", "ground", 4.5], ["data", "raised", 4.5], ["paper", "data", 4.5], ["positive", "paper", 4.5], ["positive", "ground", 4.5],
  ["bad", "paper", 4.5], ["bad", "ground", 4.5], ["warn", "paper", 4.5], ["warn", "ground", 4.5],
  ["pill-pos-ink", "pill-pos", 4.5], ["pill-bad-ink", "pill-bad", 4.5], ["pill-warn-ink", "pill-warn", 4.5], ["pill-neutral-ink", "pill-neutral", 4.5],
  ["field", "paper", 3], ["field", "ground", 3],
];
for (const [fg, bg, min] of pairs) ok(t[fg] && t[bg] && ratio(t[fg], t[bg]) >= min, `${fg} on ${bg} >= ${min} (got ${t[fg] && t[bg] ? ratio(t[fg], t[bg]).toFixed(2) : "missing"})`);
ok(ratio(t["mint"], t["paper"]) < 1.5, "mint on paper stays a field colour only (never text)");
ok(t["positive"] === t["data"], "--positive takes the same value as --data (one face colour)");
const hue = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
ok(Math.abs(hue(t["data"]) - hue(t["mint"])) <= 2, `data keeps mint's hue (data ${hue(t["data"]).toFixed(1)}, mint ${hue(t["mint"]).toFixed(1)})`);
ok(!/00babc/i.test(fs.readFileSync("tailwind.config.ts", "utf8")), "42 teal removed");
console.log(`tokens: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
