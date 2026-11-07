// test/verify-curriculum-audit-50.ts
// Rigorous verification suite for all 50 42 Curriculum Guides,
// Non-42 Archetypes, Question Optionality, and Modal Switching Lifecycle.

import assert from "assert";
import {
  PROJECT_GUIDES,
  COMMON_CORE_V1_GUIDES,
  COMMON_CORE_V2_GUIDES,
  OUTER_CIRCLE_GUIDES,
  PISCINE_GUIDES,
  findProjectGuide,
  detectProjectArchetype,
  getNon42ProjectQuestions,
  PERSONAL_PROJECT_QUESTIONS,
  FREELANCE_PROJECT_QUESTIONS,
  HACKATHON_PROJECT_QUESTIONS,
  OPEN_SOURCE_QUESTIONS,
  COMMON_PROJECT_QUESTIONS,
  isCommonCore,
  ProjectGuide,
} from "../src/lib/project-guide";
import {
  helperQuestions,
  buildBulletPrompt,
  hasEnoughAnswers,
  HelperTarget,
} from "../src/lib/bullet-helper";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";
import { ProjectItem } from "../src/types/resume";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: unknown) {
    console.error(`  ✗ ${name}:`, err instanceof Error ? err.message : String(err));
    failed++;
  }
}

async function runAudit() {
  console.log("==================================================");
  console.log("PrintCV 42 Curriculum Specialist Audit (50 Guides)");
  console.log("==================================================");

  // ---------------------------------------------------------------------------
  // 1. Audit All 50 Curriculum Guides Catalogue Structure
  // ---------------------------------------------------------------------------
  console.log("\n1. Catalogue Structure & Classification Integrity");

  check("Exact count: 50 registered 42 curriculum guides across all categories", () => {
    assert.strictEqual(COMMON_CORE_V1_GUIDES.length, 20, "Must have exactly 20 Common Core v1 guides");
    assert.strictEqual(COMMON_CORE_V2_GUIDES.length, 6, "Must have exactly 6 Common Core v2 guides");
    assert.strictEqual(OUTER_CIRCLE_GUIDES.length, 21, "Must have exactly 21 Outer Circle guides");
    assert.strictEqual(PISCINE_GUIDES.length, 3, "Must have exactly 3 Piscine guides");
    assert.strictEqual(PROJECT_GUIDES.length, 50, "PROJECT_GUIDES must contain exactly 50 guides in total");
  });

  check("Every guide has valid metadata, non-empty fields, and verified status", () => {
    const validCategories = new Set(["common-core-v1", "common-core-v2", "outer-circle", "piscine"]);
    const validStatuses = new Set(["verified-subject", "curriculum-catalog", "community-verified"]);
    const validTracks = new Set([
      "General",
      "Unix & Systems",
      "Graphics",
      "Algorithms",
      "Web & Mobile",
      "Cybersecurity",
      "AI & Data Science",
      "DevOps & Cloud",
    ]);

    const seenSlugs = new Set<string>();

    for (const guide of PROJECT_GUIDES) {
      assert(guide.slug && guide.slug.trim(), `Slug cannot be empty in guide: ${JSON.stringify(guide)}`);
      assert(!seenSlugs.has(guide.slug), `Duplicate slug detected: ${guide.slug}`);
      seenSlugs.add(guide.slug);

      assert(guide.name && guide.name.trim(), `Name cannot be empty in ${guide.slug}`);
      assert(guide.about && guide.about.trim().length >= 20, `About description too short in ${guide.slug}`);
      assert(validCategories.has(guide.category), `Invalid category ${guide.category} in ${guide.slug}`);
      assert(validTracks.has(guide.track), `Invalid track ${guide.track} in ${guide.slug}`);
      assert(validStatuses.has(guide.verificationStatus), `Invalid verificationStatus in ${guide.slug}`);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Audit Tech Stack Invariants & Variable Freedom
  // ---------------------------------------------------------------------------
  console.log("\n2. Tech Stack Invariants & Subject Mandates");

  check("Tech stack is non-empty where 42 subject mandates tools, and empty where free", () => {
    // Projects where 42 subjects strictly mandate tools:
    const mandated = [
      { slug: "libft", expectedSubstring: "C" },
      { slug: "ft_printf", expectedSubstring: "C" },
      { slug: "get_next_line", expectedSubstring: "C" },
      { slug: "push_swap", expectedSubstring: "C" },
      { slug: "pipex", expectedSubstring: "C" },
      { slug: "minishell", expectedSubstring: "C" },
      { slug: "philosophers", expectedSubstring: "C" },
      { slug: "cpp-modules", expectedSubstring: "C++" },
      { slug: "webserv", expectedSubstring: "C++" },
      { slug: "ft_irc", expectedSubstring: "C++" },
      { slug: "inception", expectedSubstring: "Docker" },
      { slug: "python-modules", expectedSubstring: "Python" },
    ];

    for (const m of mandated) {
      const g = findProjectGuide(m.slug);
      assert(g, `Missing guide for ${m.slug}`);
      assert(g.techStack.includes(m.expectedSubstring), `${m.slug} techStack must contain ${m.expectedSubstring}, got: "${g.techStack}"`);
    }

    // Projects where technology choices are open to student / team selection:
    const freeTech = ["ft_transcendence", "call-me-maybe", "rag-against-the-machine"];
    for (const slug of freeTech) {
      const g = findProjectGuide(slug);
      assert(g, `Missing guide for ${slug}`);
      assert.strictEqual(g.techStack, "", `${slug} techStack must be empty string to allow student customization`);
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Question Wording, Optionality & Quality
  // ---------------------------------------------------------------------------
  console.log("\n3. Question Wording, Quality & Strict Optionality");

  check("All questions across all 50 guides are strictly optional and have clear wording", () => {
    let totalQuestions = 0;
    const shortGuides: string[] = [];
    for (const guide of PROJECT_GUIDES) {
      if (guide.questions.length < 2) {
        shortGuides.push(`${guide.slug} (${guide.questions.length})`);
      }
      for (const q of guide.questions) {
        totalQuestions++;
        assert(q.id && q.id.trim(), `Question id empty in ${guide.slug}`);
        assert(q.question && q.question.trim(), `Question text empty in ${guide.slug}/${q.id}`);

        // Question wording should never contain mandatory or forced terms
        const lowerQ = q.question.toLowerCase();
        assert(!lowerQ.includes("required"), `Question ${q.id} in ${guide.slug} contains "required"`);
        assert(!lowerQ.includes("must answer"), `Question ${q.id} in ${guide.slug} contains "must answer"`);
        assert(!q.question.startsWith("*"), `Question ${q.id} in ${guide.slug} starts with asterisk`);

        if (q.type === "radio" || q.type === "checkbox") {
          assert(Array.isArray(q.options) && q.options.length >= 2, `Options missing or < 2 for ${q.id} in ${guide.slug}`);
          for (const opt of q.options) {
            assert(opt && opt.trim(), `Option in ${q.id} cannot be empty`);
          }
        } else if (q.type === "text") {
          assert(q.placeholder && q.placeholder.trim().length > 5, `Text question ${q.id} in ${guide.slug} lacks descriptive placeholder`);
        }
      }
    }
    assert.strictEqual(shortGuides.length, 0, `Guides with fewer than 2 questions: ${shortGuides.join(", ")}`);
    console.log(`    Total project-specific questions audited: ${totalQuestions}`);
  });

  check("Non-42 Archetype question sets exist and contain relevant questions", () => {
    assert(PERSONAL_PROJECT_QUESTIONS.length >= 2, "PERSONAL_PROJECT_QUESTIONS must have questions");
    assert(FREELANCE_PROJECT_QUESTIONS.length >= 2, "FREELANCE_PROJECT_QUESTIONS must have questions");
    assert(HACKATHON_PROJECT_QUESTIONS.length >= 2, "HACKATHON_PROJECT_QUESTIONS must have questions");
    assert(OPEN_SOURCE_QUESTIONS.length >= 2, "OPEN_SOURCE_QUESTIONS must have questions");
    assert(COMMON_PROJECT_QUESTIONS.length >= 3, "COMMON_PROJECT_QUESTIONS must have common questions");
  });

  check("Archetype detection correctly differentiates genuine vs false positive terms", () => {
    // False positives that must NOT trigger hackathon:
    assert.strictEqual(detectProjectArchetype({ name: "fullstack-ecommerce" }), "personal");
    assert.strictEqual(detectProjectArchetype({ name: "hacker-news-clone" }), "personal");
    assert.strictEqual(detectProjectArchetype({ name: "growth-hacker-dashboard" }), "personal");

    // True hackathon detections:
    assert.strictEqual(detectProjectArchetype({ name: "hackathon-ai-assistant" }), "hackathon");
    assert.strictEqual(detectProjectArchetype({ name: "global-gamejam-entry" }), "hackathon");
    assert.strictEqual(detectProjectArchetype({ name: "ethglobal-runner" }), "hackathon");

    // Freelance detections:
    assert.strictEqual(detectProjectArchetype({ name: "Freelance Booking System" }), "freelance");
    assert.strictEqual(detectProjectArchetype({ name: "Client Work Portal", description: "Built under contract" }), "freelance");
    assert.strictEqual(detectProjectArchetype({ name: "Consulting Project" }), "freelance");

    // Open source detections:
    assert.strictEqual(detectProjectArchetype({ name: "react-custom-hooks-lib", link: "github.com/react/hooks" }), "personal");
    assert.strictEqual(detectProjectArchetype({ name: "open-source-parser" }), "open-source");
    assert.strictEqual(detectProjectArchetype({ name: "My PR", role: "open source maintainer" }), "open-source");
  });

  // ---------------------------------------------------------------------------
  // 5. Question Loading & Modal Switching Lifecycle
  // ---------------------------------------------------------------------------
  console.log("\n5. Question Loading, Reopening & Project Switching Lifecycle");

  check("Question loading is fast and deterministic when switching between projects", () => {
    const projA: ProjectItem = {
      id: "proj-1",
      name: "minishell",
      slug: "minishell",
      techStack: "C",
      date: "2024",
      is42Project: true,
      bulletPoints: [],
    };

    const projB: ProjectItem = {
      id: "proj-2",
      name: "webserv",
      slug: "webserv",
      techStack: "C++",
      date: "2024",
      is42Project: true,
      bulletPoints: [],
    };

    const projC: ProjectItem = {
      id: "proj-3",
      name: "Portfolio Website",
      techStack: "Next.js, Tailwind",
      date: "2024",
      is42Project: false,
      bulletPoints: [],
    };

    const targetA: HelperTarget = { kind: "project", item: projA };
    const targetB: HelperTarget = { kind: "project", item: projB };
    const targetC: HelperTarget = { kind: "project", item: projC };

    // Questions for Minishell
    const qA = helperQuestions(targetA);
    assert(qA.some((q) => q.id === "ms-parts"), "Minishell questions must include ms-parts");

    // Questions for Webserv
    const qB = helperQuestions(targetB);
    assert(qB.some((q) => q.id === "ws-features"), "Webserv questions must include ws-features");
    assert(!qB.some((q) => q.id === "ms-parts"), "Webserv questions must NOT include Minishell questions");

    // Questions for Non-42 Personal Project
    const qC = helperQuestions(targetC);
    assert(qC.some((q) => q.id === "architecture"), "Personal project questions must include architecture");
    assert(!qC.some((q) => q.id === "ws-features"), "Personal project must NOT include Webserv questions");

    // Reopen Project A: questions must load reliably and identically
    const qA_reopen = helperQuestions(targetA);
    assert.strictEqual(qA_reopen.length, qA.length);
    assert.strictEqual(qA_reopen[0].id, qA[0].id);
  });

  check("Prompt assembly functions cleanly with 0, 1, or multiple answered questions", () => {
    const cv = createEmptyCV();
    const proj: ProjectItem = {
      id: "proj-test",
      name: "Push Swap",
      slug: "push_swap",
      techStack: "C, Algorithms",
      date: "2024",
      is42Project: true,
      bulletPoints: [],
    };
    const target: HelperTarget = { kind: "project", item: proj };

    // Zero answers: Prompt must still generate valid instructions without crashing
    const promptZero = buildBulletPrompt({ target, answers: {}, cv });
    assert(promptZero.includes("push_swap") || promptZero.includes("Push Swap"));
    assert(promptZero.includes("Write 2 to 4 bullets"));

    // 1 answer: Prompt incorporates the answer
    const promptOne = buildBulletPrompt({
      target,
      answers: { "ps-algorithm": "Turk algorithm (cheapest move cost calculation for each element)" },
      cv,
    });
    assert(promptOne.includes("Turk algorithm"));

    // Check hasEnoughAnswers optionality: doesn't block, only informs
    assert.strictEqual(hasEnoughAnswers(target, {}), false);
    assert.strictEqual(hasEnoughAnswers(target, { "ps-moves": "sorted 500 numbers in 5200 moves" }), true);
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n==================================================");
  console.log(`Specialist Audit Completed: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error("Fatal audit runner error:", err);
  process.exit(1);
});
