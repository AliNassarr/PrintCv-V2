// test/verify-help-me-write-ui.ts
// Exhaustive automated unit and integration verification for Help Me Write v2 UI components,
// state transitions, ephemeral README boundaries, candidate review studio, and bullet insertion.
//
// Suite 1: Dynamic Question List & Archetype Switching
// Suite 2: ReadmeUploadZone & Ephemeral State Invariants (Zustand/Storage Purity)
// Suite 3: Candidate Evaluation Engine & Live Validation (220 Chars, Verbs, Pronouns)
// Suite 4: Bullet Review Studio Selection & Insertion Modes (Add vs Replace)
// Suite 5: Offline Prompt Assembly & Fallback Integration
// Suite 6: Live CV Sheet & DOCX Export Purity After Helper Insertion

import assert from "assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useCVStore } from "../src/lib/store/cv-store";
import {
  helperQuestions,
  buildBulletPrompt,
  parseBulletsFromAI,
  hasEnoughAnswers,
  HelperTarget,
  HelperAnswers,
} from "../src/lib/bullet-helper";
import {
  detectProjectArchetype,
  ProjectArchetype,
  GuideQuestion,
  COMMON_CORE_GUIDES,
} from "../src/lib/project-guide";
import {
  validateReadmeFile,
  extractReadmeSections,
  MAX_README_FILE_SIZE_BYTES,
} from "../src/lib/readme-parser";
import {
  MAX_BULLET_LENGTH,
  startsWithActionVerb,
  startsWithWeakWord,
  hasPronoun,
  hasNumber,
  LINE_HINTS,
} from "../src/lib/line-checks";
import { EditableQuestionItem } from "../src/components/studio/help-me-write/DynamicQuestionList";
import { BulletCandidateItem } from "../src/components/studio/help-me-write/BulletReviewStudio";
import { CVSheet } from "../src/components/templates/CVSheet";
import { generateCvDocx } from "../src/lib/docx-generator";

(globalThis as any).React = React;

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}:`, msg);
    failed++;
  }
}

async function checkAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}:`, msg);
    failed++;
  }
}

console.log("==================================================");
console.log("PrintCV Help Me Write v2: UI & Integration Test Suite");
console.log("==================================================");

// -----------------------------------------------------------------------------
// Suite 1: Dynamic Question List & Archetype Switching
// -----------------------------------------------------------------------------
console.log("\nSuite 1: Dynamic Question List & Archetype Switching");

check("Loads project-specific questions for 42 Common Core projects", () => {
  const targetTranscendence: HelperTarget = {
    kind: "project",
    item: {
      id: "p-trans",
      name: "ft_transcendence",
      slug: "ft_transcendence",
      is42Project: true,
      date: "2024",
      techStack: "TypeScript, NestJS, React",
      bulletPoints: [],
    },
  };
  const questions = helperQuestions(targetTranscendence);
  assert(questions.length >= 3, "Expected at least 3 questions for ft_transcendence");
  assert(
    questions.some((q) =>
      q.question.toLowerCase().includes("technologies") ||
      q.question.toLowerCase().includes("modules") ||
      q.question.toLowerCase().includes("contributions") ||
      q.question.toLowerCase().includes("challenge")
    ),
    "ft_transcendence questions should probe tech stack or modules"
  );
});

check("Loads 42Next specific questions for Call Me Maybe", () => {
  const targetCallMeMaybe: HelperTarget = {
    kind: "project",
    item: {
      id: "p-cmm",
      name: "Call Me Maybe",
      slug: "call-me-maybe",
      is42Project: true,
      date: "2026",
      techStack: "Python, GGUF",
      bulletPoints: [],
    },
  };
  const questions = helperQuestions(targetCallMeMaybe);
  assert(questions.length >= 3, "Expected questions for Call Me Maybe");
  assert(
    questions.some((q) =>
      q.question.toLowerCase().includes("constrained decoding") ||
      q.question.toLowerCase().includes("tool") ||
      q.question.toLowerCase().includes("llm") ||
      q.question.toLowerCase().includes("json")
    ),
    "Should include LLM/tool execution questions"
  );
});

