# PrintCV — Help Me Write v2 Architectural Specification & Implementation Plan

> **Document Version:** 2.1.0 (Post-Review Corrections)  
> **Target Branch:** `enforce_template_format`  
> **Status:** Final Revised Planning Specification — Awaiting User Approval to Begin Phase 2A  
> **Authors:** Coordinated Sub-Agent Architecture Council  
> - Lead Architect (Systems Integration & Repository Audit)  
> - AI & Groq Specialist (Model Benchmarking, Rate Limits & Structured Outputs)  
> - Backend & Security Specialist (Deployment Compatibility, Safe IP Resolution & Secret Hygiene)  
> - Frontend & UX Specialist (Adaptive Section-Aware README, Dynamic Questions & Review Studio)  
> - 42 Curriculum Specialist (Subject Invariants, Core Taxonomy & Honest Question Design)  
> - Independent Reviewer / QA (Reality Audit, Rule Preservation & Threat Modeling)  

---

## Executive Summary

**Help Me Write v2** is an architectural upgrade to PrintCV’s bullet generation workflow, designed to empower 42 Network students and alumni to articulate verified software engineering achievements without hallucinating skills, inventing metrics, or compromising browser performance.

Following an exhaustive architectural review and repository audit, this revised specification incorporates critical corrections across model selection, deployment compatibility, writing rules, README ingestion, and security:

1. **Modern Groq Model Selection (`openai/gpt-oss-120b` & `openai/gpt-oss-20b`):** Replaces deprecated LLaMA models with OpenAI's open-weight Mixture-of-Experts (MoE) reasoning models supported on Groq. Features strict JSON Schema structured outputs, prompt caching rate benefits, configurable model selection, and realistic latency expectations (no false "sub-second" claims).
2. **Section-Aware, Adaptive README Ingestion:** Eliminates arbitrary 1,500-character truncations. Uploaded READMEs remain 100% optional and strictly ephemeral in client memory. The parser analyzes Markdown section headers, extracting high-signal technical content (Features, Architecture, Implementation, Challenges, Testing) while filtering out badges, navigation links, contributor lists, and CLI installation boilerplate. An adaptive token budget provides transparent UI explanations of extracted vs. omitted content.
3. **Deployment-Compatible Backend Architecture:** Aligns with PrintCV's production deployment (Next.js serverless on Vercel at `printcv.me` paired with an auxiliary Cloudflare Worker OAuth relay). Uses deployment-agnostic Web standard route handlers, authenticates requests via signed 42 session cookies (`printcv_session`), resolves client IP safely (`cf-connecting-ip` $\rightarrow$ `x-real-ip`, rejecting untrusted `X-Forwarded-For`), enforces a 32 KB payload cap and 15-second timeout, and provides a pluggable rate limiter interface for distributed production.
4. **Preservation of Canonical Writing Rules (220-Character Limit):** Restores PrintCV’s canonical **220-character maximum** (`MAX_BULLET_LENGTH = 220` in `src/lib/line-checks.ts`), rejecting artificial 180-character constraints. Bans blind mid-sentence truncation in favor of actionable length pills and regeneration prompts.
5. **Truthful 42 Curriculum Strategy:** Corrects `ft_transcendence` by distinguishing universal subject requirements (SPA, real-time multiplayer Pong, chat, user accounts/2FA, Docker containerization) from student-confirmed frameworks (Django, NestJS, React, Fastify, WebSockets). Separates verified Common Core from optional Piscine and Outer Circle specializations without redistributing restricted subject materials.
6. **Honest Security & PII Disclosures:** Rejects misleading "zero PII" and "immune to injection" claims. Delimiter boxing and instruction sandwiching reduce risk, but output is treated as untrusted. Clear user disclosure is presented prior to Groq transmission.
7. **Repository Delineation & Phase 2A Checklist:** Accurately distinguishes existing verified functionality from exploratory prototypes and planned Phase 2A deliverables.

---

## Part 1: Phase 5 Formal Verification & Closure

