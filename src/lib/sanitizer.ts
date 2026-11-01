/**
 * PrintCV Content Sanitizer & Compliance Guard
 *
 * Enforces:
 * 1. STRICT BAN ON EM-DASHES (—): Automatically converts em-dashes to ", " or " - "
 * 2. Grounded engineering tone: Detects and replaces robotic AI buzzwords with simple, direct verbs
 * 3. Preserves standard en-dash (–) for date ranges and "Software Engineer – Level X"
 */

// Banned robotic / exaggerated buzzwords mapped to humble, direct alternatives
const BUZZWORD_REPLACEMENTS: Record<string, string> = {
  spearheaded: "led",
  orchestrated: "developed",
  synergized: "collaborated with",
  revolutionized: "redesigned",
  leveraged: "used",
  utilized: "used",
  harnessed: "applied",
  "cutting-edge": "modern",
  "state-of-the-art": "industry-standard",
  groundbreaking: "effective",
  paradigm: "architecture",
  gamechanger: "solution",
  pioneered: "built",
  masterminded: "architected",
};

/**
 * Strips all em-dashes (—) from text.
 * Replaces em-dashes with ", " or " - " depending on context.
 */
export function removeEmDashes(text: string): string {
  if (!text) return text;
  // Replace em-dash with space around it to a clean comma or hyphen
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/—/g, ", ")
    .replace(/\s{2,}/g, " ");
}

/**
 * Sanitizes an engineering bullet point:
 * - Removes em-dashes
 * - Normalizes excessive punctuation
 * - Strips or softens robotic buzzwords
 * - Ensures it starts with a capitalized letter
 * - Ensures single sentence end period
 */
export function sanitizeBulletPoint(bullet: string): string {
  if (!bullet) return "";

  let cleaned = removeEmDashes(bullet.trim());

  // Replace AI buzzwords (case-insensitive word boundary match)
  for (const [buzzword, replacement] of Object.entries(BUZZWORD_REPLACEMENTS)) {
    const regex = new RegExp(`\\b${buzzword}\\b`, "gi");
    cleaned = cleaned.replace(regex, (match) => {
      // Preserve first character capitalization
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Capitalize first character
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  // Ensure trailing period
  if (!cleaned.endsWith(".")) {
    cleaned += ".";
  }

  return cleaned;
}

/**
 * Recursively sanitizes any CV data object before rendering or saving.
 */
export function sanitizeCVData<T>(obj: T): T {
  if (typeof obj === "string") {
    return removeEmDashes(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeCVData(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "bulletPoints" && Array.isArray(value)) {
        result[key] = value.map((b) => (typeof b === "string" ? sanitizeBulletPoint(b) : b));
      } else {
        result[key] = sanitizeCVData(value);
      }
    }
    return result as unknown as T;
  }
  return obj;
}

/**
 * Normalizes LinkedIn input to strict 'linkedin.com/in/username' format without duplicate prefixes
 */
export function normalizeLinkedIn(val: string): string {
  if (!val) return "";
  let cleaned = val.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  while (/^linkedin\.com\/(in\/)?/i.test(cleaned)) {
    cleaned = cleaned.replace(/^linkedin\.com\/(in\/)?/i, "");
  }
  cleaned = cleaned.replace(/\/+$/, "").replace(/\?.*$/, "");
  return cleaned ? `linkedin.com/in/${cleaned}` : "";
}

/**
 * Normalizes GitHub input to strict 'github.com/username' format without duplicate prefixes
 */
export function normalizeGitHub(val: string): string {
  if (!val) return "";
  let cleaned = val.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  while (/^github\.com\//i.test(cleaned)) {
    cleaned = cleaned.replace(/^github\.com\//i, "");
  }
  cleaned = cleaned.replace(/\/+$/, "").replace(/\?.*$/, "");
  return cleaned ? `github.com/${cleaned}` : "";
}
