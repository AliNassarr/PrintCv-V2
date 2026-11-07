// test/verify-phase2d-backend.ts
// Phase 2D AI & Backend Verification Test Suite:
// 1. Groq Request Contract: max_completion_tokens (2048), reasoning_effort ("low"), strict JSON Schema
// 2. Refined Failover: 400 selective retry, 404/503 retry, 429 no retry, 401/403/413/422 no retry, timeout preservation (<=1500ms -> 504)
// 3. Shared Distributed Rate Limiter: Upstash Redis REST adapter, pipeline execution, fail-closed safety

import assert from "assert";
import {
  GROQ_MODELS,
  callGroqCompletions,
  isRetriableWithFallback,
  CV_BULLETS_JSON_SCHEMA,
  clearRequestDeduplicationCache,
} from "../src/lib/server/groq-client";
import {
  UpstashRedisRestRateLimiterStore,
  ProductionFailSafeStore,
  getRateLimiterStore,
  checkAiRateLimit,
} from "../src/lib/security/rate-limiter";

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

async function runPhase2DTests() {
  console.log("==================================================");
  console.log("PrintCV Phase 2D Backend Verification Suite");
  console.log("==================================================");

  // ---------------------------------------------------------------------------
  // Suite 1: Groq API Request Contract Updates
  // ---------------------------------------------------------------------------
  console.log("\nSuite 1: Groq API Request Contract Updates");

  await check("Payload contains max_completion_tokens=2048 and reasoning_effort=low", async () => {
    let capturedBody: any = null;
    const mockFetch = async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          model: "openai/gpt-oss-20b",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  bullets: ["Engineered an atomic distributed lock in Redis."],
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
      { apiKey: "gsk_test", fetchFn: mockFetch as any }
    );

    assert.strictEqual(res.ok, true);
    assert.strictEqual(capturedBody.max_completion_tokens, 2048, "Must use max_completion_tokens: 2048");
    assert.strictEqual(capturedBody.max_tokens, undefined, "max_tokens must be omitted");
    assert.strictEqual(capturedBody.reasoning_effort, "low", "reasoning_effort must be 'low' for gpt-oss");
    assert.strictEqual(capturedBody.temperature, 0.2);
    assert.strictEqual(capturedBody.response_format.type, "json_schema");
    assert.strictEqual(capturedBody.response_format.json_schema.strict, true);
    assert.strictEqual(capturedBody.response_format.json_schema.schema.additionalProperties, false);
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Refined Failover Eligibility & Timeout Budget Preservation
  // ---------------------------------------------------------------------------
  console.log("\nSuite 2: Refined Failover Eligibility & Timeout Budget Preservation");

  await check("isRetriableWithFallback classifies HTTP status codes correctly", () => {
    // Strictly forbidden retries
    assert.strictEqual(isRetriableWithFallback(401), false, "401 must not retry");
    assert.strictEqual(isRetriableWithFallback(403), false, "403 must not retry");
    assert.strictEqual(isRetriableWithFallback(413), false, "413 must not retry");
    assert.strictEqual(isRetriableWithFallback(422), false, "422 must not retry");
    assert.strictEqual(isRetriableWithFallback(429), false, "429 must not retry");

    // Retriable server statuses
    assert.strictEqual(isRetriableWithFallback(404), true, "404 must retry");
    assert.strictEqual(isRetriableWithFallback(503), true, "503 must retry");
    assert.strictEqual(isRetriableWithFallback(500), true, "500 must retry");
    assert.strictEqual(isRetriableWithFallback(502), true, "502 must retry");

    // HTTP 400 selective retry
    assert.strictEqual(isRetriableWithFallback(400, "Syntax error in JSON"), false, "Generic 400 must not retry");
    assert.strictEqual(isRetriableWithFallback(400, "Invalid schema type"), false, "Schema 400 must not retry");
    assert.strictEqual(isRetriableWithFallback(400, "model_not_found"), true, "400 with model_not_found must retry");
    assert.strictEqual(isRetriableWithFallback(400, "The requested model is unsupported"), true, "400 with unsupported model must retry");
    assert.strictEqual(isRetriableWithFallback(400, "Model does not exist on cluster"), true, "400 with model does not exist must retry");
  });

  await check("Timeout budget preservation: returns 504 without fallback when remaining time <= 1500ms", async () => {
    let fallbackAttempted = false;

    const mockFetch = async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      if (body.model === "openai/gpt-oss-120b") {
        fallbackAttempted = true;
      }

      // Simulate primary request taking 1400ms when overall timeout is 2000ms (leaving 600ms <= 1500ms)
      await new Promise((r) => setTimeout(r, 60));
      return new Response("Service Overloaded", { status: 503 });
    };

    clearRequestDeduplicationCache();
    const res = await callGroqCompletions(
      [{ role: "user", content: "test" }],
      { apiKey: "gsk_test", timeoutMs: 50, fetchFn: mockFetch as any } // 50ms budget will leave <1500ms
    );

    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 504, "Must return 504 Gateway Timeout");
    assert.strictEqual(fallbackAttempted, false, "Fallback must NOT be attempted when remaining time <= 1500ms");
    assert(res.error?.includes("timed out"), "Error should explain timeout");
  });

  await check("Refined failover retries 400 with model_not_found but rejects generic 400", async () => {
    // 1. Generic 400: no retry
    let callsCount = 0;
    const mockGeneric400 = async () => {
      callsCount++;
      return new Response(JSON.stringify({ error: { message: "Invalid JSON syntax" } }), { status: 400 });
    };

    clearRequestDeduplicationCache();
    const resGeneric = await callGroqCompletions(
      [{ role: "user", content: "test" }],
      { apiKey: "gsk_test", fetchFn: mockGeneric400 as any }
    );
    assert.strictEqual(resGeneric.status, 400);
    assert.strictEqual(callsCount, 1, "Generic 400 must only execute 1 attempt (no retry)");

    // 2. Model 400: retries with fallback
    let modelCallsCount = 0;
    const modelsCalled: string[] = [];
    const mockModel400 = async (_url: any, init: any) => {
      modelCallsCount++;
      const body = JSON.parse(init.body);
      modelsCalled.push(body.model);

      if (body.model === "openai/gpt-oss-20b") {
        return new Response(JSON.stringify({ error: { message: "Model unsupported on this endpoint" } }), { status: 400 });
      }

      return new Response(
        JSON.stringify({
          model: "openai/gpt-oss-120b",
          choices: [{ message: { content: JSON.stringify({ bullets: ["Engineered fallback."], hasSufficientEvidence: true, missingInformationPrompt: "" }) } }],
        }),
        { status: 200 }
      );
    };

    clearRequestDeduplicationCache();
    const resModel = await callGroqCompletions(
      [{ role: "user", content: "test" }],
      { apiKey: "gsk_test", fetchFn: mockModel400 as any }
    );
    assert.strictEqual(resModel.ok, true);
    assert.strictEqual(modelCallsCount, 2, "Model 400 must trigger fallback");
    assert.strictEqual(modelsCalled[1], "openai/gpt-oss-120b");
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Upstash Redis REST Shared Distributed Rate Limiter
  // ---------------------------------------------------------------------------
  console.log("\nSuite 3: Upstash Redis REST Distributed Rate Limiter");

  await check("Upstash Redis store executes atomic pipeline and consumes quota correctly", async () => {
    let capturedCommands: any = null;
    let authHeader: string | null = null;

    const mockFetch = async (url: any, init: any) => {
      authHeader = init?.headers?.["Authorization"] || null;
      capturedCommands = JSON.parse(init?.body);

      // Return simulated Redis pipeline response: INCR -> 1, EXPIRE -> 1, TTL -> 590
      return new Response(
        JSON.stringify([
          { result: 1 },
          { result: 1 },
          { result: 590 },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://test-redis.upstash.io",
      token: "test-token-xyz",
      fetchFn: mockFetch as any,
    });

    const result = await store.consume("user:anassarr", 15, 600_000);

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.limit, 15);
    assert.strictEqual(result.remaining, 14);
    assert.strictEqual(authHeader, "Bearer test-token-xyz");
    assert.deepStrictEqual(capturedCommands, [
      ["INCR", "ratelimit:user:anassarr"],
      ["EXPIRE", "ratelimit:user:anassarr", 600, "NX"],
      ["TTL", "ratelimit:user:anassarr"],
    ]);
  });

  await check("Upstash Redis store detects rate limit exceedance and returns TTL as retryAfterSeconds", async () => {
    const mockFetch = async () => {
      // Return simulated Redis count of 16 (exceeding limit of 15) with TTL 42 seconds
      return new Response(
        JSON.stringify([
          { result: 16 },
          { result: 1 },
          { result: 42 },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://test-redis.upstash.io",
      token: "test-token-xyz",
      fetchFn: mockFetch as any,
    });

    const result = await store.consume("user:anassarr", 15, 600_000);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.retryAfterSeconds, 42);
    assert.strictEqual(result.reason, "RATE_LIMIT_EXCEEDED");
  });

  await check("Upstash Redis store fails closed safely with RATE_LIMIT_STORE_ERROR when REST API is unreachable", async () => {
    const mockFetch = async () => {
      throw new Error("Connection refused (Upstash outage)");
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://test-redis.upstash.io",
      token: "test-token-xyz",
      fetchFn: mockFetch as any,
    });

    const result = await store.consume("user:anassarr", 15, 600_000);

    assert.strictEqual(result.allowed, false, "Must fail closed (deny request)");
    assert.strictEqual(result.reason, "RATE_LIMIT_STORE_ERROR");
    assert.strictEqual(result.retryAfterSeconds, 60);
  });

  await check("getRateLimiterStore selects UpstashRedis in production when env vars are set, or FailSafe when not", () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.UPSTASH_REDIS_REST_URL;
    const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      (process.env as any).NODE_ENV = "production";

      // 1. In production with no Upstash env vars -> ProductionFailSafeStore
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;

      const storeFailSafe = getRateLimiterStore();
      assert(storeFailSafe instanceof ProductionFailSafeStore, "Must return ProductionFailSafeStore without env vars");

      // 2. In production with Upstash env vars -> UpstashRedisRestRateLimiterStore
      process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example.com";
      process.env.UPSTASH_REDIS_REST_TOKEN = "token123";

      const storeUpstash = getRateLimiterStore();
      assert(storeUpstash instanceof UpstashRedisRestRateLimiterStore, "Must return UpstashRedisRestRateLimiterStore with env vars");
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      if (origUrl) process.env.UPSTASH_REDIS_REST_URL = origUrl;
      else delete process.env.UPSTASH_REDIS_REST_URL;
      if (origToken) process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
      else delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });

  console.log("\n==================================================");
  console.log("All Phase 2D AI & Backend checks passed!");
  console.log("==================================================");
}

runPhase2DTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