Prior to advancing to Help Me Write v2 planning, a final source verification of `src/lib/date-parser.ts` was completed.

### 1.1 Source Code Regex Invariant
Lines 44–45 of `src/lib/date-parser.ts` were inspected directly:
```typescript
const separatorRegex =
  /\s*[–—]\s*|\s+-\s+|\s+to\s+|(?<=\b\d{4})-(?=(?:\d{4}|present|current)\b)/i;
```
- **Finding:** The source regex contains unescaped raw asterisks (`\s*`), matching zero or more whitespace characters around en-dashes (`–`) and em-dashes (`—`).
- **Discrepancy Cause:** The quantifier was never escaped as `\s\*` in source code; the notation was purely an escaped formatting typo in the markdown documentation report.

### 1.2 Automated Date Parsing Verification
`test/verify-date-parser.ts` was executed and passed all **19 / 19 boundary assertions (0 failed)**:
- ISO dates with en-dash (`2023-09 – 2024-05` $\rightarrow$ `2023-09`, `2024-05`)
- Full ISO dates with hyphen (`2023-09-01 - 2024-05-30` $\rightarrow$ `2023-09-01`, `2024-05-30`)
- Month-year with Present (`January 2023 – Present` $\rightarrow$ `January 2023`, `Present`, `isCurrent: true`)
- Tight en/em-dashes (`2022–2023`, `2022—2023` $\rightarrow$ `2022`, `2023`)
- Tight hyphens (`2022-2023` $\rightarrow$ `2022`, `2023`)
- Word range (`Sep 2022 to May 2024` $\rightarrow$ `Sep 2022`, `May 2024`)

**Conclusion:** `src/lib/date-parser.ts` is verified. **Phase 5 is formally closed.**

---

## Part 2: Repository Architecture & Planning-Only Reality Audit

To ensure complete transparency, this section clarifies what is currently implemented in the repository, what was explored in scratch prototypes, and what remains to be built in Phase 2A–2D.

### 2.1 What Is Currently Implemented & Verified in `enforce_template_format`
- **Phase 1: 42 Level Precision:** Strict numeric parsing, preservation of exact Intra levels (e.g. `11.45`, `3.5`, `5.01`), centralized formatting across preview, PDF print, and DOCX.
- **Phase 2: Granular Store Mutations:** Targeted project and bullet mutations in `cv-store.ts`, immutable state updates, draft persistence.
- **Phase 3: Inline Bullet Editing Proof of Concept:** Live preview bullet editing, keyboard navigation (Enter/Escape/Blur), live validation pills.
- **Phase 4: Full Live Preview Editing:** Universal `renderField` slot inversion across Contact, Education, Projects, Skills, and Coursework; strict AST server safety of `CVSheet.tsx` (0 hooks, 0 browser globals, 7 conditional onClicks).
- **Phase 5: Canvas Hardening & Empty Field Placeholders:** Interactive placeholders for missing fields, bullet deletion with undo toast, date range parser with tight dash support.
- **Baseline Test Suites:** 20 test files in `test/run-all.ts` passing **1,250 assertions (0 failed)**; `npm run typecheck` passing with **0 errors**.

### 2.2 What Was Prototyped During Council Exploration (Unmerged / Prototype Status)
During sub-agent investigation, exploratory prototypes were drafted to test algorithms and schemas:
- `src/lib/security/readme-sanitizer.ts`: Prototype file extension checker and control-character stripper.
- `src/lib/security/rate-limiter.ts`: Prototype in-memory token bucket.
- `src/lib/ai/bullet-parser.ts`: Prototype JSON / markdown list parser.
- `src/lib/ai/prompt-builder.ts`: Prototype XML delimiter assembler.
- `src/app/api/ai/generate-bullets/route.ts`: Exploratory Next.js route handler.
- `test/verify-help-me-write-security.ts`: Experimental 28-assertion test harness.

> [!IMPORTANT]
> **Status Clarification:** These files represent **exploratory prototype code only**. They contain known architectural deficiencies identified during review (e.g., in-memory rate limiting incompatible with serverless deployment, deprecated LLaMA model references, arbitrary 180-char truncation). They are **NOT** approved production code. Production implementation begins strictly in Phase 2A upon user authorization.

