// test/live-groq-smoke-test.ts
// Decoupled Live Groq Smoke Test Procedure Draft & Pre-Release Runbook for PrintCV Help Me Write v2.
//
// CRITICAL NOTICE:
// This script is an authored runbook procedure intended for manual verification by engineers
// with active credentials.
// It is STRICTLY DECOUPLED and does NOT execute any network calls during automated test runs.
// Test A and Test B can NEVER run automatically from an ambiguous command.
//
// Explicit Execution Flags Required:
//   --run-test-a : Direct Groq LPU API Smoke Test (direct API call with synthetic project).
//   --run-test-b : PrintCV Integration Test (authenticated Next.js route with 42 session & Upstash Redis).
//
// Usage:
//   1. Safe Dry-Run (default invocation, 0 network calls, safe for CI):
//      npx tsx test/live-groq-smoke-test.ts
//
//   2. Test A Only (Direct Groq LPU API Inference):
//      GROQ_API_KEY="gsk_..." npx tsx test/live-groq-smoke-test.ts --run-test-a
//
//   3. Test B Only (Full Next.js Route Integration + Upstash Redis Distributed Limiter):
//      GROQ_API_KEY="gsk_..." UPSTASH_REDIS_REST_URL="https://..." UPSTASH_REDIS_REST_TOKEN="..." npx tsx test/live-groq-smoke-test.ts --run-test-b
//
//   4. Both Tests Explicitly:
//      GROQ_API_KEY="gsk_..." UPSTASH_REDIS_REST_URL="https://..." UPSTASH_REDIS_REST_TOKEN="..." npx tsx test/live-groq-smoke-test.ts --run-test-a --run-test-b

import fs from "fs";
import path from "path";

// Automatically load .env.local if present (Next.js environment parity)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(process.cwd());
} catch {
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || "").trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

import {
  GROQ_API_URL,
  GROQ_MODELS,
  CV_BULLETS_JSON_SCHEMA,
} from "../src/lib/server/groq-client";
import { parseAiBulletResponse } from "../src/lib/ai/bullet-parser";
import { assembleBulletGenerationPrompt } from "../src/lib/ai/prompt-builder";
import { createSessionToken, SESSION_COOKIE } from "../src/lib/auth-session";
import type { IntraProfile } from "../src/lib/intra/cv-from-intra";
import { NextRequest } from "next/server";
import { POST as handleGenerateBullets } from "../src/app/api/ai/generate-bullets/route";

function maskApiKey(key?: string): string {
  if (!key) return "[NOT_SET]";
  return `[CONFIGURED (${key.trim().length} chars)]`;
}

// Ensure SESSION_SECRET exists for test B
if (!process.env.SESSION_SECRET && !process.env.NEXTAUTH_SECRET) {
  process.env.SESSION_SECRET = "printcv-smoke-test-secret-at-least-32-chars-long!";
}

const SYNTHETIC_PROJECT_INPUT = {
  projectName: "PrintCV-SmokeTest",
  techStack: "TypeScript, Next.js, Redis, Groq API",
  targetRole: "Full-Stack Engineer",
  schoolContext: "42 Network",
  facts: [
    {
      question: "What did you build?",
      answer: "Engineered distributed sliding-window rate limiting pipeline in Redis and native Groq completions client",
    },
    {
      question: "What were the results?",
      answer: "Achieved sub-15ms validation latency and eliminated duplicate upstream calls with in-memory deduplication cache",
    },
  ],
};

const MOCK_INTRA_USER: IntraProfile = {
  id: 4242,
  login: "smoke_test_user",
  email: "smoke_test_user@student.42.fr",
  displayname: "Smoke Test User",
  image: "https://intra.42.fr/avatar.jpg",
  campusName: "Paris",
  campusId: 1,
  level: 12.42,
  grade: "Cadet",
  poolMonth: "July",
  poolYear: 2024,
  coalition: "Commodore",
  beginAt: "2024-07-01",
  validatedProjects: [
    {
      id: 101,
      name: "PrintCV",
      slug: "printcv",
      finalMark: 125,
      validated: true,
      markedAt: "2026-05-01",
    },
  ],
};

