import type { Viewport } from "next";
import { Masthead } from "@/components/landing/Masthead";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Showcase } from "@/components/landing/Showcase";
import { Facts } from "@/components/landing/Facts";
import { Faq } from "@/components/landing/Faq";
import { Cta } from "@/components/landing/Cta";
import { Footer } from "@/components/landing/Footer";
import { LandingMotion } from "@/components/landing/LandingMotion";

export const viewport: Viewport = { themeColor: "#f7f7f4" };

export default function Home() {
  // .lp switches on the landing colours (globals.css); the editor keeps its own
  return (
    <div className="lp bg-canvas text-ink">
      <a href="#main" className="sr-only-focusable fixed left-4 top-4 z-50 rounded-landing bg-accent px-4 py-3 text-step-small font-medium text-ink">Skip to the main content</a>
      <Masthead />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Showcase />
        <Facts />
        <Faq />
        <Cta />
      </main>
      <Footer />
      <LandingMotion />
    </div>
  );
}
