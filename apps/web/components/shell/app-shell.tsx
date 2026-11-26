"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EuFlag, Icon } from "@/components/icons";

export interface NavItem { href: string; label: string; icon: string; color?: string; exact?: boolean }
export interface NavGroup { label?: string; items: NavItem[] }

/** Sidebar + main column. The sidebar collapses behind a menu button on narrow screens. */
export function AppShell({ locale, groups, user, labels, children }: {
  locale: string;
  groups: NavGroup[];
  user: { name: string; role: string };
  labels: { brandSub: string; funded: string; signOut: string; password: string; menu: string; close: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const other = locale === "fr" ? "en" : "fr";
  const otherPath = path.replace(new RegExp(`^/${locale}(?=/|$)`), `/${other}`) || `/${other}`;
  const all = groups.flatMap((g) => g.items);
  const active = all
    .filter((i) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  // Switching language keeps the page, its query (selected class, date, filters) and the #section.
  const switchLang = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push(`${otherPath}${window.location.search}${window.location.hash}`);
  };
  const initials = user.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div className="app" data-open={open}>
      <aside className="sidebar" aria-label={labels.nav}>
        <div className="brand">
          <Link href={`/${locale}`} aria-label="GoCongo">
            <Image src="/gocongo-logo-white.png" alt="GoCongo" width={150} height={35} priority />
          </Link>
        </div>
        <div className="brand-sub">{labels.brandSub}</div>
        <nav className="nav">
          {groups.map((g, gi) => (
            <div key={gi} className="nav-group">
              {g.label && <div className="nav-label">{g.label}</div>}
              {g.items.map((i) => (
                <Link key={i.href} href={i.href} aria-current={i.href === active ? "page" : undefined}>
                  <Icon name={i.icon} size={19} />
                  <span>{i.label}</span>
                  {i.color && <span className="dot" style={{ background: i.color }} aria-hidden />}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <span className="avatar" aria-hidden>{initials}</span>
            <div style={{ minWidth: 0 }}>
              <div className="who-name">{user.name}</div>
              <div className="who-role">{user.role}</div>
              <Link className="who-link" href={`/${locale}/password`}><Icon name="lock" size={12} /> {labels.password}</Link>
            </div>
          </div>
          <div className="foot-row">
            <Link href={otherPath} hrefLang={other} lang={other} onClick={switchLang}>
              <Icon name="globe" size={15} /> {other === "fr" ? "Français" : "English"}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = `/${locale}/login`;
              }}
            >
              <Icon name="logout" size={15} /> {labels.signOut}
            </button>
          </div>
          <div className="eu-mark"><EuFlag width={30} /> {labels.funded}</div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden />
      <div className="main">
        <div className="mobilebar">
          <button type="button" onClick={() => setOpen(!open)} aria-label={open ? labels.close : labels.menu} aria-expanded={open}>
            <Icon name="menu" size={24} />
          </button>
          <Image src="/gocongo-logo-white.png" alt="GoCongo" width={120} height={28} />
          <Link href={otherPath} className="lang" style={{ color: "#fff" }} hrefLang={other} lang={other} onClick={switchLang}>{other.toUpperCase()}</Link>
        </div>
        {children}
      </div>
    </div>
  );
}
