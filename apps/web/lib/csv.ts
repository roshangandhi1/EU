/**
 * CSV for spreadsheets (SEC-9, I18N-8): every cell quoted; text that a spreadsheet would run as a
 * formula (starting with = + - @, a tab or a carriage return) is prefixed with an apostrophe; a
 * UTF-8 BOM so Excel keeps accents; and ";" between columns for French, which is what
 * French-locale Excel expects.
 */
export type CsvLocale = "en" | "fr";

export function csvLocale(v: string | null | undefined): CsvLocale {
  return v === "fr" ? "fr" : "en";
}

export function csvCell(v: unknown): string {
  if (v == null) return '""';
  if (typeof v === "number" || typeof v === "boolean") return `"${String(v)}"`;
  const s = v instanceof Date ? v.toISOString() : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly unknown[])[], locale: CsvLocale): string {
  const sep = locale === "fr" ? ";" : ",";
  return "﻿" + rows.map((r) => r.map(csvCell).join(sep)).join("\r\n") + "\r\n";
}

/** "yes" / "oui" for flags, empty otherwise. */
export const yes = (on: unknown, locale: CsvLocale) => (on ? (locale === "fr" ? "oui" : "yes") : "");
