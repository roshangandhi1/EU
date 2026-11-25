import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin", "latin-ext"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  title: { default: "GoCongo · EU Programme", template: "%s · GoCongo EU Programme" },
  description: "Programme platform for the EU-funded GoCongo programme, Haut-Lomami, DRC",
  icons: { icon: "/favicon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e3519" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={interTight.variable}>
      <body>{children}</body>
    </html>
  );
}
