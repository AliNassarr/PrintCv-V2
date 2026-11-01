import { NextRequest, NextResponse } from "next/server";
import { getIntraConfig } from "@/lib/intra/oauth";
import { OAUTH_STATE_COOKIE, createOAuthState } from "@/lib/auth-session";

export async function GET(request: NextRequest) {
  const { clientId, origin, redirectUri, relayLogin } = getIntraConfig(request.nextUrl.origin);

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
  // With the relay, the login ends with a POST from the relay's page, which is a cross-site request.
  // Browsers send the cookie on it only if it is SameSite=None (and so Secure; localhost counts as secure).
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: relayLogin || process.env.NODE_ENV === "production",
    sameSite: relayLogin ? "none" : "lax",
    maxAge: 10 * 60,
    path: "/api/auth",
  });
  return response;
}
