/** "1 Sep 2026" / "1 sept. 2026": dates in lists read better than raw ISO strings. Dates are calendar days, so format in UTC. */
export function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "25 nov. 2026, 14:05" in Haut-Lomami time (UTC+2), for server and device timestamps. */
export function fmtDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" });
}

/** "novembre 2026" / "November 2026" for a YYYY-MM month. */
export function fmtMonth(month: string, locale: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
