/** Plain calendar-date helpers on ISO yyyy-mm-dd strings (UTC, no time zone drift). */
export const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(new Date(toDate(d).getTime() + n * 86_400_000));
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
export function ymd(y: number, m: number, day: number): string {
  // m is 1-12; clamps day to month length (e.g. 31 Feb -> 28/29 Feb)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m - 1, Math.min(day, last))));
}
export function addMonths(y: number, m: number, n: number): [number, number] {
  const idx = y * 12 + (m - 1) + n;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}
