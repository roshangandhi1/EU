import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, t, LOCALES } from "@eu/core/i18n";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const other = locale === "fr" ? "en" : "fr";
  return (
    <div lang={locale} className="shell">
      <header className="topbar">
        <Link href={`/${locale}`} aria-label="GoCongo">
          <Image src="/gocongo-logo.png" alt="GoCongo" width={132} height={44} priority />
        </Link>
        <Link className="lang" href={`/${other}`} hrefLang={other}>
          {other.toUpperCase()}
        </Link>
      </header>
      <main className="content">{children}</main>
      <footer className="eu-band">{t(locale, "common.fundedByEu")}</footer>
    </div>
  );
}
