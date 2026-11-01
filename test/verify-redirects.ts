// Checks old links and login redirects point at the editor. Run: npx tsx test/verify-redirects.ts
import fs from "fs"; import path from "path"; import { pathToFileURL } from "url";
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
(async () => {
  const config = (await import(pathToFileURL(path.resolve("next.config.mjs")).href)).default;
  const list = typeof config.redirects === "function" ? await config.redirects() : [];
  for (const key of ["step", "login", "error"]) {
    ok(list.some((r: any) => r.source === "/" && r.destination === "/studio" && r.permanent === false && r.has?.[0]?.type === "query" && r.has?.[0]?.key === key), `/?${key}= goes to /studio`);
  }
  for (const f of ["src/app/api/auth/callback/42-school/route.ts", "src/app/api/auth/42/login/route.ts"]) {
    const src = fs.readFileSync(f, "utf8");
    ok(!/new URL\("\/",/.test(src), `${f} has no redirect to "/"`);
  }
  ok(fs.readFileSync("src/app/api/auth/callback/42-school/route.ts", "utf8").split('new URL("/studio", origin)').length === 3, "callback sends both error and success to /studio");
  ok(/new URL\("\/studio", origin\)/.test(fs.readFileSync("src/app/api/auth/42/login/route.ts", "utf8")), "login setup error goes to /studio");
  ok(!fs.readFileSync("src/app/page.tsx", "utf8").includes('"use client"'), "/ is a server component");
  const { authErrorMessage, AUTH_ERROR_MESSAGES } = await import("../src/lib/auth-errors");
  ok(authErrorMessage("expired") === AUTH_ERROR_MESSAGES.expired, "known error code shows its message");
  for (const code of ["constructor", "toString", "__proto__", "nonsense"]) {
    ok(authErrorMessage(code) === AUTH_ERROR_MESSAGES.failed, `?error=${code} shows the "failed" message`);
  }
  ok(authErrorMessage(null) === null && authErrorMessage("") === null, "no error code shows nothing");
  console.log(`redirects: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
