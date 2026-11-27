import { termKindFor, termShort } from "./levels";
import type { AcademicYear, FeeItem, FeePlan, LevelDef, Synced, Term, TermKind } from "./model";

/**
 * Recurring fees (fee plans). A plan generates ordinary fee items, one per period, so each period
 * has its own due amount per pupil and payments are tracked per period by the usual balance rules.
 * Phone-safe (no database code).
 */

/** One period a plan charges for. */
export interface PlanPeriod {
  /** Matches a generated item to its period when a plan is edited. */
  key: string;
  /** Short period label added to the plan name, e.g. "oct. 2026" or "T2". Empty for one-off fees. */
  label: string;
  termId: string | null;
  dueOn: string;
  periodEndsOn: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const monthStart = (iso: string) => iso.slice(0, 7);
const atDay = (ym: string, day: number) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${ym}-${pad(Math.min(day, lastDay(y, m)))}`;
};

/** Month label in the given language, e.g. "Oct 2026" / "oct. 2026". */
export function monthLabel(ym: string, locale: "en" | "fr"): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * The periods a plan charges for within its academic year.
 * - one-time: one item, due on `dueOn`, always charged (no period end);
 * - per year: one item for the year, due on `dueOn` (else the first day of the year);
 * - monthly: every month from the month of `startsOn` to the month of `endsOn`, due on `dueDay` of that month;
 * - per trimester (or semester): every term of the year starting in [startsOn, endsOn], due on
 *   `dueDay` of the term's first month (or its first day), never before the term starts. Pass the
 *   terms of the plan's kind only (see `planTermKind`).
 */
export function planPeriods(
  plan: Pick<FeePlan, "frequency" | "dueDay" | "dueOn" | "startsOn" | "endsOn">,
  year: Pick<AcademicYear, "startsOn" | "endsOn">,
  terms: readonly (Pick<Synced<Term>, "id" | "number" | "startsOn" | "endsOn" | "voidedAt"> & { kind?: TermKind | null })[],
  locale: "en" | "fr" = "fr",
): PlanPeriod[] {
  const from = plan.startsOn > year.startsOn ? plan.startsOn : year.startsOn;
  const to = plan.endsOn < year.endsOn ? plan.endsOn : year.endsOn;
  switch (plan.frequency) {
    case "one_time":
      return [{ key: "once", label: "", termId: null, dueOn: plan.dueOn ?? from, periodEndsOn: null }];
    case "per_year":
      return [{ key: year.endsOn, label: "", termId: null, dueOn: plan.dueOn ?? year.startsOn, periodEndsOn: year.endsOn }];
    case "monthly": {
      const out: PlanPeriod[] = [];
      for (let ym = monthStart(from); ym <= monthStart(to); ym = nextMonth(ym)) {
        const [y, m] = ym.split("-").map(Number) as [number, number];
        const end = `${ym}-${pad(lastDay(y, m))}`;
        out.push({ key: end, label: monthLabel(ym, locale), termId: null, dueOn: atDay(ym, plan.dueDay ?? 1), periodEndsOn: end < year.endsOn ? end : year.endsOn });
      }
      return out;
    }
    case "per_term":
      return terms
        .filter((t) => !t.voidedAt && t.startsOn >= from && t.startsOn <= to)
        .sort((a, b) => a.number - b.number)
        .map((t) => {
          const due = plan.dueDay ? atDay(monthStart(t.startsOn), plan.dueDay) : t.startsOn;
          return { key: t.endsOn, label: termShort(t), termId: t.id, dueOn: due < t.startsOn ? t.startsOn : due, periodEndsOn: t.endsOn };
        });
  }
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/**
 * Whether a plan's levels charge per trimester or per semester: all its levels must agree, else
 * "mixed" (a per-term fee must then be split in two).
 */
export function planTermKind(levels: readonly number[], defs: readonly LevelDef[]): TermKind | "mixed" {
  const kinds = new Set(levels.map((l) => termKindFor(defs, l)));
  return kinds.size > 1 ? "mixed" : ([...kinds][0] ?? "trimester");
}

/** The name a generated item carries: the plan name and its period. */
export const planItemName = (planName: string, p: Pick<PlanPeriod, "label">) => (p.label ? `${planName} · ${p.label}` : planName);

export type PlanOp =
  | { op: "create"; fields: FeeItem }
  | { op: "update"; id: string; fields: Partial<FeeItem> }
  | { op: "void"; id: string };

/**
 * The fee-item changes that bring a plan's items in line with its periods. Items are matched by
 * period, updated in place (so payments that name them stay linked), created for new periods,
 * and voided for periods no longer charged unless a payment or exemption uses them (`inUse`), in
 * which case they are kept and listed in `kept`.
 */
export function planFeePlanItems(
  existing: readonly Synced<FeeItem>[],
  planId: string,
  plan: Pick<FeePlan, "academicYearId" | "name" | "levels" | "amount">,
  periods: readonly PlanPeriod[],
  inUse: (itemId: string) => boolean,
): { ops: PlanOp[]; kept: string[] } {
  const mine = existing.filter((i) => !i.voidedAt && i.planId === planId);
  const keyOf = (i: Synced<FeeItem>) => i.periodEndsOn ?? "once";
  const ops: PlanOp[] = [];
  const used = new Set<string>();
  for (const p of periods) {
    const fields: FeeItem = {
      academicYearId: plan.academicYearId, termId: p.termId, name: planItemName(plan.name, p), levels: [...plan.levels].sort((a, b) => a - b),
      amount: plan.amount, dueOn: p.dueOn, planId, periodEndsOn: p.periodEndsOn,
    };
    const match = mine.find((i) => !used.has(i.id) && keyOf(i) === p.key);
    if (!match) {
      ops.push({ op: "create", fields });
      continue;
    }
    used.add(match.id);
    const changes: Partial<FeeItem> = {};
    for (const k of Object.keys(fields) as (keyof FeeItem)[]) if (JSON.stringify(match[k] ?? null) !== JSON.stringify(fields[k] ?? null)) (changes as Record<string, unknown>)[k] = fields[k];
    if (Object.keys(changes).length) ops.push({ op: "update", id: match.id, fields: changes });
  }
  const kept: string[] = [];
  for (const i of mine) {
    if (used.has(i.id)) continue;
    if (inUse(i.id)) kept.push(i.id);
    else ops.push({ op: "void", id: i.id });
  }
  return { ops, kept };
}
