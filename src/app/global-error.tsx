"use client";
import { useEffect, useState } from "react";
import { downloadSavedDraft, readSavedDraft, startAgain } from "@/lib/draft-rescue";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => setHasDraft(Boolean(readSavedDraft())), []);
  const btn = { height: 44, padding: "0 16px", borderRadius: 6, font: "500 15px Jost, Arial, sans-serif", cursor: "pointer" } as const;
  const plain = { ...btn, background: "#ffffff", color: "#232323", border: "1px solid #d6d6d6" } as const;
  const text = { margin: "8px 0 0", fontSize: 15, lineHeight: "22px", color: "#666666" } as const;
  return (
    <html lang="en">
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body style={{ margin: 0, background: "#f3f3f3", color: "#232323", fontFamily: "Jost, Arial, sans-serif" }}>
        <main style={{ minHeight: "100svh", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 480, background: "#ffffff", border: "1px solid #e6e6e6", borderRadius: 16, padding: 32, boxSizing: "border-box" }}>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: "28px", fontWeight: 500 }}>Something went wrong</h1>
            <p style={text}>Your CV is still saved in this browser.</p>
            <p style={text}>If &quot;Try again&quot; keeps failing, save a copy of your CV. Then start again.</p>
            <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" onClick={() => reset()} style={{ ...btn, background: "#232323", color: "#ffffff", border: "none" }}>Try again</button>
              <button type="button" onClick={() => location.reload()} style={plain}>Reload the page</button>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {hasDraft && <button type="button" onClick={downloadSavedDraft} style={plain}>Save a copy of my CV</button>}
              <button type="button" onClick={startAgain} style={plain}>Start again</button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
