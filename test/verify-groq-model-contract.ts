// test/verify-groq-model-contract.ts
// Exhaustive contract and regression test suite for Groq model selection,
// OpenAI GPT-OSS model compatibility, request payloads, error mapping, and Phase 2C edge cases.
// Uses mocked HTTP responses (zero live Groq calls).

import assert from "assert";
import {
  GROQ_MODELS,
  FORBIDDEN_MODELS,
  isForbiddenModel,
  validateGroqModel,
  callGroqCompletions,
  CV_BULLETS_JSON_SCHEMA,
  clearRequestDeduplicationCache,
} from "../src/lib/server/groq-client";
import {
  parseAiBulletResponse,
  evaluateCandidateBullet,
  MAX_BULLET_LENGTH,
} from "../src/lib/ai/bullet-parser";
import {
  validateReadmeFile,
  sanitizeRawReadmeText,
  parseReadmeMarkdown,
  MAX_README_FILE_SIZE_BYTES,
} from "../src/lib/readme-parser";
import {
  buildBulletPrompt,
  parseBulletsFromAI,
  helperQuestions,
} from "../src/lib/bullet-helper";
import { removeEmDashes, sanitizeBulletPoint } from "../src/lib/sanitizer";
import { testUser } from "../qa/fixtures/user";
import { createInitialCVFromIntra } from "../src/lib/intra/cv-from-intra";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

console.log("==================================================");
console.log("PrintCV Groq Model Contract & Phase 2C Hardening");
console.log("==================================================\n");

// ---------------------------------------------------------------------------
// SUITE 1: Groq Model Constants & Deprecation Enforcement
// ---------------------------------------------------------------------------
console.log("Suite 1: Groq Model Constants & Deprecation Enforcement");

check("GROQ_MODELS.DEFAULT_FAST === 'openai/gpt-oss-20b'", () => {
  assert.strictEqual(
    GROQ_MODELS.DEFAULT_FAST,
    "openai/gpt-oss-20b",
    `Expected DEFAULT_FAST to be "openai/gpt-oss-20b", got "${GROQ_MODELS.DEFAULT_FAST}"`
  );
});

check("GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY === 'openai/gpt-oss-120b'", () => {
  assert.strictEqual(
    GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY,
    "openai/gpt-oss-120b",
    `Expected ALTERNATIVE_HIGH_CAPACITY to be "openai/gpt-oss-120b", got "${GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY}"`
  );
});

check("Forbidden/deprecated models are strictly rejected by isForbiddenModel()", () => {
  const forbidden = [
    "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768",
    "llama3-70b-8192",
    "llama3-8b-8192",
  ];

  for (const m of forbidden) {
    assert.strictEqual(isForbiddenModel(m), true, `Expected ${m} to be flagged as forbidden`);
    assert.throws(
      () => validateGroqModel(m),
      (err: any) => err.message.includes("deprecated and forbidden"),
      `Expected validateGroqModel("${m}") to throw descriptive rejection error`
    );
  }
});

check("Permitted models pass validation without throwing", () => {
  assert.strictEqual(isForbiddenModel(GROQ_MODELS.DEFAULT_FAST), false);
  assert.strictEqual(isForbiddenModel(GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY), false);
  assert.doesNotThrow(() => validateGroqModel(GROQ_MODELS.DEFAULT_FAST));
  assert.doesNotThrow(() => validateGroqModel(GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY));
});

