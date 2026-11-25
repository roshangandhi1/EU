/**
 * Locale-aware display helpers shared by the web pages (no server-only imports, so client
 * components can use them too). Calendar dates read "16 nov. 2026" / "16 Nov 2026", matching the
 * schools pages; numbers use French or British grouping and decimal separators.
 */
import { t, type Locale } from "@eu/core/i18n";

export const intlLocale = (locale: string) => (locale === "fr" ? "fr-FR" : "en-GB");

/** A calendar day (yyyy-mm-dd, or a Date) as "16 nov. 2026". Calendar days are formatted in UTC so they never shift. */
export function fmtDate(value: string | Date | null | undefined, locale: string, fallback = "—"): string {
  if (!value) return fallback;
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : fallback;
  return d.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: typeof value === "string" ? "UTC" : "Africa/Lubumbashi" });
}

/** A number with the locale's grouping and decimal separator ("1 250,5" / "1,250.5"). */
export function fmtNum(n: number | null | undefined, locale: string, maxDecimals = 0, fallback = "—"): string {
  if (n === null || n === undefined || Number.isNaN(n)) return fallback;
  return n.toLocaleString(intlLocale(locale), { maximumFractionDigits: maxDecimals });
}

/** Euros with the symbol: "39 600 €" / "€39,600". */
export function fmtEur(n: number, locale: string): string {
  return n.toLocaleString(intlLocale(locale), { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

/**
 * Plural-aware translation: uses `<key>_one` when the locale's plural rule says "one" for n and
 * that string exists, otherwise `<key>`. French treats 0 and 1 as singular. `{n}` is filled in
 * (formatted for the locale) along with any other vars.
 */
export function tn(locale: Locale, key: string, n: number, vars: Record<string, string | number> = {}): string {
  const all = { n: fmtNum(n, locale, 2), ...vars };
  if (new Intl.PluralRules(intlLocale(locale)).select(n) === "one") {
    const one = t(locale, `${key}_one`, all);
    if (one !== `${key}_one`) return one;
  }
  return t(locale, key, all);
}

/** Plural helper for client components, which receive both forms as plain strings. */
export function plural(locale: string, n: number, forms: { one: string; other: string }, vars: Record<string, string | number> = {}): string {
  const s = new Intl.PluralRules(intlLocale(locale)).select(n) === "one" ? forms.one : forms.other;
  const all: Record<string, string | number> = { n: fmtNum(n, locale, 2), ...vars };
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in all ? String(all[k]) : m));
}

/**
 * Parses a decimal typed the French or English way: "2,2", "2.2", "-7,912", " 24.371 ".
 * Returns null for an empty value and NaN for anything that is not a plain decimal number.
 */
export function parseDecimal(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim().replace(/\s/g, "").replace(/\u2212/g, "-");
  if (s === "") return null;
  if (!/^[-+]?\d+([.,]\d+)?$/.test(s)) return NaN;
  return Number(s.replace(",", "."));
}

/** CSV text for spreadsheets: French Excel expects ";" and needs a BOM to read accents. */
export function toCsv(rows: (string | number | null | undefined)[][], locale: string): string {
  const sep = locale === "fr" ? ";" : ",";
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : typeof v === "number" ? (locale === "fr" ? String(v).replace(".", ",") : String(v)) : v;
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(sep)).join("\r\n") + "\r\n";
}
