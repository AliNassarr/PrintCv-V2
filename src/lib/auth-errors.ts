// Login errors travel in the URL as short codes (?error=expired), never as free text,
// so a link can't put its own message on the page.

export const AUTH_ERROR_MESSAGES = {
  cancelled: "Login with 42 was cancelled.",
  expired: "Your login link expired. Please try again.",
  failed: "Login with 42 failed. Please try again.",
  busy: "42 is busy right now. Please try again in a minute.",
  unreachable: "We couldn't reach 42 right now. Please try again.",
  profile: "We couldn't read your 42 profile. Please try again.",
  setup: "Login with 42 is not set up yet.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  // Own keys only, so "constructor" or "toString" fall back to "failed"
  return Object.prototype.hasOwnProperty.call(AUTH_ERROR_MESSAGES, code)
    ? AUTH_ERROR_MESSAGES[code as AuthErrorCode]
    : AUTH_ERROR_MESSAGES.failed;
}