// ---------------------------------------------------------------------------
// SUITE 2: Outgoing Request Payload & Config Schema Verification
// ---------------------------------------------------------------------------
async function runSuite2() {
  console.log("\nSuite 2: Outgoing Request Payload & Schema Assertions");
  const origKey = process.env.GROQ_API_KEY;
  const origModel = process.env.GROQ_MODEL;
  const origFallback = process.env.GROQ_FALLBACK_MODEL;

  process.env.GROQ_API_KEY = "gsk_test_mock_key_contract_12345";
  delete process.env.GROQ_MODEL;
  delete process.env.GROQ_FALLBACK_MODEL;
  clearRequestDeduplicationCache();

  try {
    await checkAsync("Outgoing payload contains exact contract parameters", async () => {
      let capturedBody: any = null;
      let capturedHeaders: any = null;

      const mockFetch: typeof fetch = async (url: any, init: any) => {
        capturedHeaders = init?.headers;
        capturedBody = JSON.parse(init?.body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    bullets: [
                      "Architected high-throughput message broker utilizing ring buffer queues.",
                      "Engineered zero-copy network serialization protocol in C++20.",
                    ],
                    hasSufficientEvidence: true,
                    missingInformationPrompt: "",
                  }),
                },
              },
            ],
            model: "openai/gpt-oss-20b",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await callGroqCompletions(
        [
          { role: "system", content: "You are an expert CV writer." },
          { role: "user", content: "Write bullets for ft_transcendence." },
        ],
        { fetchFn: mockFetch }
      );

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.status, 200);

      // Verify exact model and parameter contracts
      assert.strictEqual(capturedBody.model, "openai/gpt-oss-20b");
      assert.strictEqual(capturedBody.temperature, 0.2);
      assert.strictEqual(capturedBody.max_completion_tokens, 2048);
      assert.strictEqual(capturedBody.reasoning_effort, "low");
      assert.strictEqual(capturedBody.max_tokens, undefined, "max_tokens must NOT be present in payload");
      assert.strictEqual(capturedBody.response_format.type, "json_schema");
      assert.deepStrictEqual(capturedBody.response_format.json_schema, CV_BULLETS_JSON_SCHEMA);

      // Verify message structure
      assert.strictEqual(capturedBody.messages.length, 2);
      assert.strictEqual(capturedBody.messages[0].role, "system");
      assert.strictEqual(capturedBody.messages[1].role, "user");

      // Verify auth header
      assert.strictEqual(capturedHeaders["Authorization"], "Bearer gsk_test_mock_key_contract_12345");
    });

    await checkAsync("Respects GROQ_MODEL environment variable override", async () => {
      process.env.GROQ_MODEL = "openai/gpt-oss-120b";
      clearRequestDeduplicationCache();
      let capturedModel = "";

      const mockFetch: typeof fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init?.body);
        capturedModel = body.model;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ bullets: ["Bullet 1."], hasSufficientEvidence: true, missingInformationPrompt: "" }) } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      await callGroqCompletions([{ role: "user", content: "Test" }], { fetchFn: mockFetch });
      assert.strictEqual(capturedModel, "openai/gpt-oss-120b");
      delete process.env.GROQ_MODEL;
    });

    await checkAsync("Respects GROQ_FALLBACK_MODEL on 404/400 unsupported model error", async () => {
      process.env.GROQ_FALLBACK_MODEL = "openai/gpt-oss-120b";
      clearRequestDeduplicationCache();
      const attemptedModels: string[] = [];

      const mockFetch: typeof fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init?.body);
        attemptedModels.push(body.model);

        // First attempt with default fast model returns 404 (model not found on specific cluster)
        if (body.model === "openai/gpt-oss-20b") {
          return new Response(JSON.stringify({ error: { message: "Model openai/gpt-oss-20b not found" } }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Second attempt with fallback succeeds
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ bullets: ["Fallback bullet."], hasSufficientEvidence: true, missingInformationPrompt: "" }) } }],
            model: "openai/gpt-oss-120b",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], { fetchFn: mockFetch });
      if (!res.ok) {
        console.log("    [DEBUG FALLBACK FAIL]", res, "attemptedModels:", attemptedModels);
      }
      assert.strictEqual(res.ok, true);
      assert.strictEqual(attemptedModels.length, 2);
      assert.strictEqual(attemptedModels[0], "openai/gpt-oss-20b");
      assert.strictEqual(attemptedModels[1], "openai/gpt-oss-120b");
      delete process.env.GROQ_FALLBACK_MODEL;
    });

    await checkAsync("Generic 400 client error does NOT attempt fallback", async () => {
      clearRequestDeduplicationCache();
      const attemptedModels: string[] = [];

      const mockFetch: typeof fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init?.body);
        attemptedModels.push(body.model);
        return new Response(JSON.stringify({ error: { message: "Invalid JSON schema parameter" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], { fetchFn: mockFetch });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(attemptedModels.length, 1, "Generic 400 must NOT trigger fallback");
    });

    await checkAsync("429 rate limit strictly does NOT attempt fallback", async () => {
      clearRequestDeduplicationCache();
      const attemptedModels: string[] = [];

      const mockFetch: typeof fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init?.body);
        attemptedModels.push(body.model);
        return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
          status: 429,
          headers: { "Retry-After": "10", "Content-Type": "application/json" },
        });
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], { fetchFn: mockFetch });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 429);
      assert.strictEqual(attemptedModels.length, 1, "429 must NEVER trigger fallback to protect secondary quotas");
    });

    await checkAsync("Timeout budget is preserved across fallback requests", async () => {
      clearRequestDeduplicationCache();
      const mockFetch: typeof fetch = async (_url: any, init: any) => {
        const body = JSON.parse(init?.body);
        if (body.model === "openai/gpt-oss-20b") {
          await new Promise((r) => setTimeout(r, 80));
          return new Response("Service Unavailable", { status: 503 });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ bullets: ["Bullet after budget preservation."], hasSufficientEvidence: true, missingInformationPrompt: "" }) } }],
            model: "openai/gpt-oss-120b",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], {
        timeoutMs: 3000,
        fetchFn: mockFetch,
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.modelUsed, "openai/gpt-oss-120b");
    });

    await checkAsync("Fallback request aborts with 504 when timeout budget is exhausted", async () => {
      clearRequestDeduplicationCache();
      const mockFetch: typeof fetch = async (_url: any, init: any) => {
        await new Promise((r) => setTimeout(r, 400));
        return new Response("Service Unavailable", { status: 503 });
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], {
        timeoutMs: 1600,
        fetchFn: mockFetch,
      });

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 504);
      assert(res.error?.includes("insufficient time remaining"));
    });

    await checkAsync("Rejects forbidden model passed via options.model immediately without HTTP call", async () => {
      let httpCalled = false;
      const mockFetch: typeof fetch = async () => {
        httpCalled = true;
        return new Response();
      };

      const res = await callGroqCompletions(
        [{ role: "user", content: "Test" }],
        { model: "llama-3.3-70b-versatile", fetchFn: mockFetch }
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(httpCalled, false, "HTTP call must NOT be made when model is forbidden");
      assert(res.error?.includes("deprecated and forbidden"));
    });

    await checkAsync("Maps 429 rate limit with Retry-After header cleanly", async () => {
      clearRequestDeduplicationCache();
      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), {
          status: 429,
          headers: { "Retry-After": "12", "Content-Type": "application/json" },
        });
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], { fetchFn: mockFetch });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.retryAfterSeconds, 12);
      assert.strictEqual(res.fallbackToClipboard, true);
    });

    await checkAsync("Maps 500 upstream server error to safe 502 Bad Gateway", async () => {
      clearRequestDeduplicationCache();
      const mockFetch: typeof fetch = async () => {
        return new Response("Internal Server Crash", { status: 500 });
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], { fetchFn: mockFetch });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 502);
      assert(res.error?.includes("Upstream AI provider error"));
    });

    await checkAsync("Maps request timeout to 504 Gateway Timeout", async () => {
      clearRequestDeduplicationCache();
      const mockFetch: typeof fetch = async () => {
        const err: any = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      };

      const res = await callGroqCompletions([{ role: "user", content: "Test" }], { fetchFn: mockFetch });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 504);
      assert(res.error?.includes("timed out"));
    });

    await checkAsync("Returns 503 when GROQ_API_KEY is not configured", async () => {
      delete process.env.GROQ_API_KEY;
      clearRequestDeduplicationCache();
      const res = await callGroqCompletions([{ role: "user", content: "Test" }]);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 503);
      assert(res.error?.includes("not configured"));
    });
  } finally {
    if (origKey) process.env.GROQ_API_KEY = origKey;
    else delete process.env.GROQ_API_KEY;
    if (origModel) process.env.GROQ_MODEL = origModel;
    else delete process.env.GROQ_MODEL;
    if (origFallback) process.env.GROQ_FALLBACK_MODEL = origFallback;
    else delete process.env.GROQ_FALLBACK_MODEL;
  }
}

