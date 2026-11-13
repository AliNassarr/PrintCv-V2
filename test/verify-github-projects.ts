import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as reposGet } from "../src/app/api/github/repos/route";
import { GET as readmeGet } from "../src/app/api/github/readme/route";
import { parseGitHubLogin, validGitHubRepoParts, githubReposApiUrl, githubReadmeApiUrl, canRetryReadme } from "../src/lib/github-public";

assert.equal(parseGitHubLogin("https://github.com/octocat"), "octocat");
assert.equal(parseGitHubLogin("github.com/octocat/"), "octocat");
for (const bad of ["https://github.com.evil.test/octocat", "http://github.com/octocat", "https://github.com/a/b", "https://user@github.com/octocat", "https://github.com/%2fetc"]) assert.equal(parseGitHubLogin(bad), null);
assert.equal(validGitHubRepoParts("octocat", "hello-world", "main"), true);
assert.equal(validGitHubRepoParts("octocat/../../evil", "repo", "main"), false);
assert.match(githubReposApiUrl("octocat"), /^https:\/\/api\.github\.com\/users\/octocat\/repos\?/);
assert.match(githubReadmeApiUrl("octocat", "repo", "main"), /^https:\/\/api\.github\.com\/repos\/octocat\/repo\/readme\?/);
assert.equal(canRetryReadme(0), true);
assert.equal(canRetryReadme(1), true);
assert.equal(canRetryReadme(2), true);
assert.equal(canRetryReadme(3), false);
assert.equal(canRetryReadme(-1), false);
async function verifyRoutes() {
const originalFetch = globalThis.fetch;
let requested = "";
globalThis.fetch = (async (input: RequestInfo | URL) => {
  requested = String(input);
  return new Response(JSON.stringify([
    { name: "app", full_name: "octocat/app", html_url: "https://github.com/octocat/app", private: false, fork: false, language: "TypeScript", default_branch: "main" },
    { name: "secret", private: true },
  ]), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
try {
  const repos = await reposGet(new NextRequest("http://localhost/api/github/repos?profile=https%3A%2F%2Fgithub.com%2Foctocat"));
  const repoData = await repos.json();
  assert.equal(repos.status, 200);
  assert.equal(repoData.repositories.length, 1);
  assert.match(requested, /^https:\/\/api\.github\.com\/users\/octocat\/repos/);
  assert.equal(requested.includes("README"), false, "discovery must not fetch repository files");

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested = String(input);
    return new Response("# App\nA student project", { status: 200 });
  }) as typeof fetch;
  const readme = await readmeGet(new NextRequest("http://localhost/api/github/readme?owner=octocat&repo=app&branch=main"));
  assert.equal(await readme.text(), "# App\nA student project");
  assert.match(requested, /\/repos\/octocat\/app\/readme\?ref=main$/);
  assert.equal(requested.includes("git/trees"), false, "README endpoint must not enumerate or fetch other files");
  globalThis.fetch = (async () => new Response("é".repeat(300_000), { status: 200 })) as typeof fetch;
  const oversized = await readmeGet(new NextRequest("http://localhost/api/github/readme?owner=octocat&repo=app&branch=main"));
  assert.equal(oversized.status, 413, "README limit must count UTF-8 bytes, not JavaScript characters");
} finally { globalThis.fetch = originalFetch; }
console.log("GitHub URL validation, fixed-host endpoints, and three-attempt retry limit passed.");

}
verifyRoutes().catch(e => { console.error(e); process.exitCode=1; });

