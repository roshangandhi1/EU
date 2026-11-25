import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoCongo EU Programme",
  description: "Programme platform for the EU-funded GoCongo programme, Haut-Lomami, DRC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