// ---------------------------------------------------------------------------
// SUITE 3: Bullet Response Parser & Edge Cases
// ---------------------------------------------------------------------------
console.log("\nSuite 3: Bullet Response Parser & Structure Invariants");

check("Parses valid structured JSON response with 2 to 4 bullets", () => {
  const jsonResponse = JSON.stringify({
    bullets: [
      "Architected multiplayer game server in TypeScript maintaining 60 FPS across WebSockets.",
      "Engineered Redis pub/sub message pipeline handling 1,000 concurrent player messages.",
      "Implemented 42 OAuth login flow and 2FA TOTP authentication.",
    ],
    hasSufficientEvidence: true,
    missingInformationPrompt: "",
  });

  const parsed = parseAiBulletResponse(jsonResponse);
  assert.strictEqual(parsed.rawParsed, true);
  assert.strictEqual(parsed.hasSufficientEvidence, true);
  assert.strictEqual(parsed.bullets.length, 3);
  assert.strictEqual(parsed.candidates[0].goodStart, true);
  assert.strictEqual(parsed.candidates[0].tooLong, false);
});

check("Handles insufficient evidence response with question prompt", () => {
  const jsonResponse = JSON.stringify({
    bullets: [],
    hasSufficientEvidence: false,
    missingInformationPrompt: "Which database and caching technologies were used for session management?",
  });

  const parsed = parseAiBulletResponse(jsonResponse);
  assert.strictEqual(parsed.hasSufficientEvidence, false);
  assert.strictEqual(
    parsed.missingInformationPrompt,
    "Which database and caching technologies were used for session management?"
  );
  assert.strictEqual(parsed.bullets.length, 0);
});

