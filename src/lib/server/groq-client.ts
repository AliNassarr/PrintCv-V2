// src/lib/server/groq-client.ts
// Native fetch client for Groq API with OpenAI-compatible JSON Schema structured outputs.
// Features approved modern production models (GPT-OSS 20B/120B), max_completion_tokens (2048),
// reasoning_effort: "low", strict schema validation, 15s overall timeout with budget preservation,
// safe upstream error mapping, and refined failover logic.
// Zero third-party SDK dependencies.

export const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Approved modern production models for PrintCV Help Me Write v2.
 * Groq retired llama-3.3-70b-versatile on August 16, 2026 for Free/Dev tiers
 * and mixtral-8x7b-32768 on March 20, 2025.
 */
export const GROQ_MODELS = {
  DEFAULT_FAST: "openai/gpt-oss-20b",
  ALTERNATIVE_HIGH_CAPACITY: "openai/gpt-oss-120b",
  OPENAI_OSS_20B: "openai/gpt-oss-20b",
  OPENAI_OSS_120B: "openai/gpt-oss-120b",
} as const;

/**
 * Deprecated and retired Groq models.
 * Calling any of these models is explicitly forbidden and will fail fast
 * with a descriptive error rather than silently degrading or failing upstream.
 */
export const DEPRECATED_GROQ_MODELS: readonly string[] = [
  "llama-3.3-70b-versatile",
  "mixtral-8x7b-32768",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "llama-3.1-70b-versatile",
] as const;

export const FORBIDDEN_MODELS = DEPRECATED_GROQ_MODELS;

/**
 * Checks whether a given model identifier belongs to the deprecated models list.
 */
export function isDeprecatedGroqModel(modelId: string): boolean {
  if (!modelId || typeof modelId !== "string") return false;
  const normalized = modelId.trim().toLowerCase();
  return DEPRECATED_GROQ_MODELS.some((m) => m.toLowerCase() === normalized);
}

export const isForbiddenModel = isDeprecatedGroqModel;

/**
 * Validates that a model is not deprecated or forbidden, throwing an explicit error if it is.
 */
export function validateGroqModel(modelId: string): void {
  if (isDeprecatedGroqModel(modelId)) {
    throw new Error(`Model ${modelId} has been retired and is not permitted (deprecated and forbidden)`);
  }
}

/**
 * Resolves the primary Groq model:
 * 1. process.env.GROQ_MODEL (if set)
 * 2. GROQ_MODELS.DEFAULT_FAST ("openai/gpt-oss-20b")
 */
export function getPrimaryGroqModel(): string {
  const envModel = process.env.GROQ_MODEL?.trim();
  return envModel || GROQ_MODELS.DEFAULT_FAST;
}

/**
 * Resolves the fallback Groq model:
 * 1. process.env.GROQ_FALLBACK_MODEL (if set)
 * 2. GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY ("openai/gpt-oss-120b")
 */
export function getFallbackGroqModel(): string {
  const envFallback = process.env.GROQ_FALLBACK_MODEL?.trim();
  return envFallback || GROQ_MODELS.ALTERNATIVE_HIGH_CAPACITY;
}

/**
 * Refined model failover eligibility check:
 * - 401, 403, 413, 422, 429: STRICTLY NO RETRY.
 * - 404: Retry (model not found on endpoint).
 * - 503: Retry (service unavailable for that model).
 * - 500, 502: Retry if remaining timeout budget allows.
 * - 400: ONLY retry if the response body indicates model issue (not client syntax/schema error).
 */
