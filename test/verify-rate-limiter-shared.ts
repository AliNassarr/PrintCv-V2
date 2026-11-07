// test/verify-rate-limiter-shared.ts
// Verification suite for UpstashRedisRestRateLimiterStore, atomic multi-tier Lua script (EVAL),
// concurrency & zero-partial-mutation invariants, multi-student campus IP sharing, and fail-closed security.
// Uses mocked HTTP responses (zero external network calls).

import assert from "assert";
import {
  UpstashRedisRestRateLimiterStore,
  UPSTASH_LUA_MULTI_TIER_SCRIPT,
  ProductionFailSafeStore,
  InMemoryRateLimiterStore,
  getRateLimiterStore,
  DEFAULT_RATE_LIMIT_CONFIG,
} from "../src/lib/security/rate-limiter";

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
console.log("PrintCV Upstash Redis Shared Rate Limiter Suite");
console.log("==================================================\n");

async function main() {
  // -------------------------------------------------------------------------
  // Suite 1: Atomic Lua Script (EVAL) REST Payload & Upstash Command Format
  // -------------------------------------------------------------------------
  console.log("Suite 1: Atomic Lua Script (EVAL) REST Payload Structure");

  await checkAsync("Asserts outgoing REST payload is ['EVAL', script, 3, ...keys, ...args]", async () => {
    let capturedUrl = "";
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    const mockFetch: typeof fetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body);
      return new Response(
        JSON.stringify({
          result: [1, "OK", 15, 14, 0], // Lua output: [allowed, reason, limit, remaining, ttl]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io///",
      token: "mock_upstash_secret_token_123",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "anassarr",
      clientIp: "10.42.0.1",
      config: DEFAULT_RATE_LIMIT_CONFIG,
    });

    // 1. Verify URL and Headers
    assert.strictEqual(capturedUrl, "https://mock-redis.upstash.io");
    assert.strictEqual(capturedHeaders["Authorization"], "Bearer mock_upstash_secret_token_123");
    assert.strictEqual(capturedHeaders["Content-Type"], "application/json");

    // 2. Verify Command format: ["EVAL", script, 3, ...keys, ...args]
    assert.strictEqual(Array.isArray(capturedBody), true);
    assert.strictEqual(capturedBody[0], "EVAL");
    assert.strictEqual(capturedBody[1], UPSTASH_LUA_MULTI_TIER_SCRIPT);
    assert.strictEqual(capturedBody[2], 3, "Must pass exactly 3 Redis keys");

    // 3. Verify Keys
    assert(capturedBody[3].startsWith("ratelimit:global:daily:"), `Expected global key, got ${capturedBody[3]}`);
    assert.strictEqual(capturedBody[4], "ratelimit:ip:10.42.0.1");
    assert.strictEqual(capturedBody[5], "ratelimit:user:anassarr");

    // 4. Verify Args: [globalLimit, globalTtl, ipLimit, ipTtl, userLimit, userTtl, hasUser]
    assert.strictEqual(capturedBody[6], "900", "Global daily limit");
    assert.strictEqual(capturedBody[7], "172800", "Global 48h TTL");
    assert.strictEqual(capturedBody[8], "100", "IP limit (accommodates shared campus NAT)");
    assert.strictEqual(capturedBody[9], "600", "IP window seconds");
    assert.strictEqual(capturedBody[10], "15", "User limit");
    assert.strictEqual(capturedBody[11], "600", "User window seconds");
    assert.strictEqual(capturedBody[12], "1", "hasUser flag");

    // 5. Verify Parsed Result
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.limit, 15);
    assert.strictEqual(result.remaining, 14);
    assert.strictEqual(result.retryAfterSeconds, 0);
  });

  await checkAsync("Single-key legacy pipeline consume() maintains backward compatibility", async () => {
    let capturedBody: any = null;
    const mockFetch: typeof fetch = async (_url: any, init: any) => {
      capturedBody = JSON.parse(init?.body);
      return new Response(
        JSON.stringify([{ result: 1 }, { result: 1 }, { result: 600 }]),
        { status: 200 }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.consume("user:42student", 15, 600_000);
    assert.strictEqual(result.allowed, true);
    assert.deepStrictEqual(capturedBody[0], ["INCR", "ratelimit:user:42student"]);
  });

  // -------------------------------------------------------------------------
  // Suite 2: Concurrency & Zero-Partial-Mutation Invariant
  // -------------------------------------------------------------------------
  console.log("\nSuite 2: Concurrency & Zero-Partial-Mutation Invariant");

  check("When IP limit is exceeded, user counter is NOT incremented (zero partial mutation)", () => {
    const memStore = new InMemoryRateLimiterStore();
    const saturatedIpConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: 3, ipMaxRequests: 2, globalDailyLimit: 100 };

    // Fill IP limit to 2 requests using student1
    assert.strictEqual(memStore.checkMultiTierAtomic({ userId: "student1", clientIp: "10.42.1.99", config: saturatedIpConfig }).allowed, true);
    assert.strictEqual(memStore.checkMultiTierAtomic({ userId: "student1", clientIp: "10.42.1.99", config: saturatedIpConfig }).allowed, true);

    // Now student2 (fresh user, 0 requests) tries from the same saturated IP -> blocked by IP limit
    const blockedRes = memStore.checkMultiTierAtomic({ userId: "student2_fresh", clientIp: "10.42.1.99", config: saturatedIpConfig });
    assert.strictEqual(blockedRes.allowed, false);
    assert.strictEqual(blockedRes.reason, "IP_RATE_LIMIT_EXCEEDED");

    // Zero-partial-mutation check: student2's personal user quota must NOT have been burned!
    // On a fresh IP (where IP limit is ample), student2 must be able to make all 3 allowed requests!
    const freshIpConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: 3, ipMaxRequests: 20, globalDailyLimit: 100 };
    const r1 = memStore.checkMultiTierAtomic({ userId: "student2_fresh", clientIp: "172.16.0.5", config: freshIpConfig });
    const r2 = memStore.checkMultiTierAtomic({ userId: "student2_fresh", clientIp: "172.16.0.5", config: freshIpConfig });
    const r3 = memStore.checkMultiTierAtomic({ userId: "student2_fresh", clientIp: "172.16.0.5", config: freshIpConfig });

    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r3.allowed, true);

    // 4th request from student2 hits user limit
    const r4 = memStore.checkMultiTierAtomic({ userId: "student2_fresh", clientIp: "172.16.0.5", config: freshIpConfig });
    assert.strictEqual(r4.allowed, false);
    assert.strictEqual(r4.reason, "USER_RATE_LIMIT_EXCEEDED");
  });

  check("When User limit is exceeded, global daily counter is NOT incremented (zero partial mutation)", () => {
    const memStore = new InMemoryRateLimiterStore();
    const config = { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: 2, ipMaxRequests: 20, globalDailyLimit: 100 };

    // User exhausts personal quota
    memStore.checkMultiTierAtomic({ userId: "student_exhausted", clientIp: "10.0.0.1", config });
    memStore.checkMultiTierAtomic({ userId: "student_exhausted", clientIp: "10.0.0.1", config });
    const globalCountAfter2 = memStore.getGlobalDailyCount();
    assert.strictEqual(globalCountAfter2, 2);

    // 3rd attempt by user fails user limit
    const blocked = memStore.checkMultiTierAtomic({ userId: "student_exhausted", clientIp: "10.0.0.1", config });
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.reason, "USER_RATE_LIMIT_EXCEEDED");

    // Zero-partial-mutation check: global counter must NOT have been incremented
    assert.strictEqual(memStore.getGlobalDailyCount(), 2, "Global count must remain 2 after rejected user attempt");
  });

  check("When Global daily quota is reached, user and IP counters are NOT incremented", () => {
    const memStore = new InMemoryRateLimiterStore();
    const config = { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: 15, ipMaxRequests: 20, globalDailyLimit: 2 };

    // Fill global quota to 2
    memStore.checkMultiTierAtomic({ userId: "userA", clientIp: "10.0.0.1", config });
    memStore.checkMultiTierAtomic({ userId: "userB", clientIp: "10.0.0.2", config });
    assert.strictEqual(memStore.getGlobalDailyCount(), 2);

    // userC attempts request
    const blocked = memStore.checkMultiTierAtomic({ userId: "userC", clientIp: "10.0.0.3", config });
    assert.strictEqual(blocked.allowed, false);
    assert.strictEqual(blocked.reason, "GLOBAL_DAILY_QUOTA_REACHED");

    // Global quota remains capped at 2
    assert.strictEqual(memStore.getGlobalDailyCount(), 2);
  });

  // -------------------------------------------------------------------------
  // Suite 3: Multi-Tier Limits & Campus Multi-Student Sharing
  // -------------------------------------------------------------------------
  console.log("\nSuite 3: Multi-Tier Limits & Campus Multi-Student Sharing");

  check("Multiple students sharing a campus NAT IP: IP limit applies across students", () => {
    const memStore = new InMemoryRateLimiterStore();
    const campusIp = "194.214.0.1"; // 42 Campus Gateway IP
    const config = { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: 15, ipMaxRequests: 20, globalDailyLimit: 900 };

    // Student A makes 12 requests
    for (let i = 0; i < 12; i++) {
      assert.strictEqual(memStore.checkMultiTierAtomic({ userId: "studentA", clientIp: campusIp, config }).allowed, true);
    }

    // Student B makes 8 requests (IP total is now 20)
    for (let i = 0; i < 8; i++) {
      assert.strictEqual(memStore.checkMultiTierAtomic({ userId: "studentB", clientIp: campusIp, config }).allowed, true);
    }

    // Student C attempts request on campus IP -> blocked by campus IP cap
    const studentCResult = memStore.checkMultiTierAtomic({ userId: "studentC", clientIp: campusIp, config });
    assert.strictEqual(studentCResult.allowed, false);
    assert.strictEqual(studentCResult.reason, "IP_RATE_LIMIT_EXCEEDED");
    assert(studentCResult.retryAfterSeconds > 0);
  });

  check("Multiple students across different IPs all contribute to global daily quota", () => {
    const memStore = new InMemoryRateLimiterStore();
    const config = { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: 15, ipMaxRequests: 20, globalDailyLimit: 5 };

    const students = [
      { id: "s1", ip: "10.1.0.1" },
      { id: "s2", ip: "10.2.0.1" },
      { id: "s3", ip: "10.3.0.1" },
      { id: "s4", ip: "10.4.0.1" },
      { id: "s5", ip: "10.5.0.1" },
    ];

    for (const s of students) {
      const res = memStore.checkMultiTierAtomic({ userId: s.id, clientIp: s.ip, config });
      assert.strictEqual(res.allowed, true);
    }

    assert.strictEqual(memStore.getGlobalDailyCount(), 5);

    // 6th request from any student or IP is blocked
    const res6 = memStore.checkMultiTierAtomic({ userId: "s6", clientIp: "10.6.0.1", config });
    assert.strictEqual(res6.allowed, false);
    assert.strictEqual(res6.reason, "GLOBAL_DAILY_QUOTA_REACHED");
  });

  // -------------------------------------------------------------------------
  // Suite 4: Fail-Closed Resilience on Errors & Timeouts
  // -------------------------------------------------------------------------
  console.log("\nSuite 4: Fail-Closed Resilience on Errors & Timeouts");

  await checkAsync("Fails closed safely on Upstash HTTP 500 server error", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response("Internal Redis cluster outage", { status: 500 });
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "test",
      clientIp: "10.0.0.1",
      config: DEFAULT_RATE_LIMIT_CONFIG,
    });

    assert.strictEqual(result.allowed, false, "Must fail closed on 500");
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.retryAfterSeconds, 60);
    assert.strictEqual(result.reason, "RATE_LIMIT_STORE_ERROR");
  });

  await checkAsync("Fails closed safely on Upstash HTTP 401 unauthorized", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "bad_token",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "test",
      clientIp: "10.0.0.1",
      config: DEFAULT_RATE_LIMIT_CONFIG,
    });

    assert.strictEqual(result.allowed, false, "Must fail closed on 401 auth error");
    assert.strictEqual(result.reason, "RATE_LIMIT_STORE_ERROR");
  });

  await checkAsync("Fails closed safely when request times out (>3000ms AbortError)", async () => {
    const mockFetch: typeof fetch = async () => {
      const err: any = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      timeoutMs: 100,
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "test",
      clientIp: "10.0.0.1",
      config: DEFAULT_RATE_LIMIT_CONFIG,
    });

    assert.strictEqual(result.allowed, false, "Must fail closed on network abort");
    assert.strictEqual(result.reason, "RATE_LIMIT_STORE_ERROR");
  });

  await checkAsync("Fails closed safely when Upstash returns malformed JSON", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ unexpected: "payload" }), { status: 200 });
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "test",
      clientIp: "10.0.0.1",
      config: DEFAULT_RATE_LIMIT_CONFIG,
    });

    assert.strictEqual(result.allowed, false, "Must fail closed on malformed response");
    assert.strictEqual(result.reason, "RATE_LIMIT_STORE_ERROR");
  });

  // -------------------------------------------------------------------------
  // Suite 5: Boundary Expiry & Reset Mechanics
  // -------------------------------------------------------------------------
  console.log("\nSuite 5: Boundary Expiry & Store Resolution");

  check("Boundary expiry: expired keys allow new requests after window expires", () => {
    const memStore = new InMemoryRateLimiterStore();
    const config = { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: 1, userWindowMs: 50 }; // 50ms window

    // First request allowed
    const r1 = memStore.checkMultiTierAtomic({ userId: "quick_expiry_user", clientIp: "10.0.0.1", config });
    assert.strictEqual(r1.allowed, true);

    // Immediate second request blocked
    const r2 = memStore.checkMultiTierAtomic({ userId: "quick_expiry_user", clientIp: "10.0.0.1", config });
    assert.strictEqual(r2.allowed, false);

    // Reset/clear user key simulates TTL expiration
    memStore.reset("user:quick_expiry_user");

    // After reset/expiry, new request is allowed again
    const r3 = memStore.checkMultiTierAtomic({ userId: "quick_expiry_user", clientIp: "10.0.0.1", config });
    assert.strictEqual(r3.allowed, true);
  });

  check("getRateLimiterStore() returns ProductionFailSafeStore in production when unconfigured", () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.UPSTASH_REDIS_REST_URL;
    const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const origKvUrl = process.env.KV_REST_API_URL;
    const origKvToken = process.env.KV_REST_API_TOKEN;

    try {
      (process.env as any).NODE_ENV = "production";
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;

      const store = getRateLimiterStore();
      assert(store instanceof ProductionFailSafeStore, "Expected ProductionFailSafeStore");

      const res = store.checkMultiTierAtomic({ userId: "test", clientIp: "1.1.1.1", config: DEFAULT_RATE_LIMIT_CONFIG });
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.reason, "PRODUCTION_SHARED_LIMITER_UNCONFIGURED");
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      if (origUrl) process.env.UPSTASH_REDIS_REST_URL = origUrl;
      if (origToken) process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
      if (origKvUrl) process.env.KV_REST_API_URL = origKvUrl;
      if (origKvToken) process.env.KV_REST_API_TOKEN = origKvToken;
    }
  });

  check("getRateLimiterStore() returns UpstashRedisRestRateLimiterStore in production when configured", () => {
    const origEnv = process.env.NODE_ENV;
    const origUrl = process.env.UPSTASH_REDIS_REST_URL;
    const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      (process.env as any).NODE_ENV = "production";
      process.env.UPSTASH_REDIS_REST_URL = "https://upstash.io/test";
      process.env.UPSTASH_REDIS_REST_TOKEN = "upstash_token_123";

      const store = getRateLimiterStore();
      assert(store instanceof UpstashRedisRestRateLimiterStore, "Expected UpstashRedisRestRateLimiterStore");
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      if (origUrl) process.env.UPSTASH_REDIS_REST_URL = origUrl;
      else delete process.env.UPSTASH_REDIS_REST_URL;
      if (origToken) process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
      else delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });

  console.log("\nSuite 5: Multi-Tier Atomic Quota Enforcement & Zero Partial Mutations");

  await checkAsync("Upstash checkMultiTierAtomic dispatches EVAL with Lua script and correct keys/args", async () => {
    let capturedUrl = "";
    let capturedHeaders: any = null;
    let capturedBody: any = null;

    const mockFetch: typeof fetch = async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body);
      return new Response(
        JSON.stringify({
          result: [1, "ALLOWED", 15, 14, 0],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "mock_token_eval",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "student42",
      clientIp: "192.168.1.1",
      config: {
        userMaxRequests: 15,
        userWindowMs: 600_000,
        ipMaxRequests: 20,
        ipWindowMs: 600_000,
        globalDailyLimit: 900,
      },
    });

    assert.strictEqual(capturedUrl, "https://mock-redis.upstash.io");
    assert.strictEqual(capturedHeaders["Authorization"], "Bearer mock_token_eval");
    assert.strictEqual(capturedHeaders["Content-Type"], "application/json");

    assert.strictEqual(Array.isArray(capturedBody), true);
    assert.strictEqual(capturedBody[0], "EVAL");
    assert.strictEqual(capturedBody[1], UPSTASH_LUA_MULTI_TIER_SCRIPT);
    assert.strictEqual(capturedBody[2], 3); // 3 keys
    assert(capturedBody[3].startsWith("ratelimit:global:daily:"));
    assert.strictEqual(capturedBody[4], "ratelimit:ip:192.168.1.1");
    assert.strictEqual(capturedBody[5], "ratelimit:user:student42");
    assert.strictEqual(capturedBody[6], "900"); // globalLimit
    assert.strictEqual(capturedBody[8], "20");  // ipLimit
    assert.strictEqual(capturedBody[10], "15"); // userLimit
    assert.strictEqual(capturedBody[12], "1");  // hasUser

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.limit, 15);
    assert.strictEqual(result.remaining, 14);
    assert.strictEqual(result.retryAfterSeconds, 0);
  });

  await checkAsync("Upstash checkMultiTierAtomic parses USER denial correctly", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          result: [0, "USER_RATE_LIMIT_EXCEEDED", 15, 0, 420],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "user_exceeded",
      clientIp: "10.0.0.1",
      config: {
        userMaxRequests: 15,
        userWindowMs: 600_000,
        ipMaxRequests: 20,
        ipWindowMs: 600_000,
        globalDailyLimit: 900,
      },
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "USER_RATE_LIMIT_EXCEEDED");
    assert.strictEqual(result.limit, 15);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.retryAfterSeconds, 420);
  });

  await checkAsync("Upstash checkMultiTierAtomic parses IP denial correctly", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          result: [0, "IP_RATE_LIMIT_EXCEEDED", 20, 0, 310],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "fresh_user",
      clientIp: "10.0.0.99",
      config: {
        userMaxRequests: 15,
        userWindowMs: 600_000,
        ipMaxRequests: 20,
        ipWindowMs: 600_000,
        globalDailyLimit: 900,
      },
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "IP_RATE_LIMIT_EXCEEDED");
    assert.strictEqual(result.limit, 20);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.retryAfterSeconds, 310);
  });

  await checkAsync("Upstash checkMultiTierAtomic parses GLOBAL denial correctly", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          result: [0, "GLOBAL_DAILY_QUOTA_REACHED", 900, 0, 3600],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "fresh_user",
      clientIp: "10.0.0.1",
      config: {
        userMaxRequests: 15,
        userWindowMs: 600_000,
        ipMaxRequests: 20,
        ipWindowMs: 600_000,
        globalDailyLimit: 900,
      },
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "GLOBAL_DAILY_QUOTA_REACHED");
    assert.strictEqual(result.limit, 900);
    assert.strictEqual(result.remaining, 0);
    assert.strictEqual(result.retryAfterSeconds, 3600);
  });

  await checkAsync("Upstash checkMultiTierAtomic fails closed safely on network error, 500, or timeout", async () => {
    // 1. HTTP 500
    const mock500 = async () => new Response("Internal Error", { status: 500 });
    const store500 = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mock500 as any,
    });
    const res500 = await store500.checkMultiTierAtomic({
      clientIp: "127.0.0.1",
      config: { userMaxRequests: 15, userWindowMs: 600_000, ipMaxRequests: 20, ipWindowMs: 600_000, globalDailyLimit: 900 },
    });
    assert.strictEqual(res500.allowed, false);
    assert.strictEqual(res500.reason, "RATE_LIMIT_STORE_ERROR");
    assert.strictEqual(res500.retryAfterSeconds, 60);

    // 2. AbortError / Timeout
    const mockTimeout = async () => {
      const err: any = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };
    const storeTimeout = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockTimeout as any,
    });
    const resTimeout = await storeTimeout.checkMultiTierAtomic({
      clientIp: "127.0.0.1",
      config: { userMaxRequests: 15, userWindowMs: 600_000, ipMaxRequests: 20, ipWindowMs: 600_000, globalDailyLimit: 900 },
    });
    assert.strictEqual(resTimeout.allowed, false);
    assert.strictEqual(resTimeout.reason, "RATE_LIMIT_STORE_ERROR");
  });

  check("InMemoryRateLimiterStore enforces zero partial counter increments across all tiers", () => {
    const memStore = new InMemoryRateLimiterStore();
    const config = {
      userMaxRequests: 2,
      userWindowMs: 600_000,
      ipMaxRequests: 4,
      ipWindowMs: 600_000,
      globalDailyLimit: 10,
    };

    // User "alice" on IP "10.0.0.1"
    const req1 = memStore.checkMultiTierAtomic({ userId: "alice", clientIp: "10.0.0.1", config });
    assert.strictEqual(req1.allowed, true);
    assert.strictEqual(memStore.getGlobalDailyCount(), 1);

    const req2 = memStore.checkMultiTierAtomic({ userId: "alice", clientIp: "10.0.0.1", config });
    assert.strictEqual(req2.allowed, true);
    assert.strictEqual(memStore.getGlobalDailyCount(), 2);

    // 3rd request from "alice": exceeds user limit (2)
    const req3 = memStore.checkMultiTierAtomic({ userId: "alice", clientIp: "10.0.0.1", config });
    assert.strictEqual(req3.allowed, false);
    assert.strictEqual(req3.reason, "USER_RATE_LIMIT_EXCEEDED");
    // ZERO PARTIAL INCREMENT: Global count must NOT have increased!
    assert.strictEqual(memStore.getGlobalDailyCount(), 2, "Global counter must NOT mutate when user limit denied");

    // Request from "bob" on SAME IP "10.0.0.1": allowed (IP currently has 2 requests)
    const req4 = memStore.checkMultiTierAtomic({ userId: "bob", clientIp: "10.0.0.1", config });
    assert.strictEqual(req4.allowed, true);
    assert.strictEqual(memStore.getGlobalDailyCount(), 3);

    // Request from "charlie" on SAME IP "10.0.0.1": allowed (IP hits 4)
    const req5 = memStore.checkMultiTierAtomic({ userId: "charlie", clientIp: "10.0.0.1", config });
    assert.strictEqual(req5.allowed, true);
    assert.strictEqual(memStore.getGlobalDailyCount(), 4);

    // Request from "dave" on SAME IP "10.0.0.1": IP limit exceeded (4 requests reached)
    const req6 = memStore.checkMultiTierAtomic({ userId: "dave", clientIp: "10.0.0.1", config });
    assert.strictEqual(req6.allowed, false);
    assert.strictEqual(req6.reason, "IP_RATE_LIMIT_EXCEEDED");
    // ZERO PARTIAL INCREMENT: Global count must NOT mutate, Dave must not be recorded!
    assert.strictEqual(memStore.getGlobalDailyCount(), 4, "Global counter must NOT mutate when IP limit denied");

    // Dave switches to IP "10.0.0.2": Dave has 0 recorded requests, so this request is ALLOWED!
    const req7 = memStore.checkMultiTierAtomic({ userId: "dave", clientIp: "10.0.0.2", config });
    assert.strictEqual(req7.allowed, true, "Dave should be allowed because previous attempt was not partially recorded");
    assert.strictEqual(memStore.getGlobalDailyCount(), 5);

    // Test Global Daily Cap: simulate global limit reached
    const strictGlobalConfig = {
      ...config,
      globalDailyLimit: 5, // currently at 5
    };
    const req8 = memStore.checkMultiTierAtomic({ userId: "eve", clientIp: "10.0.0.3", config: strictGlobalConfig });
    assert.strictEqual(req8.allowed, false);
    assert.strictEqual(req8.reason, "GLOBAL_DAILY_QUOTA_REACHED");
    assert.strictEqual(memStore.getGlobalDailyCount(), 5, "Global count capped at 5");

    // Eve was NOT mutated. If global limit increases, Eve still has 0 requests:
    const relaxedConfig = { ...config, globalDailyLimit: 10 };
    const req9 = memStore.checkMultiTierAtomic({ userId: "eve", clientIp: "10.0.0.3", config: relaxedConfig });
    assert.strictEqual(req9.allowed, true);
    assert.strictEqual(req9.remaining, 1, "Eve has full remaining requests (1 remaining out of 2)");
  });

  check("ProductionFailSafeStore.checkMultiTierAtomic denies with PRODUCTION_SHARED_LIMITER_UNCONFIGURED", () => {
    const store = new ProductionFailSafeStore();
    const res = store.checkMultiTierAtomic();
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, "PRODUCTION_SHARED_LIMITER_UNCONFIGURED");
    assert.strictEqual(res.retryAfterSeconds, 60);
  });

  console.log("\nSuite 6: Campus Network Quotas & Lua Type Safety");

  check("DEFAULT_RATE_LIMIT_CONFIG provides 100 requests per IP window for campus NAT sharing", () => {
    assert.strictEqual(DEFAULT_RATE_LIMIT_CONFIG.ipMaxRequests, 100, "Campus NAT ceiling must be 100");
    assert.strictEqual(DEFAULT_RATE_LIMIT_CONFIG.userMaxRequests, 15, "Per-user limit must be 15");
    assert.strictEqual(DEFAULT_RATE_LIMIT_CONFIG.globalDailyLimit, 900, "Global daily cap must be 900");
  });

  check("Campus NAT IP accommodating multiple students with 100 requests ceiling", () => {
    const memStore = new InMemoryRateLimiterStore();
    const campusNatIp = "212.82.100.42";

    // 6 students make 15 requests each = 90 total requests on same NAT IP
    for (let s = 1; s <= 6; s++) {
      const studentId = `student_${s}`;
      for (let req = 1; req <= 15; req++) {
        const res = memStore.checkMultiTierAtomic({
          userId: studentId,
          clientIp: campusNatIp,
          config: DEFAULT_RATE_LIMIT_CONFIG,
        });
        assert.strictEqual(res.allowed, true, `Student ${s} request ${req} should succeed`);
      }
    }
  });

  check("InMemoryRateLimiterStore rejects invalid configuration with INVALID_RATE_LIMIT_CONFIG", () => {
    const memStore = new InMemoryRateLimiterStore();
    const invalidConfig = {
      ...DEFAULT_RATE_LIMIT_CONFIG,
      ipMaxRequests: 0, // non-positive
    };

    const res = memStore.checkMultiTierAtomic({
      userId: "test",
      clientIp: "127.0.0.1",
      config: invalidConfig,
    });

    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, "INVALID_RATE_LIMIT_CONFIG");
    assert.strictEqual(res.retryAfterSeconds, 60);
  });

  await checkAsync("Upstash checkMultiTierAtomic parses INVALID_RATE_LIMIT_CONFIG from Lua", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          result: [0, "INVALID_RATE_LIMIT_CONFIG", 0, 0, 60],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "test",
      clientIp: "10.0.0.1",
      config: { ...DEFAULT_RATE_LIMIT_CONFIG, userMaxRequests: -1 },
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "INVALID_RATE_LIMIT_CONFIG");
  });

  await checkAsync("Upstash checkMultiTierAtomic parses key type error from Lua as RATE_LIMIT_STORE_ERROR", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          result: [0, "RATE_LIMIT_STORE_ERROR", 0, 0, 60],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const store = new UpstashRedisRestRateLimiterStore({
      url: "https://mock-redis.upstash.io",
      token: "secret",
      fetchFn: mockFetch,
    });

    const result = await store.checkMultiTierAtomic({
      userId: "test",
      clientIp: "10.0.0.1",
      config: DEFAULT_RATE_LIMIT_CONFIG,
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, "RATE_LIMIT_STORE_ERROR");
  });

  console.log("\n==================================================");
  console.log(`Rate Limiter Verification: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

main().catch((err) => {
  console.error("FATAL Suite Failure:", err);
  process.exit(1);
});
