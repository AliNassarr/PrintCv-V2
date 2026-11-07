// src/lib/ai/bullet-parser.ts
// Output parsing and validation engine for PrintCV Help Me Write v2.
// Evaluates candidate bullets against canonical Dr. Wissam validation rules (MAX_BULLET_LENGTH = 220)
// from src/lib/line-checks.ts without slicing or truncating sentences mid-thought.

import {
  MAX_BULLET_LENGTH,
  startsWithActionVerb,
  startsWithWeakWord,
  hasPronoun,
  hasNumber,
  openingWord,
} from "@/lib/line-checks";
import { removeEmDashes } from "@/lib/sanitizer";

export { MAX_BULLET_LENGTH, openingWord };

export interface ParsedBulletCandidate {
  text: string;
  goodStart: boolean;
  weakStart: boolean;
  hasPronoun: boolean;
  hasNumber: boolean;
  tooLong: boolean;
  length: number;
  unverifiedMetric?: boolean;
}

export interface BulletParseResult {
  bullets: string[];
  candidates: ParsedBulletCandidate[];
  hasSufficientEvidence: boolean;
  missingInformationPrompt?: string;
  rawParsed: boolean;
}

const BULLET_MARKER_REGEX = /^\s*(?:[-*•·▪◦‣–—]|\d{1,2}[.)])\s+/;
const CONVERSATIONAL_PREAMBLE_REGEX = /^(here(?:'s| is| are)|sure|certainly|below|these bullets|i hope|feel free|let me know|of course)\b/i;

/**
 * Evaluates a single candidate bullet against canonical line checks.
 * Does NOT truncate sentences exceeding MAX_BULLET_LENGTH (220 characters).
 * If sourceText is provided, checks whether numeric metrics in the bullet are grounded in sourceText.
 */
export function evaluateCandidateBullet(rawBullet: string, sourceText?: string): ParsedBulletCandidate {
  // Strip bullet markers e.g. "- ", "* ", "1. " and clean em-dashes
  let text = (rawBullet || "").trim().replace(BULLET_MARKER_REGEX, "").trim();
  text = removeEmDashes(text).replace(/\s+([,.;:])/g, "$1").trim();

  // Ensure first character is uppercase
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Ensure sentence ends with appropriate punctuation if missing
  if (text.length > 5 && !/[.!?]$/.test(text)) {
    text = text + ".";
  }

  const length = text.length;
  const hasNum = hasNumber(text);

  let unverifiedMetric = false;
  if (hasNum && typeof sourceText === "string" && sourceText.trim().length > 0) {
    const bulletNumbers = text.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
    const normalizedSource = sourceText.toLowerCase();

    for (const rawNum of bulletNumbers) {
      const cleanNum = rawNum.replace(/%/g, "").trim().toLowerCase();
      const digitsMatch = rawNum.match(/\d+/g);
      if (!digitsMatch) continue;
      const digits = digitsMatch.join("");
      // Multi-digit numbers or percentages not found in the source text are flagged
      if (digits.length >= 2) {
        const hasDirect = normalizedSource.includes(cleanNum);
        const hasDigits = normalizedSource.includes(digits);
        if (!hasDirect && !hasDigits) {
          unverifiedMetric = true;
          break;
        }
      }
    }
  }

  return {
    text,
    goodStart: startsWithActionVerb(text),
    weakStart: startsWithWeakWord(text),
    hasPronoun: hasPronoun(text),
    hasNumber: hasNum,
    tooLong: length > MAX_BULLET_LENGTH,
    length,
    unverifiedMetric,
  };
}

/**
 * Parses raw LLM response text into structured bullet candidates.
 * Handles JSON Schema output, markdown code-fenced JSON, and plain text lists.
 * Optionally validates metrics against sourceText to flag unverified numbers.
 */
export function parseAiBulletResponse(replyText: string, sourceText?: string): BulletParseResult {
  if (!replyText || !replyText.trim()) {
    return {
      bullets: [],
      candidates: [],
      hasSufficientEvidence: false,
      rawParsed: false,
    };
  }

  const trimmed = replyText.trim();
  let candidateStrings: string[] = [];
  let hasSufficientEvidence = true;
  let missingInformationPrompt: string | undefined;
  let rawParsed = false;

  // 1. Attempt JSON parsing (handles pure JSON or markdown code-fenced ```json ... ```)
  try {
    let jsonStr = trimmed;
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    if (jsonStr.startsWith("{") && jsonStr.endsWith("}")) {
      const parsed = JSON.parse(jsonStr);

      if (Array.isArray(parsed?.bullets)) {
        candidateStrings = parsed.bullets.filter(
          (b: unknown): b is string => typeof b === "string" && b.trim().length > 5
        );
        rawParsed = true;
      }

      if (typeof parsed?.hasSufficientEvidence === "boolean") {
        hasSufficientEvidence = parsed.hasSufficientEvidence;
      }

      if (typeof parsed?.missingInformationPrompt === "string" && parsed.missingInformationPrompt.trim()) {
        missingInformationPrompt = parsed.missingInformationPrompt.trim();
      }
    }
  } catch {
    // JSON parsing failed, fallback to line-by-line parsing below
  }

  // 2. Fallback: Parse line-by-line if JSON parsing did not extract bullets
  if (candidateStrings.length === 0) {
    const lines = trimmed.split("\n");
    const marked: string[] = [];
    const plain: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Skip conversational filler
      if (CONVERSATIONAL_PREAMBLE_REGEX.test(line)) continue;
      if (/^\{|\}$|\[|\]$/.test(line)) continue;

      const isMarked = BULLET_MARKER_REGEX.test(line);
      const cleaned = line.replace(BULLET_MARKER_REGEX, "").trim();

      if (cleaned.length > 5) {
        (isMarked ? marked : plain).push(cleaned);
      }
    }

    candidateStrings = marked.length > 0 ? marked : plain;
  }

  // Limit to maximum 4 candidate suggestions
  const cappedStrings = candidateStrings.slice(0, 4);

  // Evaluate each candidate bullet without truncating
  const candidates: ParsedBulletCandidate[] = cappedStrings.map((b) =>
    evaluateCandidateBullet(b, sourceText)
  );
  const bullets = candidates.map((c) => c.text);

  return {
    bullets,
    candidates,
    hasSufficientEvidence,
    missingInformationPrompt,
    rawParsed,
  };
}