export function isRetriableWithFallback(status: number, errorText?: string): boolean {
  if ([401, 403, 413, 422, 429].includes(status)) {
    return false;
  }

  if (status === 404) {
    return true;
  }

  if (status === 503) {
    return true;
  }

  if (status === 500 || status === 502) {
    return true;
  }

  if (status === 400 && errorText) {
    const lower = errorText.toLowerCase();
    return (
      lower.includes("model_not_found") ||
      lower.includes("unsupported") ||
      lower.includes("unknown model") ||
      lower.includes("invalid model") ||
      (lower.includes("model") &&
        (lower.includes("not found") ||
          lower.includes("deprecated") ||
          lower.includes("does not exist") ||
          lower.includes("not supported")))
    );
  }

  return false;
}

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqClientOptions {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  allowFallback?: boolean;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface GroqCompletionsResponse {
  ok: boolean;
  status: number;
  content?: string;
  rawJson?: unknown;
  modelUsed?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  retryAfterSeconds?: number;
  error?: string;
  fallbackToClipboard: boolean;
}

/**
 * Strict JSON Schema enforcing Dr. Wissam CV bullet points output structure.
 * With strict: true, all properties must be listed in required and additionalProperties: false.
 */
export const CV_BULLETS_JSON_SCHEMA = {
  name: "cv_bullet_suggestions",
  strict: true,
  schema: {
    type: "object",
    properties: {
      bullets: {
        type: "array",
        items: { type: "string" },
        description: "List of 2 to 4 past-tense CV bullet points strictly adhering to Dr. Wissam CV writing rules.",
      },
      hasSufficientEvidence: {
        type: "boolean",
        description: "True if the student's answers and technical context provided sufficient evidence to describe authentic contributions without inventing facts.",
      },
      missingInformationPrompt: {
        type: "string",
        description: "If hasSufficientEvidence is false, a clear question asking the student for the missing technical facts.",
      },
    },
    required: ["bullets", "hasSufficientEvidence", "missingInformationPrompt"],
    additionalProperties: false,
  },
};

// In-memory request deduplication cache to prevent firing duplicate calls
// when inputs have not changed within a 15-second window.
// Strictly isolated per user login and generation inputs to prevent cross-user leakage.
interface CachedResponse {
  timestamp: number;
  response: GroqCompletionsResponse;
}
const requestDeduplicationCache = new Map<string, CachedResponse>();

export function clearRequestDeduplicationCache(): void {
  requestDeduplicationCache.clear();
}

export function getDeduplicationCacheSize(): number {
  return requestDeduplicationCache.size;
}

function pruneStaleCacheEntries(now: number): void {
  for (const [key, item] of requestDeduplicationCache.entries()) {
    if (now - item.timestamp >= 15_000) {
      requestDeduplicationCache.delete(key);
    }
  }
}

/**
 * Internal helper to execute a single completions request to Groq API with timeout and schema enforcement.
 */
async function executeGroqRequest({
  model,
  messages,
  apiKey,
  timeoutMs,
  customFetch,
}: {
  model: string;
  messages: GroqMessage[];
  apiKey: string;
  timeoutMs: number;
  customFetch: typeof fetch;
}): Promise<GroqCompletionsResponse> {
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.2, // Low temperature for high factual adherence
    max_completion_tokens: 2048, // Generous budget for reasoning tokens + JSON Schema + bullets
    reasoning_effort: "low",
    response_format: {
      type: "json_schema",
      json_schema: CV_BULLETS_JSON_SCHEMA,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await customFetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Upstream Rate Limit (HTTP 429)
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("retry-after");
      let retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 10;
      if (isNaN(retryAfterSeconds) || retryAfterSeconds <= 0) retryAfterSeconds = 10;

      // Do NOT automatically switch models or retry on 429: respect org quota and return safe error
      const errorResult: GroqCompletionsResponse = {
        ok: false,
        status: 429,
        error: "AI provider rate limit reached. Please wait or use the offline Copy Prompt.",
        retryAfterSeconds,
        fallbackToClipboard: true,
      };
      return errorResult;
    }

    // Upstream Server Overload (HTTP 500, 502, 503)
    if (res.status >= 500) {
      return {
        ok: false,
        status: 502,
        error: "Upstream AI provider error. You can continue using the offline Copy Prompt.",
        fallbackToClipboard: true,
      };
    }

    // Client Error (HTTP 400, 401, 404, 422)
    if (!res.ok) {
      let message = "AI generation request rejected by provider.";
      try {
        const errJson = await res.json();
        if (errJson?.error?.message) {
          message = errJson.error.message;
        }
      } catch {
        // use fallback message
      }
      return {
        ok: false,
        status: res.status,
        error: message,
        fallbackToClipboard: true,
      };
    }

    const data = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content;

    if (!rawContent) {
      return {
        ok: false,
        status: 502,
        error: "AI provider returned empty response.",
        fallbackToClipboard: true,
      };
    }

    return {
      ok: true,
      status: 200,
      content: rawContent,
      modelUsed: data?.model || model,
      usage: data?.usage,
      fallbackToClipboard: false,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof Error && (err.name === "AbortError" || err.message?.includes("aborted"))) {
      return {
        ok: false,
        status: 504,
        error: "AI generation request timed out after 15 seconds.",
        fallbackToClipboard: true,
      };
    }

    return {
      ok: false,
      status: 502,
      error: "Network error connecting to AI provider.",
      fallbackToClipboard: true,
    };
  }
}

