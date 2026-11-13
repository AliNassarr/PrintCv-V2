"use client";

import { useState } from "react";
import { useCVStore } from "@/lib/store/cv-store";
import { Button } from "@/components/ui/Button";
import { extractReadmeSections } from "@/lib/readme-parser";
import { canRetryReadme } from "@/lib/github-public";
import { validateReadmeFile } from "@/lib/readme-parser";

type Repo = { name: string; fullName: string; url: string; description: string; language: string; defaultBranch: string };
// Section content is conditionally mounted, so keep per-repository retry budgets in module memory.
const retryCounts = new Map<string, number>();

export function GitHubProjectPicker({ onOpenHelper }: { onOpenHelper: (id: string) => void }) {
  const profile = useCVStore(s => s.studentProfile);
  const addProject = useCVStore(s => s.addProjectToCV);
  const [url, setUrl] = useState(profile?.login ? `https://github.com/${profile.login}` : "");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, refreshAttempts] = useState(0);
  const [readmes, setReadmes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [readmeErrors, setReadmeErrors] = useState<Record<string, string>>({});

  async function discover() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/github/repos?profile=${encodeURIComponent(url)}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not load repositories.");
      setRepos(data.repositories);
      if (!data.repositories.length) setError("No public repositories were found for this profile.");
    } catch (e) { setError(e instanceof Error ? e.message : "GitHub is unavailable. Please retry."); }
    finally { setBusy(false); }
  }

  async function fetchReadme(repo: Repo) {
    const key = repo.fullName;
    const retryKey = `${profile?.id ?? "guest"}:${profile?.login ?? "guest"}:${key}`;
    const attempt = retryCounts.get(retryKey) || 0;
    if (!canRetryReadme(attempt)) return;
    retryCounts.set(retryKey, attempt + 1);
    refreshAttempts(v => v + 1);
    setReadmeErrors(v => ({ ...v, [key]: "" }));
    const [owner, name] = key.split("/");
    try {
      const r = await fetch(`/api/github/readme?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&branch=${encodeURIComponent(repo.defaultBranch)}`, { cache: "no-store" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || "README fetch failed."); }
      const text = await r.text();
      retryCounts.delete(retryKey);
      refreshAttempts(v => v + 1);
      setReadmes(v => ({ ...v, [key]: text }));
    } catch (e) { setReadmeErrors(v => ({ ...v, [key]: e instanceof Error ? e.message : "README fetch failed." })); }
  }

  return <section className="rounded-card border border-edge bg-paper p-4" aria-label="GitHub projects">
    <h2 className="font-semibold text-ink">Find your GitHub projects</h2>
    <p className="mt-1 text-app-sm text-muted">We list public repositories and fetch only README.md after you choose to. No code or other files are downloaded.</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="github-profile-url">GitHub profile URL</label>
      <input id="github-profile-url" className="min-h-10 flex-1 rounded-control border border-control px-3" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/username" />
      <Button variant="secondary" disabled={busy || !url.trim()} onClick={discover}>{busy ? "Searching…" : "Find repositories"}</Button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-warn">{error}</p>}
    <div className="mt-3 grid gap-2">
      {repos.map(repo => {
        const key = repo.fullName, retryKey = `${profile?.id ?? "guest"}:${profile?.login ?? "guest"}:${key}`, count = retryCounts.get(retryKey) || 0;
        return <article key={key} className="rounded-control border border-edge p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{repo.name}</strong>{repo.language && <span className="ml-2 text-xs text-muted">{repo.language}</span>}<p className="text-sm text-muted">{repo.description}</p></div>
            <Button variant="secondary" size="sm" aria-pressed={Boolean(selected[key])} onClick={() => { const slug=`github:${key}`; addProject({ name: repo.name, slug, techStack: repo.language, date: "", is42Project: false, bulletPoints: [] }); setSelected(v=>({...v,[key]:true})); }}>Add project</Button>
          </div>
          {!readmes[key] ? <div className="mt-2 flex flex-wrap items-center gap-2"><Button variant="ghost" size="sm" disabled={!selected[key] || count >= 3} onClick={() => fetchReadme(repo)}>{!selected[key] ? "Add project to enable README" : count ? `Retry README (${count}/3)` : "Fetch README.md"}</Button>
            <label className="text-sm underline">Upload README<input className="sr-only" type="file" accept=".md,.markdown,.txt" onChange={async e => { const f=e.target.files?.[0]; if(!f)return; const valid=validateReadmeFile({name:f.name,size:f.size}); if(!valid.valid){setReadmeErrors(v=>({...v,[key]:valid.error||"Invalid README file."}));return;} const text=await f.text(); setReadmes(v=>({...v,[key]:text})); }} /></label>
            {readmeErrors[key] && <span role="alert" className="text-sm text-warn">{readmeErrors[key]} {canRetryReadme(count) ? "Retry or upload a README manually." : "Three attempts used; upload a README manually."}</span>}
          </div> : <details className="mt-2"><summary>README loaded ({readmes[key].length.toLocaleString()} characters) — review before using</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs">{readmes[key].slice(0, 5000)}</pre><Button variant="ghost" size="sm" onClick={() => { const slug=`github:${key}`; addProject({ name: repo.name, slug, techStack: repo.language, date: "", is42Project: false, bulletPoints: [] }); const item=useCVStore.getState().cvData.projects.find(p=>p.slug===slug); if(!item)return; onOpenHelper(item.id); window.setTimeout(()=>window.dispatchEvent(new CustomEvent("printcv:github-readme", { detail: { slug, name: repo.name, text: readmes[key] } })),0); }}>Add project and use README in writing helper</Button></details>}
        </article>;
      })}
    </div>
  </section>;
}



