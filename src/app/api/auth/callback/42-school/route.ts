import { NextRequest, NextResponse } from "next/server";
import { extractIntraProfile } from "@/lib/intra/extract-profile";
import { getIntraConfig, exchangeCodeForToken, fetchIntraMe, IntraError } from "@/lib/intra/oauth";
import type { AuthErrorCode } from "@/lib/auth-errors";
import {
  OAUTH_STATE_COOKIE,
  isValidOAuthState,
  setSessionCookie,
  createLoginCode,
  setLoginCodeCookie,
  clearOAuthStateCookie,
} from "@/lib/auth-session";

// Token exchange + profile fetch can take a while when 42 is slow
export const maxDuration = 30;

function redirectWithError(origin: string, code: AuthErrorCode): NextResponse {
  const url = new URL("/studio", origin);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  clearOAuthStateCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const { clientId, clientSecret, origin, redirectUri } = getIntraConfig(request.nextUrl.origin);

  if (searchParams.get("error")) {
    return redirectWithError(origin, "cancelled");
  }

  if (!isValidOAuthState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, searchParams.get("state"))) {
    return redirectWithError(origin, "expired");
  }

  if (!code) {
    return redirectWithError(origin, "failed");
  }

  if (!clientId || !clientSecret) {
    return redirectWithError(origin, "setup");
  }

  try {
    const accessToken = await exchangeCodeForToken({ clientId, clientSecret, code, redirectUri });
    const me = await fetchIntraMe(accessToken);
    const profile = extractIntraProfile(me);

    const loginCode = createLoginCode();
    const url = new URL("/studio", origin);
    url.searchParams.set("login", loginCode);
    const response = NextResponse.redirect(url);
    clearOAuthStateCookie(response);
    setSessionCookie(response, profile);
    setLoginCodeCookie(response, loginCode);
    return response;
  } catch (err: any) {
    console.error("42 login failed:", err?.message || "unknown error");
    return redirectWithError(origin, err instanceof IntraError ? err.code : "failed");
  }
}
