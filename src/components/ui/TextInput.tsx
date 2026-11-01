import { forwardRef, type InputHTMLAttributes } from "react";
import { cx } from "@/lib/cx";
export const inputClass =
  "w-full rounded-control border border-field bg-paper px-3 text-base text-ink placeholder:text-muted sm:text-app focus:border-ink";
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cx("h-11 sm:h-10", inputClass, className)} {...props} />;
});
