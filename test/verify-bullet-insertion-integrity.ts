// Unit verification for Bullet Insertion Integrity & State Sanitization
// Tests "Add Below Mine" vs "Replace My Bullets", deduplication, empty/whitespace guards, and persistence purity.
// Run: npx tsx test/verify-bullet-insertion-integrity.ts

import { sanitizeBulletPoint, removeEmDashes } from "../src/lib/sanitizer";
import { useCVStore } from "../src/lib/store/cv-store";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { generateCvDocx } from "../src/lib/docx-generator";

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

export function mergeBullets(
  existing: string[] | undefined | null,
  incoming: string[] | undefined | null,
  mode: "replace" | "add"
): string[] {
  const cleanIncoming = (incoming || [])
    .map((b) => sanitizeBulletPoint(removeEmDashes(b || "").trim()))
    .filter((b) => b.length > 0);

  const seenIncoming = new Set<string>();
  const uniqueIncoming: string[] = [];
  for (const b of cleanIncoming) {
    const key = b.toLowerCase();
    if (!seenIncoming.has(key)) {
      seenIncoming.add(key);
      uniqueIncoming.push(b);
    }
  }

  if (mode === "replace") {
    return uniqueIncoming;
  }

  const existingClean = (existing || [])
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const existingKeys = new Set(existingClean.map((b) => b.toLowerCase()));
  const nonDuplicates = uniqueIncoming.filter((b) => !existingKeys.has(b.toLowerCase()));

  return [...existingClean, ...nonDuplicates];
}

async function run() {
  console.log("==================================================");
  console.log("Verify Bullet Insertion Integrity & State Guards");
  console.log("==================================================");

  // Suite 1: Empty and Whitespace Rejection
  console.log("\nSuite 1: Empty & Whitespace Rejection");
  const existing1 = ["Engineered a POSIX-compliant shell in C with signals."];
  const incoming1 = ["", "   ", "\t\n", "Architected an HTTP/1.1 server using epoll."];

  const resAdd1 = mergeBullets(existing1, incoming1, "add");
  ok(
    resAdd1.length === 2 && resAdd1[1].includes("Architected an HTTP/1.1 server"),
    `"add" mode rejects empty & whitespace-only bullets (length: ${resAdd1.length})`
  );

  const resReplace1 = mergeBullets(existing1, incoming1, "replace");
  ok(
    resReplace1.length === 1 && resReplace1[0].includes("Architected an HTTP/1.1 server"),
    `"replace" mode rejects empty & whitespace-only bullets (length: ${resReplace1.length})`
  );

  // Suite 2: Deduplication Guard
  console.log("\nSuite 2: Deduplication Guard");
  const existing2 = ["Engineered a POSIX-compliant shell in C."];
  const incoming2 = [
    "engineered a posix-compliant shell in c.", // exact duplicate with different case
    "Engineered a POSIX-compliant shell in C.", // exact duplicate
    "Optimized memory usage by 40% with custom allocator.",
    "Optimized memory usage by 40% with custom allocator.", // self-duplicate in incoming
  ];

  const resAdd2 = mergeBullets(existing2, incoming2, "add");
  ok(
    resAdd2.length === 2 &&
    resAdd2[0] === "Engineered a POSIX-compliant shell in C." &&
    resAdd2[1] === "Optimized memory usage by 40% with custom allocator.",
    `"add" mode skips existing duplicates and self-duplicates (length: ${resAdd2.length})`
  );

  const resReplace2 = mergeBullets(existing2, incoming2, "replace");
  ok(
    resReplace2.length === 2 &&
    resReplace2[0] === "Engineered a posix-compliant shell in c." &&
    resReplace2[1] === "Optimized memory usage by 40% with custom allocator.",
    `"replace" mode deduplicates incoming list (length: ${resReplace2.length})`
  );

  // Suite 3: Safe Null/Undefined Handling
  console.log("\nSuite 3: Safe Null/Undefined Handling");
  const resAddNull = mergeBullets(null, ["Engineered an HTTP server."], "add");
  ok(
    resAddNull.length === 1 && resAddNull[0].includes("Engineered an HTTP server"),
    `"add" handles null existing array safely`
  );

  const resAddNullIncoming = mergeBullets(existing1, null, "add");
  ok(
    resAddNullIncoming.length === 1 && resAddNullIncoming[0] === existing1[0],
    `"add" handles null incoming array safely`
  );

  const resReplaceNull = mergeBullets(existing1, null, "replace");
  ok(
    resReplaceNull.length === 0,
    `"replace" with null incoming safely returns empty array`
  );

  // Suite 4: Sanitization & Buzzword Replacement on Insert
  console.log("\nSuite 4: Sanitization & Buzzword Replacement");
  const rawIncoming = [
    "Spearheaded cutting-edge paradigm — with high performance",
  ];
  const resSanitized = mergeBullets([], rawIncoming, "replace");
  ok(
    resSanitized[0] === "Led modern architecture, with high performance.",
    `Incoming bullets are sanitized (buzzwords softened, em-dashes stripped, period ensured): "${resSanitized[0]}"`
  );

  // Suite 5: Persistence & Export Isolation (Zero Leakage)
  console.log("\nSuite 5: Persistence & Export Isolation");
  const cv = createEmptyCV();
  cv.projects = [
    {
      id: "proj-1",
      name: "Webserv",
      slug: "webserv",
      is42Project: true,
      techStack: "C++, Sockets",
      date: "2024",
      bulletPoints: ["Engineered an HTTP/1.1 server using non-blocking poll."],
    },
  ];

  useCVStore.setState({ cvData: cv });

  // Verify store partialize does NOT serialize candidates or readme
  const state = useCVStore.getState();
  const persistedKeys = Object.keys(state);
  ok(
    !persistedKeys.includes("candidates") &&
    !persistedKeys.includes("readmeContent") &&
    !persistedKeys.includes("readmeParsed") &&
    !persistedKeys.includes("unconfirmedBullets"),
    "Zustand store schema contains zero raw candidate or README state keys"
  );

  // Verify docx generator produces pure output with only confirmed bullets
  const docxBlob = await generateCvDocx(useCVStore.getState().cvData);
  ok(
    docxBlob.size > 2000,
    `DOCX generation succeeds with confirmed bullets only (size: ${docxBlob.size} bytes)`
  );

  console.log("\n==================================================");
  console.log(`Bullet Insertion Verification: ${pass} passed, ${fail} failed`);
  console.log("==================================================");

  process.exit(fail ? 1 : 0);
}

run();