### 2.3 What Remains Planned for Future Implementation
- **Phase 2A:** Production server route handler, Groq client with `openai/gpt-oss` models and strict JSON Schema, deployment-compatible rate limiting and auth session verification, section-aware README parser, canonical 220-char validation.
- **Phase 2B:** Honest 42 Curriculum enhancements in `src/lib/project-guide.ts` (distinguishing requirements from choices, dynamic archetypes for personal projects).
- **Phase 2C:** Studio UI implementation (`ReadmeUploadZone`, `DynamicQuestionList`, `GenerationActionBar`, `BulletReviewStudio`).
- **Phase 2D:** End-to-end integration, CDP browser tests, DOCX/PDF export verification.

---

## Part 3: AI & Groq Strategy — `openai/gpt-oss-120b` & `openai/gpt-oss-20b`

### 3.1 Model Evaluation & Benchmarking
Groq deprecated the LLaMA 3.3 70B and LLaMA 3.1 8B models on its Free and Developer tiers on August 16, 2026. The new architectural standard leverages OpenAI’s open-weight Mixture-of-Experts (MoE) reasoning models hosted on Groq:

| Metric / Dimension | Primary Model: `openai/gpt-oss-120b` | Failover Model: `openai/gpt-oss-20b` |
| :--- | :--- | :--- |
| **Model ID** | `openai/gpt-oss-120b` | `openai/gpt-oss-20b` |
| **Total / Active Parameters** | ~117 Billion total / ~5.1 Billion active | ~21 Billion total / ~3.6 Billion active |
| **Context Window** | 131,072 tokens | 131,072 tokens |
| **Max Completion Tokens** | 65,536 tokens | 65,536 tokens |
| **Free Tier Rate Limits** | 30 RPM / 8,000 TPM / 1,000 RPD / 200,000 TPD | 30 RPM / 8,000 TPM / 1,000 RPD / 200,000 TPD |
| **Developer Tier Rate Limits**| 1,000 RPM / 250,000 TPM | 1,000 RPM / 250,000 TPM |
| **Prompt Caching Benefit** | Cached tokens do **NOT** count against TPM | Cached tokens do **NOT** count against TPM |
| **Structured Output Support** | Native `json_schema` strict mode (`additionalProperties: false`) | Native `json_schema` strict mode (`additionalProperties: false`) |
| **Instruction Adherence** | Exceptional negative constraint enforcement (0 pronouns, action verb start) | High constraint enforcement with lower compute overhead |
| **Architectural Role** | Default primary generator for all bullet requests | Automatic failover on 429 rate limit, 503 overload, or low-latency requests |

### 3.2 Realistic Latency Expectations
We do not promise "sub-second" generation. Actual generation latency depends on:
1. **Serverless Cold Starts:** 800ms–2,500ms on initial spin-up of the Next.js serverless function.
2. **MoE Reasoning Depth:** The `gpt-oss-120b` MoE architecture activates ~5.1B parameters per token. While Groq's LPU execution is fast (typically 300–500 tokens/sec), full network roundtrip, TLS handshakes, prompt processing, and token streaming typically yield **1.5s to 3.5s total turnaround**.
3. **Failover Execution:** If the primary model returns HTTP 429, failover to `gpt-oss-20b` adds another 800ms–1,500ms.
4. **UI Representation:** The frontend displays an active progress indicator with elapsed timing rather than a static spinner, setting realistic expectations.

### 3.3 Configurable Model Strategy
Model selection is completely decoupled from code:
```typescript
export const AI_CONFIG = {
  primaryModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  fallbackModel: process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b",
  temperature: 0.2, // Low temperature for deterministic, factual adherence
  maxCompletionTokens: 512, // Ample room for 2-4 bullets (each ~35-50 tokens)
  timeoutMs: 15_000,
};
```

