// src/lib/security/readme-sanitizer.ts
// Security wrapper integrating with src/lib/readme-parser.ts
// Re-exports canonical file validation and sanitization functions.

import {
  validateReadmeFile,
  sanitizeRawReadmeText,
  parseReadmeMarkdown,
  MAX_README_FILE_SIZE_BYTES,
  DEFAULT_README_TOKEN_BUDGET,
  type ReadmeParseResult,
  type ReadmeFileValidation,
} from "@/lib/readme-parser";

export {
  validateReadmeFile,
  sanitizeRawReadmeText,
  parseReadmeMarkdown,
  MAX_README_FILE_SIZE_BYTES,
  DEFAULT_README_TOKEN_BUDGET,
  type ReadmeParseResult,
  type ReadmeFileValidation,
};

export const ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;
export const MAX_FILE_SIZE_BYTES = MAX_README_FILE_SIZE_BYTES;
export const MAX_README_CHARS = 10000; // 10,000 characters server clamp
export const MAX_REQUEST_BYTES = 32 * 1024; // 32 KB hard cap on request payload

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedName?: string;
}

export function validateUploadedFile(file: { name: string; size: number }): FileValidationResult {
  const result = validateReadmeFile(file);
  const sanitizedName = (file?.name || "")
    .replace(/[^\w\.\-\s]/g, "")
    .replace(/\.\.+/g, ".")
    .trim();

  return {
    valid: result.valid,
    error: result.error,
    sanitizedName,
  };
}

export function sanitizeReadmeText(rawText: string, maxChars: number = MAX_README_CHARS): string {
  const parsed = parseReadmeMarkdown(rawText, { maxTokensBudget: Math.ceil(maxChars / 4) });
  return parsed.excerpt;
}
