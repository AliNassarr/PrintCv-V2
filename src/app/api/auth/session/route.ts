import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  LOGIN_CODE_COOKIE,
  readSessionToken,
  clearSessionCookie,
  clearLoginCodeCookie,
  matchesCookie,
} from "@/lib/auth-session";

export const dynamic = "force-dynamic";

// GET /api/auth/session            -> who is logged in
// GET /api/auth/session?code=...   -> same, plus `fresh: true` once, right after a real login
export async function GET(req: NextRequest) {
  let user = null;
  try {
    user = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    // Missing SESSION_SECRET: treat as logged out
  }

  const loginCode = req.nextUrl.searchParams.get("code");
  const fresh = Boolean(user) && matchesCookie(req.cookies.get(LOGIN_CODE_COOKIE)?.value, loginCode);

  const res = NextResponse.json(
    user ? { authenticated: true, fresh, user } : { authenticated: false, fresh: false, user: null },
    { headers: { "Cache-Control": "no-store" } }
  );
  if (loginCode) clearLoginCodeCookie(res);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  clearLoginCodeCookie(res);
  // Old cookies from the previous login system
  for (const legacy of ["forty_two_sid", "forty_two_session", "forty_two_bridge_ticket"]) {
    res.cookies.set(legacy, "", { path: "/", maxAge: 0 });
  }
  return res;
}
