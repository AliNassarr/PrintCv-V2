// src/lib/security/rate-limiter.ts
// Reusable rate limiting abstraction and safe client IP resolution for PrintCV Help Me Write v2.
// Supports session-authenticated per-user limiting, safe IP extraction, global daily quota protection,
// atomic Lua-scripted Upstash Redis REST adapter for shared serverless environments, and production fail-safe enforcement.

export interface RateLimitConfig {
  userMaxRequests: number;  // e.g. 15 requests per user window
  userWindowMs: number;     // e.g. 10 minutes (600,000 ms)
  ipMaxRequests: number;    // e.g. 100 requests per IP window (supports shared 42 campus NAT)
  ipWindowMs: number;       // e.g. 10 minutes (600,000 ms)
  globalDailyLimit: number; // e.g. 900 requests per day across all users
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
  reason?: string;
}

export interface MultiTierRateLimitParams {
  userId?: string;
  clientIp: string;
  config: RateLimitConfig;
}

export interface RateLimiterStore {
  checkMultiTierAtomic(params: MultiTierRateLimitParams): Promise<RateLimitResult> | RateLimitResult;
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> | RateLimitResult;
  getGlobalDailyCount(): Promise<number> | number;
  incrementGlobalDailyCount(): Promise<number> | number;
  reset(key?: string): Promise<void> | void;
}

interface Bucket {
  timestamps: number[];
}

/**
 * Single Atomic Lua script executed via Redis EVAL on Upstash REST endpoint.
 * Evaluates Global, User, and IP quotas atomically BEFORE any mutation.
 * If ANY limit is exceeded, returns { 0, reason, limit, remaining, ttl } with ZERO counter mutations.
 * If ALL limits are satisfied, atomically increments all counters and returns { 1, "ALLOWED", limit, remaining, 0 }.
 */
export const UPSTASH_LUA_MULTI_TIER_SCRIPT = `
local globalKey = KEYS[1]
local ipKey     = KEYS[2]
local userKey   = KEYS[3]

local globalLimit = tonumber(ARGV[1])
local globalTtl   = tonumber(ARGV[2])
local ipLimit     = tonumber(ARGV[3])
local ipTtl       = tonumber(ARGV[4])
local userLimit   = tonumber(ARGV[5])
local userTtl     = tonumber(ARGV[6])
local hasUser     = ARGV[7] == "1"

if not globalLimit or globalLimit <= 0 or
   not globalTtl   or globalTtl <= 0 or
   not ipLimit     or ipLimit <= 0 or
   not ipTtl       or ipTtl <= 0 or
   not userLimit   or userLimit <= 0 or
   not userTtl     or userTtl <= 0 then
  return { 0, "INVALID_RATE_LIMIT_CONFIG", 0, 0, 60 }
end

local function isKeyTypeValid(k)
  local t = redis.call("TYPE", k)
  local typeStr = (type(t) == "table" and t["ok"]) or tostring(t)
  return typeStr == "none" or typeStr == "string"
end

if not isKeyTypeValid(globalKey) or not isKeyTypeValid(ipKey) or (hasUser and not isKeyTypeValid(userKey)) then
  return { 0, "RATE_LIMIT_STORE_ERROR", 0, 0, 60 }
end

local globalVal = tonumber(redis.call("GET", globalKey) or "0") or 0
local ipVal     = tonumber(redis.call("GET", ipKey) or "0") or 0
local userVal   = 0
if hasUser then
  userVal = tonumber(redis.call("GET", userKey) or "0") or 0
end

if globalVal >= globalLimit then
  local ttl = redis.call("TTL", globalKey)
  if ttl < 0 then ttl = 3600 end
  return { 0, "GLOBAL_DAILY_QUOTA_REACHED", globalLimit, 0, ttl }
end

if hasUser and userVal >= userLimit then
  local ttl = redis.call("TTL", userKey)
  if ttl < 0 then ttl = userTtl end
  return { 0, "USER_RATE_LIMIT_EXCEEDED", userLimit, 0, ttl }
end

if ipVal >= ipLimit then
  local ttl = redis.call("TTL", ipKey)
  if ttl < 0 then ttl = ipTtl end
  return { 0, "IP_RATE_LIMIT_EXCEEDED", ipLimit, 0, ttl }
end

local newGlobal = redis.call("INCR", globalKey)
if newGlobal == 1 then
  redis.call("EXPIRE", globalKey, globalTtl)
end

local remainingUser = userLimit
if hasUser then
  local newUser = redis.call("INCR", userKey)
  if newUser == 1 then
    redis.call("EXPIRE", userKey, userTtl)
  end
  remainingUser = userLimit - newUser
end

local newIp = redis.call("INCR", ipKey)
if newIp == 1 then
  redis.call("EXPIRE", ipKey, ipTtl)
end
local remainingIp = ipLimit - newIp

local remaining = remainingIp
local primaryLimit = ipLimit
if hasUser then
  primaryLimit = userLimit
  remaining = remainingUser
end
if remaining < 0 then remaining = 0 end

return { 1, "ALLOWED", primaryLimit, remaining, 0 }
`.trim();