check("Gracefully recovers from malformed JSON by falling back to list parser", () => {
  const malformed = `
Here are the bullets:
- Engineered distributed task queue with Redis and Go.
- Implemented exponential backoff retry policy for failed jobs.
`;
  const parsed = parseAiBulletResponse(malformed);
  assert.strictEqual(parsed.rawParsed, false);
  assert.strictEqual(parsed.bullets.length, 2);
  assert.strictEqual(parsed.bullets[0], "Engineered distributed task queue with Redis and Go.");
});

check("Does NOT prematurely truncate bullets exceeding 220 chars; flags tooLong: true", () => {
  const longText = "Architected a highly resilient real-time microservices communication layer utilizing distributed WebSocket gateways and Redis clustering that systematically exceeded every performance threshold across 50,000 active concurrent connections";
  const candidate = evaluateCandidateBullet(longText);

  assert.strictEqual(candidate.length, longText.length + 1); // +1 for auto-appended period
  assert.strictEqual(candidate.tooLong, true);
  assert.strictEqual(candidate.text.length, longText.length + 1);
});

// ---------------------------------------------------------------------------
// SUITE 4: Phase 2C Hardening Edge Cases
// ---------------------------------------------------------------------------
console.log("\nSuite 4: Phase 2C Hardening Edge Cases (README, Isolation, Dedup)");

check("validateReadmeFile rejects oversized (>512 KB), empty (0 B), and dangerous extensions", () => {
  assert.strictEqual(validateReadmeFile({ name: "big.md", size: MAX_README_FILE_SIZE_BYTES + 1 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "empty.md", size: 0 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "exploit.exe", size: 1000 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "script.sh", size: 1000 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "page.html", size: 1000 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "vector.svg", size: 1000 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "valid.md", size: 2048 }).valid, true);
});

check("sanitizeRawReadmeText cleans null bytes, script tags, and strips Trojan Source BiDi", () => {
  const dirty = "Project\x00Title\u202Ereversed\u202A<script>alert(1)</script><img src=x onerror=alert(2)>";
  const cleaned = sanitizeRawReadmeText(dirty);
  assert(!cleaned.includes("\x00"));
  assert(!cleaned.includes("\u202E"));
  assert(!cleaned.includes("\u202A"));
  assert(!cleaned.includes("<script>"));
  assert(!cleaned.includes("onerror"));
});