### 3.4 Strict JSON Schema Structured Outputs
Where supported by Groq's API, the request specifies a strict JSON schema:
```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "cv_bullet_suggestions",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "bullets": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Array of 2 to 4 past-tense CV bullet points strictly adhering to Dr. Wissam formatting."
          }
        },
        "required": ["bullets"],
        "additionalProperties": false
      }
    }
  }
}
```
If the model returns raw markdown despite `json_schema`, a robust fallback parser (`src/lib/ai/bullet-parser.ts`) extracts bullets from JSON code blocks or dashed lists.

---

## Part 4: Section-Aware README Parsing & Adaptive Budgeting

### 4.1 Rejection of Unconditional Character Truncation
The previous plan's hard 1,500-character truncation (~350 words) frequently discarded the most critical engineering details, such as architecture diagrams, concurrency models, and testing suites, which often appear later in a project's README.

### 4.2 Intelligent Section-Aware Parser (`src/lib/readme-parser.ts`)
The client-side parser scans Markdown AST/headers and prioritizes content by engineering relevance:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   README SECTION-AWARE EXTRACTION                      │
├────────────────────────────────────────────────────────────────────────┤
│ PRIORITY 1: High-Signal Engineering (Always Preserved)                │
│ • ## Architecture, ## Core Mechanics, ## System Design                │
│ • ## Implementation Details, ## Concurrency / Networking               │
│ • ## Key Features, ## Algorithms, ## Memory Safety                    │
├────────────────────────────────────────────────────────────────────────┤
│ PRIORITY 2: Validation & Metrics (Included in Budget)                  │
│ • ## Benchmarks, ## Performance, ## Stress Testing                     │
│ • ## Challenges & Trade-offs, ## Edge Cases Tested                    │
├────────────────────────────────────────────────────────────────────────┤
│ EXCLUDED NOISE (Filtered Out Before Budgeting)                         │
│ • Badges: [![Build](...)], [![License](...)]                           │
│ • Navigation: [Back to top], Table of Contents anchors                 │
│ • Installation / Setup: git clone, npm install, make, apt-get, env     │
│ • Boilerplate: License text, Code of Conduct, Acknowledgments         │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Adaptive Token Budgeting
- **Client-Side Cap:** Uploaded files are capped at **512 KB** to prevent main-thread freeze.
- **Target Budget:** The parser aims for an adaptive budget of **1,000 to 2,000 tokens** (~4,000 to 8,000 characters) of filtered high-signal text.
- **Server-Side Cap:** The server route enforces an absolute payload body ceiling of **32 KB** and clamps README excerpts to a maximum of **10,000 characters** (~2,500 tokens).
- **UI Transparency Drawer:** When a README is attached, an interactive drawer informs the user:
  ```
  📄 README.md Attached
  Analyzed 1,120 words from: "## Architecture", "## Key Features", "## Testing".
  Omitted 580 words: Installation commands, badges, and license text.
  [View Extracted Excerpt] [Replace File] [Remove]
  ```

---

## Part 5: Deployment Compatibility, Security & Rate Limiting

### 5.1 Deployment Architecture Reality
PrintCV is deployed on **Vercel** (`printcv.me`) with an auxiliary **Cloudflare Worker** (`relay/cloudflare-worker.js`) used as an OAuth login relay because 42’s Intra API blocks requests originating from standard cloud IP pools.

```
┌─────────────────┐       ┌───────────────────────┐       ┌───────────────────────┐
│ Student Browser │ ────> │ Vercel Serverless App │ ────> │ Groq Cloud API        │
│ (React / Client)│       │ (Next.js /printcv.me) │       │ (LPU / MoE Models)    │
└─────────────────┘       └───────────┬───────────┘       └───────────────────────┘
                                      │ OAuth Only
                                      ▼
                          ┌───────────────────────┐
                          │ Cloudflare Relay      │ ────> 42 Intra API
                          │ (printcv-42-relay)    │
                          └───────────────────────┘
```

**Architectural Invariant:**
Next.js route handlers run across distributed, ephemeral serverless functions. An in-memory Node.js `Map` cannot guarantee rate limits across multiple concurrent serverless instances or across cold restarts.

