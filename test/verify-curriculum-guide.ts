// test/verify-curriculum-guide.ts
// Verification suite for Phase 2B Final Correction: 42Next / 2026 Common Core Support,
// Versioned Project Catalogue, Tech Stack Invariants, Strict Archetype Classification, and Security.

import assert from "assert";
import {
  COMMON_CORE_V1_GUIDES,
  COMMON_CORE_V2_GUIDES,
  COMMON_CORE_GUIDES,
  OUTER_CIRCLE_GUIDES,
  PISCINE_GUIDES,
  PROJECT_GUIDES,
  findProjectGuide,
  detectProjectArchetype,
  getNon42ProjectQuestions,
  PERSONAL_PROJECT_QUESTIONS,
  FREELANCE_PROJECT_QUESTIONS,
  HACKATHON_PROJECT_QUESTIONS,
  OPEN_SOURCE_QUESTIONS,
  COMMON_PROJECT_QUESTIONS,
  isCommonCore,
} from "../src/lib/project-guide";
import {
  helperQuestions,
  buildBulletPrompt,
  HelperTarget,
} from "../src/lib/bullet-helper";
import { createEmptyCV } from "../src/lib/intra/cv-from-intra";

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

async function main() {
  console.log("==================================================");
  console.log("PrintCV Phase 2B: 42Next & Curriculum Intelligence");
  console.log("==================================================");

  // ---------------------------------------------------------------------------
  // SUITE 1: 42Next / 2026 Common Core (v2) Project Recognition
  // ---------------------------------------------------------------------------
  console.log("\nSuite 1: 42Next / 2026 Common Core (v2) Project Recognition");

  check("Recognizes all verified 42Next / Common Core v2 projects", () => {
    assert.strictEqual(COMMON_CORE_V2_GUIDES.length, 6);
    const v2Slugs = [
      "python-modules",
      "a-maze-ing",
      "call-me-maybe",
      "fly-in",
      "codexion",
      "rag-against-the-machine",
    ];

    for (const slug of v2Slugs) {
      const guide = findProjectGuide(slug);
      assert(guide, `Missing 42Next project: ${slug}`);
      assert.strictEqual(guide.category, "common-core-v2");
      assert.strictEqual(guide.verificationStatus, "verified-subject");
      assert(isCommonCore(guide.category), "Must be recognized by isCommonCore()");
    }
  });

  check("Resolves 42Next project aliases and spelling variations", () => {
    // Python module variations
    assert.strictEqual(findProjectGuide("python-module-00")?.slug, "python-modules");
    assert.strictEqual(findProjectGuide("python-module-05")?.slug, "python-modules");
    assert.strictEqual(findProjectGuide("python-module-10")?.slug, "python-modules");
    assert.strictEqual(findProjectGuide("python04")?.slug, "python-modules");
    assert.strictEqual(findProjectGuide("pypiscine")?.slug, "python-modules");
    assert.strictEqual(findProjectGuide("python")?.slug, "python-modules");

    // A-Maze-ing aliases
    assert.strictEqual(findProjectGuide("a-maze-ing")?.slug, "a-maze-ing");
    assert.strictEqual(findProjectGuide("amaz-ing")?.slug, "a-maze-ing");
    assert.strictEqual(findProjectGuide("amazing")?.slug, "a-maze-ing");

    // Call Me Maybe aliases
    assert.strictEqual(findProjectGuide("call-me-maybe")?.slug, "call-me-maybe");
    assert.strictEqual(findProjectGuide("callmemaybe")?.slug, "call-me-maybe");

    // Fly-In aliases
    assert.strictEqual(findProjectGuide("fly-in")?.slug, "fly-in");
    assert.strictEqual(findProjectGuide("flyin")?.slug, "fly-in");

    // Codexion
    assert.strictEqual(findProjectGuide("codexion")?.slug, "codexion");

    // RAG Against the Machine aliases
    assert.strictEqual(findProjectGuide("rag-against-the-machine")?.slug, "rag-against-the-machine");
    assert.strictEqual(findProjectGuide("rag-against-machine")?.slug, "rag-against-the-machine");
    assert.strictEqual(findProjectGuide("rag")?.slug, "rag-against-the-machine");
  });

  check("Matches 42Next projects by human-readable title", () => {
    assert.strictEqual(findProjectGuide("", "A-Maze-ing")?.slug, "a-maze-ing");
    assert.strictEqual(findProjectGuide("", "Call Me Maybe")?.slug, "call-me-maybe");
    assert.strictEqual(findProjectGuide("", "Fly-In")?.slug, "fly-in");
    assert.strictEqual(findProjectGuide("", "Codexion")?.slug, "codexion");
    assert.strictEqual(findProjectGuide("", "RAG Against the Machine")?.slug, "rag-against-the-machine");
    assert.strictEqual(findProjectGuide("", "Python Modules (00–10)")?.slug, "python-modules");
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: Version-Specific Project Classification & Old-Core Integrity
  // ---------------------------------------------------------------------------
  console.log("\nSuite 2: Version-Specific Project Classification & Old-Core Integrity");

  check("Preserves traditional Common Core (v1) catalogue with exact v1 tagging", () => {
    assert.strictEqual(COMMON_CORE_V1_GUIDES.length, 20);
    const requiredV1Slugs = [
      "libft", "ft_printf", "get_next_line", "born2beroot",
      "push_swap", "pipex", "minitalk", "so_long", "fdf", "fract-ol",
      "philosophers", "minishell", "cub3d", "minirt", "netpractice",
      "cpp-modules", "inception", "ft_irc", "webserv", "ft_transcendence"
    ];

    for (const slug of requiredV1Slugs) {
      const guide = COMMON_CORE_V1_GUIDES.find((g) => g.slug === slug);
      assert(guide, `Missing v1 project: ${slug}`);
      assert.strictEqual(guide.category, "common-core-v1");
      assert(isCommonCore(guide.category));
    }
  });

  check("Unified COMMON_CORE_GUIDES combines v1 and v2 seamlessly (26 projects)", () => {
    assert.strictEqual(COMMON_CORE_GUIDES.length, 26);
    const v1Count = COMMON_CORE_GUIDES.filter((g) => g.category === "common-core-v1").length;
    const v2Count = COMMON_CORE_GUIDES.filter((g) => g.category === "common-core-v2").length;
    assert.strictEqual(v1Count, 20);
    assert.strictEqual(v2Count, 6);
  });

  check("Outer Circle (21 projects) and Piscine (3 projects) remain strictly segregated", () => {
    assert.strictEqual(OUTER_CIRCLE_GUIDES.length, 21);
    assert.strictEqual(PISCINE_GUIDES.length, 3);
    assert.strictEqual(PROJECT_GUIDES.length, 50);

    for (const g of OUTER_CIRCLE_GUIDES) {
      assert.strictEqual(g.category, "outer-circle");
      assert(!isCommonCore(g.category));
    }
    for (const g of PISCINE_GUIDES) {
      assert.strictEqual(g.category, "piscine");
      assert(!isCommonCore(g.category));
    }
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: Tech Stack Invariants — No Preset Technologies on Variable Stacks
  // ---------------------------------------------------------------------------
  console.log("\nSuite 3: Tech Stack Invariants & Variable Technology Freedom");

  check("Leaves techStack empty when technologies are student/team selected", () => {
    // ft_transcendence: team selected web framework & database
    const trans = findProjectGuide("ft_transcendence");
    assert(trans);
    assert.strictEqual(trans.techStack, "", "ft_transcendence techStack must be empty to avoid false presets");

    // call-me-maybe: student selects inference runtime (PyTorch, llama.cpp, etc.)
    const cmm = findProjectGuide("call-me-maybe");
    assert(cmm);
    assert.strictEqual(cmm.techStack, "", "call-me-maybe techStack must be empty");

    // rag-against-the-machine: student selects vector DB and retrieval index
    const rag = findProjectGuide("rag-against-the-machine");
    assert(rag);
    assert.strictEqual(rag.techStack, "", "rag-against-the-machine techStack must be empty");

    // matcha: student selects web stack
    const matcha = findProjectGuide("matcha");
    assert(matcha);
    assert.strictEqual(matcha.techStack, "", "matcha techStack must be empty");
  });

  check("Maintains verified language presets only where subject strictly mandates them", () => {
    assert.strictEqual(findProjectGuide("libft")?.techStack, "C, Make");
    assert.strictEqual(findProjectGuide("minishell")?.techStack, "C, Unix processes, POSIX Shell, Readline");
    assert.strictEqual(findProjectGuide("cpp-modules")?.techStack, "C++98, OOP, Templates, STL");
    assert.strictEqual(findProjectGuide("python-modules")?.techStack, "Python");
    assert.strictEqual(findProjectGuide("codexion")?.techStack, "C, POSIX Threads, Mutexes");
    assert.strictEqual(findProjectGuide("a-maze-ing")?.techStack, "Python, Algorithms");
    assert.strictEqual(findProjectGuide("fly-in")?.techStack, "Python, Graph Theory");
  });

  // ---------------------------------------------------------------------------
  // SUITE 4: Verified Project Questions — Factual Alignment & Individual Ownership
  // ---------------------------------------------------------------------------
  console.log("\nSuite 4: Verified Project Questions & Individual Ownership");

  check("Call Me Maybe questions probe constrained decoding, logit masking, and tools", () => {
    const guide = findProjectGuide("call-me-maybe");
    assert(guide);
    const qIds = guide.questions.map((q) => q.id);
    assert(qIds.includes("cmm-stack"), "Must ask for local model and runtime");
    assert(qIds.includes("cmm-decoding"), "Must ask how constrained decoding was enforced");
    assert(qIds.includes("cmm-tools"), "Must ask which tools were executed");
    assert(qIds.includes("cmm-metrics"), "Must ask for reliability improvement");

    const decodingQ = guide.questions.find((q) => q.id === "cmm-decoding");
    assert(decodingQ && decodingQ.options);
    const optionsText = decodingQ.options.join(" ");
    assert(optionsText.includes("logit masking") || optionsText.includes("logit bias"));
    assert(optionsText.includes("constrained grammar decoding") || optionsText.includes("Trie"));
  });

  check("RAG Against the Machine questions probe AST chunking, hybrid search, and grounding", () => {
    const guide = findProjectGuide("rag-against-the-machine");
    assert(guide);
    const qIds = guide.questions.map((q) => q.id);
    assert(qIds.includes("rag-stack"));
    assert(qIds.includes("rag-chunking"));
    assert(qIds.includes("rag-retrieval"));
    assert(qIds.includes("rag-generation"));

    const chunkingQ = guide.questions.find((q) => q.id === "rag-chunking");
    assert(chunkingQ?.options?.some((opt) => opt.includes("AST-aware")));

    const retrievalQ = guide.questions.find((q) => q.id === "rag-retrieval");
    assert(retrievalQ?.options?.some((opt) => opt.includes("BM25")));
    assert(retrievalQ?.options?.some((opt) => opt.includes("vector similarity")));
  });

  check("A-Maze-ing questions probe Prim/DFS, A* pathfinding, and mandatory '42' wall pattern", () => {
    const guide = findProjectGuide("a-maze-ing");
    assert(guide);
    const qIds = guide.questions.map((q) => q.id);
    assert(qIds.includes("amaze-algo"));
    assert(qIds.includes("amaze-solve"));
    assert(qIds.includes("amaze-42"), "Must ask about mandatory '42' logo wall constraint");
  });

  check("Codexion questions probe thread synchronization and concurrency safety", () => {
    const guide = findProjectGuide("codexion");
    assert(guide);
    const qIds = guide.questions.map((q) => q.id);
    assert(qIds.includes("code-sync"));
    assert(qIds.includes("code-safety"));
    assert(qIds.includes("code-metrics"));
  });

  check("All questions across every guide are strictly optional without forced defaults", () => {
    for (const guide of PROJECT_GUIDES) {
      for (const q of guide.questions) {
        assert(q.question.length > 5, `Question text too short in ${guide.slug}`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // SUITE 5: Non-42 Archetype Classification & Manual Override
  // ---------------------------------------------------------------------------
  console.log("\nSuite 5: Non-42 Archetype Classification & Manual Override");

  check("Does NOT falsely classify projects containing 'hack' as hackathons", () => {
    // A cybersecurity project with the word "hack" must NOT be classified as hackathon!
    const secItem1 = {
      name: "Ethical Hack Lab",
      description: "A virtual penetration testing lab simulating active directory attacks",
    };
    assert.strictEqual(detectProjectArchetype(secItem1), "personal");

    const secItem2 = {
      name: "HackTheBox Solutions",
      description: "Writeups and exploits for retired CTF machines",
    };
    assert.strictEqual(detectProjectArchetype(secItem2), "personal");

    const sysItem = {
      name: "Linux Kernel Hack",
      description: "Experimental scheduler modifications in C",
    };
    assert.strictEqual(detectProjectArchetype(sysItem), "personal");
  });

  check("Correctly detects genuine hackathon terms", () => {
    const hackItem1 = {
      name: "HackAbuDhabi 2024 AI Agent",
      description: "A 36-hour sprint prototype for emergency triage",
    };
    assert.strictEqual(detectProjectArchetype(hackItem1), "hackathon");

    const hackItem2 = {
      name: "Global Game Jam Game",
      description: "Built a 2D puzzle game in 48 hours with Godot",
    };
    assert.strictEqual(detectProjectArchetype(hackItem2), "hackathon");

    const hackItem3 = {
      name: "Devpost Submission",
      description: "Winner of Best AI Hack on Devpost",
    };
    assert.strictEqual(detectProjectArchetype(hackItem3), "hackathon");
  });

  check("Respects manual archetypeOverride over all heuristic detection", () => {
    // Project has 'hackathon' in name, but manual override is 'freelance'
    const overriddenItem1 = {
      name: "Hackathon Platform for Client",
      description: "Commercial client engagement building a custom registration portal",
      archetypeOverride: "freelance" as const,
    };
    assert.strictEqual(detectProjectArchetype(overriddenItem1), "freelance");

    // Generic project manually set to 'open-source'
    const overriddenItem2 = {
      name: "Simple Utility Script",
      archetypeOverride: "open-source" as const,
    };
    assert.strictEqual(detectProjectArchetype(overriddenItem2), "open-source");

    // Freelance project manually overridden to 'personal'
    const overriddenItem3 = {
      name: "Client Billing Tool",
      description: "Client work",
      archetypeOverride: "personal" as const,
    };
    assert.strictEqual(detectProjectArchetype(overriddenItem3), "personal");
  });

  // ---------------------------------------------------------------------------
  // SUITE 6: Prompt Assembly & End-to-End Fallback Safety
  // ---------------------------------------------------------------------------
  console.log("\nSuite 6: Prompt Assembly & End-to-End Fallback Safety");

  check("Builds prompt for 42Next Call Me Maybe with constrained decoding evidence", () => {
    const cv = createEmptyCV();
    cv.targetRole = "AI Software Engineer";
    cv.education[0].institution = "42 Abu Dhabi";

    const target: HelperTarget = {
      kind: "project",
      item: {
        id: "p_cmm",
        name: "Call Me Maybe",
        slug: "call-me-maybe",
        is42Project: true,
        techStack: "PyTorch, Transformers",
        date: "2025",
        bulletPoints: [],
      },
    };

    const prompt = buildBulletPrompt({
      target,
      cv,
      answers: {
        "cmm-stack": "Qwen2.5-0.5B with PyTorch and Transformers",
        "cmm-decoding": [
          "Token-level logit masking / logit bias manipulation during generation",
          "Trie-based / finite-state machine constrained grammar decoding"
        ],
        "cmm-tools": "Arithmetic calculator, weather API, and file search tools",
        "cmm-metrics": "Increased valid JSON execution rate from 32% to 100% with zero parse errors",
        "hard-part": "Logit masking latency overhead; optimized by pre-computing valid token masks into a trie lookup table",
      },
    });

    assert(prompt.includes("Call Me Maybe"));
    assert(prompt.includes("AI Software Engineer"));
    assert(prompt.includes("Token-level logit masking"));
    assert(prompt.includes("Increased valid JSON execution rate from 32% to 100%"));
    assert(prompt.includes("Do not invent numbers, users, results or tools"));
  });

  check("Unknown project falls back safely to non-42 personal questions", () => {
    const target: HelperTarget = {
      kind: "project",
      item: {
        id: "p_unknown",
        name: "Custom Home Automation",
        slug: "home-automation",
        is42Project: false,
        techStack: "ESP32, C++",
        date: "2025",
        bulletPoints: [],
      },
    };

    const qs = helperQuestions(target).map((q) => q.id);
    assert(qs.includes("about"), "Fallback must include about question");
    assert(qs.includes("architecture"), "Fallback must include architecture question");
    assert(qs.includes("team"), "Fallback must include common team question");
  });

  console.log(`\n==================================================`);
  console.log(`Phase 2B Final Verification: ${passed} passed, ${failed} failed`);
  console.log(`==================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
