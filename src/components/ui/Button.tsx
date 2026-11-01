import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "mint";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  testId?: string;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-[#444444]",
  secondary: "bg-paper text-ink border border-control hover:bg-raised",
  ghost: "bg-transparent text-ink hover:bg-active",
  mint: "bg-mint text-ink hover:bg-paper",
};
// 44px tall under 640px; 32px (sm) or 40px (md) above
const SIZES = { sm: "h-11 sm:h-8 px-3", md: "h-11 sm:h-10 px-4" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", testId, className, type = "button", ...props }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-test-id={testId}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-app font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-active disabled:text-muted",
        VARIANTS[variant], SIZES[size], className,
      )}
      {...props}
    />
  );
});
