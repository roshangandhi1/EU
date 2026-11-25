import type { SyncMeta } from "./model";

/**
 * The as-at rule.
 *
 * Day-to-day reports count records by device capture time. Evidence exports for an
 * assessor count only records the server had received by the cut-off; records
 * captured before the cut-off but synced after it are returned separately so a
 * reviewer can admit them with a logged reason.
 */
export type AsAtMode = "operational" | "evidence";

export interface AsAtSplit<T> {
  counted: T[];
  /** Captured on or before the cut-off but received by the server after it. */
  lateSynced: T[];
}

const toMs = (iso: string) => Date.parse(iso);

/** A cut-off given as a date means the end of that day in Haut-Lomami time (UTC+2). Pass a full ISO datetime for any other instant. */
export function cutoffInstant(cutoff: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(cutoff) ? toMs(`${cutoff}T23:59:59.999+02:00`) : toMs(cutoff);
}

export function splitAsAt<T extends SyncMeta>(
  records: readonly T[],
  cutoff: string,
  mode: AsAtMode,
  admittedIds: ReadonlySet<string> = new Set(),
): AsAtSplit<T> {
  const limit = cutoffInstant(cutoff);
  const counted: T[] = [];
  const lateSynced: T[] = [];
  for (const r of records) {
    if (r.voidedAt && toMs(r.voidedAt) <= limit) continue;
    const captured = toMs(r.deviceTime) <= limit;
    if (!captured) continue;
    if (mode === "operational") {
      counted.push(r);
      continue;
    }
    const received = r.serverTime !== null && toMs(r.serverTime) <= limit;
    if (received || admittedIds.has(r.id)) counted.push(r);
    else lateSynced.push(r);
  }
  return { counted, lateSynced };
}

/** Records whose device clock is ahead of the server receipt time, or far behind it: worth a look. */
export function clockAnomalies<T extends SyncMeta>(records: readonly T[], maxLagDays = 14): T[] {
  const day = 86_400_000;
  return records.filter((r) => {
    if (!r.serverTime) return false;
    const lag = toMs(r.serverTime) - toMs(r.deviceTime);
    return lag < -5 * 60_000 || lag > maxLagDays * day;
  });
}
