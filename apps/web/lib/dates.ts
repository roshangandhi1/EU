/** Today's date in Lubumbashi time (UTC+2, no DST), as yyyy-mm-dd. */
export function todayDrc(now = new Date()): string {
  return new Date(now.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
}
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
