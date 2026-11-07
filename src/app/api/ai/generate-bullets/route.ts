// src/app/api/ai/generate-bullets/route.ts
// Authenticated Next.js Route Handler for PrintCV Help Me Write v2.
// Protected by:
// 1. 32 KB actual-bytes streaming limit
// 2. 42 OAuth signed-session verification (src/lib/auth-session.ts)
// 3. Multi-tier abuse prevention (safe IP resolution & user quota)
// 4. Input schema validation & prompt injection defenses
// 5. Native Groq fetch client with strict JSON Schema outputs
// 6. Zero secret leakage & permanent Copy Prompt fallback

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth-session";
import { getTrustedClientIp, checkAiRateLimit } from "@/lib/security/rate-limiter";
import { sanitizeReadmeText, MAX_REQUEST_BYTES } from "@/lib/security/readme-sanitizer";
import { assembleBulletGenerationPrompt } from "@/lib/ai/prompt-builder";
import { parseAiBulletResponse } from "@/lib/ai/bullet-parser";
import { callGroqCompletions } from "@/lib/server/groq-client";

export const dynamic = "force-dynamic";

interface GenerateBulletsRequestBody {
  projectName: string;
  projectSlug?: string;
  techStack?: string;
  targetRole?: string;
  facts?: Array<{ question: string; answer: string }>;
  readmeContent?: string;
  usedActionVerbs?: string[];
}

/**
 * Reads request body safely while enforcing actual byte limit against streaming or chunked payloads.
 */
async function readBodyWithByteLimit(req: NextRequest, maxBytes: number): Promise<{ bodyText: string; error?: string }> {
  // 1. Fast check Content-Length header if present
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    if (!isNaN(bytes) && bytes > maxBytes) {
      return { bodyText: "", error: `Request body exceeds ${Math.round(maxBytes / 1024)} KB limit.` };
    }
  }

  // 2. Read stream with actual byte counter
  if (!req.body) {
    return { bodyText: "" };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return { bodyText: "", error: `Request payload exceeded ${Math.round(maxBytes / 1024)} KB limit.` };
        }
        chunks.push(value);
      }
    }
  } catch {
    return { bodyText: "", error: "Error reading request stream." };
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const bodyText = new TextDecoder("utf-8").decode(merged);
  return { bodyText };
}

/**
 * Validates Origin or Referer header to protect against cross-site request forgery.
 */