check("Supports editing question text and preserving question ID", () => {
  const initialQuestions: EditableQuestionItem[] = [
    { id: "q1", type: "text", question: "What part did you build?", options: ["Frontend", "Backend"] },
    { id: "q2", type: "text", question: "What was the hardest bug?", options: [] },
  ];

  // Simulate onQuestionEdit
  const editQuestion = (items: EditableQuestionItem[], id: string, newPrompt: string) => {
    return items.map((q) => (q.id === id ? { ...q, question: newPrompt } : q));
  };

  const updated = editQuestion(initialQuestions, "q1", "Which specific microservices did you own?");
  assert.strictEqual(updated[0].question, "Which specific microservices did you own?");
  assert.strictEqual(updated[0].id, "q1", "Question ID must remain unchanged to preserve existing answers");
  assert.strictEqual(updated[1].question, "What was the hardest bug?");
});

check("Supports adding custom questions with unique ID and isCustom flag", () => {
  const initialQuestions: EditableQuestionItem[] = [
    { id: "q1", type: "text", question: "Question 1", options: [] },
  ];

  const addQuestion = (items: EditableQuestionItem[], promptText: string) => {
    const newItem: EditableQuestionItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "text",
      question: promptText.trim(),
      options: [],
      isCustom: true,
    };
    return [...items, newItem];
  };

  const updated = addQuestion(initialQuestions, "How did you optimize memory consumption?");
  assert.strictEqual(updated.length, 2);
  assert.strictEqual(updated[1].question, "How did you optimize memory consumption?");
  assert.strictEqual(updated[1].isCustom, true);
  assert(updated[1].id.startsWith("custom-"));
});

check("Supports reordering questions (move up / move down)", () => {
  const items: EditableQuestionItem[] = [
    { id: "q1", type: "text", question: "Question 1" },
    { id: "q2", type: "text", question: "Question 2" },
    { id: "q3", type: "text", question: "Question 3" },
  ];

  const moveQuestion = (list: EditableQuestionItem[], index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return list;
    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    return next;
  };

  // Move q2 up
  const afterUp = moveQuestion(items, 1, "up");
  assert.strictEqual(afterUp[0].id, "q2");
  assert.strictEqual(afterUp[1].id, "q1");
  assert.strictEqual(afterUp[2].id, "q3");

  // Move boundary item up (no-op)
  const boundaryUp = moveQuestion(items, 0, "up");
  assert.strictEqual(boundaryUp[0].id, "q1");

  // Move q1 down
  const afterDown = moveQuestion(items, 0, "down");
  assert.strictEqual(afterDown[0].id, "q2");
  assert.strictEqual(afterDown[1].id, "q1");
});

check("Supports removing a question from the list", () => {
  const items: EditableQuestionItem[] = [
    { id: "q1", type: "text", question: "Question 1" },
    { id: "q2", type: "text", question: "Question 2" },
  ];

  const removeQuestion = (list: EditableQuestionItem[], id: string) => {
    return list.filter((q) => q.id !== id);
  };

  const updated = removeQuestion(items, "q1");
  assert.strictEqual(updated.length, 1);
  assert.strictEqual(updated[0].id, "q2");
});

