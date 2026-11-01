// The quick yes/no checks for one CV line, in one place.
// Used by the editor, the score, the "Help me write" helper and the landing page.
import { ALL_SAMPLE_LINES } from "./sample-lines";

export const MAX_BULLET_LENGTH = 220;

// First word of a bullet, as typed ("Built", "Fixed"...).
export function openingWord(bullet: string): string {
  const match = (bullet || "").trim().match(/^[A-Za-z][A-Za-z-]*/);
  return match ? match[0] : "";
}

const IRREGULAR_VERBS = new Set([
  "built", "led", "wrote", "ran", "made", "taught", "set", "drove", "won", "took", "gave", "kept",
  "found", "grew", "cut", "brought", "held", "sped", "split", "rebuilt", "rewrote", "shipped", "met",
  "spoke", "sold", "bought", "chose", "began", "beat", "lent", "spent", "dealt", "sent",
]);

const WEAK_OPENERS = new Set([
  "worked", "helped", "assisted", "participated", "responsible", "tasked", "involved", "did", "was",
  "were", "had", "used", "utilized", "tried", "attempted", "learned", "studied",
]);

export function startsWithActionVerb(bullet: string): boolean {
  const word = openingWord(bullet).toLowerCase();
  if (!word || WEAK_OPENERS.has(word)) return false;
  return IRREGULAR_VERBS.has(word) || (word.length > 3 && word.endsWith("ed"));
}

export function startsWithWeakWord(bullet: string): boolean {
  // "I helped..." and "We worked..." are weak too
  const text = (bullet || "").trim().replace(/^(I|We)\s+/i, "");
  return WEAK_OPENERS.has(openingWord(text).toLowerCase());
}

// "I" only as a capital letter and a word of its own: not in "I/O", "I2C", "UI" or "iOS".
// The others in lower case or with a capital first letter, so "We built..." and "My parser..." are caught,
// but not in all capitals: "US servers", "ME" and "MY" are short names, not pronouns.
const PRONOUN_I = /\bI(?![\w/])/;
const PRONOUNS = /\b(me|my|mine|myself|we|us|our|ours|ourselves)\b/gi;
const LOWER_OR_CAPITALISED = /^[A-Za-z][a-z]*$/;
export function hasPronoun(bullet: string): boolean {
  const text = bullet || "";
  if (PRONOUN_I.test(text)) return true;
  for (const m of text.matchAll(PRONOUNS)) if (LOWER_OR_CAPITALISED.test(m[0])) return true;
  return false;
}

export function hasNumber(bullet: string): boolean {
  return /\d/.test(bullet || "");
}

// Bullets the old version of PrintCV gave to every student. Kept only to warn when a CV still uses them.
const OLD_TEMPLATE_BULLETS = [
  "Implemented 40+ standard C library functions from scratch, including string manipulation, memory management, and linked list operations.",
  "Built a reusable static library used as the low-level foundation for all subsequent C systems projects.",
  "Implemented a custom printf function handling 7+ format specifiers using variadic arguments in C.",
  "Built a modular parsing and formatting engine matching standard libc printf output byte-for-byte.",
  "Developed a robust C function to read arbitrary lines from file descriptors, managing dynamic memory and static buffers.",
  "Handled edge cases including EOF, variable buffer sizes, and simultaneous reading across multiple file descriptors with zero memory leaks.",
  "Configured a Debian-based virtual server with strict security policies including UFW firewall, custom SSH port, and password complexity enforcement via PAM.",
  "Set up LVM disk partitioning with encrypted volumes and automated system monitoring scripts running via cron.",
  "Implemented an optimized sorting algorithm in C to sort integer stacks using a constrained set of instructions.",
  "Optimized algorithmic efficiency to sort 500 numbers in minimal operations, balancing time complexity and instruction count.",
  "Reproduced Unix pipeline behavior in C using pipe(), fork(), dup2(), and execve() to execute chained commands.",
  "Implemented input/output file redirections, heredoc parsing, and graceful process error handling.",
  "Developed a 2D top-down game engine in C using MiniLibX, handling sprite rendering, keyboard events, and player movement.",
  "Implemented map parsing and flood-fill path validation algorithm to verify reachable exits and collectibles before initialization.",
  "Engineered a 3D wireframe graphics visualizer in C using MiniLibX to render altitude landscapes from raw coordinate maps.",
  "Implemented Bresenham line-drawing algorithm and isometric mathematical projections with interactive zoom and camera rotation.",
  "Built a client-server messaging system using Unix signals (SIGUSR1/SIGUSR2) for inter-process communication in C.",
  "Implemented bitwise message encoding and signal handling to transmit strings between independent processes.",
  "Built a multithreaded simulation of the Dining Philosophers problem in C using pthreads and mutex synchronization.",
  "Prevented deadlocks and data races using asymmetric mutex locking, verified clean via ThreadSanitizer and Valgrind.",
  "Built a Unix shell from scratch in C with support for pipelines, I/O redirections, heredocs, and environment variable expansion.",
  "Implemented POSIX built-in commands and signal handlers replicating standard Bash behavior.",
  "Designed a custom lexer and parser to tokenize and execute complex command-line inputs.",
  "Built a 3D raycasting game engine in C using MiniLibX, rendering a first-person 3D view from 2D grid maps.",
  "Implemented texture mapping, wall collision detection, and mathematical ray casting using the DDA algorithm.",
  "Configured complex IPv4 network topologies, computing CIDR subnet masks, routing tables, and interface gateways.",
  "Analyzed TCP/IP network packet paths to establish end-to-end communication across multi-router networks.",
  "Completed intensive C++ modules mastering Orthodox Canonical Form, inheritance hierarchies, and dynamic polymorphism.",
  "Implemented generic programming with templates and standard STL containers, including exception-safe class architectures.",
  "Architected multi-container infrastructure on Alpine Linux using Docker and Docker Compose, enforcing TLS v1.3 encryption.",
  "Configured isolated container networks, persistent volumes, and secure MariaDB database connections.",
  "Developed an RFC-compliant IRC server in C++ implementing non-blocking TCP socket multiplexing via poll().",
  "Handled concurrent client connections, user authentication, channel management, and operator privileges.",
  "Built an HTTP/1.1 web server from scratch in C++ supporting GET, POST, and DELETE methods with non-blocking I/O.",
  "Implemented dynamic CGI script execution, file upload handling, and custom NGINX-style configuration parsing.",
  "Architected socket multiplexing via poll() to sustain concurrent client connections with defensive error handling.",
  "Built a full-stack real-time web application featuring online multiplayer Pong with WebSocket synchronization.",
  "Implemented OAuth2 authentication, two-factor authentication (TOTP), and secure RESTful backend APIs.",
  "Containerized all microservices using Docker Compose, integrating relational database management and live chat.",
  "Mentored newer students in C programming, memory management, and Unix system fundamentals as part of the Infrastructure Guild program.",
  "Supervised Piscine bootcamp sessions, providing guidance and code review to incoming candidates.",
  "Conducted peer code reviews across C/C++ projects, evaluating code quality, memory safety, and algorithmic correctness.",
  "Assisted as a tutor during the 4-week intensive C systems bootcamp, helping candidates with debugging, algorithms, and shell scripting.",
  "Organized campus events and workshops to foster community engagement among software engineering students.",
  "Engineered the project utilizing structured software design principles and rigorous testing.",
  "Implemented core application logic and validated system behavior across critical edge cases.",
];

