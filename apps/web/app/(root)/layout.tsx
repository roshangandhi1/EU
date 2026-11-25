import type { Metadata, Viewport } from "next";
import { interTight } from "../fonts";
import "../globals.css";

// Root of the bare "/" redirect only; every real page renders under app/[locale]/layout.tsx,
// which sets <html lang> from the URL locale.
export const metadata: Metadata = { title: "GoCongo", icons: { icon: "/favicon.png" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e3519" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={interTight.variable}>
      <body>{children}</body>
    </html>
  );
}
