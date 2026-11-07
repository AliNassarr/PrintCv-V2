// test/verify-real-upstash-connection.ts
// Live Upstash Redis Verification Script for PrintCV Help Me Write v2.
// Safely tests connectivity, atomic Lua EVAL script execution, zero-partial-mutation invariants,
// TTL expiration, and concurrent request handling using strictly isolated temporary test keys.
// Cleans up all test keys upon completion. Zero secrets are logged.

import { loadEnvConfig } from "@next/env";
import { UPSTASH_LUA_MULTI_TIER_SCRIPT } from "../src/lib/security/rate-limiter";

// Load environment variables securely from .env.local
loadEnvConfig(process.cwd());

const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "");
const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

if (!url || !token) {
  console.log("SKIP: UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is not configured in this environment (live Upstash test skipped).");
  process.exit(0);
}

const uniqueRunId = `test_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const createdKeys = new Set<string>();

async function executeRedisCommand(command: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Upstash HTTP ${res.status} ${res.statusText}: ${errorText}`);
  }

  const json = await res.json();
  return json?.result;
}

async function cleanup(): Promise<void> {
  if (createdKeys.size === 0) return;
  const keysArray = Array.from(createdKeys);
  try {
    await executeRedisCommand(["DEL", ...keysArray]);
    console.log(`✓ Cleaned up ${keysArray.length} temporary test keys.`);
  } catch (err: any) {
    console.error(`Warning: Cleanup failed for keys: ${err.message}`);
  }
}