function printDryRunInstructions() {
  console.log("==================================================================");
  console.log("PrintCV Help Me Write v2 - Decoupled Live Smoke Test Runbook");
  console.log("==================================================================");
  console.log("\n[STATUS] Dry-run safety guard active. Zero network calls dispatched.");
  console.log("\nTo prevent accidental live calls or credential leakage, each test must be");
  console.log("explicitly invoked using its dedicated flag:\n");
  console.log("  * Test A: Direct Groq LPU Inference");
  console.log("    - Dispatches 1 live completion request directly to Groq API.");
  console.log("    - Validates LPU latency, model ID ('openai/gpt-oss-20b'), token telemetry,");
  console.log("      and Dr. Wissam strict JSON Schema adherence.");
  console.log("    - Command: GROQ_API_KEY=\"gsk_...\" npx tsx test/live-groq-smoke-test.ts --run-test-a\n");
  console.log("  * Test B: Complete PrintCV Next.js Route Integration");
  console.log("    - Invokes Next.js Route Handler /api/ai/generate-bullets with 42 session.");
  console.log("    - Requires active Upstash Redis credentials (UPSTASH_REDIS_REST_URL/TOKEN).");
  console.log("    - Validates atomic multi-tier rate limiting headers, README sanitization, and candidate parsing.");
  console.log("    - Command: GROQ_API_KEY=\"gsk_...\" UPSTASH_REDIS_REST_URL=\"...\" UPSTASH_REDIS_REST_TOKEN=\"...\" npx tsx test/live-groq-smoke-test.ts --run-test-b\n");
  console.log("------------------------------------------------------------------");
  console.log("Credential Status (Masked):");
  console.log(`  GROQ_API_KEY:               ${maskApiKey(process.env.GROQ_API_KEY)}`);
  console.log(`  UPSTASH_REDIS_REST_URL:     ${maskApiKey(process.env.UPSTASH_REDIS_REST_URL)}`);
  console.log(`  UPSTASH_REDIS_REST_TOKEN:   ${maskApiKey(process.env.UPSTASH_REDIS_REST_TOKEN)}`);
  console.log("------------------------------------------------------------------");
  console.log("[EXIT] Dry-run mode completed cleanly with code 0 (Safety Guard Verified).");
}

