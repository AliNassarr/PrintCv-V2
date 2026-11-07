// src/lib/readme-parser.ts
// Section-aware Markdown README parser for PrintCV Help Me Write v2.
// Prioritizes high-signal technical content (architecture, implementation, features, testing)
// while filtering noise (badges, navigation, license, CLI installation boilerplate).
// Uploaded content remains 100% optional, untrusted, and strictly ephemeral in client memory.

export const MAX_README_FILE_SIZE_BYTES = 512 * 1024; // 512 KB upload cap
export const DEFAULT_README_TOKEN_BUDGET = 1200; // ~4,800 characters target

export interface ReadmeParserOptions {
  maxTokensBudget?: number;
  maxFileSizeBytes?: number;
}

export interface ReadmeParseResult {
  valid: boolean;
  excerpt: string;
  characterCount: number;
  estimatedTokens: number;
  includedSections: string[];
  omittedSections: string[];
  totalOriginalWords: number;
  extractedWords: number;
  hasTechnicalContent: boolean;
  omittedBoilerplateWords: number;
  error?: string;
}

export interface ReadmeFileValidation {
  valid: boolean;
  error?: string;
}

const ALLOWED_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".ps1",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".php",
  ".html", ".htm", ".svg", ".xml",
  ".pdf", ".docx", ".doc", ".odt",
  ".zip", ".tar", ".gz", ".rar",
]);

/**
 * Validates a dropped or selected file's extension and size.
 */
export function validateReadmeFile(file: { name: string; size: number }): ReadmeFileValidation {
  if (!file || typeof file.name !== "string") {
    return { valid: false, error: "Invalid file object provided." };
  }

  if (file.size <= 0) {
    return { valid: false, error: "File is empty (0 bytes)." };
  }

  if (file.size > MAX_README_FILE_SIZE_BYTES) {
    return { valid: false, error: `File exceeds maximum allowed size of 512 KB (${Math.round(file.size / 1024)} KB).` };
  }

  const lowerName = file.name.toLowerCase();
  const extMatch = lowerName.match(/\.[a-z0-9]+$/i);
  const ext = extMatch ? extMatch[0] : "";

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type "${ext}" is not permitted for security reasons. Please upload a .md or .txt file.` };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type "${ext}" is not supported. Please upload a Markdown (.md) or text (.txt) file.` };
  }

  return { valid: true };
}

/**
 * Strips malicious control characters, Unicode BiDi overrides (CVE-2021-42574),
 * and dangerous HTML tags from raw untrusted text.
 */
