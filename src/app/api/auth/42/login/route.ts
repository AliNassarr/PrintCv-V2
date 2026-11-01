import { NextRequest, NextResponse } from "next/server";
import { getIntraConfig } from "@/lib/intra/oauth";
import { OAUTH_STATE_COOKIE, createOAuthState } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  const { clientId, origin, redirectUri } = getIntraConfig(request.nextUrl.origin);

  // The state cookie must be set on the same host 42 sends the user back to.
  // Redirect only once, so a proxy that reports a different host can't cause a loop.
  if (request.nextUrl.origin !== origin && !request.nextUrl.searchParams.has("moved")) {
    return NextResponse.redirect(new URL("/api/auth/42/login?moved=1", origin));
  }

  if (!clientId) {
    const url = new URL("/studio", origin);
    url.searchParams.set("error", "setup");
    return NextResponse.redirect(url);
  }

  const state = createOAuthState();

  const authUrl = new URL("https://api.intra.42.fr/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "public");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/auth",
  });
  return response;
}