/**
 * Calls Groq API using native fetch with strict JSON Schema structured outputs.
 * Enforces approved models, explicit deprecation checks, timeout budget preservation,
 * and refined model failover logic.
 */
export async function callGroqCompletions(
  messages: GroqMessage[],
  options: GroqClientOptions = {},
  cacheKey?: string
): Promise<GroqCompletionsResponse> {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "AI generation service is not configured on this server.",
      fallbackToClipboard: true,
    };
  }

  // 1. Check deduplication cache
  const now = Date.now();
  pruneStaleCacheEntries(now);
  if (cacheKey) {
    const cached = requestDeduplicationCache.get(cacheKey);
    if (cached && now - cached.timestamp < 15_000) {
      return cached.response;
    }
  }

  // 2. Primary Model Selection & Deprecation Check
  const primaryModel = options.model || getPrimaryGroqModel();

  if (isDeprecatedGroqModel(primaryModel)) {
    return {
      ok: false,
      status: 400,
      error: `Model ${primaryModel} has been retired and is not permitted (deprecated and forbidden)`,
      fallbackToClipboard: true,
    };
  }

  const overallTimeoutMs = options.timeoutMs ?? 15_000;
  const customFetch = options.fetchFn ?? fetch;
  const startTime = Date.now();

  // Execute primary request with full timeout budget
  const primaryResult = await executeGroqRequest({
    model: primaryModel,
    messages,
    apiKey,
    timeoutMs: overallTimeoutMs,
    customFetch,
  });

  if (primaryResult.ok) {
    if (cacheKey) {
      requestDeduplicationCache.set(cacheKey, { timestamp: now, response: primaryResult });
    }
    return primaryResult;
  }

  // 3. Refined Fallback Handling with Timeout Budget Preservation
  const elapsed = Date.now() - startTime;
  const remainingTime = overallTimeoutMs - elapsed;

  const canRetry =
    options.allowFallback !== false &&
    isRetriableWithFallback(primaryResult.status, primaryResult.error);

  if (canRetry) {
    // Timeout Budget Preservation: if remaining time <= 1500ms, abort fallback and return 504
    if (remainingTime <= 1500) {
      return {
        ok: false,
        status: 504,
        error: "AI generation request timed out (insufficient time remaining for failover).",
        fallbackToClipboard: true,
      };
    }

    const fallbackModel = options.fallbackModel || getFallbackGroqModel();

    // Max 1 Fallback Attempt: Never fall back to a deprecated model
    if (isDeprecatedGroqModel(fallbackModel)) {
      return {
        ok: false,
        status: 400,
        error: `Model ${fallbackModel} has been retired and is not permitted (deprecated and forbidden)`,
        fallbackToClipboard: true,
      };
    }

    if (fallbackModel !== primaryModel) {
      const fallbackResult = await executeGroqRequest({
        model: fallbackModel,
        messages,
        apiKey,
        timeoutMs: remainingTime, // Pass remaining timeout budget
        customFetch,
      });

      if (fallbackResult.ok) {
        if (cacheKey) {
          requestDeduplicationCache.set(cacheKey, { timestamp: now, response: fallbackResult });
        }
        return fallbackResult;
      }

      return fallbackResult;
    }
  }

  return primaryResult;
}

/**
 * Explicit helper to invoke Groq using the approved fallback model directly.
 * Ensures only openai/gpt-oss-120b or process.env.GROQ_FALLBACK_MODEL is selected.
 */
export async function callGroqFallbackCompletions(
  messages: GroqMessage[],
  options: GroqClientOptions = {},
  cacheKey?: string
): Promise<GroqCompletionsResponse> {
  const fallbackModel = options.fallbackModel || options.model || getFallbackGroqModel();
  return callGroqCompletions(
    messages,
    {
      ...options,
      model: fallbackModel,
      allowFallback: false,
    },
    cacheKey
  );
}