### 5.2 Multi-Tier Rate Limiting & Abuse Prevention

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MULTI-TIER ABUSE PREVENTION                          │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 1: AUTHENTICATION CHECK & USER QUOTA                              │
│ • Reads signed 'printcv_session' HMAC cookie.                          │
│ • If valid 42 session: Rate limit by verified login (e.g. 'anassarr'). │
│ • Quota: 15 requests per 10 minutes per student.                       │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 2: SAFE IP EXTRACTION (SPOOF-PROOF)                               │
│ • Check 1: 'cf-connecting-ip' (Cloudflare edge verified)              │
│ • Check 2: 'x-real-ip' (Vercel edge verified)                          │
│ • Fallback: Rightmost untrusted 'x-forwarded-for' parsed safely.       │
│ • Rejects spoofed leftmost IP values injected by clients.              │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 3: PLUGGABLE RATE LIMITER STORE                                   │
│ • Local Dev: In-memory sliding window bucket.                          │
│ • Production: Strategy interface for Cloudflare KV / Upstash Redis.    │
├────────────────────────────────────────────────────────────────────────┤
│ TIER 4: GLOBAL PROTECTION & PAYLOAD CEILINGS                           │
│ • Request body capped at 32 KB (rejects with 413).                     │
│ • Server abort timeout at 15 seconds (maps to 504).                    │
│ • Daily circuit breaker stops requests if org reaches 900 RPD.         │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Secret Hygiene & Environment Variables
- `GROQ_API_KEY` is read strictly on the server: `process.env.GROQ_API_KEY`.
- Under no circumstances is the key exposed to client bundles (no `NEXT_PUBLIC_` prefix).
- The user's existing `.env.local` and environment secrets are never modified or rewritten.
- If `GROQ_API_KEY` is not present, the server responds with:
  ```json
  { "ok": false, "error": "AI generation service is not configured.", "fallbackToClipboard": true }
  ```
  The UI immediately opens the clean copy-paste prompt drawer without throwing an unhandled exception.

### 5.4 Honest Security & PII Disclosures
- **Prompt Injection Reality:** Delimiter boxing (`<project_readme>...</project_readme>`), tag escaping, and instruction sandwiching mitigate direct prompt manipulation, but **cannot guarantee 100% immunity** against sophisticated adversarial jailbreaks. The architecture treats all LLM output as untrusted and requires explicit student review before inserting into the CV.
- **PII Transmission Disclosure:** Regex filtering removes obvious contact fields (emails, phone numbers), but cannot guarantee zero PII transmission if personal names or credentials exist inside custom README text.
- **Mandatory User Consent:** Before the first AI request, the UI displays a clear notice:
  > *"When you click 'Generate with AI', your project answers and extracted README sections are sent to Groq for processing under their data privacy policy. PrintCV does not send your contact details, and no data is saved to a remote database. You can always use the offline 'Copy Prompt' option instead."*

---

## Part 6: Preservation of PrintCV Canonical Writing Rules

### 6.1 Audit of Canonical Limits: 220 Characters
Inspection of `src/lib/line-checks.ts` establishes the authoritative canonical rule:
```typescript
export const MAX_BULLET_LENGTH = 220;
```
The previous plan arbitrarily assumed a 180-character limit. That assumption is **rejected**. Help Me Write v2 preserves `MAX_BULLET_LENGTH = 220`.

### 6.2 Elimination of Mid-Sentence Truncation
Blindly chopping a generated bullet at a character boundary (e.g. `bullet.slice(0, 220)`) produces broken, incomplete sentences that degrade CV quality.
- **Rule:** If the LLM generates a bullet exceeding 220 characters, the server does **not** slice the string.
- **UI Treatment:** The candidate card renders the full sentence with an amber warning pill: `[234 / 220 chars - Too long]`, along with an inline button: `[Shorten with AI]` or direct textarea editing.