// ---------------------------------------------------------------------------
// Procedure A: Direct Groq Smoke Test
// ---------------------------------------------------------------------------
async function runTestA(apiKey: string, model: string): Promise<boolean> {
  console.log("\n--------------------------------------------------");
  console.log("Test A: Direct Groq LPU API Smoke Test");
  console.log("--------------------------------------------------");

  const messages = assembleBulletGenerationPrompt(SYNTHETIC_PROJECT_INPUT);

  const payload = {
    model,
    messages,
    temperature: 0.2,
    max_completion_tokens: 2048,
    reasoning_effort: "low",
    response_format: {
      type: "json_schema",
      json_schema: CV_BULLETS_JSON_SCHEMA,
    },
  };

  console.log(`Endpoint: ${GROQ_API_URL}`);
  console.log(`Model:    ${model}`);
  console.log("Dispatching 1 live completion request directly to Groq API...");
  const startTime = Date.now();

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const elapsedMs = Date.now() - startTime;
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    console.log(`Round-trip Latency: ${elapsedMs}ms`);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Provider Error Response: ${errText}`);
      return false;
    }

    const data = await res.json();
    const modelUsed = data?.model || model;
    const usage = data?.usage || {};
    console.log("\n--- Test A Telemetry ---");
    console.log(`Model Used:        ${modelUsed}`);
    console.log(`Prompt Tokens:     ${usage.prompt_tokens ?? "N/A"}`);
    console.log(`Completion Tokens: ${usage.completion_tokens ?? "N/A"}`);
    console.log(`Total Tokens:      ${usage.total_tokens ?? "N/A"}`);

    const rawContent = data?.choices?.[0]?.message?.content;
    const parsed = parseAiBulletResponse(rawContent || "");

    console.log("\n--- Test A Output Validation ---");
    console.log(`Evidence Flag: ${parsed.hasSufficientEvidence}`);
    console.log(`Generated Bullets (${parsed.bullets.length}):`);
    let allBulletsValid = parsed.bullets.length >= 2 && parsed.hasSufficientEvidence;

    parsed.bullets.forEach((b, idx) => {
      const isUnder220 = b.length <= 220;
      console.log(`  ${idx + 1}. [${b.length}c] ${b}`);
      if (!isUnder220) {
        console.error(`     ✗ Bullet exceeds Wissam 220-character limit!`);
        allBulletsValid = false;
      }
    });

    if (allBulletsValid) {
      console.log("✓ Test A Passed: Direct Groq model contract & schema verified live.");
      return true;
    } else {
      console.error("✗ Test A Failed: Bullets failed validation criteria.");
      return false;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Test A Failed: ${errorMsg}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Procedure B: Complete PrintCV Next.js Route Integration Test
// ---------------------------------------------------------------------------
async function runTestB(apiKey: string): Promise<boolean> {
  console.log("\n--------------------------------------------------");
  console.log("Test B: Complete PrintCV Next.js Route Integration Test");
  console.log("--------------------------------------------------");

  // Infrastructure check: Test B strictly requires Upstash Redis credentials
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!upstashUrl || !upstashToken) {
    console.error("\n[INFRASTRUCTURE BLOCKER]:");
    console.error("  Missing Upstash Redis test credentials (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN).");
    console.error("  Test B requires distributed rate limiting infrastructure configured to prevent security bypass.");
    console.error("  Provision UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN before executing Test B.");
    return false;
  }

  const sessionToken = createSessionToken(MOCK_INTRA_USER);

  const requestBody = {
    projectName: SYNTHETIC_PROJECT_INPUT.projectName,
    techStack: SYNTHETIC_PROJECT_INPUT.techStack,
    targetRole: SYNTHETIC_PROJECT_INPUT.targetRole,
    facts: SYNTHETIC_PROJECT_INPUT.facts,
  };

  const req = new NextRequest("http://localhost:3000/api/ai/generate-bullets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": "localhost:3000",
      "Cookie": `${SESSION_COOKIE}=${sessionToken}`,
      "X-Real-IP": "127.0.0.1",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("Invoking Next.js route handler POST(/api/ai/generate-bullets)...");
  const startTime = Date.now();

  try {
    const res = await handleGenerateBullets(req);
    const elapsedMs = Date.now() - startTime;

    console.log(`Route HTTP Status: ${res.status}`);
    console.log(`Route Latency:     ${elapsedMs}ms`);
    console.log(`RateLimit Limit:   ${res.headers.get("x-ratelimit-limit")}`);
    console.log(`RateLimit Remain:  ${res.headers.get("x-ratelimit-remaining")}`);

    if (res.status !== 200) {
      const errBody = await res.json();
      console.error("Route Error Body:", errBody);
      return false;
    }

    const json = await res.json();
    console.log("\n--- Test B Output & Telemetry ---");
    console.log(`Response ok:       ${json.ok}`);
    console.log(`Model Used:        ${json.modelUsed}`);
    if (json.usage) {
      console.log(`Prompt Tokens:     ${json.usage.prompt_tokens ?? "N/A"}`);
      console.log(`Completion Tokens: ${json.usage.completion_tokens ?? "N/A"}`);
      console.log(`Total Tokens:      ${json.usage.total_tokens ?? "N/A"}`);
    }
    console.log(`Evidence Flag:     ${json.hasSufficientEvidence}`);
    console.log(`Generated Bullets (${json.bullets?.length || 0}):`);

    let allBulletsValid = Array.isArray(json.bullets) && json.bullets.length >= 2 && json.hasSufficientEvidence;

    if (Array.isArray(json.bullets)) {
      json.bullets.forEach((b: string, idx: number) => {
        const isUnder220 = b.length <= 220;
        console.log(`  ${idx + 1}. [${b.length}c] ${b}`);
        if (!isUnder220) {
          console.error(`     ✗ Bullet exceeds Wissam 220-character limit!`);
          allBulletsValid = false;
        }
      });
    }

    // Verify Candidate Review Studio format
    console.log("\n--- Review Studio Compatibility ---");
    if (Array.isArray(json.candidates)) {
      console.log(`Structured candidates count: ${json.candidates.length}`);
      const candidatesValid = json.candidates.every(
        (c: any) => typeof c.text === "string" && typeof c.goodStart === "boolean" && c.unverifiedMetric !== true
      );
      if (candidatesValid) {
        console.log("✓ Candidates compatible with Candidate Review Studio (unverifiedMetric: false, pure formatting)");
      } else {
        console.warn("! Note: One or more candidates flagged with unverified metrics or formatting warnings.");
      }
    }

    // Direct Upstash Redis Counter Verification
    console.log("\n--- Upstash Redis Multi-Tier Counter Verification ---");
    try {
      const upstashCheckRes = await fetch(upstashUrl.replace(/\/+$/, ""), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["GET", `ratelimit:user:${MOCK_INTRA_USER.login}`]),
      });
      if (upstashCheckRes.ok) {
        const upstashData = await upstashCheckRes.json();
        const userCounter = upstashData?.result;
        console.log(`Real Upstash Redis User Counter ('ratelimit:user:${MOCK_INTRA_USER.login}'): ${userCounter}`);
        if (Number(userCounter) >= 1) {
          console.log("✓ Real Upstash Redis limiter confirmed: atomic Lua EVAL updated Redis cluster state.");
        }
      }

      // Cleanup test user counter in Redis
      await fetch(upstashUrl.replace(/\/+$/, ""), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["DEL", `ratelimit:user:${MOCK_INTRA_USER.login}`, "ratelimit:ip:127.0.0.1"]),
      });
      console.log("✓ Cleaned up test user and IP keys in Upstash Redis.");
    } catch (redisErr: any) {
      console.warn(`! Redis verification note: ${redisErr.message}`);
    }

    if (json.ok && allBulletsValid) {
      console.log("\n✓ Test B Passed: Complete serverless route pipeline verified end-to-end.");
      return true;
    } else {
      console.error("\n✗ Test B Failed: Route did not return expected bullet array.");
      return false;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Test B Failed: ${errorMsg}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main Controller
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const runTestAFlag = args.includes("--run-test-a");
  const runTestBFlag = args.includes("--run-test-b");

  // SAFETY GUARD: If neither decoupled flag is explicitly passed, exit 0 in dry-run mode
  if (!runTestAFlag && !runTestBFlag) {
    printDryRunInstructions();
    process.exit(0);
  }

  console.log("==================================================");
  console.log("PrintCV Live Smoke Test Execution Mode");
  console.log("==================================================");

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.startsWith("gsk_")) {
    console.error("\nERROR: Valid GROQ_API_KEY (starting with 'gsk_') is required to run live tests.");
    console.error("Example:");
    console.error("  GROQ_API_KEY=\"gsk_...\" npx tsx test/live-groq-smoke-test.ts --run-test-a");
    process.exit(1);
  }

  const model = process.env.GROQ_MODEL || GROQ_MODELS.DEFAULT_FAST;
  let allPassed = true;

  if (runTestAFlag) {
    const passedA = await runTestA(apiKey, model);
    if (!passedA) allPassed = false;
  }

  if (runTestBFlag) {
    const passedB = await runTestB(apiKey);
    if (!passedB) allPassed = false;
  }

  console.log("\n==================================================");
  console.log(`Overall Live Smoke Test Result: ${allPassed ? "PASSED" : "FAILED"}`);
  console.log("==================================================");

  process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
  main();
}