const words = (text: string): Set<string> =>
  new Set((text.toLowerCase().match(/[a-z0-9+#]{3,}/g) || []).filter((w) => !["the", "and", "with", "for", "from", "using", "via"].includes(w)));

export const SAMPLE_LINE_LIST = ALL_SAMPLE_LINES;

const matcher = (list: string[]) => {
  const sets = list.map(words);
  return (bullet: string): boolean => {
    const own = words(bullet);
    if (own.size < 5) return false;
    return sets.some((t) => { let shared = 0; t.forEach((w) => { if (own.has(w)) shared++; }); return shared / t.size >= 0.75 && shared / own.size >= 0.6; });
  };
};

// True when a line is (almost) one the old version of PrintCV gave everyone.
export const looksLikeOldTemplate = matcher(OLD_TEMPLATE_BULLETS);
// True when a line is (almost) one of the landing page sample lines.
export const isSampleLine = matcher(ALL_SAMPLE_LINES);
// What the editor and the score use: shared by many CVs, so not the student's own words.
export function looksLikeTemplate(bullet: string): boolean {
  return looksLikeOldTemplate(bullet) || isSampleLine(bullet);
}
// Word overlap between two lines (0 to 1), for tests.
export function overlap(a: string, b: string): number {
  const x = words(a), y = words(b); if (!x.size || !y.size) return 0;
  let shared = 0; x.forEach((w) => { if (y.has(w)) shared++; });
  return shared / Math.min(x.size, y.size);
}

export const LINE_HINTS = {
  template: "This is the same line many students have. Use the Help me write button, or add what you did.",
  sample: "This line is from the PrintCV sample. Write your own.",
  weakStart: "Start with what you did, like Built, Fixed or Tested.",
  pronoun: 'Remove "I", "my" or "we". CVs skip them.',
  tooLong: "Too long for one line. Try to cut a few words.",
  noNumber: "Add a real number where you can: tests, users, files or hours.",
  shared: "Same as many other CVs",
} as const;

export interface LineCheckResult { question: string; pass: boolean; hint: string }
// The five yes/no checks shown on the landing page.
export function runLineChecks(text: string): LineCheckResult[] {
  const t = (text || "").trim();
  return [
    { question: "Starts with what you did?", pass: startsWithActionVerb(t), hint: LINE_HINTS.weakStart },
    { question: "Has a number?", pass: hasNumber(t), hint: LINE_HINTS.noNumber },
    { question: "No “I”, “my” or “we”?", pass: t.length > 0 && !hasPronoun(t), hint: LINE_HINTS.pronoun },
    { question: `Under ${MAX_BULLET_LENGTH} letters?`, pass: t.length > 0 && t.length <= MAX_BULLET_LENGTH, hint: LINE_HINTS.tooLong },
    { question: "In your own words?", pass: t.length > 0 && !looksLikeTemplate(t), hint: isSampleLine(t) ? LINE_HINTS.sample : LINE_HINTS.template },
  ];
}