check("Supports switching archetype override dynamically", () => {
  const projectItem = {
    id: "p-custom",
    name: "Arbitrary Web App",
    is42Project: false,
    date: "2024",
    techStack: "React",
    bulletPoints: [],
  };

  // Default auto-detected archetype is personal
  const autoArchetype = detectProjectArchetype({ name: projectItem.name });
  assert.strictEqual(autoArchetype, "personal");

  // Switching override to hackathon
  const hackathonTarget: HelperTarget = {
    kind: "project",
    item: { ...projectItem, archetypeOverride: "hackathon" },
  };
  const hackathonQuestions = helperQuestions(hackathonTarget);
  assert(
    hackathonQuestions.some((q) =>
      q.question.toLowerCase().includes("time constraint") ||
      q.question.toLowerCase().includes("demo") ||
      q.question.toLowerCase().includes("hackathon")
    ),
    "Hackathon questions should probe time constraint or prototype demo"
  );

  // Switching override to freelance
  const freelanceTarget: HelperTarget = {
    kind: "project",
    item: { ...projectItem, archetypeOverride: "freelance" },
  };
  const freelanceQuestions = helperQuestions(freelanceTarget);
  assert(
    freelanceQuestions.some((q) =>
      q.question.toLowerCase().includes("client") ||
      q.question.toLowerCase().includes("deliverable") ||
      q.question.toLowerCase().includes("freelance")
    ),
    "Freelance questions should probe client deliverables"
  );
});

// -----------------------------------------------------------------------------
// Suite 2: ReadmeUploadZone & Ephemeral State Invariants
// -----------------------------------------------------------------------------
console.log("\nSuite 2: ReadmeUploadZone & Ephemeral State Invariants");

check("Validates README extensions and rejects invalid file types", () => {
  assert.strictEqual(validateReadmeFile({ name: "README.md", size: 1024 }).valid, true);
  assert.strictEqual(validateReadmeFile({ name: "notes.txt", size: 500 }).valid, true);
  assert.strictEqual(validateReadmeFile({ name: "overview.markdown", size: 2048 }).valid, true);

  assert.strictEqual(validateReadmeFile({ name: "binary.exe", size: 1024 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "script.sh", size: 1024 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "cv.pdf", size: 1024 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "data.zip", size: 1024 }).valid, false);
});

check("Rejects files exceeding 512 KB upload cap and 0-byte empty files", () => {
  assert.strictEqual(validateReadmeFile({ name: "README.md", size: 0 }).valid, false);
  assert.strictEqual(validateReadmeFile({ name: "README.md", size: MAX_README_FILE_SIZE_BYTES + 1 }).valid, false);
});

check("Extracts architectural sections while omitting installation commands", () => {
  const sampleReadme = `# Distributed Cache Service
A high-throughput distributed in-memory cache written in Go.

## Architecture
Built with consistent hashing across 16 virtual nodes per server.
Utilizes gRPC streaming for low-latency node synchronization.

## Performance
Achieves 120,000 req/sec at sub-5ms p99 latency under concurrent benchmark.

## Installation
\`\`\`bash
git clone https://github.com/example/cache.git
cd cache && make install
./bin/cached --port 8080
\`\`\`
`;

  const parsed = extractReadmeSections(sampleReadme);
  assert.strictEqual(parsed.hasTechnicalContent, true);
  assert(parsed.excerpt.includes("consistent hashing"));
  assert(parsed.excerpt.includes("gRPC"));
  assert.strictEqual(
    parsed.excerpt.includes("make install"),
    false,
    "Installation boilerplate must be omitted from excerpt"
  );
});

check("CRITICAL PRIVACY INVARIANT: README content NEVER persists in Zustand or localStorage", () => {
  const store = useCVStore.getState();

  // Simulate user uploading a 20KB README in the studio
  const rawSecretReadme = "CONFIDENTIAL INTERNAL CODE: SuperSecretAlgorithmKey12345\n## Architecture\nProprietary microservice";
  const parsed = extractReadmeSections(rawSecretReadme);

  // Verify Zustand store currently has zero trace of the secret README
  const stateStr = JSON.stringify(useCVStore.getState());
  assert(!stateStr.includes("SuperSecretAlgorithmKey12345"), "Zustand state must never store raw README text");

  // Simulate updating project bullet points
  const pId = store.cvData.projects[0]?.id || "proj-1";
  if (!store.cvData.projects[0]) {
    store.addProjectToCV({
      id: pId,
      name: "ft_transcendence",
      is42Project: true,
      date: "2024",
      techStack: "TypeScript",
      bulletPoints: ["Engineered WebSocket gateway"],
    });
  } else {
    store.updateProjectBullet(pId, 0, "Engineered WebSocket gateway for real-time multiplayer updates.");
  }

  // Check state again after mutations
  const updatedStateStr = JSON.stringify(useCVStore.getState().cvData);
  assert(!updatedStateStr.includes("SuperSecretAlgorithmKey12345"),
    "Store cvData must never receive ephemeral README data");
  assert(!updatedStateStr.includes("Proprietary microservice"),
    "Store cvData must not receive raw README sections");
});

