import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { t, type Locale } from "@eu/core/i18n";
import { EuFlag, Icon } from "@/components/icons";

const otherOf = (l: Locale): Locale => (l === "fr" ? "en" : "fr");

/** Split sign-in layout: programme panel on the left, the form on the right. */
export function AuthLayout({ locale, path, children }: { locale: Locale; path: string; children: ReactNode }) {
  const other = otherOf(locale);
  const u = (k: string) => t(locale, `ui.${k}`);
  return (
    <div className="auth">
      <div className="auth-hero">
        <Image src="/gocongo-logo-white.png" alt="GoCongo" width={180} height={42} priority />
        <div>
          <h1>{u("auth.title")}</h1>
          <p>{u("auth.body")}</p>
        </div>
        <div className="auth-streams" aria-hidden>
          <span><Icon name="school" />{u("nav.schools")}</span>
          <span><Icon name="drop" />{u("nav.boreholes")}</span>
          <span><Icon name="bamboo" />{u("nav.bamboo")}</span>
          <span><Icon name="tree" />{u("nav.miombo")}</span>
        </div>
        <div className="eu-inline"><EuFlag width={42} /> {t(locale, "common.fundedByEu")}</div>
      </div>
      <div className="auth-panel">
        <div className="auth-top">
          <span />
          <Link className="lang" href={`/${other}/${path}`} hrefLang={other}>{other === "fr" ? "Français" : "English"}</Link>
        </div>
        <div className="card">{children}</div>
      </div>
    </div>
  );
}

/** Top bar and EU band for public pages (the public map). */
export function PublicChrome({ locale, path, children }: { locale: Locale; path: string; children: ReactNode }) {
  const other = otherOf(locale);
  return (
    <div className="shell">
      <header className="topbar">
        <Link href={`/${locale}`} aria-label="GoCongo"><Image src="/gocongo-logo.png" alt="GoCongo" width={132} height={44} priority /></Link>
        <nav>
          <Link className="lang" href={`/${other}/${path}`} hrefLang={other}>{other.toUpperCase()}</Link>
          <Link className="btn secondary sm" href={`/${locale}/login`}>{t(locale, "common.signIn")}</Link>
        </nav>
      </header>
      <main className="content">{children}</main>
      <footer className="eu-band"><EuFlag width={36} /> {t(locale, "common.fundedByEu")}</footer>
    </div>
  );
}
