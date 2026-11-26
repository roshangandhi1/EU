import type { FeeItem, Synced, Term } from "./model";

/** Every level a school can have: primary 1-6, then 7-8 (basic education). */
export const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Column key: a term id, or "year" for whole-year fees. */
export const colKey = (termId: string | null) => termId ?? "year";

export interface FeeGrid {
  /** amount per `${colKey}:${level}`; absent = no fee */
  amounts: Map<string, number>;
  /** due date per colKey */
  dues: Map<string, string>;
}

type Item = Synced<FeeItem>;

/** The grid as it stands for one fee name in one year (voided items ignored). */
export function feeGrid(items: readonly Item[], academicYearId: string, name: string): FeeGrid {
  const amounts = new Map<string, number>();
  const dues = new Map<string, string>();
  for (const i of items) {
    if (i.voidedAt || i.academicYearId !== academicYearId || i.name !== name) continue;
    const c = colKey(i.termId);
    if (!dues.has(c)) dues.set(c, i.dueOn);
    for (const l of i.levels) if (!amounts.has(`${c}:${l}`)) amounts.set(`${c}:${l}`, i.amount);
  }
  return { amounts, dues };
}

/** Fee names used in a year, in a stable order. */
export function feeNames(items: readonly Item[], academicYearId: string): string[] {
  return [...new Set(items.filter((i) => !i.voidedAt && i.academicYearId === academicYearId).map((i) => i.name))].sort((a, b) => a.localeCompare(b));
}

export type FeeOp =
  | { op: "create"; fields: FeeItem }
  | { op: "update"; id: string; fields: Partial<Pick<FeeItem, "levels" | "amount" | "dueOn">> }
  | { op: "void"; id: string };

/**
 * Turn an edited grid into fee-item changes. Existing items are updated in place where
 * possible, so payments and exemptions that point at them keep working; an item whose
 * levels now have different amounts keeps its largest group and the rest become new items.
 * New cells with the same amount in a column share one item.
 */
export function planFeeSchedule(
  existing: readonly Item[],
  academicYearId: string,
  name: string,
  columns: readonly (string | null)[],
  wanted: FeeGrid,
): FeeOp[] {
  const ops: FeeOp[] = [];
  const mine = existing.filter((i) => !i.voidedAt && i.academicYearId === academicYearId && i.name === name);
  // Items in columns not passed in (e.g. a voided term) are left alone.
  for (const termId of columns) {
    const c = colKey(termId);
    const due = wanted.dues.get(c) ?? "";
    const want = (l: number) => wanted.amounts.get(`${c}:${l}`) ?? null;
    const assigned = new Set<number>();
    const toCreate = new Map<number, number[]>(); // amount -> levels
    const queue = (amount: number, l: number) => toCreate.set(amount, [...(toCreate.get(amount) ?? []), l]);

    for (const item of mine.filter((i) => colKey(i.termId) === c).sort((a, b) => b.levels.length - a.levels.length)) {
      const groups = new Map<number, number[]>();
      for (const l of item.levels) {
        const a = assigned.has(l) ? null : want(l);
        if (a !== null) groups.set(a, [...(groups.get(a) ?? []), l]);
      }
      if (groups.size === 0) {
        ops.push({ op: "void", id: item.id });
        continue;
      }
      const [keepAmount, keepLevels] = [...groups].sort(
        ([a1, l1], [a2, l2]) => l2.length - l1.length || Number(a2 === item.amount) - Number(a1 === item.amount),
      )[0]!;
      for (const [a, ls] of groups) if (a !== keepAmount) ls.forEach((l) => queue(a, l));
      const levels = [...keepLevels].sort((x, y) => x - y);
      for (const l of item.levels) assigned.add(l);
      const fields: Partial<Pick<FeeItem, "levels" | "amount" | "dueOn">> = {};
      if (levels.join() !== [...item.levels].sort((x, y) => x - y).join()) fields.levels = levels;
      if (keepAmount !== item.amount) fields.amount = keepAmount;
      if (due && due !== item.dueOn) fields.dueOn = due;
      if (Object.keys(fields).length) ops.push({ op: "update", id: item.id, fields });
    }
    for (const l of LEVELS) {
      const a = want(l);
      if (a !== null && !assigned.has(l)) queue(a, l);
    }
    for (const [amount, levels] of toCreate) {
      ops.push({ op: "create", fields: { academicYearId, termId, name, levels: [...levels].sort((x, y) => x - y), amount, dueOn: due } });
    }
  }
  return ops;
}

/** Days between two ISO dates (b - a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface CopyPlan {
  creates: FeeItem[];
  /** names skipped because the target year already has them */
  skippedNames: string[];
  /** items skipped because the target year has no term with that number */
  skippedNoTerm: number;
}

/**
 * Copy a year's fee structure into another year, at this school or another one.
 * Terms are matched by number; due dates move by the gap between the two years' start dates.
 * Fee names the target year already uses are skipped, never merged.
 */
export function planFeeCopy(
  source: { items: readonly Item[]; terms: readonly Synced<Term>[]; yearId: string; yearStart: string },
  target: { items: readonly Item[]; terms: readonly Synced<Term>[]; yearId: string; yearStart: string },
): CopyPlan {
  const shift = dayDiff(source.yearStart, target.yearStart);
  const taken = new Set(feeNames(target.items, target.yearId));
  const termNo = new Map(source.terms.filter((t) => !t.voidedAt).map((t) => [t.id, t.number]));
  const targetTerm = new Map(target.terms.filter((t) => !t.voidedAt && t.academicYearId === target.yearId).map((t) => [t.number, t.id]));
  const plan: CopyPlan = { creates: [], skippedNames: [], skippedNoTerm: 0 };
  for (const i of source.items) {
    if (i.voidedAt || i.academicYearId !== source.yearId) continue;
    if (taken.has(i.name)) {
      if (!plan.skippedNames.includes(i.name)) plan.skippedNames.push(i.name);
      continue;
    }
    let termId: string | null = null;
    if (i.termId) {
      const no = termNo.get(i.termId);
      termId = no === undefined ? null : (targetTerm.get(no) ?? null);
      if (!termId) {
        plan.skippedNoTerm += 1;
        continue;
      }
    }
    plan.creates.push({ academicYearId: target.yearId, termId, name: i.name, levels: [...i.levels], amount: i.amount, dueOn: addDays(i.dueOn, shift) });
  }
  return plan;
}

/**
 * Terms the target year lacks for a copy: source terms that fees use, by number,
 * with dates moved by the gap between the years. Create these before copying.
 */
export function missingTermsForCopy(
  source: { items: readonly Item[]; terms: readonly Synced<Term>[]; yearId: string; yearStart: string },
  target: { terms: readonly Synced<Term>[]; yearId: string; yearStart: string },
): Term[] {
  const shift = dayDiff(source.yearStart, target.yearStart);
  const have = new Set(target.terms.filter((t) => !t.voidedAt && t.academicYearId === target.yearId).map((t) => t.number));
  const used = new Set(source.items.filter((i) => !i.voidedAt && i.academicYearId === source.yearId && i.termId).map((i) => i.termId));
  return source.terms
    .filter((t) => !t.voidedAt && used.has(t.id) && !have.has(t.number))
    .sort((a, b) => a.number - b.number)
    .map((t) => ({ academicYearId: target.yearId, number: t.number, startsOn: addDays(t.startsOn, shift), endsOn: addDays(t.endsOn, shift) }));
}
