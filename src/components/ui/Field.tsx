import type { ReactNode } from "react";
export interface FieldA11y { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: (a11y: FieldA11y) => ReactNode }) {
  const hintId = hint ? `${id}-hint` : undefined; const errId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-app font-medium text-ink">{label}</label>
      {children({ id, "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? true : undefined })}
      {hint && <p id={hintId} className="text-app-sm text-muted">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-app-sm text-bad">{error}</p>}
    </div>
  );
}
