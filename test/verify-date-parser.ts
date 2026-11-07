// Unit verification for parseDateRange helper
// Run: npx tsx test/verify-date-parser.ts

import { parseDateRange } from "../src/lib/date-parser";

let pass = 0;
let fail = 0;

function ok(condition: unknown, message: string) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${message}`);
  } else {
    fail++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log("==================================================");
console.log("Verify Date Range Parser");
console.log("==================================================");

// Case 1: ISO dates with en-dash: "2023-09 – 2024-05"
const r1 = parseDateRange("2023-09 – 2024-05");
ok(
  r1.startDate === "2023-09" && r1.endDate === "2024-05" && r1.isCurrent === false,
  `"2023-09 – 2024-05" -> start: "${r1.startDate}", end: "${r1.endDate}", isCurrent: ${r1.isCurrent}`
);

// Case 2: Full ISO dates with hyphen range: "2023-09-01 - 2024-05-30"
const r2 = parseDateRange("2023-09-01 - 2024-05-30");
ok(
  r2.startDate === "2023-09-01" && r2.endDate === "2024-05-30" && r2.isCurrent === false,
  `"2023-09-01 - 2024-05-30" -> start: "${r2.startDate}", end: "${r2.endDate}"`
);

// Case 3: Month year with Present: "January 2023 – Present"
const r3 = parseDateRange("January 2023 – Present");
ok(
  r3.startDate === "January 2023" && r3.endDate === "Present" && r3.isCurrent === true,
  `"January 2023 – Present" -> start: "${r3.startDate}", end: "${r3.endDate}", isCurrent: ${r3.isCurrent}`
);

// Case 4: Spaced hyphen: "2023 - 2026"
const r4 = parseDateRange("2023 - 2026");
ok(
  r4.startDate === "2023" && r4.endDate === "2026" && r4.isCurrent === false,
  `"2023 - 2026" -> start: "${r4.startDate}", end: "${r4.endDate}"`
);

// Case 5: Single month-year: "September 2025"
const r5 = parseDateRange("September 2025");
ok(
  r5.startDate === "September 2025" && r5.endDate === "" && r5.isCurrent === false,
  `"September 2025" -> start: "${r5.startDate}", end: "${r5.endDate}"`
);

// Case 6: Single year: "2023"
const r6 = parseDateRange("2023");
ok(
  r6.startDate === "2023" && r6.endDate === "" && r6.isCurrent === false,
  `"2023" -> start: "${r6.startDate}", end: "${r6.endDate}"`
);

// Case 7: Empty or whitespace
const r7a = parseDateRange("");
const r7b = parseDateRange("   ");
const r7c = parseDateRange(null);
ok(
  r7a.startDate === "" && r7a.endDate === "" && r7a.isCurrent === false &&
  r7b.startDate === "" && r7b.endDate === "" &&
  r7c.startDate === "" && r7c.endDate === "",
  `Empty / whitespace / null dates return empty fields`
);

// Case 8: Lone Present
const r8 = parseDateRange("Present");
ok(
  r8.startDate === "" && r8.endDate === "Present" && r8.isCurrent === true,
  `"Present" -> start: "", end: "Present", isCurrent: true`
);

// Case 9: Word "to": "Sep 2022 to May 2024"
const r9 = parseDateRange("Sep 2022 to May 2024");
ok(
  r9.startDate === "Sep 2022" && r9.endDate === "May 2024" && r9.isCurrent === false,
  `"Sep 2022 to May 2024" -> start: "${r9.startDate}", end: "${r9.endDate}"`
);

// Case 10: Tight en-dash: "2022–2023"
const r10 = parseDateRange("2022–2023");
ok(
  r10.startDate === "2022" && r10.endDate === "2023" && r10.isCurrent === false,
  `"2022–2023" -> start: "${r10.startDate}", end: "${r10.endDate}"`
);

// Case 11: Tight em-dash: "2022—2023"
const r11 = parseDateRange("2022—2023");
ok(
  r11.startDate === "2022" && r11.endDate === "2023" && r11.isCurrent === false,
  `"2022—2023" -> start: "${r11.startDate}", end: "${r11.endDate}"`
);

// Case 12: Tight en-dash with ISO dates: "2023-09–2024-05"
const r12 = parseDateRange("2023-09–2024-05");
ok(
  r12.startDate === "2023-09" && r12.endDate === "2024-05" && r12.isCurrent === false,
  `"2023-09–2024-05" -> start: "${r12.startDate}", end: "${r12.endDate}"`
);

// Case 13: Tight em-dash with ISO dates: "2023-09—2024-05"
const r13 = parseDateRange("2023-09—2024-05");
ok(
  r13.startDate === "2023-09" && r13.endDate === "2024-05" && r13.isCurrent === false,
  `"2023-09—2024-05" -> start: "${r13.startDate}", end: "${r13.endDate}"`
);

// Case 14: Tight en-dash with Present: "2022–Present"
const r14 = parseDateRange("2022–Present");
ok(
  r14.startDate === "2022" && r14.endDate === "Present" && r14.isCurrent === true,
  `"2022–Present" -> start: "${r14.startDate}", end: "${r14.endDate}", isCurrent: ${r14.isCurrent}`
);

// Case 15: Tight em-dash with Present: "2022—Present"
const r15 = parseDateRange("2022—Present");
ok(
  r15.startDate === "2022" && r15.endDate === "Present" && r15.isCurrent === true,
  `"2022—Present" -> start: "${r15.startDate}", end: "${r15.endDate}", isCurrent: ${r15.isCurrent}`
);

// Case 16: Tight standard hyphen between 4-digit years: "2022-2023"
const r16 = parseDateRange("2022-2023");
ok(
  r16.startDate === "2022" && r16.endDate === "2023" && r16.isCurrent === false,
  `"2022-2023" -> start: "${r16.startDate}", end: "${r16.endDate}"`
);

// Case 17: Tight standard hyphen with Present: "2022-Present"
const r17 = parseDateRange("2022-Present");
ok(
  r17.startDate === "2022" && r17.endDate === "Present" && r17.isCurrent === true,
  `"2022-Present" -> start: "${r17.startDate}", end: "${r17.endDate}", isCurrent: ${r17.isCurrent}`
);

// Case 18: ISO date hyphens are NEVER mistaken for range separators
const r18a = parseDateRange("2023-09");
const r18b = parseDateRange("2023-09-01");
ok(
  r18a.startDate === "2023-09" && r18a.endDate === "" && r18a.isCurrent === false &&
  r18b.startDate === "2023-09-01" && r18b.endDate === "" && r18b.isCurrent === false,
  `ISO date hyphens preserved: "2023-09" -> "${r18a.startDate}", "2023-09-01" -> "${r18b.startDate}"`
);

// Case 19: Reproduction check proving why \s*[–—]\s+ would fail on tight dashes
const buggyRegex = /\s*[–—]\s+/;
const tightDashes = ["2022–2023", "2022—2023", "2023-09–2024-05", "2022–Present"];
const buggyFails = tightDashes.every((s) => s.split(buggyRegex).length === 1);
ok(
  buggyFails,
  `Reproduction verified: \\s*[–—]\\s+ fails to split tight dashes (all return 1 unsplit part)`
);

console.log("\n==================================================");
console.log(`Date Parser Verification: ${pass} passed, ${fail} failed`);
console.log("==================================================");

process.exit(fail ? 1 : 0);
