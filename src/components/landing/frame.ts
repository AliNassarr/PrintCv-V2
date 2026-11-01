// One frame for the whole landing page: the same margins, the same 12-column grid and the same heading
// in every section, so text blocks start on grid columns. GRID splits at 1024; the short
// closing blocks (FAQ, CTA, footer) already split at 768, since their columns stay wide enough there.
export const WRAP = "px-4 md:px-6 lg:px-8";
export const GRID = "grid grid-cols-1 gap-x-6 lg:grid-cols-12";
// Section rhythm: 96px between sections on phones, 160px at 768, 192px from 1024 up
export const SECTION = "py-12 md:py-20 lg:py-24";
// One sans family everywhere; headings stay at the regular weight with slightly tighter letters
export const HEADING = "text-head font-normal tracking-display";
// The space between a section heading and what it opens
export const AFTER_HEADING = "mt-10 lg:mt-14";
// The page is light cream; every picture sits on a slightly darker panel with a thin line round it,
// so the white editor pieces stand out without any shadow
export const PAGE = "bg-canvas";
export const STAGE = "rounded-xl border border-line bg-stage";
// The orange action button: dark text on orange (5.0:1); on hover it turns ink with cream text
export const ACTION = "inline-flex items-center rounded-landing bg-accent font-medium text-ink transition-colors duration-150 hover:bg-ink hover:text-canvas";
// The four steps from login to PDF, each with its own soft colour. The hero's demo and the workflow use the same ones.
export const FLOW = [
  { label: "Log in", tone: "bg-flow-1" },
  { label: "Pick", tone: "bg-flow-2" },
  { label: "Write", tone: "bg-flow-3" },
  { label: "Download", tone: "bg-flow-4" },
] as const;
