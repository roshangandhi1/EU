/** Haut-Lomami (Africa/Lubumbashi) is UTC+2 all year, with no daylight saving. */
export const PROGRAMME_UTC_OFFSET_HOURS = 2;

/** Today's date in Haut-Lomami as YYYY-MM-DD. Use this everywhere a "today" is shown or defaulted. */
export function todayDrc(now: Date = new Date()): string {
  return new Date(now.getTime() + PROGRAMME_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30 and 2026-13-01). */
export function isRealIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
