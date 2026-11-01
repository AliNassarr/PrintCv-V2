// A small relay for the 42 login, to run as a Cloudflare Worker. It keeps nothing.
// 42's API blocks server calls that start at Vercel, even when they go through this worker,
// but it lets through the calls this worker makes while a student's browser is waiting on it.
//
// So the login ends here (/callback): 42 sends the student to this worker, the worker gets the
// student's 42 profile, then the page posts it, signed, to PrintCV's /api/auth/42/relay-finish.
//
// Worker settings (Settings > Variables and Secrets):
//   APP_URL                  PrintCV's address, like https://printcv.me (the only place profiles go)
//   FORTY_TWO_CLIENT_ID      same as in Vercel
//   FORTY_TWO_CLIENT_SECRET  same as in Vercel (as a Secret)
//   RELAY_SECRET             same as in Vercel (as a Secret), 32+ random characters
// In Vercel, set FORTY_TWO_API_BASE to this worker's address and RELAY_SECRET to the same value.
// In the 42 app, add the redirect URI <this worker's address>/callback.

const INTRA = "https://api.intra.42.fr";
const ALLOWED = { "/oauth/token": "POST", "/v2/me": "GET" };
const PASSED_HEADERS = ["Accept", "Authorization", "Content-Type", "User-Agent"];
const PRINTCV_AGENT = "PrintCV/1.0 (+https://printcv.me)";

// A short description of a page that is not JSON (a block page): its status, Cloudflare's mark and its title
function describePage(res, body) {
  const title = (body.match(/<title>([^<]*)<\/title>/i) || [])[1];
  return `${res.status} ${res.headers.get("cf-mitigated") || ""} ${title || body.slice(0, 80)}`.replace(/\s+/g, " ").trim();
}

// Calls 42 for the login. Returns { data }, or { error } with one of PrintCV's error codes.
async function call42(path, init) {
  let res;
  try {
    res = await fetch(INTRA + path, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.log(`42 ${path}: ${err && err.message}`);
    return { error: "unreachable" };
  }
  if (res.status === 429) return { error: "busy" };
  const body = await res.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    console.log(`42 ${path}: ${describePage(res, body)}`);
    return { error: "unreachable" };
  }
  if (!res.ok) {
    console.log(`42 ${path}: ${res.status} ${(data && data.error) || ""}`);
    return { error: "failed" };
  }
  return { data: data || {} };
}

// HMAC-SHA256 in base64url, the same as signRelayHandoff in src/lib/intra/relay-handoff.ts
async function sign(secret, text) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Same clean-up as PrintCV: no spaces or quotes around the value
function setting(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

// PrintCV's state is base64url, with no dots, so the signed text can only be read one way
const STATE_FORMAT = /^[A-Za-z0-9_-]{1,200}$/;

// 42 sends the student here with ?code=...&state=...
async function finishLogin(url, env) {
  let app;
  try {
    app = new URL(setting(env.APP_URL));
  } catch {
    return new Response("APP_URL is not set on the relay.", { status: 500 });
  }
  if (app.protocol !== "https:" && app.hostname !== "localhost") {
    return new Response("APP_URL must start with https://", { status: 500 });
  }
  const backWithError = (code) => Response.redirect(`${app.origin}/studio?error=${code}`, 302);

  if (url.searchParams.get("error")) return backWithError("cancelled");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !STATE_FORMAT.test(state)) return backWithError("failed");
  const secret = setting(env.RELAY_SECRET);
  const clientId = setting(env.FORTY_TWO_CLIENT_ID);
  const clientSecret = setting(env.FORTY_TWO_CLIENT_SECRET);
  if (!clientId || !clientSecret || secret.length < 32) return backWithError("setup");

  const token = await call42("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${url.origin}/callback`,
    }).toString(),
  });
  if (token.error) return backWithError(token.error);
  if (!token.data.access_token) return backWithError("failed");

  const profile = await call42("/v2/me", { method: "GET", headers: { Authorization: `Bearer ${token.data.access_token}` } });
  if (profile.error) return backWithError(profile.error);
  if (!profile.data.login) return backWithError("profile");

  // The access token stays here: PrintCV only gets the public profile
  const me = JSON.stringify(profile.data);
  const ts = String(Date.now());
  const sig = await sign(secret, `${state}.${ts}.${me}`);
  const action = `${app.origin}/api/auth/42/relay-finish`;
  const inputs = Object.entries({ state, ts, me, sig })
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Taking you back to PrintCV</title></head>
<body style="font-family: system-ui, sans-serif; text-align: center; padding: 48px 16px;">
<form method="post" action="${escapeHtml(action)}">${inputs}
<p>Taking you back to PrintCV...</p>
<noscript><button type="submit">Go back to PrintCV</button></noscript>
</form>
<script>document.forms[0].submit();</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action ${app.origin}; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/callback" && request.method === "GET") {
      return finishLogin(url, env || {});
    }

    // Open /check in a browser to see how 42 answers this worker on the login steps (no real keys are sent).
    // All three should say 401 with json true. /check?ua=printcv sends the same User-Agent as PrintCV.
    if (pathname === "/check" && request.method === "GET") {
      const agent = url.searchParams.get("ua") === "printcv" ? { "User-Agent": PRINTCV_AGENT } : {};
      const probe = async (path, init) => {
        const res = await fetch(INTRA + path, { ...init, headers: { Accept: "application/json", ...agent, ...init.headers } });
        const body = await res.text();
        const json = body.trim().startsWith("{");
        return { status: res.status, json, page: json ? null : describePage(res, body) };
      };
      return Response.json({
        token: await probe("/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials",
        }),
        me: await probe("/v2/me", { method: "GET", headers: { Authorization: "Bearer test" } }),
        // Shaped like the real login step, with made-up values
        code: await probe("/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: "test",
            client_secret: "test",
            code: "test",
            redirect_uri: "https://printcv.me/api/auth/callback/42-school",
          }).toString(),
        }),
      });
    }

    // The older way: PrintCV's server calls 42 through here. Turned off once RELAY_SECRET is set.
    if (setting((env || {}).RELAY_SECRET) || ALLOWED[pathname] !== request.method) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const headers = new Headers();
    for (const name of PASSED_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const res = await fetch(INTRA + pathname, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.text() : undefined,
    });
    const body = await res.text();

    // 42 sent a block page: say so in JSON, so PrintCV's log shows what the page was
    if (!body.trim().startsWith("{")) {
      return Response.json(
        { error: "blocked", error_description: `42 sent the relay a block page on ${pathname}: ${describePage(res, body)}` },
        { status: 502 },
      );
    }

    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
    });
  },
};
