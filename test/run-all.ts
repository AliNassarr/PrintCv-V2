// Runs every test/verify-*.ts file, in name order. New check files are picked up by themselves,
// so tasks in parallel lanes never edit this file.
import fs from "fs";
import { spawnSync } from "child_process";
const FILES = fs.readdirSync("test").filter((f) => /^verify-.+\.ts$/.test(f)).sort().map((f) => f.replace(/\.ts$/, ""));
let failed = 0;
for (const f of FILES) {
  const r = spawnSync("npx", ["tsx", `test/${f}.ts`], { stdio: "inherit", shell: true });
  if (r.status !== 0) { failed++; console.log(`FAILED ${f}`); }
}
console.log(failed ? `${failed} check file(s) failed` : "All check files passed");
process.exit(failed ? 1 : 0);
