// Server-only helpers for the 42 Intra OAuth flow.
// The client secret never leaves the server.

import type { AuthErrorCode } from "@/lib/auth-errors";

const INTRA_API = "https://api.intra.42.fr";
// Keeps the slowest path (token + profile, each with one relay retry) under the 30s limit
const REQUEST_TIMEOUT_MS = 6000;
const USER_AGENT = "PrintCV/1.0 (+https://printcv.me)";

export class IntraError extends Error {
  constructor(public code: AuthErrorCode, detail?: string) {
    super(detail || code);
  }
}

function cleanEnv(value: string | undefined): string {
  return (value || "").replace(/^["']|["']$/g, "").trim();
}

// APP_URL must be a full URL (https://printcv.me). If it is missing or broken, use the request's own origin.
function resolveOrigin(requestOrigin: string): string {
  const configured = cleanEnv(process.env.APP_URL);
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      console.error("APP_URL is not a valid URL, using the request origin instead");
    }
  }
  return requestOrigin;
}

// Shared with the relay. It signs the profile the relay posts back (see relay-handoff.ts).
export function relaySecret(): string {
  const secret = cleanEnv(process.env.RELAY_SECRET);
  if (secret && secret.length < 32) {
    console.error("RELAY_SECRET is shorter than 32 characters, ignoring it");
    return "";
  }
  return secret;
}

export function getIntraConfig(requestOrigin: string) {
  const clientId = cleanEnv(process.env.FORTY_TWO_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.FORTY_TWO_CLIENT_SECRET);
  const origin = resolveOrigin(requestOrigin);
  // Relay login (FORTY_TWO_API_BASE + RELAY_SECRET): 42 blocks server calls that start at Vercel,
  // even through the relay, but not the ones a student's browser starts. So 42 sends the student
  // to the relay, which logs in there and posts the signed profile to /api/auth/42/relay-finish.
  const relay = relayBase();
  const relayLogin = Boolean(relay && relaySecret());
  return {
    clientId,
    clientSecret,
    origin,
    relayLogin,
    redirectUri: relayLogin ? `${relay}/callback` : `${origin}/api/auth/callback/42-school`,
  };
}

// Optional relay (FORTY_TWO_API_BASE): must be an https server you own, because it sees
// the same requests as api.intra.42.fr. Used only when 42 answers with a block page.
function relayBase(): string | null {
  const relay = cleanEnv(process.env.FORTY_TWO_API_BASE).replace(/\/+$/, "");
  if (!relay || relay === INTRA_API) return null;
  if (!relay.startsWith("https://")) {
    console.error("FORTY_TWO_API_BASE must start with https://, ignoring it");
    return null;
  }
  return relay;
}

async function intraRequest(path: string, init: RequestInit, opts: { retryOnNetworkError: boolean }): Promise<any> {
  const relay = relayBase();
  const bases = relay ? [INTRA_API, relay] : [INTRA_API];
  let lastError: IntraError | null = null;

  for (const base of bases) {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...init.headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err: any) {
      lastError = new IntraError("unreachable", err?.message);
      // A timed-out token request may already have used the one-time code, so don't retry it
      if (!opts.retryOnNetworkError) break;
      continue;
    }

    if (res.status === 429) {
      throw new IntraError("busy", "rate limited");
    }

    const body = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(body);
    } catch {
      // Not JSON: a block or maintenance page, the request never reached 42's API
      lastError = new IntraError("unreachable", `non-JSON ${res.status} from ${base}`);
      continue;
    }

    if (!res.ok) {
      throw new IntraError("failed", data?.error_description || data?.error || `HTTP ${res.status}`);
    }
    return data;
  }

  throw lastError || new IntraError("unreachable");
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<string> {
  const data = await intraRequest(
    "/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: params.clientId,
        client_secret: params.clientSecret,
        code: params.code,
        redirect_uri: params.redirectUri,
      }).toString(),
    },
    { retryOnNetworkError: false }
  );

  if (!data?.access_token) {
    throw new IntraError("failed", "no access_token in response");
  }
  return data.access_token as string;
}

export async function fetchIntraMe(accessToken: string): Promise<any> {
  const me = await intraRequest(
    "/v2/me",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    { retryOnNetworkError: true }
  );
  if (!me?.login) {
    throw new IntraError("profile", "profile without login");
  }
  return me;
}
