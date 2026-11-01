import type { Metadata, Viewport } from "next";
import StudioClient from "./StudioClient";

export const metadata: Metadata = { title: "Your CV", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#f3f3f3" };

export default function StudioPage() {
  return <StudioClient />;
}
