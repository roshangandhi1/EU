"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./ui.module.css";

/** Section tabs. The longest matching href is active, so an overview tab can be the section root. */
export function Tabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname() ?? "";
  const active = items
    .filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className={s.tabs}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={[s.tab, i.href === active && s.tabActive].filter(Boolean).join(" ")} aria-current={i.href === active ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
