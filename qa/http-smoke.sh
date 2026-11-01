#!/usr/bin/env bash
# Runtime checks of routes. Needs next start on :3100.
B=${BASE:-http://localhost:3100}; fail=0
loc() { curl -s -o /dev/null -w "%{redirect_url}" "$B$1"; }
code() { curl -s -o /dev/null -w "%{http_code}" "$B$1"; }
expect() { if [[ "$2" == *"$3"* ]]; then echo "ok   $1"; else echo "FAIL $1 -> $2 (want $3)"; fail=1; fi; }
expect "/?step=EDITOR"      "$(loc '/?step=EDITOR')"      "/studio?step=EDITOR"
expect "/?login=abc"        "$(loc '/?login=abc')"        "/studio?login=abc"
expect "/?error=expired"    "$(loc '/?error=expired')"    "/studio?error=expired"
expect "callback cancelled" "$(loc '/api/auth/callback/42-school?error=access_denied')" "/studio?error=cancelled"
L=$(loc '/api/auth/42/login'); if [[ "$L" == *"/studio?error=setup"* || "$L" == *"/oauth/authorize"* ]]; then echo "ok   login"; else echo "FAIL login -> $L"; fail=1; fi
[[ "$L" == *"/oauth/authorize"* ]] && expect "redirect_uri" "$L" "callback%2F42-school"
expect "session" "$(curl -s $B/api/auth/session)" '"authenticated":false'
expect "/nope 404" "$(code /nope)" "404"
expect "/ 200" "$(code /)" "200"
expect "/studio 200" "$(code /studio)" "200"
expect "studio noindex" "$(curl -s $B/studio)" 'name="robots" content="noindex'
expect "robots" "$(curl -s $B/robots.txt)" "Disallow: /api/"
exit $fail
