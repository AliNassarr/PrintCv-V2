import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/cx";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  label: string;
  children: ReactNode;
  testId?: string;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, testId, className, type = "button", ...props }, ref,
) {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} data-test-id={testId}
      className={cx("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink transition-colors duration-150 hover:bg-active sm:h-8 sm:w-8 disabled:text-muted", className)}
      {...props}>
      <span aria-hidden="true" className="inline-flex">{children}</span>
    </button>
  );
});