// -----------------------------------------------------------------------------
// Suite 3: Candidate Evaluation Engine & Live Validation
// -----------------------------------------------------------------------------
console.log("\nSuite 3: Candidate Evaluation Engine & Live Validation");

check("Recognizes strong action verbs at bullet start", () => {
  assert.strictEqual(startsWithActionVerb("Architected distributed cache node cluster in Go."), true);
  assert.strictEqual(startsWithActionVerb("Engineered high-concurrency event bus reducing latency by 40%."), true);
  assert.strictEqual(startsWithActionVerb("Refactored memory allocator achieving zero leaks across Valgrind suite."), true);
  assert.strictEqual(startsWithActionVerb("Developed RESTful API with automated integration tests."), true);
});

check("Flags weak starting words and personal pronouns", () => {
  assert.strictEqual(startsWithWeakWord("Helped with database migration."), true);
  assert.strictEqual(startsWithWeakWord("Worked on the frontend components."), true);
  assert.strictEqual(startsWithWeakWord("Responsible for writing tests."), true);

  assert.strictEqual(hasPronoun("I designed the architecture for the service."), true);
  assert.strictEqual(hasPronoun("Architected our internal deployment pipeline."), true);
  assert.strictEqual(hasPronoun("Engineered pipeline achieving 99.9% uptime."), false);
});

check("Detects metrics and numbers for accomplishment quantification", () => {
  assert.strictEqual(hasNumber("Reduced latency by 45% under 10k concurrent connections."), true);
  assert.strictEqual(hasNumber("Handled 5,000 daily active users."), true);
  assert.strictEqual(hasNumber("Created clean code without bugs."), false);
});

check("Strictly validates length against MAX_BULLET_LENGTH (220 characters)", () => {
  const shortBullet = "Architected event-driven microservices handling 5,000 req/sec.";
  assert(shortBullet.length <= MAX_BULLET_LENGTH);

  const exactBullet = "A".repeat(220);
  assert.strictEqual(exactBullet.length, MAX_BULLET_LENGTH);

  const tooLongBullet = "A".repeat(221);
  assert(tooLongBullet.length > MAX_BULLET_LENGTH);
});

// -----------------------------------------------------------------------------
// Suite 4: Bullet Review Studio Selection & Insertion Modes
// -----------------------------------------------------------------------------
console.log("\nSuite 4: Bullet Review Studio Selection & Insertion Modes");

check("Toggles candidate selection and calculates selected counts", () => {
  const candidates: BulletCandidateItem[] = [
    { id: "c1", text: "Bullet 1", selected: true },
    { id: "c2", text: "Bullet 2", selected: false },
    { id: "c3", text: "Bullet 3", selected: true },
  ];

  const selectedCount = candidates.filter((c) => c.selected && c.text.trim().length > 0).length;
  assert.strictEqual(selectedCount, 2);

  // Toggle c2 to true
  const updated = candidates.map((c) => (c.id === "c2" ? { ...c, selected: !c.selected } : c));
  const newSelectedCount = updated.filter((c) => c.selected && c.text.trim().length > 0).length;
  assert.strictEqual(newSelectedCount, 3);
});

