import type { HTMLAttributes } from "react";
import { cx } from "@/lib/cx";
export type PillTone = "positive" | "negative" | "warning" | "neutral";
const TONES: Record<PillTone, string> = {
  positive: "bg-pill-pos text-pill-pos-ink", negative: "bg-pill-bad text-pill-bad-ink",
  warning: "bg-pill-warn text-pill-warn-ink", neutral: "bg-pill-neutral text-pill-neutral-ink",
};
export function Pill({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: PillTone }) {
  return <span className={cx("inline-flex h-5 flex-none items-center gap-1 whitespace-nowrap rounded-full px-2 text-app-sm font-medium tabular-nums", TONES[tone], className)} {...props} />;
}
