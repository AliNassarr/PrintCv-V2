import { cx } from "@/lib/cx";
export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 items-center gap-2 text-app text-ink sm:min-h-8">
      <span aria-hidden="true" className={cx("relative h-5 w-8 rounded-full border transition-colors duration-150", checked ? "border-ink bg-ink" : "border-field bg-paper")}>
        <span className={cx("absolute left-0 top-0.5 h-3.5 w-3.5 rounded-full transition-transform duration-150", checked ? "translate-x-3.5 bg-paper" : "translate-x-0.5 bg-field")} />
      </span>
      {label}
    </button>
  );
}
