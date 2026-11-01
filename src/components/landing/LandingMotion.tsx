"use client";
import { useEffect } from "react";

// Mounted once on the landing page; it draws nothing.
export function LandingMotion() {
  // Section entrances: show whatever starts inside the first screen at once (a heading on the fold must not sit
  // there invisible), then hide the rest until it scrolls in. When one shows, every one above it shows too: a jump
  // (Page Down, a link) can carry a short heading past the screen without it ever being on it.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        for (const el of els.slice(0, els.indexOf(e.target as HTMLElement) + 1)) { el.classList.add("is-in"); io.unobserve(el); }
      }
    }, { rootMargin: "0px 0px -12% 0px" });
    for (const el of els) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-in");
      else io.observe(el);
    }
    document.documentElement.classList.add("reveal-on");
    return () => io.disconnect();
  }, []);

  return null;
}
