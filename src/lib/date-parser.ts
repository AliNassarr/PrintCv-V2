// Reliable Date Range Parser for CV Education, Experience, and Project Dates.
// Accurately parses date ranges while preserving ISO date strings (e.g. "2023-09 – 2024-05")
// and never splitting on hyphens inside dates.

export interface ParsedDateRange {
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

/**
 * Parses an editable date range string into its component parts: startDate, endDate, and isCurrent.
 *
 * Rules:
 * 1. En-dash (–) or Em-dash (—) are recognized as range separators with optional surrounding whitespace:
 *    e.g. "2023-09 – 2024-05", "2023–2024", "2023—2024"
 * 2. Standard hyphen (-) is treated as a range separator when surrounded by whitespace:
 *    e.g. "2023 - 2026", "Sep 2022 - May 2024", "2023-09-01 - 2024-05-30"
 *    OR between 4-digit years or "Present": e.g. "2022-2023", "2022-Present"
 *    A tight hyphen before a 2-digit month/day (e.g. "2023-09", "2024-05-12") is preserved as an ISO date.
 * 3. Case-insensitive " to " is recognized as a range separator:
 *    e.g. "January 2023 to Present"
 * 4. Lone "Present" sets isCurrent: true and endDate: "Present", with empty startDate.
 * 5. Single date (e.g. "September 2025", "2023") sets startDate to that date, with empty endDate.
 * 6. Empty / blank string returns empty fields with isCurrent: false.
 */
export function parseDateRange(input?: string | null): ParsedDateRange {
  if (!input || !input.trim()) {
    return { startDate: "", endDate: "", isCurrent: false };
  }

  const raw = input.trim();

  // Special case: lone "Present" or "Current"
  if (/^present$/i.test(raw) || /^current$/i.test(raw)) {
    return { startDate: "", endDate: "Present", isCurrent: true };
  }

  // Regex for range separators:
  // 1. \s*[–—]\s*                                : en-dash or em-dash (with optional spaces)
  // 2. \s+-\s+                                   : standard hyphen with whitespace on BOTH sides
  // 3. \s+to\s+                                  : the word "to" with whitespace on BOTH sides
  // 4. (?<=\b\d{4})-(?=(?:\d{4}|present|current)\b) : standard hyphen between 4-digit years or "Present"
  const separatorRegex =
    /\s*[–—]\s*|\s+-\s+|\s+to\s+|(?<=\b\d{4})-(?=(?:\d{4}|present|current)\b)/i;

  const parts = raw.split(separatorRegex).map((s) => s.trim()).filter(Boolean);

  if (parts.length === 0) {
    return { startDate: "", endDate: "", isCurrent: false };
  }

  if (parts.length === 1) {
    const single = parts[0];
    const isCurrent = /present/i.test(single) || /current/i.test(single);
    if (isCurrent) {
      return { startDate: "", endDate: "Present", isCurrent: true };
    }
    return { startDate: single, endDate: "", isCurrent: false };
  }

  // Two or more parts: first is start, second is end (if more than 2, join remainder cleanly)
  const startDate = parts[0];
  const endDate = parts.slice(1).join(" – ");
  const isCurrent = /present/i.test(endDate) || /current/i.test(endDate);

  return {
    startDate,
    endDate: isCurrent ? "Present" : endDate,
    isCurrent,
  };
}
