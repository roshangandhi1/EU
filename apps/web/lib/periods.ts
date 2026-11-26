/** Payment periods and outcome indicators: database reads and admin writes (audited). */
import { auditLog, programmeOutcomes, programmePeriodIndicators, programmePeriods, type Db } from "@eu/db";
import { asc, eq } from "drizzle-orm";
import { INDICATORS } from "./indicator-defs";
import type { Period, PeriodIndicator, PeriodStatus } from "./periods-core";

export * from "./periods-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export type Outcome = typeof programmeOutcomes.$inferSelect;

export async function loadPeriods(db: Db): Promise<Period[]> {
  const d = db as AnyDb;
  const [ps, rows] = await Promise.all([
    d.select().from(programmePeriods).orderBy(asc(programmePeriods.n)),
    d.select().from(programmePeriodIndicators),
  ]);
  return (ps as (typeof programmePeriods.$inferSelect)[]).map((p) => ({
    n: p.n, startsOn: p.startsOn, endsOn: p.endsOn, status: p.status as PeriodStatus,
    tpaFrom: p.tpaFrom, tpaTo: p.tpaTo, noteEn: p.noteEn, noteFr: p.noteFr,
    indicators: Object.fromEntries(
      (rows as (typeof programmePeriodIndicators.$inferSelect)[])
        .filter((r) => r.periodN === p.n)
        .map((r) => [r.code, { target: Number(r.target), validated: r.validated === null ? null : Number(r.validated), noteEn: r.noteEn, noteFr: r.noteFr }]),
    ),
  }));
}

export async function loadOutcomes(db: Db): Promise<Outcome[]> {
  return (db as AnyDb).select().from(programmeOutcomes).orderBy(asc(programmeOutcomes.sort));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export interface PeriodInput {
  n: number;
  startsOn: string;
  endsOn: string;
  status: PeriodStatus;
  tpaFrom: string | null;
  tpaTo: string | null;
  noteEn: string | null;
  noteFr: string | null;
  indicators: Record<string, PeriodIndicator>;
}

export type SaveResult = { ok: true } | { ok: false; reason: "dates" | "number" | "overlap" | "not_found" };

/** Checks a period before saving: ordered dates, no overlap with neighbours, non-negative numbers. */
export function checkPeriod(input: PeriodInput, others: Period[]): SaveResult {
  const dates = [input.startsOn, input.endsOn, input.tpaFrom, input.tpaTo].filter((x): x is string => x !== null);
  if (!dates.every((x) => ISO.test(x)) || input.endsOn < input.startsOn) return { ok: false, reason: "dates" };
  if ((input.tpaFrom && input.tpaTo && input.tpaTo < input.tpaFrom) || (!!input.tpaFrom !== !!input.tpaTo)) return { ok: false, reason: "dates" };
  for (const o of others) if (o.n !== input.n && o.startsOn <= input.endsOn && input.startsOn <= o.endsOn) return { ok: false, reason: "overlap" };
  for (const r of Object.values(input.indicators)) {
    if (!Number.isFinite(r.target) || r.target < 0) return { ok: false, reason: "number" };
    if (r.validated !== null && (!Number.isFinite(r.validated) || r.validated < 0)) return { ok: false, reason: "number" };
  }
  return { ok: true };
}

export async function savePeriod(db: Db, input: PeriodInput, userId: string): Promise<SaveResult> {
  const all = await loadPeriods(db);
  const old = all.find((p) => p.n === input.n);
  if (!old) return { ok: false, reason: "not_found" };
  const check = checkPeriod(input, all);
  if (!check.ok) return check;
  await (db as AnyDb).transaction(async (tx: AnyDb) => {
    await tx.update(programmePeriods).set({
      startsOn: input.startsOn, endsOn: input.endsOn, status: input.status, tpaFrom: input.tpaFrom, tpaTo: input.tpaTo,
      noteEn: input.noteEn, noteFr: input.noteFr, updatedBy: userId, updatedAt: new Date(),
    }).where(eq(programmePeriods.n, input.n));
    for (const def of INDICATORS) {
      const r = input.indicators[def.code] ?? { target: 0, validated: null, noteEn: null, noteFr: null };
      await tx.insert(programmePeriodIndicators).values({ periodN: input.n, code: def.code, ...r })
        .onConflictDoUpdate({ target: [programmePeriodIndicators.periodN, programmePeriodIndicators.code], set: r });
    }
    await tx.insert(auditLog).values({ entity: "platform.period", recordId: String(input.n), scopeId: "platform", op: "update", userId, oldValues: old, newValues: input });
  });
  return { ok: true };
}

/** Adds the next period, starting the day after the last one ends and lasting a year, with no targets yet. */
export async function addPeriod(db: Db, userId: string): Promise<number> {
  const all = await loadPeriods(db);
  const last = all.at(-1);
  const n = (last?.n ?? 0) + 1;
  const startsOn = last ? addDays(last.endsOn, 1) : new Date().toISOString().slice(0, 10);
  const endsOn = addDays(`${Number(startsOn.slice(0, 4)) + 1}${startsOn.slice(4)}`, -1);
  await (db as AnyDb).transaction(async (tx: AnyDb) => {
    await tx.insert(programmePeriods).values({ n, startsOn, endsOn, status: "open", updatedBy: userId });
    await tx.insert(programmePeriodIndicators).values(INDICATORS.map((d) => ({ periodN: n, code: d.code, target: 0 })));
    await tx.insert(auditLog).values({ entity: "platform.period", recordId: String(n), scopeId: "platform", op: "insert", userId, newValues: { n, startsOn, endsOn } });
  });
  return n;
}

export interface OutcomeInput { code: string; targetEn: string; targetFr: string; reportedEn: string | null; reportedFr: string | null; reportedOn: string | null }

export async function saveOutcome(db: Db, input: OutcomeInput, userId: string): Promise<SaveResult> {
  if (input.reportedOn !== null && !ISO.test(input.reportedOn)) return { ok: false, reason: "dates" };
  const [old] = await (db as AnyDb).select().from(programmeOutcomes).where(eq(programmeOutcomes.code, input.code));
  if (!old) return { ok: false, reason: "not_found" };
  const { code, ...set } = input;
  await (db as AnyDb).transaction(async (tx: AnyDb) => {
    await tx.update(programmeOutcomes).set({ ...set, updatedBy: userId, updatedAt: new Date() }).where(eq(programmeOutcomes.code, code));
    await tx.insert(auditLog).values({ entity: "platform.outcome", recordId: code, scopeId: "platform", op: "update", userId, oldValues: old, newValues: input });
  });
  return { ok: true };
}
