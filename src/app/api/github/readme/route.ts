import { NextRequest, NextResponse } from "next/server";
import { githubReadmeApiUrl, validGitHubRepoParts } from "@/lib/github-public";

export const dynamic = "force-dynamic";
const MAX_README_BYTES = 512 * 1024;
export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") || "";
  const repo = req.nextUrl.searchParams.get("repo") || "";
  const branch = req.nextUrl.searchParams.get("branch") || "main";
  if (!validGitHubRepoParts(owner, repo, branch)) {
    return NextResponse.json({ error: "Invalid GitHub repository reference." }, { status: 400 });
  }
  try {
    // This endpoint requests only README.md via GitHub's Contents API; it never clones or lists repository files.
    const response = await fetch(githubReadmeApiUrl(owner, repo, branch), {
      headers: { Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "PrintCV" },
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return NextResponse.json({ error: "No README.md was found in this repository. You can retry or upload a README manually." }, { status: 404 });
    if (!response.ok) return NextResponse.json({ error: "Could not fetch this README. You can retry or upload it manually." }, { status: 502 });
    if (!response.body) return NextResponse.json({ error: "README.md was empty." }, { status: 422 });
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_README_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "README.md exceeds the 512 KB limit." }, { status: 413 });
      }
      chunks.push(value);
    }
    if (total === 0) return NextResponse.json({ error: "README.md was empty." }, { status: 422 });
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return new NextResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "GitHub is temporarily unavailable. You can retry or upload a README manually." }, { status: 502 }); }
}