async function main() {
  console.log("==================================================");
  console.log("PrintCV Live Upstash Redis Verification");
  console.log("==================================================");
  console.log(`Namespace: ratelimit:test:${uniqueRunId}`);

  let step1Passed = false;
  let step2Passed = false;
  let step3Passed = false;
  let step4Passed = false;
  let step5Passed = false;
  let step6Passed = false;
  let step7Passed = false;

  try {
    // -----------------------------------------------------------------------
    // 1. Connect to Upstash REST API (PING)
    // -----------------------------------------------------------------------
    console.log("\n[Test 1] Testing basic REST API connectivity (PING)...");
    const pingResult = await executeRedisCommand(["PING"]);
    if (pingResult === "PONG") {
      console.log("✓ Upstash connection: PASS (PONG received)");
      step1Passed = true;
    } else {
      throw new Error(`Unexpected PING response: ${JSON.stringify(pingResult)}`);
    }

    // -----------------------------------------------------------------------
    // 2. Execute existing atomic Lua EVAL script
    // -----------------------------------------------------------------------
    console.log("\n[Test 2] Executing atomic Lua EVAL script on isolated test keys...");
    const globalKey = `ratelimit:test:${uniqueRunId}:global`;
    const ipKey = `ratelimit:test:${uniqueRunId}:ip`;
    const userKey = `ratelimit:test:${uniqueRunId}:user1`;

    createdKeys.add(globalKey);
    createdKeys.add(ipKey);
    createdKeys.add(userKey);

    // Config: userLimit = 2, ipLimit = 5, globalLimit = 10, TTL = 60s
    const evalArgs = [
      "EVAL",
      UPSTASH_LUA_MULTI_TIER_SCRIPT,
      3,
      globalKey,
      ipKey,
      userKey,
      "10", // globalLimit
      "60", // globalTtl
      "5",  // ipLimit
      "60", // ipTtl
      "2",  // userLimit
      "60", // userTtl
      "1",  // hasUser
    ];

    // First request: should be ALLOWED, remaining = 1
    const evalRes1 = await executeRedisCommand(evalArgs);
    console.log("  Request 1 response:", evalRes1);
    if (Array.isArray(evalRes1) && evalRes1[0] === 1 && evalRes1[1] === "ALLOWED" && evalRes1[3] === 1) {
      console.log("✓ Request 1 allowed, user remaining quota: 1");
      step2Passed = true;
    } else {
      throw new Error(`Unexpected Lua result on Request 1: ${JSON.stringify(evalRes1)}`);
    }

    // -----------------------------------------------------------------------
    // 3. Verify that allowed requests increment counters
    // -----------------------------------------------------------------------
    console.log("\n[Test 3] Verifying counter increments in Redis...");
    const userVal1 = await executeRedisCommand(["GET", userKey]);
    const ipVal1 = await executeRedisCommand(["GET", ipKey]);
    const globalVal1 = await executeRedisCommand(["GET", globalKey]);

    if (userVal1 === "1" && ipVal1 === "1" && globalVal1 === "1") {
      console.log("✓ Allowed request correctly incremented user, IP, and global counters to 1");
      step3Passed = true;
    } else {
      throw new Error(`Counter mismatch: user=${userVal1}, ip=${ipVal1}, global=${globalVal1}`);
    }

    // -----------------------------------------------------------------------
    // 4. Verify TTL expiration values
    // -----------------------------------------------------------------------
    console.log("\n[Test 4] Verifying TTL values on newly created keys...");
    const userTtl = await executeRedisCommand(["TTL", userKey]);
    const ipTtl = await executeRedisCommand(["TTL", ipKey]);
    const globalTtl = await executeRedisCommand(["TTL", globalKey]);

    console.log(`  TTLs: user=${userTtl}s, ip=${ipTtl}s, global=${globalTtl}s`);
    if (userTtl > 0 && userTtl <= 60 && ipTtl > 0 && ipTtl <= 60 && globalTtl > 0 && globalTtl <= 60) {
      console.log("✓ Key TTL values correctly set within expected 60-second window");
      step4Passed = true;
    } else {
      throw new Error(`Invalid TTLs: user=${userTtl}, ip=${ipTtl}, global=${globalTtl}`);
    }

    // -----------------------------------------------------------------------
    // 5. Verify exhausted quotas block requests
    // -----------------------------------------------------------------------
    console.log("\n[Test 5] Exhausting user quota (limit = 2) and testing denial...");
    // Second request (allowed, remaining = 0)
    const evalRes2 = await executeRedisCommand(evalArgs);
    console.log("  Request 2 response:", evalRes2);
    if (!Array.isArray(evalRes2) || evalRes2[0] !== 1 || evalRes2[3] !== 0) {
      throw new Error(`Request 2 failed: ${JSON.stringify(evalRes2)}`);
    }

    // Third request (should be DENIED by USER_RATE_LIMIT_EXCEEDED)
    const evalRes3 = await executeRedisCommand(evalArgs);
    console.log("  Request 3 (exceeded) response:", evalRes3);
    if (Array.isArray(evalRes3) && evalRes3[0] === 0 && evalRes3[1] === "USER_RATE_LIMIT_EXCEEDED") {
      console.log("✓ Request 3 correctly denied with USER_RATE_LIMIT_EXCEEDED");
      step5Passed = true;
    } else {
      throw new Error(`Request 3 was not blocked: ${JSON.stringify(evalRes3)}`);
    }

    // -----------------------------------------------------------------------
    // 6. Verify that denied requests do NOT modify counters (Zero Partial Mutation)
    // -----------------------------------------------------------------------
    console.log("\n[Test 6] Verifying zero-partial-mutation invariant on denied request...");
    const userValAfterDenied = await executeRedisCommand(["GET", userKey]);
    const ipValAfterDenied = await executeRedisCommand(["GET", ipKey]);
    const globalValAfterDenied = await executeRedisCommand(["GET", globalKey]);

    console.log(`  Counters after denial: user=${userValAfterDenied}, ip=${ipValAfterDenied}, global=${globalValAfterDenied}`);
    if (userValAfterDenied === "2" && ipValAfterDenied === "2" && globalValAfterDenied === "2") {
      console.log("✓ Zero-partial-mutation verified: all counters remained strictly at 2");
      step6Passed = true;
    } else {
      throw new Error(`Zero-partial-mutation violated! user=${userValAfterDenied}, ip=${ipValAfterDenied}, global=${globalValAfterDenied}`);
    }

    // -----------------------------------------------------------------------
    // 7. Test concurrent requests against the same quota
    // -----------------------------------------------------------------------
    console.log("\n[Test 7] Testing concurrent race conditions (10 parallel requests, limit = 5)...");
    const concurrentGlobalKey = `ratelimit:test:${uniqueRunId}:concurrent_global`;
    const concurrentIpKey = `ratelimit:test:${uniqueRunId}:concurrent_ip`;
    const concurrentUserKey = `ratelimit:test:${uniqueRunId}:concurrent_user`;

    createdKeys.add(concurrentGlobalKey);
    createdKeys.add(concurrentIpKey);
    createdKeys.add(concurrentUserKey);

    const concurrentEvalArgs = [
      "EVAL",
      UPSTASH_LUA_MULTI_TIER_SCRIPT,
      3,
      concurrentGlobalKey,
      concurrentIpKey,
      concurrentUserKey,
      "100", // globalLimit
      "60",
      "100", // ipLimit
      "60",
      "5",   // userLimit = 5
      "60",
      "1",
    ];

    // Fire 10 parallel requests at the exact same moment
    const parallelPromises = Array.from({ length: 10 }, () =>
      executeRedisCommand(concurrentEvalArgs)
    );
    const parallelResults = await Promise.all(parallelPromises);

    const allowedCount = parallelResults.filter((r) => Array.isArray(r) && r[0] === 1).length;
    const deniedCount = parallelResults.filter((r) => Array.isArray(r) && r[0] === 0).length;
    const finalCounter = await executeRedisCommand(["GET", concurrentUserKey]);

    console.log(`  Concurrency Results: ${allowedCount} allowed, ${deniedCount} denied, counter in Redis = ${finalCounter}`);

    if (allowedCount === 5 && deniedCount === 5 && finalCounter === "5") {
      console.log("✓ Concurrency enforcement: PASS (exactly 5 allowed, exactly 5 denied, counter = 5)");
      step7Passed = true;
    } else {
      throw new Error(`Concurrency race condition detected! allowed=${allowedCount}, denied=${deniedCount}, counter=${finalCounter}`);
    }

  } catch (err: any) {
    console.error(`\n✗ Upstash Test Error: ${err.message}`);
  } finally {
    console.log("\n[Cleanup] Removing temporary test keys...");
    await cleanup();
  }

  const allPassed =
    step1Passed &&
    step2Passed &&
    step3Passed &&
    step4Passed &&
    step5Passed &&
    step6Passed &&
    step7Passed;

  console.log("\n==================================================");
  console.log(`Upstash Real Test Summary: ${allPassed ? "ALL TESTS PASSED" : "FAILED"}`);
  console.log("==================================================");

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL Failure:", err);
  process.exit(1);
});
