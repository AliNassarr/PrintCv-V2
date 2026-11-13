const PART = /^[A-Za-z0-9_.-]{1,100}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function parseGitHubLogin(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 300) return null;
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.port || url.username || url.password) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.length === 1 && LOGIN.test(parts[0]) ? parts[0] : null;
  } catch { return null; }
}

export function validGitHubRepoParts(owner: unknown, repo: unknown, branch: unknown): owner is string {
  const validBranch = typeof branch === "string" && branch.length <= 200 && branch.split("/").every(part => PART.test(part) && part !== "." && part !== "..");
  return typeof owner === "string" && typeof repo === "string" && validBranch &&
    PART.test(owner) && PART.test(repo) && owner !== "." && owner !== ".." && repo !== "." && repo !== "..";
}

export function githubReposApiUrl(login: string): string {
  return `https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&per_page=100`;
}

export function githubReadmeApiUrl(owner: string, repo: string, branch: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme?ref=${encodeURIComponent(branch)}`;
}

export function canRetryReadme(attempts: number): boolean {
  return Number.isInteger(attempts) && attempts >= 0 && attempts < 3;
}