/**
 * In-memory sliding window store for local development and automated testing.
 * Enforces synchronized atomic multi-tier checking with zero partial mutations on denial.
 */
export class InMemoryRateLimiterStore implements RateLimiterStore {
  private readonly buckets = new Map<string, Bucket>();
  private globalDailyCount = 0;
  private currentUtcDay = new Date().toISOString().slice(0, 10);
  private lastPrune = Date.now();

  public checkMultiTierAtomic(params: MultiTierRateLimitParams): RateLimitResult {
    const now = Date.now();

    // 0. Validate configuration parameters
    if (
      !params.config ||
      !(params.config.globalDailyLimit > 0) ||
      !(params.config.ipMaxRequests > 0) ||
      !(params.config.ipWindowMs > 0) ||
      !(params.config.userMaxRequests > 0) ||
      !(params.config.userWindowMs > 0)
    ) {
      return {
        allowed: false,
        limit: 0,
        remaining: 0,
        resetTimeMs: now + 60_000,
        retryAfterSeconds: 60,
        reason: "INVALID_RATE_LIMIT_CONFIG",
      };
    }

    this.checkDailyReset();
    this.pruneIfNeeded(now, Math.max(params.config.userWindowMs, params.config.ipWindowMs));

    // 1. Evaluate Global Daily Cap
    if (this.globalDailyCount >= params.config.globalDailyLimit) {
      return {
        allowed: false,
        limit: params.config.globalDailyLimit,
        remaining: 0,
        resetTimeMs: now + 3600_000,
        retryAfterSeconds: 3600,
        reason: "GLOBAL_DAILY_QUOTA_REACHED",
      };
    }

    // 2. Evaluate User Limit (without mutating)
    let userBucket: Bucket | undefined;
    if (params.userId) {
      const userKey = `user:${params.userId}`;
      userBucket = this.buckets.get(userKey);
      if (!userBucket) {
        userBucket = { timestamps: [] };
        this.buckets.set(userKey, userBucket);
      }
      const userWindowStart = now - params.config.userWindowMs;
      userBucket.timestamps = userBucket.timestamps.filter((ts) => ts > userWindowStart);

      if (userBucket.timestamps.length >= params.config.userMaxRequests) {
        const oldest = userBucket.timestamps[0];
        const resetTimeMs = oldest + params.config.userWindowMs;
        const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));
        return {
          allowed: false,
          limit: params.config.userMaxRequests,
          remaining: 0,
          resetTimeMs,
          retryAfterSeconds,
          reason: "USER_RATE_LIMIT_EXCEEDED",
        };
      }
    }

    // 3. Evaluate IP Limit (without mutating)
    const ipKey = `ip:${params.clientIp}`;
    let ipBucket = this.buckets.get(ipKey);
    if (!ipBucket) {
      ipBucket = { timestamps: [] };
      this.buckets.set(ipKey, ipBucket);
    }
    const ipWindowStart = now - params.config.ipWindowMs;
    ipBucket.timestamps = ipBucket.timestamps.filter((ts) => ts > ipWindowStart);

    if (ipBucket.timestamps.length >= params.config.ipMaxRequests) {
      const oldest = ipBucket.timestamps[0];
      const resetTimeMs = oldest + params.config.ipWindowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));
      return {
        allowed: false,
        limit: params.config.ipMaxRequests,
        remaining: 0,
        resetTimeMs,
        retryAfterSeconds,
        reason: "IP_RATE_LIMIT_EXCEEDED",
      };
    }

    // ALL LIMITS SATISFIED: Atomically commit all mutations simultaneously
    this.globalDailyCount++;
    if (userBucket) {
      userBucket.timestamps.push(now);
    }
    ipBucket.timestamps.push(now);

    const remainingUser = userBucket
      ? Math.max(0, params.config.userMaxRequests - userBucket.timestamps.length)
      : 0;
    const remainingIp = Math.max(0, params.config.ipMaxRequests - ipBucket.timestamps.length);
    const remaining = params.userId ? remainingUser : remainingIp;
    const limit = params.userId ? params.config.userMaxRequests : params.config.ipMaxRequests;

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, remaining),
      resetTimeMs: now + (params.userId ? params.config.userWindowMs : params.config.ipWindowMs),
      retryAfterSeconds: 0,
    };
  }

  public consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    this.pruneIfNeeded(now, windowMs);

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    const windowStart = now - windowMs;
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

    if (bucket.timestamps.length >= limit) {
      const oldest = bucket.timestamps[0];
      const resetTimeMs = oldest + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - now) / 1000));

      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTimeMs,
        retryAfterSeconds,
        reason: "RATE_LIMIT_EXCEEDED",
      };
    }

    bucket.timestamps.push(now);
    const resetTimeMs = bucket.timestamps[0] + windowMs;

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - bucket.timestamps.length),
      resetTimeMs,
      retryAfterSeconds: 0,
    };
  }

  public getGlobalDailyCount(): number {
    this.checkDailyReset();
    return this.globalDailyCount;
  }

  public incrementGlobalDailyCount(): number {
    this.checkDailyReset();
    this.globalDailyCount++;
    return this.globalDailyCount;
  }

  public reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
      this.globalDailyCount = 0;
    }
  }

  private checkDailyReset(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentUtcDay) {
      this.currentUtcDay = today;
      this.globalDailyCount = 0;
    }
  }

  private pruneIfNeeded(now: number, windowMs: number): void {
    if (now - this.lastPrune < 300_000) return; // 5 min interval
    this.lastPrune = now;
    const windowStart = now - windowMs;
    for (const [key, bucket] of this.buckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);
      if (bucket.timestamps.length === 0) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * Production fail-safe store: in production, if no shared distributed limiter
 * (e.g. Upstash Redis or KV) is configured, denies AI requests safely rather than
 * silently falling back to an unshared in-memory limiter across serverless lambdas.
 */
export class ProductionFailSafeStore implements RateLimiterStore {
  public checkMultiTierAtomic(_params?: MultiTierRateLimitParams): RateLimitResult {
    return {
      allowed: false,
      limit: 0,
      remaining: 0,
      resetTimeMs: Date.now() + 60_000,
      retryAfterSeconds: 60,
      reason: "PRODUCTION_SHARED_LIMITER_UNCONFIGURED",
    };
  }

  public consume(_key?: string, _limit?: number, _windowMs?: number): RateLimitResult {
    return {
      allowed: false,
      limit: 0,
      remaining: 0,
      resetTimeMs: Date.now() + 60_000,
      retryAfterSeconds: 60,
      reason: "PRODUCTION_SHARED_LIMITER_UNCONFIGURED",
    };
  }

  public getGlobalDailyCount(): number {
    return 0;
  }

  public incrementGlobalDailyCount(): number {
    return 0;
  }

  public reset(): void {
    // no-op
  }
}

export interface UpstashRedisStoreOptions {
  url: string;
  token: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Shared distributed rate limiter adapter using Upstash Redis REST API.
 * Dispatches atomic Lua script via Redis EVAL in a single HTTP request.
 * If the REST API fails or times out (>3000ms), fails closed safely with RATE_LIMIT_STORE_ERROR.
 */
export class UpstashRedisRestRateLimiterStore implements RateLimiterStore {
  private readonly url: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly customFetch: typeof fetch;

  constructor(options: UpstashRedisStoreOptions) {
    this.url = options.url.replace(/\/+$/, "");
    this.token = options.token.trim();
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.customFetch = options.fetchFn ?? fetch;
  }

  /**
   * Dispatches atomic multi-tier Lua script via Upstash Redis REST POST /
   * Evaluates Global, User, and IP quotas with zero partial counter mutations on denial.
   */
  public async checkMultiTierAtomic(params: MultiTierRateLimitParams): Promise<RateLimitResult> {
    const now = Date.now();
    // 0. Client-side fast rejection for non-positive or invalid configuration parameters
    if (
      !params.config ||
      !(params.config.globalDailyLimit > 0) ||
      !(params.config.ipMaxRequests > 0) ||
      !(params.config.ipWindowMs > 0) ||
      !(params.config.userMaxRequests > 0) ||
      !(params.config.userWindowMs > 0)
    ) {
      return {
        allowed: false,
        limit: 0,
        remaining: 0,
        resetTimeMs: now + 60_000,
        retryAfterSeconds: 60,
        reason: "INVALID_RATE_LIMIT_CONFIG",
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const globalKey = `ratelimit:global:daily:${today}`;
    const ipKey = `ratelimit:ip:${params.clientIp}`;
    const userKey = `ratelimit:user:${params.userId || "none"}`;

    const globalTtl = 86400 * 2;
    const ipTtl = Math.max(1, Math.ceil(params.config.ipWindowMs / 1000));
    const userTtl = Math.max(1, Math.ceil(params.config.userWindowMs / 1000));
    const hasUser = Boolean(params.userId && params.userId.trim());

    const command = [
      "EVAL",
      UPSTASH_LUA_MULTI_TIER_SCRIPT,
      3,
      globalKey,
      ipKey,
      userKey,
      String(params.config.globalDailyLimit),
      String(globalTtl),
      String(params.config.ipMaxRequests),
      String(ipTtl),
      String(params.config.userMaxRequests),
      String(userTtl),
      hasUser ? "1" : "0",
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.customFetch(`${this.url}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        return {
          allowed: false,
          limit: 0,
          remaining: 0,
          resetTimeMs: now + 60_000,
          retryAfterSeconds: 60,
          reason: "RATE_LIMIT_STORE_ERROR",
        };
      }

      const data = await res.json();
      const rawResult = data?.result;

      if (!Array.isArray(rawResult) || rawResult.length < 5) {
        return {
          allowed: false,
          limit: 0,
          remaining: 0,
          resetTimeMs: now + 60_000,
          retryAfterSeconds: 60,
          reason: "RATE_LIMIT_STORE_ERROR",
        };
      }

      const allowedNum = Number(rawResult[0]);
      const reason = String(rawResult[1]);
      const limit = Number(rawResult[2]) || 0;
      const remaining = Number(rawResult[3]) || 0;
      const ttl = Number(rawResult[4]) || 0;

      if (allowedNum === 1) {
        return {
          allowed: true,
          limit,
          remaining,
          resetTimeMs: now + (hasUser ? params.config.userWindowMs : params.config.ipWindowMs),
          retryAfterSeconds: 0,
        };
      }

      const retryAfterSeconds = Math.max(1, ttl);
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTimeMs: now + retryAfterSeconds * 1000,
        retryAfterSeconds,
        reason,
      };
    } catch {
      clearTimeout(timer);
      return {
        allowed: false,
        limit: 0,
        remaining: 0,
        resetTimeMs: now + 60_000,
        retryAfterSeconds: 60,
        reason: "RATE_LIMIT_STORE_ERROR",
      };
    }
  }

  private async executePipeline(commands: unknown[][]): Promise<{ ok: boolean; results?: any[]; error?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.customFetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commands),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        return { ok: false, error: `Upstash HTTP error ${res.status}` };
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        return { ok: false, error: "Invalid Upstash pipeline response format" };
      }

      return { ok: true, results: data };
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : "Pipeline fetch failed";
      return { ok: false, error: msg };
    }
  }

  public async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const redisKey = `ratelimit:${key}`;

    const pipeline = [
      ["INCR", redisKey],
      ["EXPIRE", redisKey, ttlSeconds, "NX"],
      ["TTL", redisKey],
    ];

    const exec = await this.executePipeline(pipeline);

    if (!exec.ok || !exec.results || exec.results.length < 3) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTimeMs: now + 60_000,
        retryAfterSeconds: 60,
        reason: "RATE_LIMIT_STORE_ERROR",
      };
    }

    const incrResult = exec.results[0]?.result;
    const ttlResult = exec.results[2]?.result;

    const count = typeof incrResult === "number" ? incrResult : parseInt(String(incrResult), 10);
    const ttl = typeof ttlResult === "number" && ttlResult > 0 ? ttlResult : ttlSeconds;

    if (isNaN(count)) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTimeMs: now + 60_000,
        retryAfterSeconds: 60,
        reason: "RATE_LIMIT_STORE_ERROR",
      };
    }

    const resetTimeMs = now + ttl * 1000;

    if (count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTimeMs,
        retryAfterSeconds: Math.max(1, ttl),
        reason: "RATE_LIMIT_EXCEEDED",
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - count),
      resetTimeMs,
      retryAfterSeconds: 0,
    };
  }

  public async getGlobalDailyCount(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const redisKey = `ratelimit:global:daily:${today}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.customFetch(`${this.url}/get/${encodeURIComponent(redisKey)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) return 0;
      const data = await res.json();
      const val = data?.result;
      return val ? parseInt(String(val), 10) || 0 : 0;
    } catch {
      clearTimeout(timer);
      return 0;
    }
  }

  public async incrementGlobalDailyCount(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const redisKey = `ratelimit:global:daily:${today}`;
    const ttlSeconds = 86400 * 2; // 48 hours TTL

    const pipeline = [
      ["INCR", redisKey],
      ["EXPIRE", redisKey, ttlSeconds, "NX"],
    ];

    const exec = await this.executePipeline(pipeline);
    if (!exec.ok || !exec.results) return 0;
    const incrResult = exec.results[0]?.result;
    return typeof incrResult === "number" ? incrResult : parseInt(String(incrResult), 10) || 0;
  }

  public async reset(key?: string): Promise<void> {
    if (key) {
      const redisKey = `ratelimit:${key}`;
      try {
        await this.customFetch(`${this.url}/del/${encodeURIComponent(redisKey)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${this.token}` },
        });
      } catch {
        // no-op
      }
    }
  }
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  userMaxRequests: 15,            // 15 requests per user
  userWindowMs: 10 * 60 * 1000,   // 10 minutes
  ipMaxRequests: 100,             // 100 requests per IP (supports 10-20 concurrent 42 students on campus NAT IP)
  ipWindowMs: 10 * 60 * 1000,     // 10 minutes
  globalDailyLimit: 900,          // 900 requests per day (stays under Groq 1K RPD free cap)
};

const devLimiterStore = new InMemoryRateLimiterStore();

/**
 * Selects appropriate limiter store based on environment:
 * - Production: uses UpstashRedisRestRateLimiterStore if UPSTASH_REDIS_REST_URL / KV_REST_API_URL are set;
 *   otherwise fails safely with ProductionFailSafeStore.
 * - Development/Test: uses InMemoryRateLimiterStore.
 */
export function getRateLimiterStore(): RateLimiterStore {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    return new UpstashRedisRestRateLimiterStore({ url, token });
  }

  if (process.env.NODE_ENV === "production") {
    // In production without shared limiter, fail safely
    return new ProductionFailSafeStore();
  }

  return devLimiterStore;
}

/**
 * Extracts trusted client IP from normalized Vercel / reverse proxy headers.
 * Audited against Vercel deployment topology:
 * 1. Cloudflare-specific headers (cf-connecting-ip) are ONLY trusted when explicit, verifiable
 *    proxy trust is configured via environment variable (TRUST_CLOUDFLARE_PROXY === "true").
 *    Presence of unverified client headers like cf-ray is never treated as proof of trusted routing.
 * 2. On standard Vercel deployments, Vercel edge-controlled headers (x-vercel-forwarded-for, x-real-ip)
 *    are prioritized and cannot be spoofed by incoming client requests.
 * 3. Never trusts raw, client-supplied leftmost X-Forwarded-For headers; takes rightmost proxy hop.
 */
export function getTrustedClientIp(req: Request): string {
  // 1. If explicitly configured with verified Cloudflare proxy trust, inspect cf-connecting-ip
  const trustCloudflare = process.env.TRUST_CLOUDFLARE_PROXY === "true";
  if (trustCloudflare) {
    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp && isValidIpFormat(cfIp)) {
      return cfIp.trim();
    }
  }

  // 2. Vercel deployment topology: x-vercel-forwarded-for is set and normalized by Vercel edge network
  const vercelForwarded = req.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const parts = vercelForwarded.split(",").map((s) => s.trim()).filter(isValidIpFormat);
    if (parts.length > 0) return parts[0];
  }

  // 3. Vercel verified real IP
  const realIp = req.headers.get("x-real-ip");
  if (realIp && isValidIpFormat(realIp)) {
    return realIp.trim();
  }

  // 4. Fallback for standard X-Forwarded-For: take the rightmost valid proxy IP
  // to defend against leftmost client-injected spoofed IPs
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(isValidIpFormat);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return "127.0.0.1";
}

function isValidIpFormat(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  // Basic IPv4 or IPv6 format check
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip);
  const isIpv6 = /^[a-fA-F0-9:]+$/.test(ip);
  return isIpv4 || isIpv6;
}

export interface AiRateLimitParams {
  userId?: string; // Authenticated 42 student login (e.g. "anassarr")
  clientIp: string;
  config?: RateLimitConfig;
  store?: RateLimiterStore;
}

/**
 * Enforces multi-tier rate limiting: Global Daily Cap, User Limit, and IP Limit.
 * Dispatches a single atomic check (Lua script in Redis or synchronized memory store)
 * guaranteeing zero partial counter increments on denial.
 */
export async function checkAiRateLimit(params: AiRateLimitParams): Promise<RateLimitResult> {
  const config = params.config ?? DEFAULT_RATE_LIMIT_CONFIG;
  const store = params.store ?? getRateLimiterStore();

  return await store.checkMultiTierAtomic({
    userId: params.userId,
    clientIp: params.clientIp,
    config,
  });
}

// For unit testing and backward compatibility
export const globalAiRateLimiter = {
  check: (identifier: string, limit: number = 10, windowMs: number = 60_000): RateLimitResult => {
    return devLimiterStore.consume(identifier, limit, windowMs);
  },
  reset: (identifier?: string) => devLimiterStore.reset(identifier),
};
