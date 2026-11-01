import { NextRequest, NextResponse } from "next/server";
import { extractIntraProfile } from "@/lib/intra/extract-profile";
import { getIntraConfig, relaySecret } from "@/lib/intra/oauth";
import { readRelayHandoff } from "@/lib/intra/relay-handoff";
import type { AuthErrorCode } from "@/lib/auth-errors";
import {
  OAUTH_STATE_COOKIE,
  isValidOAuthState,
  setSessionCookie,
  createLoginCode,
  setLoginCodeCookie,
  clearOAuthStateCookie,
} from "@/lib/auth-session";

// Last step of the relay login: the relay's page posts the signed 42 profile here.
// 303 so the browser follows with a GET.
function redirectWithError(origin: string, code: AuthErrorCode): NextResponse {
  const url = new URL("/studio", origin);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url, 303);
  clearOAuthStateCookie(response);
  return response;
}

function field(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: NextRequest) {
  const { origin } = getIntraConfig(request.nextUrl.origin);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirectWithError(origin, "failed");
  }

  const handoff = readRelayHandoff(relaySecret(), {
    state: field(form, "state"),
    ts: field(form, "ts"),
    me: field(form, "me"),
    sig: field(form, "sig"),
  });
  if (!handoff.ok) {
    console.error("42 relay login failed:", handoff.code);
    return redirectWithError(origin, handoff.code);
  }

  // Only the browser that started this login has the matching state cookie
  if (!isValidOAuthState(request.cookies.get(OAUTH_STATE_COOKIE)?.value, handoff.state)) {
    return redirectWithError(origin, "expired");
  }

  try {
    const profile = extractIntraProfile(handoff.me);
    const loginCode = createLoginCode();
    const url = new URL("/studio", origin);
    url.searchParams.set("login", loginCode);
    const response = NextResponse.redirect(url, 303);
    clearOAuthStateCookie(response);
    setSessionCookie(response, profile);
    setLoginCodeCookie(response, loginCode);
    return response;
  } catch (err: any) {
    console.error("42 relay login failed:", err?.message || "unknown error");
    return redirectWithError(origin, "failed");
  }
}
