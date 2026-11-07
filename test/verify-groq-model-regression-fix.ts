// test/verify-groq-model-regression-fix.ts
// Unit test verification for Groq model regression fix:
// 1. Approved models configuration: openai/gpt-oss-20b and openai/gpt-oss-120b
// 2. Env variable overrides (GROQ_MODEL, GROQ_FALLBACK_MODEL)
// 3. Explicit rejection of retired models (llama-3.3-70b-versatile, mixtral-8x7b-32768, etc.)
// 4. Strict JSON Schema & token parameters (temperature: 0.2, max_tokens: 512)
// 5. Fallback selection integrity (openai/gpt-oss-120b or GROQ_FALLBACK_MODEL only)

import assert from "assert";
import {
  GROQ_MODELS,
  DEPRECATED_GROQ_MODELS,
  isDeprecatedGroqModel,
  getPrimaryGroqModel,
  getFallbackGroqModel,
  callGroqCompletions,
  callGroqFallbackCompletions,
  CV_BULLETS_JSON_SCHEMA,
  clearRequestDeduplicationCache,
} from "../src/lib/server/groq-client";

function check(title: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`  ✓ ${title}`);
    })
    .catch((err) => {
      console.error(`  ✗ ${title}`);
      console.error(`    ${err.message}`);
      process.exit(1);
    });
}