function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!origin || !host) {
    // If no origin header (e.g. same-origin or direct test invocation), allow if host matches
    return true;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // 1. CSRF / Origin Guard
  if (!isValidOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Invalid request origin.", fallbackToClipboard: true },
      { status: 403 }
    );
  }

  // 2. Authentication Guard: require verified 42 session cookie
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  const user = readSessionToken(sessionToken);

  if (!user || !user.login) {
    return NextResponse.json(
      {
        ok: false,
        error: "Authentication required. Please log in with your 42 account to use in-app AI generation, or use the offline Copy Prompt.",
        fallbackToClipboard: true,
      },
      { status: 401 }
    );
  }

  // 3. Multi-Tier Rate Limiting Guard
  const clientIp = getTrustedClientIp(req);
  const rateResult = await checkAiRateLimit({
    userId: user.login,
    clientIp,
  });

  const rateHeaders: Record<string, string> = {
    "X-RateLimit-Limit": String(rateResult.limit),
    "X-RateLimit-Remaining": String(rateResult.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rateResult.resetTimeMs / 1000)),
  };

  if (!rateResult.allowed) {
    if (
      rateResult.reason === "PRODUCTION_SHARED_LIMITER_UNCONFIGURED" ||
      rateResult.reason === "RATE_LIMIT_STORE_ERROR" ||
      rateResult.reason === "INVALID_RATE_LIMIT_CONFIG"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "AI generation is temporarily disabled pending infrastructure setup. Please use the offline Copy Prompt.",
          fallbackToClipboard: true,
        },
        {
          status: 503,
          headers: rateHeaders,
        }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: rateResult.reason === "GLOBAL_DAILY_QUOTA_REACHED"
          ? "Daily generation quota reached. Please use the offline Copy Prompt."
          : "Rate limit reached. Please wait or use the offline Copy Prompt.",
        retryAfterSeconds: rateResult.retryAfterSeconds,
        fallbackToClipboard: true,
      },
      {
        status: 429,
        headers: {
          ...rateHeaders,
          "Retry-After": String(rateResult.retryAfterSeconds),
        },
      }
    );
  }

  // 4. Request Body Reading with Actual Byte Size Enforcement
  const { bodyText, error: streamError } = await readBodyWithByteLimit(req, MAX_REQUEST_BYTES);
  if (streamError) {
    return NextResponse.json(
      { ok: false, error: streamError, fallbackToClipboard: true },
      { status: 413, headers: rateHeaders }
    );
  }

  if (!bodyText.trim()) {
    return NextResponse.json(
      { ok: false, error: "Request payload cannot be empty.", fallbackToClipboard: true },
      { status: 400, headers: rateHeaders }
    );
  }

  // 5. JSON Parsing & Schema Validation
  let payload: GenerateBulletsRequestBody;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed JSON payload.", fallbackToClipboard: true },
      { status: 400, headers: rateHeaders }
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON object structure.", fallbackToClipboard: true },
      { status: 422, headers: rateHeaders }
    );
  }

  const projectName = typeof payload.projectName === "string" ? payload.projectName.trim() : "";
  if (!projectName || projectName.length > 100) {
    return NextResponse.json(
      { ok: false, error: "Field 'projectName' is required (max 100 characters).", fallbackToClipboard: true },
      { status: 422, headers: rateHeaders }
    );
  }

  const techStack = typeof payload.techStack === "string" ? payload.techStack.trim().slice(0, 200) : "";
  const targetRole = typeof payload.targetRole === "string" ? payload.targetRole.trim().slice(0, 100) : "";
  const rawFacts = Array.isArray(payload.facts) ? payload.facts : [];

  // Sanitize facts array (max 20 facts, max 1000 chars per answer)
  const facts = rawFacts.slice(0, 20).map((f) => ({
    question: typeof f?.question === "string" ? f.question.trim().slice(0, 200) : "",
    answer: typeof f?.answer === "string" ? f.answer.trim().slice(0, 1000) : "",
  }));

  const usedActionVerbs = Array.isArray(payload.usedActionVerbs)
    ? payload.usedActionVerbs.slice(0, 30).map((v) => String(v).trim().slice(0, 30))
    : [];

  // Sanitize optional README excerpt using section-aware parser
  let readmeExcerpt = "";
  if (typeof payload.readmeContent === "string" && payload.readmeContent.trim()) {
    readmeExcerpt = sanitizeReadmeText(payload.readmeContent, 8000);
  }

  // 6. Request Deduplication / Idempotency Key
  // Strictly isolated per user login and generation inputs to prevent cross-user leakage.
  // Includes user.login, projectSlug, projectName, techStack, targetRole,
  // all facts, sorted usedActionVerbs, and SHA-256 of the full readmeExcerpt.
  const fullReadmeHash = crypto.createHash("sha256").update(readmeExcerpt).digest("hex");
  const hashPayload = [
    `user:${user.login}`,
    `slug:${typeof payload.projectSlug === "string" ? payload.projectSlug.trim() : ""}`,
    `name:${projectName}`,
    `stack:${techStack}`,
    `role:${targetRole}`,
    `verbs:${[...usedActionVerbs].sort().join(",")}`,
    `facts:${JSON.stringify(facts)}`,
    `readme:${fullReadmeHash}`,
  ].join("|");
  const deduplicationKey = `dedup:${user.login}:${crypto.createHash("sha256").update(hashPayload).digest("hex")}`;

  // 7. Check Groq API Key Configuration
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI generation service is not configured on this server.",
        fallbackToClipboard: true,
      },
      { status: 503, headers: rateHeaders }
    );
  }

  // 8. Assemble Safe Prompt
  const messages = assembleBulletGenerationPrompt({
    projectName,
    projectSlug: typeof payload.projectSlug === "string" ? payload.projectSlug.trim() : undefined,
    techStack,
    targetRole,
    schoolContext: user.campusName ? `42 ${user.campusName}` : "42 Network",
    facts,
    readmeExcerpt,
    forbiddenOpeningVerbs: usedActionVerbs,
  });

  // 9. Call Groq Completions API
  const groqResponse = await callGroqCompletions(messages, {}, deduplicationKey);

  if (!groqResponse.ok) {
    const errorStatus = groqResponse.status >= 400 && groqResponse.status < 600 ? groqResponse.status : 502;
    const responseHeaders: Record<string, string> = { ...rateHeaders };
    if (groqResponse.retryAfterSeconds) {
      responseHeaders["Retry-After"] = String(groqResponse.retryAfterSeconds);
    }

    return NextResponse.json(
      {
        ok: false,
        error: groqResponse.error || "AI generation failed. Please use the offline Copy Prompt.",
        retryAfterSeconds: groqResponse.retryAfterSeconds,
        fallbackToClipboard: true,
      },
      { status: errorStatus, headers: responseHeaders }
    );
  }

  // 10. Parse and Validate Output Bullets with Grounding Check
  const sourceContext = [
    projectName,
    techStack,
    targetRole,
    ...facts.map((f) => `${f.question} ${f.answer}`),
    readmeExcerpt,
  ].join(" ");
  const parsed = parseAiBulletResponse(groqResponse.content || "", sourceContext);

  return NextResponse.json(
    {
      ok: true,
      bullets: parsed.bullets,
      candidates: parsed.candidates,
      modelUsed: groqResponse.modelUsed,
      usage: groqResponse.usage,
      hasSufficientEvidence: parsed.hasSufficientEvidence,
      missingInformationPrompt: parsed.missingInformationPrompt,
      fallbackToClipboard: false,
    },
    { status: 200, headers: rateHeaders }
  );
}
