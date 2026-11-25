import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { isLocale, LOCALES, t } from "@eu/core/i18n";
// Registers every module's strings (including the "ui" shell namespace) before any page renders.
import "@/lib/registry";
import { interTight } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}
// Only /fr and /en exist; anything else 404s at routing.
export const dynamicParams = false;

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e3519" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "fr";
  const app = t(l, "ui.meta.app");
  return {
    title: { default: app, template: `%s · ${app}` },
    description: t(l, "ui.meta.description"),
    icons: { icon: "/favicon.png" },
  };
}

/** Root layout of every page: <html lang> follows the URL locale. */
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} className={interTight.variable}>
      <body>{children}</body>
    </html>
  );
}