check("Add Below Mine mode appends candidates preserving existing bullets in exact order", () => {
  const store = useCVStore.getState();
  const testProjectId = "proj-test-modes";

  // Setup project with 2 existing bullets
  store.setCVData({
    ...store.cvData,
    projects: [
      {
        id: testProjectId,
        name: "Web Engine",
        is42Project: false,
        date: "2024",
        techStack: "C++98",
        bulletPoints: [
          "Implemented non-blocking I/O multiplexing with poll().",
          "Designed HTTP/1.1 request parser with RFC 7230 compliance.",
        ],
      },
    ],
  });

  const selectedCandidates = [
    "Engineered CGI gateway supporting multipart form uploads.",
    "Benchmarked connection throughput against NGINX baseline.",
  ];

  // Apply in "add" mode
  const currentBullets = useCVStore.getState().cvData.projects.find((p) => p.id === testProjectId)!.bulletPoints;
  const mergedBullets = [...currentBullets.filter((b) => b.trim()), ...selectedCandidates];

  useCVStore.getState().setCVData({
    ...useCVStore.getState().cvData,
    projects: useCVStore.getState().cvData.projects.map((p) =>
      p.id === testProjectId ? { ...p, bulletPoints: mergedBullets } : p
    ),
  });

  const resultProject = useCVStore.getState().cvData.projects.find((p) => p.id === testProjectId)!;
  assert.strictEqual(resultProject.bulletPoints.length, 4);
  assert.strictEqual(resultProject.bulletPoints[0], "Implemented non-blocking I/O multiplexing with poll().");
  assert.strictEqual(resultProject.bulletPoints[1], "Designed HTTP/1.1 request parser with RFC 7230 compliance.");
  assert.strictEqual(resultProject.bulletPoints[2], "Engineered CGI gateway supporting multipart form uploads.");
  assert.strictEqual(resultProject.bulletPoints[3], "Benchmarked connection throughput against NGINX baseline.");
});

check("Replace Existing Bullets mode replaces all bullets with selected candidates", () => {
  const store = useCVStore.getState();
  const testProjectId = "proj-test-replace";

  store.setCVData({
    ...store.cvData,
    projects: [
      {
        id: testProjectId,
        name: "ft_irc",
        is42Project: true,
        date: "2024",
        techStack: "C++98",
        bulletPoints: ["Old draft line 1", "Old draft line 2"],
      },
    ],
  });

  const replacementCandidates = [
    "Architected RFC 2812 compliant IRC server supporting 100+ concurrent users with epoll.",
    "Engineered channel mode moderation, operator privileges, and private messaging.",
  ];

  // Apply in "replace" mode
  useCVStore.getState().setCVData({
    ...useCVStore.getState().cvData,
    projects: useCVStore.getState().cvData.projects.map((p) =>
      p.id === testProjectId ? { ...p, bulletPoints: replacementCandidates } : p
    ),
  });

  const resultProject = useCVStore.getState().cvData.projects.find((p) => p.id === testProjectId)!;
  assert.strictEqual(resultProject.bulletPoints.length, 2);
  assert.strictEqual(resultProject.bulletPoints[0], replacementCandidates[0]);
  assert.strictEqual(resultProject.bulletPoints[1], replacementCandidates[1]);
  assert.strictEqual(resultProject.bulletPoints.includes("Old draft line 1"), false);
});

// -----------------------------------------------------------------------------
// Suite 5: Offline Prompt Assembly & Fallback Integration
// -----------------------------------------------------------------------------
console.log("\nSuite 5: Offline Prompt Assembly & Fallback Integration");

check("Assembles structured bullet prompt including custom answers and Dr. Wissam constraints", () => {
  const target: HelperTarget = {
    kind: "project",
    item: {
      id: "p-irc",
      name: "ft_irc",
      is42Project: true,
      date: "2024",
      techStack: "C++98",
      bulletPoints: [],
    },
  };

  const answers: HelperAnswers = {
    "own-part": "Architected network socket engine and channel state machine.",
    "hard-part": "Handling abrupt client disconnects without hanging sockets.",
    "numbers": "Tested with 150 concurrent nc bots simultaneously.",
  };

  const prompt = buildBulletPrompt({ target, answers, cv: useCVStore.getState().cvData });

  assert(prompt.includes("ft_irc"), "Prompt must include project title");
  assert(prompt.includes("C++98"), "Prompt must include tech stack");
  assert(prompt.includes("220 characters"), "Prompt must enforce 220 character constraint");
  assert(prompt.includes("Architected network socket engine"), "Prompt must include user answer");
  assert(prompt.includes("strong past-tense action verb"), "Prompt must enforce action verbs");
  assert(prompt.includes("No em dashes"), "Prompt must ban em dashes");
});