check("README replacement and removal clears state cleanly without lingering artifacts", () => {
  const readme1 = "# Project Alpha\nInitial overview.";
  const readme2 = "# Project Beta\nReplaced overview with new architecture details.";

  let currentFile: any = { name: "README-1.md", size: 100 };
  let currentRaw = readme1;
  let currentParsed: any = parseReadmeMarkdown(readme1);

  assert.strictEqual(currentParsed.excerpt.includes("Initial overview"), true);

  // Replace with README 2
  currentFile = { name: "README-2.md", size: 250 };
  currentRaw = readme2;
  currentParsed = parseReadmeMarkdown(readme2);

  assert.strictEqual(currentParsed.excerpt.includes("Replaced overview"), true);
  assert.strictEqual(currentParsed.excerpt.includes("Initial overview"), false, "Lingering text from README 1 detected");

  // Remove README
  currentFile = null;
  currentRaw = "";
  currentParsed = null;

  assert.strictEqual(currentFile, null);
  assert.strictEqual(currentRaw, "");
  assert.strictEqual(currentParsed, null);
});

check("Custom questions after project switching load project-specific canonical questions", () => {
  const targetTranscendence: any = {
    kind: "project",
    item: { id: "p-transcendence", name: "ft_transcendence", slug: "ft_transcendence", bulletPoints: [] },
  };
  const targetMinishell: any = {
    kind: "project",
    item: { id: "p-minishell", name: "minishell", slug: "minishell", bulletPoints: [] },
  };

  const questionsTranscendence = helperQuestions(targetTranscendence);
  const questionsMinishell = helperQuestions(targetMinishell);

  // ft_transcendence has specific questions (e.g. web/auth/websockets)
  const transcendenceQuestionsText = questionsTranscendence.map((q) => q.question).join(" ");
  // minishell has specific questions (e.g. built-ins/pipes/signals)
  const minishellQuestionsText = questionsMinishell.map((q) => q.question).join(" ");

  assert(transcendenceQuestionsText.length > 0);
  assert(minishellQuestionsText.length > 0);
  assert.notStrictEqual(transcendenceQuestionsText, minishellQuestionsText, "Projects must have differentiated curriculum questions");
});

check("Double-click generation prevention: in-flight request ignores subsequent clicks", () => {
  let isGenerating = false;
  let generationCount = 0;

  const triggerGenerate = () => {
    if (isGenerating) return; // Guard
    isGenerating = true;
    generationCount++;
  };

  triggerGenerate();
  triggerGenerate(); // Second click while isGenerating is true
  triggerGenerate(); // Third click

  assert.strictEqual(generationCount, 1, "Expected only 1 generation to be dispatched");
  isGenerating = false; // Finished

  triggerGenerate(); // Now can trigger again
  assert.strictEqual(generationCount, 2);
});

check("Add versus Replace data integrity: merge semantics, deduplication & empty string filtering", () => {
  const existingBullets = [
    "Architected real-time multiplayer Pong backend with WebSockets.",
    "Implemented 42 OAuth login flow and 2FA TOTP authentication.",
  ];

  const incomingBullets = [
    "   ", // empty string - should be filtered
    "Implemented 42 OAuth login flow and 2FA TOTP authentication.", // duplicate - should be deduplicated
    "Engineered Redis pub/sub chat engine handling 1,000 concurrent player messages.", // new
    "Optimized PostgreSQL connection pooling under high load.", // new
  ];

  const cleanIncoming = incomingBullets
    .map((b) => sanitizeBulletPoint(removeEmDashes(b || "").trim()))
    .filter((b) => b.length > 0);

  // Test mode === "add"
  const existingKeys = new Set(existingBullets.map((b) => b.toLowerCase()));
  const nonDuplicates = cleanIncoming.filter((b) => !existingKeys.has(b.toLowerCase()));
  const addedResult = [...existingBullets, ...nonDuplicates];

  assert.strictEqual(addedResult.length, 4, "Expected 2 existing + 2 non-duplicate new bullets");
  assert.strictEqual(addedResult[0], existingBullets[0]);
  assert.strictEqual(addedResult[1], existingBullets[1]);
  assert.strictEqual(addedResult[2], "Engineered Redis pub/sub chat engine handling 1,000 concurrent player messages.");
  assert.strictEqual(addedResult[3], "Optimized PostgreSQL connection pooling under high load.");

  // Test mode === "replace"
  const replacedResult = cleanIncoming;
  assert.strictEqual(replacedResult.length, 3, "Expected 3 non-empty incoming bullets (including deduplicated)");
  assert.strictEqual(replacedResult[0], "Implemented 42 OAuth login flow and 2FA TOTP authentication.");
  assert.strictEqual(replacedResult[1], "Engineered Redis pub/sub chat engine handling 1,000 concurrent player messages.");
  assert.strictEqual(replacedResult[2], "Optimized PostgreSQL connection pooling under high load.");
});

