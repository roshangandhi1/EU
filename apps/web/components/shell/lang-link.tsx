"use client";
import Link from "next/link";
import type { ReactNode } from "react";

/** Language switch for public pages: keeps the query string (e.g. a setup token) and the hash. */
export function LangLink({ href, hrefLang, className, children }: { href: string; hrefLang: string; className?: string; children: ReactNode }) {
  return (
    <Link className={className} href={href} hrefLang={hrefLang}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.location.assign(href + window.location.search + window.location.hash);
      }}>
      {children}
    </Link>
  );
}