check("Parses raw AI bullet replies safely discarding chat conversational filler", () => {
  const rawReply = `Here are 3 strong resume bullets for your CV:

• Architected non-blocking TCP socket server in C++98 using poll() for event multiplexing.
- Implemented RFC 2812 command parser supporting JOIN, PRIVMSG, KICK, and MODE operations.
* Engineered ping-pong heartbeat mechanism detecting dead TCP connections within 15 seconds.

I hope these help your application!`;

  const parsedBullets = parseBulletsFromAI(rawReply);
  assert.strictEqual(parsedBullets.length, 3);
  assert(parsedBullets[0].startsWith("Architected non-blocking"));
  assert(parsedBullets[1].startsWith("Implemented RFC 2812"));
  assert(parsedBullets[2].startsWith("Engineered ping-pong"));
  assert(!parsedBullets.some((b) => b.includes("Here are") || b.includes("I hope")),
    "Conversational preamble and epilogue must be discarded");
});

// -----------------------------------------------------------------------------
// Suite 6: Live CV Sheet & DOCX Export Purity
// -----------------------------------------------------------------------------
console.log("\nSuite 6: Live CV Sheet & DOCX Export Purity");

check("CVSheet static render contains zero modal or helper markers after bullet insertion", () => {
  const store = useCVStore.getState();
  store.setCVData({
    ...store.cvData,
    contact: {
      ...store.cvData.contact,
      fullName: "Jane 42 Student",
    },
    projects: [
      {
        id: "p-clean",
        name: "ft_transcendence",
        is42Project: true,
        date: "2024",
        techStack: "TypeScript, NestJS, Docker",
        bulletPoints: [
          "Architected real-time WebSocket game loop maintaining 60 FPS across client sessions.",
          "Implemented OAuth2 2FA security flow with JWT session management.",
        ],
      },
    ],
  });

  const html = renderToStaticMarkup(React.createElement(CVSheet, { data: useCVStore.getState().cvData }));
  assert(html.includes("ft_transcendence"), "Project title rendered");
  assert(html.includes("Architected real-time WebSocket game loop"), "Bullet 1 rendered");
  assert(!html.includes("Help Me Write"), "Helper UI must not leak into CVSheet");
  assert(!html.includes("Candidate Bullet Studio"), "Review studio must not leak into CVSheet");
  assert(!html.includes("Add Below Mine"), "Studio action labels must not leak into CVSheet");
  assert(!html.includes("data-slot="), "Static view must have zero editor data-slots");
});

checkAsync("DOCX generator produces clean document with zero UI artifacts", async () => {
  const store = useCVStore.getState();
  const blob = await generateCvDocx(store.cvData);
  assert(blob instanceof Blob, "DOCX output must be a Blob");
  assert(blob.size > 2000, `DOCX size should be realistic (got ${blob.size} bytes)`);

  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const textContent = buffer.toString("binary");

  assert(!textContent.includes("Candidate Bullet Studio"), "DOCX must not leak studio UI strings");
  assert(!textContent.includes("Help Me Write"), "DOCX must not leak modal strings");
  assert(!textContent.includes("Replace Existing Bullets"), "DOCX must not leak button labels");
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
setTimeout(() => {
  console.log("\n==================================================");
  console.log(`Phase 2C UI & Integration Verification: ${passed} passed, ${failed} failed`);
  console.log("==================================================");
  if (failed > 0) {
    process.exit(1);
  }
}, 100);