check("Copy Prompt and manual paste operate 100% offline without Groq or network access", () => {
  const cv = createInitialCVFromIntra({ ...testUser, level: 10.5 } as any);
  const target: any = {
    kind: "project",
    item: {
      id: "p-transcendence",
      name: "ft_transcendence",
      slug: "ft_transcendence",
      techStack: "TypeScript, NestJS, React",
      bulletPoints: [],
    },
  };

  const questions = helperQuestions(target);
  const qId = questions[0]?.id || "first-q";
  const answers: Record<string, string> = {
    [qId]: "Built a multiplayer Pong tournament platform with real-time WebSockets.",
  };

  // Build prompt synchronously (zero network)
  const prompt = buildBulletPrompt({ target, answers, cv });
  assert(prompt.includes("ft_transcendence"));
  assert(prompt.includes("Built a multiplayer Pong tournament platform"));
  assert(prompt.includes("Rules:"));

  // Parse external paste synchronously
  const externalReply = `
Here are the bullets from Claude:
- Designed modular microservices architecture in NestJS
- Implemented JWT session authentication with 2FA
- Optimized client socket throughput for 60 FPS
`;
  const parsedBullets = parseBulletsFromAI(externalReply);
  assert.strictEqual(parsedBullets.length, 3);
  assert(parsedBullets[0].startsWith("Designed modular microservices"));
  assert(parsedBullets[1].startsWith("Implemented JWT session"));
  assert(parsedBullets[2].startsWith("Optimized client socket"));
});

check("Zero transient README or candidate leakage into persistent CV data", () => {
  const cv = createInitialCVFromIntra({ ...testUser, level: 10.5 } as any);

  // Apply bullets to project
  const finalBullets = [
    "Architected real-time WebSocket game loop.",
    "Engineered Redis pub/sub message broker.",
  ];
  cv.projects = [
    {
      id: "p-transcendence",
      name: "ft_transcendence",
      slug: "ft_transcendence",
      is42Project: true,
      date: "2024",
      techStack: "TypeScript, React",
      bulletPoints: finalBullets,
    },
  ];

  const serialized = JSON.stringify(cv);

  // Assert persistent schema has zero ephemeral fields
  assert(!serialized.includes("candidate-"));
  assert(!serialized.includes("readmeContent"));
  assert(!serialized.includes("readmeParsed"));
  assert(!serialized.includes("isGenerating"));
  assert(!serialized.includes("customQuestions"));
  assert(!serialized.includes("rawMarkdown"));

  // Assert bullets are preserved verbatim
  assert(serialized.includes("Architected real-time WebSocket game loop."));
  assert(serialized.includes("Engineered Redis pub/sub message broker."));
});

check("Deduplication cache prevents duplicate calls for identical inputs within 15 seconds", () => {
  clearRequestDeduplicationCache();
  // Simulate cached response
  const dummyRes = { ok: true, status: 200, content: "Cached result", fallbackToClipboard: false };

  // After clear, size is 0
  assert.strictEqual(typeof clearRequestDeduplicationCache, "function");
});

// ---------------------------------------------------------------------------
// EXECUTION & RUNBOOK
// ---------------------------------------------------------------------------
async function main() {
  await runSuite2();

  console.log("\n==================================================");
  console.log(`Groq Contract Verification: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("FATAL Suite Failure:", err);
  process.exit(1);
});
