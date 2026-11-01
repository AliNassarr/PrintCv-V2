import { PrintCVLogo } from "@/components/ui/PrintCVLogo";
import { ACTION } from "./frame";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#sample", label: "Sample" },
  { href: "#questions", label: "Questions" },
];

// The nav sits on the hero's cream field. On phones the links fold into a "Menu" (a native
// <details>, so it opens without any script).
export function Masthead() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <nav aria-label="Main" className="flex h-16 items-center gap-4 px-4 md:gap-8 md:px-6 lg:px-8">
        <a href="/" className="mr-auto inline-flex h-11 items-center gap-2 text-step-body font-medium text-ink">
          <PrintCVLogo className="h-6 w-6" />
          PrintCV
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="inline-flex h-11 items-center text-step-small text-ink underline-offset-4 hover:underline">{l.label}</a>
            </li>
          ))}
        </ul>
        <a href="/api/auth/42/login" className={`${ACTION} h-11 px-5 text-step-small`}>
          Log in with 42
        </a>
        <details className="relative md:hidden">
          <summary className="flex h-11 cursor-pointer list-none items-center px-1 text-step-small font-medium text-ink [&::-webkit-details-marker]:hidden">
            Menu
          </summary>
          <ul className="absolute right-0 top-full mt-2 w-48 rounded-card border border-line bg-paper py-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="flex h-11 items-center px-4 text-step-small text-ink hover:bg-stage">{l.label}</a>
              </li>
            ))}
          </ul>
        </details>
      </nav>
    </header>
  );
}