### 6.3 Reuse of Real Validators
All candidate bullets are evaluated against the canonical functions in `src/lib/line-checks.ts`:
- `startsWithActionVerb(line)`: Verifies recognized past-tense irregular verbs or regular `-ed` verbs.
- `startsWithWeakWord(line)`: Detects weak openings (*"worked"*, *"helped"*, *"assisted"*, *"responsible"*).
- `hasPronoun(line)`: Detects personal pronouns (*"I"*, *"my"*, *"we"*, *"our"*).
- `hasNumber(line)`: Identifies quantified metrics.
- `removeEmDashes(line)`: Automatically converts em-dashes and en-dashes to commas or colons.

---

## Part 7: Truthful 42 Curriculum Strategy

### 7.1 Separation of Universal Requirements vs. Implementation Choices
In projects like `ft_transcendence`, the 42 subject mandates core features but leaves technology stacks to student choice. Hardcoding specific libraries as universal creates inaccurate prompts.

| Project | Universal Subject Invariants | Variable Implementation Choices (Must Ask Student) |
| :--- | :--- | :--- |
| **`ft_transcendence`** | Single-page application; live multiplayer Pong tournament; user management & profile stats; 2-Factor Authentication (2FA); real-time chat with channel/blocking; Docker containerization. | Backend framework (Django vs NestJS vs Fastify vs Go); frontend library (React vs Vue vs Vanilla TypeScript); real-time protocol (WebSockets vs Socket.IO); database (PostgreSQL vs SQLite). |
| **`minishell`** | Command execution with PATH; pipe redirection chains; environment variable expansion (`$`); signal handling (`Ctrl-C`, `Ctrl-\`, `Ctrl-D`); quote handling (`'`, `"`); built-ins (`cd`, `echo`, `pwd`, `export`, `unset`, `env`, `exit`). | Parser architecture (AST vs command table); tokenizer state machine; process tree coordination; readline integration. |
| **`philosophers`** | Dining philosophers synchronization; race condition elimination; deadlock avoidance; microsecond timing precision; thread/process lifecycle. | Mutex acquisition strategy (odd/even ordering vs resource hierarchy); bonus process semaphores (`sem_open`). |
| **`cub3d`** | First-person 3D raycasting maze (inspired by Wolfenstein 3D); map validation; wall texture mapping; player collision; event hooks. | Raycasting algorithm (DDA vs trigonometric); bonus features (doors, animated sprites, minimap, mouse rotation). |
| **`webserv`** | Non-blocking I/O event loop; HTTP/1.1 RFC 7230 compliance (GET, POST, DELETE); CGI script execution; configuration file parser; client upload streaming. | Socket multiplexer (`poll` vs `epoll` vs `kqueue` vs `select`); chunked transfer decoding; stress testing benchmarks (Siege). |

### 7.2 Core vs. Outer Circle Taxonomy
The project guides are strictly organized into two distinct groups:
1. **Universal Common Core Guides:** The foundational 20 projects of the 42 Common Core (from `libft` to `ft_transcendence`).
2. **Specialization & Outer Circle Guides (Optional):** Clearly marked as post-Core or Piscine specializations (e.g. `snow-crash`, `rainfall`, `nm-otool`, `ft_linear_regression`, `scop`, `c-piscine`).

### 7.3 Honest Question Formulation
Questions are designed to probe the student's **actual engineering contributions**, not to fabricate achievements:
- *"Which part of the pipeline did you personally implement?"*
- *"What was the hardest bug or race condition you debugged, and how did you resolve it?"*
- *"Any verified performance numbers you are certain about? (Leave blank if none)"*

---

## Part 8: Preserved User Experience & Workflow

The user experience retains the proven elements of v1 while seamlessly incorporating v2 capabilities:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Help Me Write v2 Modal                          │
├────────────────────────────────────────────────────────────────────────┤
│ Target: Selected Projects > Minishell                                  │
│                                                                        │
│ 📂 Optional: Attach Project README (.md, .txt)                         │
│   [ Drag & drop README here, or browse ] ──> [ Attached: 840 words ]   │
│   ℹ️ Analyzed: ## Architecture, ## Features. Omitted: CLI install.      │
│                                                                        │
│ ❓ Interview Questions (Customizable & Optional)                       │
│   • Q1: What did you build yourself?                                   │
│     [ I wrote the command parser, AST, and signal handling         ]  │
│     [▲] [▼] [✏️ Edit Question] [🗑️ Delete]                             │
│   • Q2: What was the hardest challenge?                                │
│     [ Race conditions in signals and heredoc file descriptors      ]  │
│   [ + Add custom question ]                                            │
│                                                                        │
│ ⚡ Action Controls                                                     │
│   [ ✨ Generate with AI ]              [ 📋 Copy Offline Prompt ]      │
│   🔒 Privacy: Technical facts sent to Groq. Contact details excluded. │
├────────────────────────────────────────────────────────────────────────┤
│ Candidate Review Studio (Appears after Generation or Offline Paste)   │
│                                                                        │
│ ☑ Candidate 1                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Built a POSIX-compliant shell in C featuring an AST parser,        │ │
│ │ pipeline redirections, and custom signal handlers with zero leaks. │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ [✓ Strong start]  [✓ Has a number]                   138 / 220 chars   │
│                                                                        │
│ ☑ Candidate 2                                                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Implemented input tokenization and built-in commands (cd, echo),   │ │
│ │ passing 140 Bash compatibility test suites without memory leaks.   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ [✓ Strong start]  [✓ Has a number]                   136 / 220 chars   │
│                                                                        │
│ [ Replace Existing Bullets ]         [ Add Below Mine ]                │
└────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Offline Copy Prompt Purity
When the student chooses `"Copy Offline Prompt"`, the prompt builder:
1. Includes **only** non-empty, answered questions.
2. Formats the extracted technical README excerpt under `<project_readme>`.
3. Injects canonical Dr. Wissam constraints (past-tense action verbs, $\le 220$ characters, no pronouns, no em-dashes).
4. Excludes all unanswered questions and empty boilerplate.
5. Copies cleanly to the clipboard with 1-click links to ChatGPT, Claude, and Gemini.

---

## Part 9: Sub-Agent Council Findings & Consensus

All six sub-agents reached unanimous consensus on the corrected architecture:

```
┌─────────────────────────┬─────────────────────────────────────────────────────────────┐
│ Sub-Agent Role          │ Consensus Architectural Contribution                        │
├─────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 1. Lead Architect       │ Reconciled deployment topology (Vercel serverless + CF      │
│                         │ relay); restored canonical 220-char limit; established      │
│                         │ prototype vs planned boundary.                              │
│ 2. AI/Groq Specialist   │ Benchmarked 'openai/gpt-oss-120b' & '20b'; verified 8K TPM   │
│                         │ free limits & prompt caching; specified JSON Schema;        │
│                         │ realistic 1.5s-3.5s latency expectations.                   │
│ 3. Backend & Security   │ Multi-tier rate limiting with session auth & safe IP order; │
│                         │ 32KB payload cap; honest prompt injection threat modeling;  │
│                         │ explicit Groq transmission privacy disclosure.              │
│ 4. Frontend & UX        │ Section-aware README parser prioritizing tech sections;     │
│                         │ adaptive token budgeting with UI transparency drawer;       │
│                         │ no blind truncation; candidate inline editing studio.       │
│ 5. 42 Curriculum        │ Invariant vs choice separation for ft_transcendence;        │
│                         │ Common Core vs Outer Circle taxonomy; honest questions.     │
│ 6. Independent Reviewer │ Preserved Red Lines: 0 localStorage bloat, 0 lock-in,      │
│                         │ mandatory human review gate, canonical line check parity.   │
└─────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## Part 10: Phase 2A Implementation Checklist & Acceptance Criteria

Implementation will begin **only after user sign-off**. The following checklist defines the scope and acceptance criteria for Phase 2A:

### 10.1 Phase 2A Implementation Tasks

- [ ] **Task 2A.1: Section-Aware README Parser (`src/lib/readme-parser.ts`)**
  - Implement client-side parser scanning Markdown headers (`## Features`, `## Architecture`, `## Implementation`, `## Testing`, `## Challenges`).
  - Strip badges, navigation anchors, license text, and installation boilerplate.
  - Implement adaptive budgeting (800–1,500 tokens) with word count metrics.
- [ ] **Task 2A.2: Deployment-Compatible Rate Limiter (`src/lib/security/rate-limiter.ts`)**
  - Implement `RateLimiterStore` interface supporting in-memory sliding window for development and pluggable KV/Redis store for distributed production.
  - Implement safe IP resolution checking `cf-connecting-ip`, then `x-real-ip`, rejecting untrusted `X-Forwarded-For`.
  - Implement session-authenticated rate limiting using `readSessionToken()` from `src/lib/auth-session.ts` (15 requests / 10 minutes per authenticated student).
- [ ] **Task 2A.3: Native Groq Client (`src/lib/server/groq-client.ts`)**
  - Implement native `fetch()` client connecting to `https://api.groq.com/openai/v1/chat/completions`.
  - Configure primary `openai/gpt-oss-120b` and failover `openai/gpt-oss-20b` via `GROQ_MODEL` and `GROQ_FALLBACK_MODEL`.
  - Enforce strict JSON Schema structured output: `{"bullets": ["..."]}`.
  - Implement 15-second timeout via `AbortSignal.timeout(15000)`.
- [ ] **Task 2A.4: Server Route Handler (`src/app/api/ai/generate-bullets/route.ts`)**
  - Web standard Next.js route handler (`export const dynamic = "force-dynamic"`).
  - Enforce 32 KB request body cap (returns HTTP 413).
  - Enforce multi-tier rate limiting (returns HTTP 429 with `Retry-After`).
  - Check `process.env.GROQ_API_KEY`. If undefined, return `{ fallbackToClipboard: true }`.
  - Assemble zero-PII prompt with XML delimiter boxing (`<project_readme>`).
  - Validate output bullets against `src/lib/line-checks.ts` (canonical 220 chars, strong action verbs, no pronouns, em-dashes cleaned).
- [ ] **Task 2A.5: Automated Security & QA Test Suite (`test/verify-help-me-write-security.ts`)**
  - Unit tests verifying section-aware README extraction and badge filtering.
  - Unit tests verifying safe IP resolution and session-authenticated rate limiting.
  - Route handler mock tests covering 200 OK, 413 Payload Too Large, 422 Unprocessable Entity, 429 Rate Limit, 502 Bad Gateway, and 504 Gateway Timeout.
  - Verification that bullets exceeding 220 chars are flagged, not truncated mid-sentence.
- [ ] **Task 2A.6: Regression Suite Parity**
  - Verify that `npx tsx test/run-all.ts` passes all suites with zero regressions.
  - Verify that `npm run typecheck` (`tsc --noEmit`) passes with zero errors.

### 10.2 Phase 2A Acceptance Criteria
1. **Model Accuracy:** Route handler successfully sends requests formatted for `openai/gpt-oss-120b` with structured output JSON schema.
2. **Budgeting Transparency:** README text over budget is filtered by section relevance, not sliced mid-sentence.
3. **Deployment Safety:** Route handler relies exclusively on Web standards compatible with Vercel and Cloudflare; client IP is never extracted from untrusted client-supplied headers alone.
4. **Writing Rule Parity:** Bullets adhere to canonical `MAX_BULLET_LENGTH = 220` from `src/lib/line-checks.ts`.
5. **Zero LocalStorage Bloat:** No README text or raw AI responses enter `cv-store.ts` or `localStorage`.
6. **Graceful Degradation:** If `GROQ_API_KEY` is omitted or invalid, the route returns `{ fallbackToClipboard: true }` and the app functions 100% via offline prompt copy.
7. **Test Cleanliness:** All automated assertions pass cleanly; zero regression in Phase 1–5 features.

---

> [!NOTE]
> **Awaiting User Authorization:** In accordance with prompt restrictions, no application implementation code has been written for Phase 2A. Work has halted. Implementation will proceed upon your explicit approval.
