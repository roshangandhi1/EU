/**
 * Payment periods: pure helpers (no database imports) over what lib/periods.ts loads. A period's
 * targets are the units due in that period, not cumulative; milestones add up earlier periods.
 */
import { INDICATORS } from "./indicator-defs";

export type PeriodStatus = "open" | "validated";

export interface PeriodIndicator {
  target: number;
  validated: number | null;
  noteEn: string | null;
  noteFr: string | null;
}

export interface Period {
  n: number;
  startsOn: string;
  endsOn: string;
  status: PeriodStatus;
  tpaFrom: string | null;
  tpaTo: string | null;
  noteEn: string | null;
  noteFr: string | null;
  /** Keyed by indicator code; codes with no row count as 0 due. */
  indicators: Record<string, PeriodIndicator>;
}

const unit = new Map(INDICATORS.map((i) => [i.code, i.unitEur]));
const sumEur = (p: Period, pick: (r: PeriodIndicator) => number | null) =>
  Object.entries(p.indicators).reduce((s, [code, r]) => s + (pick(r) ?? 0) * (unit.get(code) ?? 0), 0);

/** Forecast budget of the period: targets at the Annex III unit rates. */
export const budgetEur = (p: Period) => sumEur(p, (r) => r.target);
/** What the TPA validated, or null if no value has been entered. */
export const validatedEur = (p: Period) => (Object.values(p.indicators).some((r) => r.validated !== null) ? sumEur(p, (r) => r.validated) : null);

/** What a period actually delivered: the validated value once there is one, else its target. */
const delivered = (r: PeriodIndicator | undefined) => (r ? (r.validated ?? r.target) : 0);

/** Cumulative value the TPA closing period `n` should find for `code`. */
export function milestone(periods: Period[], n: number, code: string): number {
  return periods.filter((p) => p.n < n).reduce((s, p) => s + delivered(p.indicators[code]), 0) + (periods.find((p) => p.n === n)?.indicators[code]?.target ?? 0);
}

/** Cumulative value validated by all validated periods. */
export function validatedToDate(periods: Period[], code: string): number {
  return periods.filter((p) => p.status === "validated").reduce((s, p) => s + (p.indicators[code]?.validated ?? 0), 0);
}

/** The latest validated period and the first open one (the next assessment). */
export function pickPeriods(periods: Period[]): { last?: Period; next?: Period } {
  const sorted = [...periods].sort((a, b) => a.n - b.n);
  return { last: sorted.filter((p) => p.status === "validated").at(-1), next: sorted.find((p) => p.status === "open") };
}

export const note = (x: { noteEn: string | null; noteFr: string | null }, locale: string) =>
  (locale === "fr" ? (x.noteFr || x.noteEn) : (x.noteEn || x.noteFr)) || null;
