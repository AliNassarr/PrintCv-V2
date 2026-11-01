import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "PrintCV: free CV builder for 42 students";
const description =
  "Make a clean one-page CV from your 42 projects. Log in with 42, write each line in your own words, and download a PDF.";

export const metadata: Metadata = {
  metadataBase: new URL("https://printcv.me"),
  title: { default: title, template: "%s · PrintCV" },
  description,
  icons: { icon: "/icon.png" },
  openGraph: { title, description, url: "/", siteName: "PrintCV", type: "website", locale: "en" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Constant string, no user data: lets CSS know scripts run (landing reveals) */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <link rel="preload" href="/fonts/jost-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