export function sanitizeRawReadmeText(rawText: string): string {
  if (!rawText) return "";

  let text = rawText;

  // 1. Strip null bytes and non-printable control characters (preserve tabs and newlines)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // 2. Strip Unicode BiDi override characters and zero-width markers (Trojan Source mitigation)
  text = text.replace(/[\u202A-\u202E\u2066-\u2069\uFEFF\u200B-\u200D]/g, "");

  // 3. Strip dangerous HTML elements and event handlers
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
    .replace(/javascript:[^\s"'>]+/gi, "");

  // 4. Strip markdown image / badge links e.g. [![badge](img_url)](target_url) or ![alt](url)
  text = text.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");

  return text.trim();
}

/**
 * Section category classification.
 */
type SectionPriority = 1 | 2 | 3 | 4 | "EXCLUDE";

interface ParsedSection {
  title: string;
  level: number;
  content: string;
  priority: SectionPriority;
  wordCount: number;
}

// Section title matching heuristics
const EXCLUDE_HEADER_REGEX = /^(table of contents|toc|contents|index|installation|install|getting started|how to run|quick start|quickstart|setup|usage|prerequisites|build instructions|deploy|deployment|license|contributing|contributors|author|authors|credits|acknowledgments|acknowledgements|code of conduct|contact|donation|donations|support|badges|status|changelog)\b/i;

const PRIORITY_1_REGEX = /^(architecture|system design|core mechanics|mechanics|features|key features|feature list|overview|components|design|structure|data flow|module|modules)\b/i;

const PRIORITY_2_REGEX = /^(implementation|implementation details|algorithms|algorithm|concurrency|threading|threads|networking|sockets|challenges|problem solving|technical challenges|performance|benchmarks|optimization|memory management|security|cryptography)\b/i;

const PRIORITY_3_REGEX = /^(testing|tests|unit tests|verification|validation|test suite|edge cases|evaluation)\b/i;

function classifySection(title: string): SectionPriority {
  const cleanTitle = title.replace(/^#+\s*/, "").trim();

  if (EXCLUDE_HEADER_REGEX.test(cleanTitle)) {
    return "EXCLUDE";
  }
  if (PRIORITY_1_REGEX.test(cleanTitle)) {
    return 1;
  }
  if (PRIORITY_2_REGEX.test(cleanTitle)) {
    return 2;
  }
  if (PRIORITY_3_REGEX.test(cleanTitle)) {
    return 3;
  }
  return 4; // General technical section
}

/**
 * Strips CLI shell setup blocks containing repetitive installation commands
 * (e.g. git clone, npm install, docker-compose up, make).
 */
function cleanSectionContent(content: string): string {
  if (!content) return "";

  // Remove code blocks that are purely shell installation/usage commands
  const cleaned = content.replace(/```(?:bash|sh|shell|zsh|cmd|powershell)?\s*(?:git clone|npm i|npm install|yarn install|pnpm install|make|docker-compose|docker build|pip install|cargo build|sudo apt)[\s\S]*?```/gi, "");

  return cleaned.trim();
}

const countWords = (text: string): number => {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
};

/**
 * Parses and extracts section-aware Markdown content within an adaptive token budget.
 */
export function parseReadmeMarkdown(
  rawContent: string,
  options: ReadmeParserOptions = {}
): ReadmeParseResult {
  const maxTokens = options.maxTokensBudget ?? DEFAULT_README_TOKEN_BUDGET;
  const maxCharBudget = maxTokens * 4; // ~4 characters per token heuristic

  if (!rawContent || !rawContent.trim()) {
    return {
      valid: true,
      excerpt: "",
      characterCount: 0,
      estimatedTokens: 0,
      includedSections: [],
      omittedSections: [],
      totalOriginalWords: 0,
      extractedWords: 0,
      hasTechnicalContent: false,
      omittedBoilerplateWords: 0,
    };
  }

  const sanitized = sanitizeRawReadmeText(rawContent);
  const totalOriginalWords = countWords(sanitized);

  // Split markdown by headers: # Header, ## Header, ### Header, #### Header
  const headerRegex = /(?:^|\n)(#{1,4}\s+[^\n]+)/g;
  const parts: { header: string; content: string }[] = [];

  let lastIndex = 0;
  let currentHeader = "Overview";
  let match: RegExpExecArray | null;

  while ((match = headerRegex.exec(sanitized)) !== null) {
    const chunkBefore = sanitized.slice(lastIndex, match.index).trim();
    if (chunkBefore) {
      parts.push({ header: currentHeader, content: chunkBefore });
    }
    currentHeader = match[1].trim();
    lastIndex = match.index + match[0].length;
  }

  const remaining = sanitized.slice(lastIndex).trim();
  if (remaining) {
    parts.push({ header: currentHeader, content: remaining });
  }

  // If no headers found at all, treat whole text as a single Overview section
  if (parts.length === 0 && sanitized.length > 0) {
    parts.push({ header: "Overview", content: sanitized });
  }

  const sections: ParsedSection[] = parts.map((part) => {
    const cleanTitle = part.header.replace(/^#+\s*/, "").trim();
    const priority = classifySection(cleanTitle);
    const cleanedBody = cleanSectionContent(part.content);
    return {
      title: cleanTitle,
      level: (part.header.match(/^#+/) || ["#"])[0].length,
      content: cleanedBody,
      priority,
      wordCount: countWords(cleanedBody),
    };
  });

  const includedSections: string[] = [];
  const omittedSections: string[] = [];
  let omittedBoilerplateWords = 0;

  // Track omitted boilerplate sections
  for (const s of sections) {
    if (s.priority === "EXCLUDE") {
      omittedSections.push(s.title);
      omittedBoilerplateWords += s.wordCount;
    }
  }

  // Filter candidate technical sections sorted by priority (1 -> 2 -> 3 -> 4)
  const candidateSections = sections.filter((s) => s.priority !== "EXCLUDE" && s.content.length > 0);

  // Group by priority order: 1, then 2, then 3, then 4
  const priorityGroups: Record<number, ParsedSection[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const s of candidateSections) {
    if (typeof s.priority === "number") {
      priorityGroups[s.priority].push(s);
    }
  }

  const excerptBlocks: string[] = [];
  let currentChars = 0;

  for (const p of [1, 2, 3, 4]) {
    for (const sec of priorityGroups[p]) {
      const headerLine = `### ${sec.title}\n`;
      const block = `${headerLine}${sec.content}\n\n`;

      if (currentChars + block.length <= maxCharBudget) {
        excerptBlocks.push(block);
        includedSections.push(sec.title);
        currentChars += block.length;
      } else {
        // Check if we can include a partial section up to sentence/paragraph boundary
        const remainingBudget = maxCharBudget - currentChars - headerLine.length - 20;
        if (remainingBudget > 200) {
          // Truncate to nearest sentence boundary
          const truncatedBody = truncateToSentenceBoundary(sec.content, remainingBudget);
          if (truncatedBody) {
            excerptBlocks.push(`${headerLine}${truncatedBody}\n\n`);
            includedSections.push(`${sec.title} (Partial)`);
            currentChars += headerLine.length + truncatedBody.length;
          }
        } else {
          omittedSections.push(sec.title);
        }
      }
    }
  }

  const excerpt = excerptBlocks.join("").trim();
  const characterCount = excerpt.length;
  const estimatedTokens = Math.ceil(characterCount / 4);
  const extractedWords = countWords(excerpt);
  const hasTechnicalContent = includedSections.length > 0 && characterCount > 50;

  return {
    valid: true,
    excerpt,
    characterCount,
    estimatedTokens,
    includedSections,
    omittedSections,
    totalOriginalWords,
    extractedWords,
    hasTechnicalContent,
    omittedBoilerplateWords,
  };
}

/**
 * Truncates text cleanly at a sentence boundary within maxChars.
 */
function truncateToSentenceBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  // Match last sentence terminator (. ! ?) followed by whitespace or end
  const lastSentenceMatch = slice.match(/[\.\!\?](?=\s|$)[^\.\!\?]*$/);

  if (lastSentenceMatch && lastSentenceMatch.index && lastSentenceMatch.index > maxChars * 0.5) {
    return slice.slice(0, lastSentenceMatch.index + 1).trim();
  }

  // Fallback to last newline or whitespace
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.5) {
    return slice.slice(0, lastSpace).trim() + " ...";
  }

  return slice.trim() + " ...";
}

/**
 * Backward-compatible alias for parseReadmeMarkdown
 */
export const extractReadmeSections = parseReadmeMarkdown;

