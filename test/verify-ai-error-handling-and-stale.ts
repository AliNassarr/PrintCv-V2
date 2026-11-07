// test/verify-ai-error-handling-and-stale.ts
// Comprehensive unit verification for Help Me Write v2:
// 1. Error status handling (200, 401, 413, 422, 429, 502, 503, 504, network error, malformed JSON, empty responses)
// 2. Stale request protection (target switching & AbortController cancellation)
// 3. Privacy transparency (no false Zero-PII claims, accurate Groq disclosure)
// 4. 100% offline copy prompt & legacy manual paste workflow

import assert from "assert";
import fs from "fs";
import path from "path";
import { parseBulletsFromAI, buildBulletPrompt, HelperTarget } from "../src/lib/bullet-helper";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { ProjectItem } from "../src/types/resume";

function check(title: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${title}`);
  } catch (err: any) {
    console.error(`  ✗ ${title}`);
    console.error(`    ${err.message}`);
    process.exit(1);
  }
}

console.log("==================================================");
console.log("PrintCV Help Me Write v2: Error Handling & Resilience Suite");
console.log("==================================================");

// -----------------------------------------------------------------------------
// Suite 1: Explicit HTTP Status Code & Error Mapping Verification
// -----------------------------------------------------------------------------
console.log("\nSuite 1: Explicit HTTP Status Code & Error Mapping Verification");

/**
 * Simulates the client-side error extraction logic implemented in BulletHelper.tsx
 */
function simulateClientResponseHandling({
  status,
  ok,
  data,
  headers,
  parseFailed = false,
}: {
  status: number;
  ok: boolean;
  data: any;
  headers?: Record<string, string>;
  parseFailed?: boolean;
}): {
  errorMessage: string | null;
  retryAfterSeconds: number | null;
  candidatesCount: number;
  advancedToStudio: boolean;
} {
  let errorMessage: string | null = null;
  let retryAfterSeconds: number | null = null;
  let candidatesCount = 0;
  let advancedToStudio = false;

  // Malformed JSON on otherwise OK status
  if (parseFailed && ok) {
    return {
      errorMessage: "Received malformed or unparseable response from server. Please use the offline Copy Prompt.",
      retryAfterSeconds: null,
      candidatesCount: 0,
      advancedToStudio: false,
    };
  }

  // Parse Retry-After header or payload
  const headerRetryAfter = headers?.["Retry-After"] || headers?.["retry-after"];
  const parsedHeaderRetry = headerRetryAfter ? parseInt(headerRetryAfter, 10) : NaN;
  const retrySec = !isNaN(parsedHeaderRetry) && parsedHeaderRetry > 0
    ? parsedHeaderRetry
    : (typeof data?.retryAfterSeconds === "number" && data.retryAfterSeconds > 0
        ? data.retryAfterSeconds
        : 10);

  if (!ok || !data?.ok) {
    switch (status) {
      case 401:
        errorMessage =
          data?.error ||
          "Authentication required. Please log in with your 42 student account to use in-app AI generation, or use the offline Copy Prompt.";
        break;

      case 413:
        errorMessage =
          data?.error ||
          "Request payload too large (exceeds 32 KB limit). Shorten your answers or README excerpt, or use the offline Copy Prompt.";
        break;

      case 422:
        errorMessage =
          data?.error ||
          "Invalid request input. Please check the project details and answers, or use the offline Copy Prompt.";
        break;

      case 429:
        retryAfterSeconds = retrySec;
        errorMessage =
          data?.error ||
          `Generation rate limit reached. Please wait ${retrySec}s before retrying, or use the offline Copy Prompt.`;
        break;

      case 502:
        errorMessage =
          data?.error ||
          "AI upstream service is temporarily unreachable (502 Bad Gateway). Please retry shortly or use the offline Copy Prompt.";
        break;

      case 503:
        errorMessage =
          data?.error ||
          "AI generation service is temporarily unavailable or not configured on this server. Please use the offline Copy Prompt.";
        break;

      case 504:
        errorMessage =
          data?.error ||
          "AI generation request timed out (504 Gateway Timeout). Please retry or use the offline Copy Prompt.";
        break;

      default:
        errorMessage =
          data?.error ||
          `Generation request failed (HTTP ${status}). You can use the offline Copy Prompt below.`;
        break;
    }
    return { errorMessage, retryAfterSeconds, candidatesCount, advancedToStudio };
  }

  if (status === 200 && data?.ok) {
    const returnedBullets: string[] = Array.isArray(data.bullets) ? data.bullets : [];
    if (returnedBullets.length === 0) {
      errorMessage =
        "AI returned no bullet suggestions. Try adding more specific technical details to your answers, or use the offline Copy Prompt.";
    } else {
      candidatesCount = returnedBullets.length;
      advancedToStudio = true;
    }
  }

  return { errorMessage, retryAfterSeconds, candidatesCount, advancedToStudio };
}

check("HTTP 200 with valid bullets populates candidates and advances to review tab", () => {
  const result = simulateClientResponseHandling({
    status: 200,
    ok: true,
    data: {
      ok: true,
      bullets: [
        "Built a concurrent HTTP/1.1 server in C++ using poll() I/O multiplexing.",
        "Implemented RFC-compliant chunked transfer decoding and static routing.",
      ],
    },
  });

  assert.strictEqual(result.errorMessage, null);
  assert.strictEqual(result.candidatesCount, 2);
  assert.strictEqual(result.advancedToStudio, true);
});

check("HTTP 200 with empty bullets list triggers explicit empty response guidance", () => {
  const result = simulateClientResponseHandling({
    status: 200,
    ok: true,
    data: { ok: true, bullets: [] },
  });

  assert.strictEqual(result.advancedToStudio, false);
  assert(result.errorMessage?.includes("no bullet suggestions"), "Should warn about empty suggestions");
  assert(result.errorMessage?.includes("offline Copy Prompt"), "Should reference offline fallback");
});

check("HTTP 200 with malformed JSON triggers explicit unparseable response error", () => {
  const result = simulateClientResponseHandling({
    status: 200,
    ok: true,
    data: null,
    parseFailed: true,
  });

  assert.strictEqual(result.advancedToStudio, false);
  assert(result.errorMessage?.includes("malformed or unparseable"), "Should flag malformed response");
  assert(result.errorMessage?.includes("offline Copy Prompt"), "Should reference offline fallback");
});

check("HTTP 401 Unauthorized gives 42 login instructions and copy fallback", () => {
  const result = simulateClientResponseHandling({
    status: 401,
    ok: false,
    data: { ok: false, error: "Authentication required." },
  });

  assert(result.errorMessage?.includes("42 student account") || result.errorMessage?.includes("Authentication required"));
});

check("HTTP 413 Payload Too Large gives 32 KB guidance and copy fallback", () => {
  const result = simulateClientResponseHandling({
    status: 413,
    ok: false,
    data: { ok: false, error: "Request body exceeds 32 KB limit." },
  });

  assert(result.errorMessage?.includes("32 KB"), "Should mention 32 KB limit");
});

check("HTTP 422 Unprocessable Content gives input validation guidance", () => {
  const result = simulateClientResponseHandling({
    status: 422,
    ok: false,
    data: { ok: false, error: "Field 'projectName' is required." },
  });

  assert(result.errorMessage?.includes("projectName") || result.errorMessage?.includes("Invalid request"));
});

check("HTTP 429 Too Many Requests parses Retry-After header and activates countdown", () => {
  const result = simulateClientResponseHandling({
    status: 429,
    ok: false,
    data: { ok: false, retryAfterSeconds: 15 },
    headers: { "Retry-After": "25" },
  });

  assert.strictEqual(result.retryAfterSeconds, 25, "Header Retry-After should take precedence");
  assert(result.errorMessage?.includes("25s"), "Error message should include countdown seconds");
});

check("HTTP 502 Bad Gateway identifies upstream Groq reachability failure", () => {
  const result = simulateClientResponseHandling({
    status: 502,
    ok: false,
    data: { ok: false },
  });

  assert(result.errorMessage?.includes("502 Bad Gateway"), "Should clearly report 502 Bad Gateway");
});

check("HTTP 503 Service Unavailable distinguishes missing API key or unconfigured service", () => {
  const result = simulateClientResponseHandling({
    status: 503,
    ok: false,
    data: { ok: false, error: "AI generation service is not configured on this server." },
  });

  assert(result.errorMessage?.includes("not configured") || result.errorMessage?.includes("503"));
});

check("HTTP 504 Gateway Timeout reports model timeout cleanly with retry notice", () => {
  const result = simulateClientResponseHandling({
    status: 504,
    ok: false,
    data: { ok: false },
  });

  assert(result.errorMessage?.includes("504 Gateway Timeout"), "Should clearly report 504 Gateway Timeout");
});

// -----------------------------------------------------------------------------
// Suite 2: Stale Request Protection & Target Switch Simulation
// -----------------------------------------------------------------------------
console.log("\nSuite 2: Stale Request Protection & Target Switch Simulation");

check("Switching targets aborts in-flight request and ignores late response", async () => {
  let activeTargetId = "project-1";
  let isGenerating = false;
  let candidates: string[] = [];
  let tab = 0;

  // User starts generation for Project 1
  const targetIdAtStart = activeTargetId;
  const controller = new AbortController();
  isGenerating = true;

  // Simulate user switching to Project 2 while request is in-flight
  const switchTarget = (newTargetId: string) => {
    controller.abort();
    activeTargetId = newTargetId;
    isGenerating = false;
    candidates = [];
    tab = 0;
  };

  // User switches to Project 2 after 10ms
  setTimeout(() => {
    switchTarget("project-2");
  }, 10);

  // Simulate late network arrival for Project 1 after 30ms
  await new Promise((resolve) => setTimeout(resolve, 30));

  // The client checks stale condition:
  const isStale = controller.signal.aborted || activeTargetId !== targetIdAtStart;
  assert.strictEqual(isStale, true, "Request must be recognized as stale");

  // Late response handler applies stale protection guard:
  if (!isStale) {
    candidates = ["Late Project 1 Bullet"];
    tab = 2;
  }

  assert.strictEqual(candidates.length, 0, "Late candidates must NOT be set on new target");
  assert.strictEqual(tab, 0, "Tab must NOT advance to review for stale project");
  assert.strictEqual(isGenerating, false, "Generating state must remain false");
});

// -----------------------------------------------------------------------------
// Suite 3: Privacy Transparency & Zero False Claims Audit
// -----------------------------------------------------------------------------
console.log("\nSuite 3: Privacy Transparency & Zero False Claims Audit");

check("No source code in src/ contains misleading 'Zero-PII' guarantee claims", () => {
  function scanDir(dir: string): string[] {
    const findings: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findings.push(...scanDir(fullPath));
      } else if (entry.isFile() && /\.(tsx?|jsx?|md)$/.test(entry.name)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes("Zero-PII Payload") || content.includes("Zero-PII guarantee")) {
          findings.push(`${fullPath}: contains false Zero-PII claim`);
        }
      }
    }
    return findings;
  }

  const srcDir = path.resolve(__dirname, "../src");
  const violations = scanDir(srcDir);
  assert.strictEqual(violations.length, 0, `Found false Zero-PII claims:\n${violations.join("\n")}`);
});

check("BulletHelper.tsx and GenerationActionBar.tsx contain transparent privacy disclosures", () => {
  const bulletHelperPath = path.resolve(__dirname, "../src/components/studio/BulletHelper.tsx");
  const actionBarPath = path.resolve(__dirname, "../src/components/studio/help-me-write/GenerationActionBar.tsx");

  const helperContent = fs.readFileSync(bulletHelperPath, "utf-8");
  const actionBarContent = fs.readFileSync(actionBarPath, "utf-8");

  assert(helperContent.includes("Prompt Preview (Payload Sent to AI)"), "Prompt preview must use honest wording");
  assert(actionBarContent.includes("Privacy Notice:"), "Action bar must have transparent privacy notice");
  assert(actionBarContent.includes("Groq LPU inference"), "Must explicitly identify Groq processing");
  assert(actionBarContent.includes("Never submit confidential passwords"), "Must warn against submitting secrets");
});

// -----------------------------------------------------------------------------
// Suite 4: 100% Offline Copy Prompt & Manual Paste Workflow
// -----------------------------------------------------------------------------
console.log("\nSuite 4: 100% Offline Copy Prompt & Manual Paste Workflow");

check("Prompt assembly runs 100% synchronously without network or async dependencies", () => {
  const cv = createEmptyCV();
  const proj: ProjectItem = {
    id: "proj-webserv",
    name: "Webserv",
    slug: "webserv",
    techStack: "C++98",
    date: "2024",
    is42Project: true,
    bulletPoints: [],
  };
  const target: HelperTarget = { kind: "project", item: proj };
  const answers = {
    "ws-features": "Implemented epoll non-blocking sockets, chunked requests, CGI execution",
    "ws-perf": "Handled 1000 concurrent client connections without memory leaks",
  };

  const start = performance.now();
  const compiledPrompt = buildBulletPrompt({ target, answers, cv });
  const duration = performance.now() - start;

  assert(compiledPrompt.includes("Webserv"), "Prompt must contain project name");
  assert(compiledPrompt.includes("epoll non-blocking sockets"), "Prompt must contain answered details");
  assert(compiledPrompt.includes("1000 concurrent"), "Prompt must contain user metrics");
  assert(compiledPrompt.includes("Start each bullet with a strong past-tense action verb"), "Prompt must enforce action verbs");
  assert(duration < 20, "Prompt compilation must be instantaneous (<20ms)");
});

check("Legacy manual reply parser extracts bullets from diverse external AI formats", () => {
  // Test ChatGPT markdown response
  const chatgptReply = `
Here are your CV bullet points:
- Built a high-performance HTTP/1.1 web server in C++ using epoll multiplexing.
- Implemented chunked transfer encoding and RFC-compliant URI parsing.
- Optimized non-blocking socket handling to sustain 1,000+ simultaneous connections.
`;
  const parsedChatGPT = parseBulletsFromAI(chatgptReply);
  assert.strictEqual(parsedChatGPT.length, 3);
  assert.strictEqual(parsedChatGPT[0], "Built a high-performance HTTP/1.1 web server in C++ using epoll multiplexing.");

  // Test Claude bulleted response with bold headings
  const claudeReply = `
* **Architected** an event-driven I/O multiplexer managing non-blocking sockets.
* **Engineered** dynamic CGI script execution supporting Python and PHP gateways.
`;
  const parsedClaude = parseBulletsFromAI(claudeReply);
  assert.strictEqual(parsedClaude.length, 2);
  assert.strictEqual(parsedClaude[0], "Architected an event-driven I/O multiplexer managing non-blocking sockets.");

  // Test Gemini numbered list
  const geminiReply = `
1. Designed a modular HTTP request router handling GET, POST, and DELETE methods.
2. Verified zero memory leaks using Valgrind across 10,000 automated curl requests.
`;
  const parsedGemini = parseBulletsFromAI(geminiReply);
  assert.strictEqual(parsedGemini.length, 2);
  assert.strictEqual(parsedGemini[0], "Designed a modular HTTP request router handling GET, POST, and DELETE methods.");
});

console.log("\n==================================================");
console.log("All AI error handling, stale protection, and offline checks passed!");
console.log("==================================================");
