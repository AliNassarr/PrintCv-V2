import { NextRequest, NextResponse } from "next/server";
import { githubReposApiUrl, parseGitHubLogin } from "@/lib/github-public";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const login = parseGitHubLogin(req.nextUrl.searchParams.get("profile"));
  if (!login) return NextResponse.json({ error: "Enter a valid github.com/<username> profile URL." }, { status: 400 });
  try {
    const response = await fetch(githubReposApiUrl(login), {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "PrintCV" },
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return NextResponse.json({ error: response.status === 404 ? "GitHub profile not found." : "GitHub could not return repositories. Please retry." }, { status: response.status === 404 ? 404 : 502 });
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) return NextResponse.json({ error: "GitHub returned an unexpected repository list." }, { status: 502 });
    const repositories = rows.filter((r: any) => r && !r.private && typeof r.name === "string" && typeof r.html_url === "string")
      .slice(0, 100).map((r: any) => ({ name: r.name, fullName: String(r.full_name || `${login}/${r.name}`).slice(0, 200), url: r.html_url, description: String(r.description || "").slice(0, 300), language: String(r.language || "").slice(0, 80), defaultBranch: String(r.default_branch || "main").slice(0, 100) }));
    return NextResponse.json({ login, repositories }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "GitHub is temporarily unavailable. Please retry." }, { status: 502 }); }
}
