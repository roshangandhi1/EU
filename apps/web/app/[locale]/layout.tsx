import { notFound } from "next/navigation";
import { isLocale, LOCALES } from "@eu/core/i18n";
// Registers every module's strings (including the "ui" shell namespace) before any page renders.
import "@/lib/registry";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <div lang={locale}>{children}</div>;
}
