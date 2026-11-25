/** "1 Sep 2026" / "1 sept. 2026": dates in lists read better than raw ISO strings. Dates are calendar days, so format in UTC. */
export function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
