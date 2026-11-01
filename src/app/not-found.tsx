import Link from "next/link";
import { PrintCVLogo } from "@/components/ui/PrintCVLogo";

export default function NotFound() {
  return (
    <main className="on-ink flex min-h-[100svh] flex-col bg-ink px-4 py-5 text-paper sm:px-8">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 self-start text-step-body font-medium">
        <PrintCVLogo className="h-6 w-6" /> PrintCV
      </Link>
      <div className="mt-[20svh] max-w-[640px] lg:ml-[var(--axis)]">
        <h1 className="overflow-hidden font-display text-head font-medium tracking-display">
          <span className="hero-rise block">We could not find this page</span>
        </h1>
        <p className="mt-4 text-step-body text-muted-on-ink">The link may be old or mistyped.</p>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <Link href="/studio" className="inline-flex h-11 items-center rounded-landing bg-mint px-5 text-step-small font-medium text-ink">Go to my CV</Link>
          <Link href="/" className="inline-flex min-h-11 items-center text-step-body underline underline-offset-4">Home page</Link>
        </div>
      </div>
    </main>
  );
}
