import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ["./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: v("paper"), ground: v("ground"), ink: v("ink"), muted: v("muted"), "muted-on-ink": v("muted-on-ink"),
        canvas: v("canvas"), stage: v("stage"), "stage-hover": v("stage-hover"), pane: v("pane"), line: v("line"), "line-strong": v("line-strong"),
        accent: v("accent"), flow: { 1: v("flow-1"), 2: v("flow-2"), 3: v("flow-3"), 4: v("flow-4") }, mint: v("mint"), data: v("data"), positive: v("positive"), bad: v("bad"), warn: v("warn"),
        raised: v("raised"), active: v("active"), edge: v("edge"), rule: v("rule"), control: v("control"), field: v("field"), bar: v("bar"),
        pill: {
          pos: v("pill-pos"), "pos-ink": v("pill-pos-ink"), bad: v("pill-bad"), "bad-ink": v("pill-bad-ink"),
          warn: v("pill-warn"), "warn-ink": v("pill-warn-ink"), neutral: v("pill-neutral"), "neutral-ink": v("pill-neutral-ink"),
        },
      },
      fontFamily: {
        sans: ["Jost", '"Jost Fallback"', "system-ui", '"Segoe UI"', "Arial", "sans-serif"],
        display: ['"Bodoni Moda"', '"Bodoni Moda Fallback"', "Didot", "Georgia", "serif"],
      },
      fontSize: {
        // landing: exactly five steps (§3). No other landing size exists.
        "step-small": ["14px", { lineHeight: "1.5" }],
        "step-body": ["18px", { lineHeight: "1.6" }],
        "step-lead": ["clamp(22px, 2vw, 30px)", { lineHeight: "1.3" }],
        head: ["clamp(40px, 3.9vw, 60px)", { lineHeight: "1.08" }],
        // the hero headline only: the largest type on the page
        display: ["clamp(44px, 4.9vw, 88px)", { lineHeight: "1.04" }],
        // studio
        "app-sm": ["12px", { lineHeight: "16px" }],
        app: ["15px", { lineHeight: "22px" }],
        "app-md": ["17px", { lineHeight: "24px" }],
        "app-title": ["22px", { lineHeight: "28px", fontWeight: "500" }],
        "app-kpi": ["28px", { lineHeight: "34px" }],
      },
      letterSpacing: { text: "0.01em", display: "-0.02em", hero: "-0.03em" },
      borderRadius: { sheet: "16px", card: "8px", control: "6px", landing: v("radius-landing") },
      boxShadow: { overlay: v("shadow-overlay") },
      animation: { fade: "fade 150ms ease-out both", "fade-slow": "fade 200ms ease-out both" },
    },
  },
  plugins: [],
};
export default config;
