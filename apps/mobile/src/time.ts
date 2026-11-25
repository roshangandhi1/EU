/**
 * Dates as the programme means them: the calendar day in Haut-Lomami (UTC+2, Africa/Lubumbashi,
 * no daylight saving), whatever time zone the phone is set to. Every "today" in the app comes
 * from here, so attendance, plantings, visits and payments agree on the date.
 */
export const PROGRAMME_UTC_OFFSET_H = 2;

/** Today in Haut-Lomami as YYYY-MM-DD. */
export function programmeToday(now = new Date()): string {
  return new Date(now.getTime() + PROGRAMME_UTC_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD shifted by whole days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole years between a birth date and a day (both YYYY-MM-DD). */
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [y, m, d] = on.split("-").map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}
