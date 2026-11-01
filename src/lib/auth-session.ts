import crypto from "crypto";
import zlib from "zlib";
import type { NextResponse } from "next/server";
import type { IntraProfile } from "@/lib/intra/cv-from-intra";

// Stateless session: the user's Intra profile is stored in an httpOnly cookie,
// compressed and signed with HMAC-SHA256. Nothing is kept in server memory,
// so it works across serverless instances.

export const SESSION_COOKIE = "printcv_session";
export const OAUTH_STATE_COOKIE = "printcv_oauth_state";
// One-time code set right after a real login. The page imports the profile only if it matches,
// so a plain link to "/?login=..." can't trigger an import.
export const LOGIN_CODE_COOKIE = "printcv_login_code";
const LOGIN_CODE_MAX_AGE_SECONDS = 2 * 60;

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours
const MAX_COOKIE_BYTES = 3800; // stay under the 4KB browser limit

function getSessionSecret(): string {
  const secret = (process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or shorter than 32 characters");
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function encode(user: IntraProfile, expiresAt: number): string {
  const json = JSON.stringify({ v: 1, exp: expiresAt, user });
  const payload = zlib.deflateRawSync(Buffer.from(json, "utf-8")).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function createSessionToken(user: IntraProfile): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  let trimmed = user;
  let token = encode(trimmed, expiresAt);

  // Very long project histories: keep the newest projects until the cookie fits
  while (token.length > MAX_COOKIE_BYTES && trimmed.validatedProjects.length > 0) {
    trimmed = {
      ...trimmed,
      validatedProjects: trimmed.validatedProjects.slice(0, Math.floor(trimmed.validatedProjects.length * 0.8)),
    };
    token = encode(trimmed, expiresAt);
  }
  return token;
}

export function readSessionToken(token: string | undefined): IntraProfile | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    if (!safeEqual(signature, sign(payload))) return null;
    const json = zlib.inflateRawSync(Buffer.from(payload, "base64url")).toString("utf-8");
    const data = JSON.parse(json);
    if (data?.v !== 1 || typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return data.user as IntraProfile;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, user: IntraProfile): void {
  response.cookies.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
}

export function createLoginCode(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export function setLoginCodeCookie(response: NextResponse, code: string): void {
  response.cookies.set(LOGIN_CODE_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: LOGIN_CODE_MAX_AGE_SECONDS,
    path: "/api/auth",
  });
}

export function clearLoginCodeCookie(response: NextResponse): void {
  response.cookies.set(LOGIN_CODE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
}

export function createOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function matchesCookie(fromCookie: string | undefined, fromQuery: string | null): boolean {
  if (!fromCookie || !fromQuery) return false;
  return safeEqual(fromCookie, fromQuery);
}

export const isValidOAuthState = matchesCookie;
