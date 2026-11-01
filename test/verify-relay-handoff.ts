// Checks the relay login end to end with a fake 42: the worker's /callback, the signed handoff,
// and PrintCV's login and relay-finish routes. No network. Run: npx tsx test/verify-relay-handoff.ts
import { NextRequest } from "next/server";
let pass = 0, fail = 0;
const ok = (c: unknown, m: string) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };

const APP = "https://printcv.example.org";
const RELAY = "https://relay.example.org";
const SECRET = "relay-secret-for-tests-only-0123456789";
const env = { APP_URL: APP, FORTY_TWO_CLIENT_ID: "id-test", FORTY_TWO_CLIENT_SECRET: "secret-test", RELAY_SECRET: SECRET };
const ME = { login: "student", displayname: `Sam "O'Neil" <b>&`, email: "student@example.org" };

type Fake = { token?: () => Response; me?: () => Response };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let seen: { tokenBody?: string; auth?: string | null } = {};
function fake42(f: Fake = {}) {
  seen = {};
  (globalThis as any).fetch = async (input: string, init: RequestInit = {}) => {
    const url = String(input);
    if (url === "https://api.intra.42.fr/oauth/token") {
      seen.tokenBody = String(init.body);
      return f.token ? f.token() : json({ access_token: "tok-test" });
    }
    if (url === "https://api.intra.42.fr/v2/me") {
      seen.auth = new Headers(init.headers).get("Authorization");
      return f.me ? f.me() : json(ME);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

function formFields(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const m of html.matchAll(/<input type="hidden" name="(\w+)" value="([^"]*)">/g)) out[m[1]] = unescape(m[2]);
  return out;
}

(async () => {
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const worker = (await import("../relay/cloudflare-worker.js" as string)).default;
  const { readRelayHandoff, signRelayHandoff } = await import("../src/lib/intra/relay-handoff");
  const callback = async (query: string, e: Record<string, string> = env) => {
    console.log = () => {};
    try { return await worker.fetch(new Request(`${RELAY}/callback?${query}`), e); } finally { console.log = realLog; }
  };
  const errorOf = (res: Response) => res.status === 302 ? new URL(res.headers.get("Location") || "").searchParams.get("error") : `status ${res.status}`;

  // The worker's /callback, happy path
  fake42();
  const res = await callback("code=c0de&state=st4te");
  const html = await res.text();
  ok(res.status === 200 && res.headers.get("Content-Type")?.startsWith("text/html"), "callback answers with a page");
  ok(seen.tokenBody?.includes(`redirect_uri=${encodeURIComponent(`${RELAY}/callback`)}`), "token step uses the relay's /callback as redirect_uri");
  ok(seen.tokenBody?.includes("client_id=id-test") && seen.tokenBody?.includes("code=c0de"), "token step sends the client id and the code");
  ok(seen.auth === "Bearer tok-test", "profile step uses the access token");
  ok(!html.includes("tok-test") && !html.includes("secret-test"), "the page holds no token and no client secret");
  ok(html.includes(`action="${APP}/api/auth/42/relay-finish"`), "the page posts to PrintCV's relay-finish");
  ok(res.headers.get("Cache-Control") === "no-store" && res.headers.get("Referrer-Policy") === "no-referrer", "the page is not cached and sends no referrer");
  ok(res.headers.get("Content-Security-Policy")?.includes(`form-action ${APP}`), "the page can only post to APP_URL");
  ok(!/<b>/.test(html), "profile text is escaped in the page");
  const fields = formFields(html);
  ok(fields.state === "st4te" && fields.ts && fields.sig && fields.me, "the page has state, ts, me and sig");
  const read = readRelayHandoff(SECRET, fields);
  ok(read.ok && read.me.login === "student" && read.me.displayname === ME.displayname, "PrintCV accepts the worker's signature and reads the profile");

  // The worker's /callback, failures
  fake42();
  ok(errorOf(await callback("error=access_denied&state=s")) === "cancelled", "42 cancel goes back as cancelled");
  ok(errorOf(await callback("state=s")) === "failed", "no code goes back as failed");
  ok(errorOf(await callback("code=c")) === "failed", "no state goes back as failed");
  ok(errorOf(await callback("code=c&state=s", { ...env, RELAY_SECRET: "short" })) === "setup", "missing relay secret goes back as setup");
  ok(errorOf(await callback("code=c&state=s", { ...env, FORTY_TWO_CLIENT_SECRET: "" })) === "setup", "missing client secret goes back as setup");
  ok((await callback("code=c&state=s", { ...env, APP_URL: "" })).status === 500, "no APP_URL on the relay shows an error, not a redirect");
  ok((await callback("code=c&state=s", { ...env, APP_URL: "http://evil.example.org" })).status === 500, "a plain http APP_URL is refused");
  fake42({ token: () => new Response("<html><title>Just a moment...</title></html>", { status: 403 }) });
  ok(errorOf(await callback("code=c&state=s")) === "unreachable", "a block page goes back as unreachable");
  fake42({ token: () => json({}, 429) });
  ok(errorOf(await callback("code=c&state=s")) === "busy", "429 goes back as busy");
  fake42({ token: () => json({ error: "invalid_grant" }, 400) });
  ok(errorOf(await callback("code=c&state=s")) === "failed", "a refused code goes back as failed");
  fake42({ me: () => json({ id: 1 }) });
  ok(errorOf(await callback("code=c&state=s")) === "profile", "a profile without login goes back as profile");
  const backTo = (await callback("error=x")).headers.get("Location") || "";
  ok(backTo.startsWith(`${APP}/studio?`), "errors go back to APP_URL/studio");
  ok(errorOf(await callback("code=c&state=st4te.1999999999999")) === "failed", "a state with a dot is refused by the worker");
  fake42();
  ok((await callback("code=c&state=st4te", { ...env, RELAY_SECRET: `"${SECRET}"`, APP_URL: ` "${APP}" ` })).status === 200, "the worker strips quotes and spaces from its settings");
  ok((await worker.fetch(new Request(`${RELAY}/anything`), env)).status === 404, "other paths are 404");
  ok((await worker.fetch(new Request(`${RELAY}/v2/me`), env)).status === 404, "the old pass-through is off once RELAY_SECRET is set");
  ok((await worker.fetch(new Request(`${RELAY}/v2/me`), {})).status === 200, "the old pass-through still works without RELAY_SECRET");
  globalThis.fetch = realFetch;

  // The signed handoff
  const now = Date.now();
  const good = { state: "s", ts: String(now), me: JSON.stringify(ME) };
  const signed = { ...good, sig: signRelayHandoff(SECRET, good.state, good.ts, good.me) };
  ok(readRelayHandoff(SECRET, signed, now).ok, "a fresh signed profile is accepted");
  const changed = (r: any) => (r.ok ? "ok" : r.code);
  ok(changed(readRelayHandoff(SECRET, { ...signed, me: JSON.stringify({ login: "someone-else" }) }, now)) === "failed", "a changed profile is refused");
  ok(changed(readRelayHandoff(SECRET, { ...signed, state: "other" }, now)) === "failed", "a changed state is refused");
  ok(changed(readRelayHandoff("another-secret-0123456789-0123456789", signed, now)) === "failed", "a different secret is refused");
  ok(changed(readRelayHandoff(SECRET, signed, now + 6 * 60 * 1000)) === "expired", "a profile older than 5 minutes is refused");
  ok(changed(readRelayHandoff(SECRET, signed, now - 2 * 60 * 1000)) === "expired", "a profile from the future is refused");
  ok(changed(readRelayHandoff(SECRET, { ...signed, sig: "" }, now)) === "failed", "no signature is refused");
  // The reviewer's case: sign state "s.<far future>" and split it differently to pick any ts
  const far = "1999999999999";
  const shifted = { state: "s", ts: `${far}.${good.ts}`, me: good.me, sig: signRelayHandoff(SECRET, `s.${far}`, good.ts, good.me) };
  ok(shifted.sig === signRelayHandoff(SECRET, shifted.state, shifted.ts, shifted.me), "(the shifted fields really do have a valid signature)");
  ok(changed(readRelayHandoff(SECRET, shifted, now)) === "failed", "a signature can't be reused with the fields split differently");
  ok(changed(readRelayHandoff(SECRET, { ...signed, state: "s.x", sig: signRelayHandoff(SECRET, "s.x", good.ts, good.me) }, now)) === "failed", "a state with a dot is refused by PrintCV");
  ok(changed(readRelayHandoff("", signed, now)) === "setup", "no secret on PrintCV means setup");
  const noLogin = { state: "s", ts: String(now), me: "{}" };
  ok(changed(readRelayHandoff(SECRET, { ...noLogin, sig: signRelayHandoff(SECRET, "s", noLogin.ts, "{}") }, now)) === "profile", "a signed profile without login is refused");

  // PrintCV's routes
  Object.assign(process.env, { APP_URL: APP, SESSION_SECRET: "session-secret-for-tests-only-0123456789", FORTY_TWO_CLIENT_ID: "id-test", FORTY_TWO_CLIENT_SECRET: "secret-test" });
  const { getIntraConfig } = await import("../src/lib/intra/oauth");
  delete process.env.FORTY_TWO_API_BASE; delete process.env.RELAY_SECRET;
  ok(getIntraConfig(APP).redirectUri === `${APP}/api/auth/callback/42-school` && !getIntraConfig(APP).relayLogin, "no relay: 42 sends students to PrintCV's callback");
  process.env.FORTY_TWO_API_BASE = RELAY;
  ok(!getIntraConfig(APP).relayLogin, "relay without RELAY_SECRET keeps the direct login");
  console.error = () => {};
  process.env.RELAY_SECRET = "short";
  ok(!getIntraConfig(APP).relayLogin, "a short RELAY_SECRET is ignored");
  process.env.RELAY_SECRET = SECRET;
  ok(getIntraConfig(APP).relayLogin && getIntraConfig(APP).redirectUri === `${RELAY}/callback`, "relay + RELAY_SECRET: 42 sends students to the relay");

  const { GET: login } = await import("../src/app/api/auth/42/login/route");
  const loginRes = await login(new NextRequest(`${APP}/api/auth/42/login`));
  const authorize = new URL(loginRes.headers.get("Location") || "");
  const stateCookie = loginRes.headers.get("set-cookie") || "";
  ok(authorize.searchParams.get("redirect_uri") === `${RELAY}/callback`, "login asks 42 to come back to the relay");
  ok(/SameSite=none/i.test(stateCookie) && /Secure/i.test(stateCookie), "the state cookie can be sent on the relay's cross-site post");
  const state = authorize.searchParams.get("state") || "";

  const { POST: finish } = await import("../src/app/api/auth/42/relay-finish/route");
  const post = (f: Record<string, string>, cookie: string) => {
    const body = new URLSearchParams(f).toString();
    return finish(new NextRequest(`${APP}/api/auth/42/relay-finish`, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie } }));
  };
  const ts = String(Date.now());
  const me = JSON.stringify(ME);
  const handoff = { state, ts, me, sig: signRelayHandoff(SECRET, state, ts, me) };
  const done = await post(handoff, `printcv_oauth_state=${state}`);
  const doneUrl = new URL(done.headers.get("Location") || "");
  const doneCookies = done.headers.get("set-cookie") || "";
  ok(done.status === 303 && doneUrl.origin === APP && doneUrl.pathname === "/studio" && doneUrl.searchParams.get("login"), "a good handoff logs the student in and goes to /studio");
  ok(doneCookies.includes("printcv_session=") && doneCookies.includes("printcv_login_code="), "a good handoff sets the session and the login code");
  const errorAt = async (r: Promise<Response>) => new URL((await r).headers.get("Location") || "").searchParams.get("error");
  ok(await errorAt(post(handoff, "printcv_oauth_state=someone-elses-state")) === "expired", "a handoff for another browser's login is refused");
  ok(await errorAt(post(handoff, "")) === "expired", "a handoff without the state cookie is refused");
  ok(await errorAt(post({ ...handoff, me: JSON.stringify({ login: "admin" }) }, `printcv_oauth_state=${state}`)) === "failed", "a changed profile is refused by the route");
  ok(await errorAt(post({}, `printcv_oauth_state=${state}`)) === "failed", "an empty post is refused");

  console.log(`relay handoff: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