async function runTests() {
  console.log("==================================================");
  console.log("PrintCV Groq Model Regression Fix Verification");
  console.log("==================================================");

  // ---------------------------------------------------------------------------
  // Suite 1: Approved Modern Production Models Configuration
  // ---------------------------------------------------------------------------
  console.log("\nSuite 1: Approved Models Configuration");

  await check("GROQ_MODELS constants match approved production models", () => {
    assert.strictEqual(GROQ_MODELS.DEFAULT_FAST, "openai/gpt-oss-20b");
    assert.strictEqual(GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY, "openai/gpt-oss-120b");
    assert.strictEqual(GROQ_MODELS.OPENAI_OSS_20B, "openai/gpt-oss-20b");
    assert.strictEqual(GROQ_MODELS.OPENAI_OSS_120B, "openai/gpt-oss-120b");
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Environment Variable Overrides
  // ---------------------------------------------------------------------------
  console.log("\nSuite 2: Environment Variable Overrides");

  const origGroqModel = process.env.GROQ_MODEL;
  const origFallbackModel = process.env.GROQ_FALLBACK_MODEL;

  try {
    delete process.env.GROQ_MODEL;
    delete process.env.GROQ_FALLBACK_MODEL;

    await check("getPrimaryGroqModel defaults to openai/gpt-oss-20b without env var", () => {
      assert.strictEqual(getPrimaryGroqModel(), "openai/gpt-oss-20b");
    });

    await check("getFallbackGroqModel defaults to openai/gpt-oss-120b without env var", () => {
      assert.strictEqual(getFallbackGroqModel(), "openai/gpt-oss-120b");
    });

    await check("process.env.GROQ_MODEL overrides primary model", () => {
      process.env.GROQ_MODEL = "openai/gpt-oss-custom-primary";
      assert.strictEqual(getPrimaryGroqModel(), "openai/gpt-oss-custom-primary");
    });

    await check("process.env.GROQ_FALLBACK_MODEL overrides fallback model", () => {
      process.env.GROQ_FALLBACK_MODEL = "openai/gpt-oss-custom-fallback";
      assert.strictEqual(getFallbackGroqModel(), "openai/gpt-oss-custom-fallback");
    });
  } finally {
    if (origGroqModel) process.env.GROQ_MODEL = origGroqModel;
    else delete process.env.GROQ_MODEL;
    if (origFallbackModel) process.env.GROQ_FALLBACK_MODEL = origFallbackModel;
    else delete process.env.GROQ_FALLBACK_MODEL;
  }

  // ---------------------------------------------------------------------------
  // Suite 3: Deprecated Models Explicit Prohibition
  // ---------------------------------------------------------------------------
  console.log("\nSuite 3: Deprecated Models Explicit Prohibition");

  await check("DEPRECATED_GROQ_MODELS includes all retired models", () => {
    const required = [
      "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768",
      "llama3-70b-8192",
      "llama3-8b-8192",
      "llama-3.1-70b-versatile",
    ];
    for (const model of required) {
      assert(
        DEPRECATED_GROQ_MODELS.includes(model),
        `Must include retired model ${model} in deprecation list`
      );
      assert(isDeprecatedGroqModel(model), `isDeprecatedGroqModel must return true for ${model}`);
      assert(isDeprecatedGroqModel(model.toUpperCase()), `isDeprecatedGroqModel must be case-insensitive for ${model}`);
    }
  });

  await check("Approved models are not marked as deprecated", () => {
    assert(!isDeprecatedGroqModel("openai/gpt-oss-20b"));
    assert(!isDeprecatedGroqModel("openai/gpt-oss-120b"));
  });

  await check("callGroqCompletions rejects deprecated model in options with explicit error", async () => {
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };

    const res = await callGroqCompletions(
      [{ role: "user", content: "test" }],
      {
        apiKey: "test-key",
        model: "llama-3.3-70b-versatile",
        fetchFn: mockFetch as any,
      }
    );

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.fallbackToClipboard, true);
    assert(
      res.error?.includes("Model llama-3.3-70b-versatile has been retired and is not permitted"),
      `Expected explicit descriptive error, got: ${res.error}`
    );
    assert.strictEqual(fetchCalled, false, "Must fail fast before calling network fetch");
  });

  await check("callGroqCompletions rejects deprecated model in process.env.GROQ_MODEL", async () => {
    const savedModel = process.env.GROQ_MODEL;
    process.env.GROQ_MODEL = "mixtral-8x7b-32768";
    try {
      const res = await callGroqCompletions(
        [{ role: "user", content: "test" }],
        { apiKey: "test-key" }
      );
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 400);
      assert(res.error?.includes("Model mixtral-8x7b-32768 has been retired and is not permitted"));
    } finally {
      if (savedModel) process.env.GROQ_MODEL = savedModel;
      else delete process.env.GROQ_MODEL;
    }
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Strict JSON Schema & Request Parameters Verification
  // ---------------------------------------------------------------------------
  console.log("\nSuite 4: Strict JSON Schema & Request Parameters Verification");

  await check("CV_BULLETS_JSON_SCHEMA enforces strict mode and no additionalProperties", () => {
    assert.strictEqual(CV_BULLETS_JSON_SCHEMA.name, "cv_bullet_suggestions");
    assert.strictEqual(CV_BULLETS_JSON_SCHEMA.strict, true);
    assert.strictEqual(CV_BULLETS_JSON_SCHEMA.schema.additionalProperties, false);
    assert.deepStrictEqual(CV_BULLETS_JSON_SCHEMA.schema.required, [
      "bullets",
      "hasSufficientEvidence",
      "missingInformationPrompt",
    ]);
  });

  await check("callGroqCompletions sends exact parameters (model, temp 0.2, max_completion_tokens 2048, reasoning_effort low, json_schema)", async () => {
    let sentBody: any = null;
    const mockFetch = async (_url: any, init: any) => {
      sentBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          model: "openai/gpt-oss-20b",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  bullets: ["Built an event loop."],
                  hasSufficientEvidence: true,
                  missingInformationPrompt: "",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    clearRequestDeduplicationCache();
    const res = await callGroqCompletions(
      [{ role: "system", content: "sys" }, { role: "user", content: "usr" }],
      { apiKey: "gsk_test_token", fetchFn: mockFetch as any }
    );

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.modelUsed, "openai/gpt-oss-20b");
    assert.strictEqual(sentBody.model, "openai/gpt-oss-20b");
    assert.strictEqual(sentBody.temperature, 0.2);
    assert.strictEqual(sentBody.max_completion_tokens, 2048);
    assert.strictEqual(sentBody.reasoning_effort, "low");
    assert.strictEqual(sentBody.response_format.type, "json_schema");
    assert.strictEqual(sentBody.response_format.json_schema.strict, true);
    assert.strictEqual(sentBody.response_format.json_schema.schema.additionalProperties, false);
  });

  // ---------------------------------------------------------------------------
  // Suite 5: Fallback Handling Verification
  // ---------------------------------------------------------------------------
  console.log("\nSuite 5: Fallback Handling Verification");

  await check("Upstream 502/503 triggers automatic fallback to openai/gpt-oss-120b", async () => {
    const attemptedModels: string[] = [];

    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      attemptedModels.push(body.model);

      if (body.model === "openai/gpt-oss-20b") {
        // Primary model fails with upstream 503
        return new Response(JSON.stringify({ error: { message: "Model overloaded" } }), { status: 503 });
      }

      // Fallback model succeeds
      return new Response(
        JSON.stringify({
          model: "openai/gpt-oss-120b",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  bullets: ["Engineered an RFC-compliant HTTP parser."],
                  hasSufficientEvidence: true,
                  missingInformationPrompt: "",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    clearRequestDeduplicationCache();
    const res = await callGroqCompletions(
      [{ role: "user", content: "test" }],
      { apiKey: "test-key", fetchFn: mockFetch as any }
    );

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.modelUsed, "openai/gpt-oss-120b");
    assert.deepStrictEqual(attemptedModels, ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
  });

  await check("Fallback respects GROQ_FALLBACK_MODEL and rejects deprecated fallback", async () => {
    const savedFallback = process.env.GROQ_FALLBACK_MODEL;
    process.env.GROQ_FALLBACK_MODEL = "llama-3.1-70b-versatile";

    try {
      const mockFetch = async () => {
        return new Response("{}", { status: 503 });
      };

      clearRequestDeduplicationCache();
      const res = await callGroqCompletions(
        [{ role: "user", content: "test" }],
        { apiKey: "test-key", fetchFn: mockFetch as any }
      );

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 400);
      assert(res.error?.includes("Model llama-3.1-70b-versatile has been retired and is not permitted"));
    } finally {
      if (savedFallback) process.env.GROQ_FALLBACK_MODEL = savedFallback;
      else delete process.env.GROQ_FALLBACK_MODEL;
    }
  });

  await check("callGroqFallbackCompletions directly targets openai/gpt-oss-120b", async () => {
    let invokedModel = "";
    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      invokedModel = body.model;
      return new Response(
        JSON.stringify({
          model: "openai/gpt-oss-120b",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  bullets: ["Refactored concurrency locks."],
                  hasSufficientEvidence: true,
                  missingInformationPrompt: "",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    clearRequestDeduplicationCache();
    const res = await callGroqFallbackCompletions(
      [{ role: "user", content: "test" }],
      { apiKey: "test-key", fetchFn: mockFetch as any }
    );

    assert.strictEqual(res.ok, true);
    assert.strictEqual(invokedModel, "openai/gpt-oss-120b");
    assert.strictEqual(res.modelUsed, "openai/gpt-oss-120b");
  });

  console.log("\n==================================================");
  console.log("All Groq model regression fix verification tests passed!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
