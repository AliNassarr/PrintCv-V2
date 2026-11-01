// Checks the profile the relay posts back after it finishes the 42 login (see relay/cloudflare-worker.js).
// The relay signs `${state}.${ts}.${me}` with RELAY_SECRET (HMAC-SHA256, base64url), so only the relay
// can send a profile, and only for a login this browser started (the state must match its cookie).

import crypto from "crypto";
import type { AuthErrorCode } from "@/lib/auth-errors";

// How long a signed profile stays good: enough for a slow page, too short to reuse later
const MAX_AGE_MS = 5 * 60 * 1000;
// Small clock differences between Cloudflare and Vercel
const CLOCK_SKEW_MS = 60 * 1000;

export function signRelayHandoff(secret: string, state: string, ts: string, me: string): string {
  return crypto.createHmac("sha256", secret).update(`${state}.${ts}.${me}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export type RelayHandoff = { state: string; ts: string; me: string; sig: string };

export function readRelayHandoff(
  secret: string,
  handoff: Partial<RelayHandoff>,
  now: number = Date.now()
): { ok: true; state: string; me: any } | { ok: false; code: AuthErrorCode } {
  const { state, ts, me, sig } = handoff;
  if (!secret) return { ok: false, code: "setup" };
  if (!state || !ts || !me || !sig) return { ok: false, code: "failed" };
  // No dots in state and only digits in ts, so `${state}.${ts}.${me}` can only be split one way
  if (!/^[A-Za-z0-9_-]+$/.test(state) || !/^\d{13}$/.test(ts)) return { ok: false, code: "failed" };
  if (!safeEqual(sig, signRelayHandoff(secret, state, ts, me))) return { ok: false, code: "failed" };

  const sentAt = Number(ts);
  if (!Number.isFinite(sentAt) || sentAt > now + CLOCK_SKEW_MS || now - sentAt > MAX_AGE_MS) {
    return { ok: false, code: "expired" };
  }

  let profile: any;
  try {
    profile = JSON.parse(me);
  } catch {
    return { ok: false, code: "profile" };
  }
  if (!profile?.login) return { ok: false, code: "profile" };
  return { ok: true, state, me: profile };
}
