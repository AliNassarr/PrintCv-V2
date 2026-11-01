// Checks that CVSheet is server-safe: no client code, no event handlers without onSectionClick. Run: npx tsx test/verify-cvsheet.ts
import fs from "fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";
import { testUser } from "../qa/fixtures/user";
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
// tsx compiles JSX here with React.createElement (tsconfig has "jsx": "preserve"), so React must be global
// before CVSheet is loaded. That is why CVSheet is imported dynamically below.
(globalThis as any).React = React;
(async () => {
  const { CVSheet } = await import("../src/components/templates/CVSheet");
  const cv = createInitialCVFromIntra(testUser);
  cv.projects[0].bulletPoints = ["Built a Bash-like shell in C with pipes and redirections, tested against 300 edge cases."];
  const plain = renderToStaticMarkup(React.createElement(CVSheet, { data: cv }));
  const asP = renderToStaticMarkup(React.createElement(CVSheet, { data: cv, nameAs: "p", dataUi: true }));
  ok(!/\son[a-z]+=/i.test(plain) && !/\son[a-z]+=/i.test(asP), "no on* attributes in the server markup");
  ok(plain.includes("<h1"), "default name tag is h1 (PrintableCV keeps it)");
  ok(!asP.includes("<h1") && asP.includes('data-ui=""'), 'nameAs="p" drops the h1 and dataUi adds data-ui');
  const src = fs.readFileSync("src/components/templates/CVSheet.tsx", "utf8");
  ok(!/["']use client["']/.test(src), 'no "use client"');
  ok(!/\buse(State|Effect|LayoutEffect|Ref|Memo|Callback|Context|Reducer)\s*\(/.test(src), "no hooks");
  ok(!/ResizeObserver|window\.|document\./.test(src), "no browser globals");
  const clicks = src.match(/onClick=\{[^\n]*/g) ?? [];
  ok(clicks.length === 7 && clicks.every((c) => c.startsWith("onClick={onSectionClick ? ")), `all 7 handlers are conditional (found ${clicks.length})`);
  console.log(`cvsheet: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
