import { todayDrc } from "@eu/core";
import type { AcademicYear, Enrolment, Exemption, FeeItem, Payment, ReceiptBook, SchoolClass, Synced } from "./model";

/** Amount a student owes for one fee item after exemptions (CDF, whole francs). */
export function chargeFor(item: Pick<FeeItem, "amount">, itemId: string, exemptions: readonly Exemption[]): number {
  let due = item.amount;
  const applicable = exemptions.filter((e) => e.feeItemId === null || e.feeItemId === itemId);
  for (const e of applicable) {
    if (e.kind === "full") return 0;
    if (e.kind === "percent") due -= Math.round((item.amount * Math.min(e.value, 100)) / 100);
    if (e.kind === "fixed") due -= e.value;
  }
  return Math.max(0, due);
}

export interface ItemLine {
  feeItemId: string;
  name: string;
  dueOn: string;
  charged: number;
  paid: number;
  outstanding: number;
}

export interface StudentBalance {
  studentId: string;
  charged: number;
  paid: number;
  /** Positive = owes; negative = credit. */
  balance: number;
  lines: ItemLine[];
  /** Outstanding on items whose due date has passed as at the given date. */
  overdue: number;
}

/** An academic year as the balance rules need it. */
export type YearRange = Pick<AcademicYear, "startsOn" | "endsOn"> & { id: string; voidedAt?: string | null };

/**
 * Which academic year a date belongs to: the live year containing it, else the next one to start
 * after it (a payment or exemption made in the holidays counts for the coming year), else the
 * latest year that ended before it.
 */
export function yearOfDate(years: readonly YearRange[], date: string): string | undefined {
  const live = years.filter((y) => !y.voidedAt).sort((a, b) => (a.startsOn < b.startsOn ? -1 : 1));
  return (
    live.filter((y) => y.startsOn <= date && date <= y.endsOn).at(-1)?.id ??
    live.find((y) => y.startsOn > date)?.id ??
    live.filter((y) => y.endsOn < date).at(-1)?.id
  );
}

/** Restricts a balance to one academic year (DATA-4/EDGE-3). */
export interface BalanceYear {
  /** The year of the enrolment (class) being billed: only that year's fee items are charged. */
  academicYearId: string;
  /** The school's years, to place unallocated payments and "all items" exemptions in a year. */
  years?: readonly YearRange[];
  /**
   * When the pupil enrolled: items for a period that ended before this day (a past month or
   * trimester) are not charged. Items with no period end (one-off fees) always are.
   */
  enrolledOn?: string;
}

/**
 * Balance for one student as at a date. Payments are allocated to the items they
 * name, in order, then to the oldest outstanding items; anything left is credit.
 * Voided payments are ignored.
 *
 * Pass `year` (always, in screens): then only that year's fee items are charged, only payments
 * belonging to that year count (those naming one of its items, or unallocated ones paid during it),
 * and an "all items" exemption applies only in the year it was granted. Without `year`, every
 * item for the level is charged (the old behaviour, kept for callers not yet updated).
 */
export function studentBalance(
  studentId: string,
  level: number,
  items: readonly Synced<FeeItem>[],
  exemptions: readonly Synced<Exemption>[],
  payments: readonly Synced<Payment>[],
  asAt: string,
  year?: BalanceYear,
): StudentBalance {
  const itemYear = new Map(items.map((i) => [i.id, i.academicYearId]));
  const inYear = (yearId: string | undefined) => !year || yearId === year.academicYearId;
  const mine = exemptions.filter((e) => {
    if (e.voidedAt || e.studentId !== studentId) return false;
    if (!year || e.feeItemId !== null) return true; // item-specific: applies only where that item is charged
    if (!year.years) return true;
    return inYear(yearOfDate(year.years, todayDrc(new Date(e.deviceTime))));
  });
  const lines: ItemLine[] = items
    .filter((i) => !i.voidedAt && i.levels.includes(level) && inYear(i.academicYearId))
    .filter((i) => !(year?.enrolledOn && i.periodEndsOn && i.periodEndsOn < year.enrolledOn))
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
    .map((i) => {
      const charged = chargeFor(i, i.id, mine);
      return { feeItemId: i.id, name: i.name, dueOn: i.dueOn, charged, paid: 0, outstanding: charged };
    });
  const byId = new Map(lines.map((l) => [l.feeItemId, l]));
  const paymentYear = (p: Synced<Payment>): string | undefined => {
    const named = p.feeItemIds.map((fid) => itemYear.get(fid)).find((y) => y !== undefined);
    if (named) return named;
    return year?.years ? yearOfDate(year.years, p.paidOn) : year?.academicYearId;
  };
  const paidTotal = { n: 0 };
  const pays = payments
    .filter((p) => !p.voidedAt && p.studentId === studentId && p.paidOn <= asAt && inYear(paymentYear(p)))
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : (a.receiptCode ?? "").localeCompare(b.receiptCode ?? "") || (a.receiptNumber ?? 0) - (b.receiptNumber ?? 0)));
  for (const p of pays) {
    paidTotal.n += p.amount;
    let left = p.amount;
    const named = p.feeItemIds.map((fid) => byId.get(fid)).filter((l): l is ItemLine => !!l);
    for (const l of [...named, ...lines]) {
      if (left === 0) break;
      const take = Math.min(left, l.outstanding);
      l.paid += take;
      l.outstanding -= take;
      left -= take;
    }
  }
  const charged = lines.reduce((n, l) => n + l.charged, 0);
  return {
    studentId,
    charged,
    paid: paidTotal.n,
    balance: charged - paidTotal.n,
    lines,
    overdue: lines.filter((l) => l.dueOn < asAt).reduce((n, l) => n + l.outstanding, 0),
  };
}

/**
 * The balance for one enrolment, billed for its class's level and academic year.
 * Screens should use this: `enrolmentBalance(d, e, date)` with `d` from loadSchool (or the phone's data).
 */
export function enrolmentBalance(
  d: {
    classes: readonly Synced<SchoolClass>[];
    years: readonly Synced<AcademicYear>[];
    feeItems: readonly Synced<FeeItem>[];
    exemptions: readonly Synced<Exemption>[];
    payments: readonly Synced<Payment>[];
  },
  e: Pick<Enrolment, "studentId" | "classId" | "academicYearId"> & Partial<Pick<Enrolment, "enrolledOn">>,
  asAt: string,
): StudentBalance {
  const cls = d.classes.find((c) => c.id === e.classId);
  return studentBalance(e.studentId, cls?.level ?? 0, d.feeItems, d.exemptions, d.payments, asAt, {
    academicYearId: cls?.academicYearId ?? e.academicYearId,
    years: d.years,
    enrolledOn: e.enrolledOn,
  });
}

export type ReceiptProblem = "not_in_assigned_book" | "already_used" | null;

/**
 * Check a paper receipt number before saving a payment: it must fall in a receipt
 * book assigned to the user, and must not already be used by a non-voided payment.
 */
export function checkReceiptNumber(
  receiptNumber: number,
  userId: string,
  books: readonly Synced<ReceiptBook>[],
  payments: readonly Synced<Payment>[],
): ReceiptProblem {
  const inBook = books.some(
    (b) => !b.voidedAt && b.assignedTo === userId && receiptNumber >= b.firstNumber && receiptNumber <= b.lastNumber,
  );
  if (!inBook) return "not_in_assigned_book";
  if (payments.some((p) => !p.voidedAt && p.receiptNumber === receiptNumber)) return "already_used";
  return null;
}

/** Same paper receipt number on two non-voided payments: possible after two devices sync. */
export function duplicateReceipts(payments: readonly Synced<Payment>[]): Map<number, string[]> {
  const seen = new Map<number, string[]>();
  for (const p of payments) {
    if (p.voidedAt || p.receiptNumber === null) continue;
    seen.set(p.receiptNumber, [...(seen.get(p.receiptNumber) ?? []), p.id]);
  }
  return new Map([...seen].filter(([, ids]) => ids.length > 1));
}

/** Cash collected per day, for reconciliation against the cash box. */
export function dailyCollections(
  payments: readonly Synced<Payment>[],
  from: string,
  to: string,
): Array<{ date: string; count: number; total: number; firstReceipt: number | null; lastReceipt: number | null; firstCode: string | null; lastCode: string | null }> {
  const days = new Map<string, Synced<Payment>[]>();
  for (const p of payments) {
    if (p.voidedAt || p.paidOn < from || p.paidOn > to) continue;
    days.set(p.paidOn, [...(days.get(p.paidOn) ?? []), p]);
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, ps]) => {
      const nums = ps.map((p) => p.receiptNumber).filter((n): n is number => n !== null);
      const codes = ps.map((p) => p.receiptCode).filter((c): c is string => !!c).sort();
      return {
        date,
        count: ps.length,
        total: ps.reduce((n, p) => n + p.amount, 0),
        firstReceipt: nums.length ? Math.min(...nums) : null,
        lastReceipt: nums.length ? Math.max(...nums) : null,
        firstCode: codes[0] ?? null,
        lastCode: codes.at(-1) ?? null,
      };
    });
}

/**
 * The next system receipt number for a device at a school: school code, the device's letter (W for
 * the web), and one more than the highest count that letter has used, voided payments included
 * (a number is never reused). E.g. KIA-W-0042.
 */
export function nextReceiptCode(schoolCode: string, letter: string, payments: readonly Pick<Payment, "receiptCode">[]): string {
  const prefix = `${schoolCode.toUpperCase()}-${letter.toUpperCase()}-`;
  let max = 0;
  for (const p of payments) {
    if (!p.receiptCode?.startsWith(prefix)) continue;
    const n = Number(p.receiptCode.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** How a payment's receipt is shown: the system number, else (older payments) the paper number. */
export const receiptLabel = (p: Pick<Payment, "receiptCode" | "receiptNumber">) => p.receiptCode ?? (p.receiptNumber !== null ? `#${p.receiptNumber}` : "—");

/** Matches a search text against a payment's system or paper receipt number. */
export function matchesReceipt(p: Pick<Payment, "receiptCode" | "receiptNumber">, q: string): boolean {
  const s = q.trim().toUpperCase().replace(/^#/, "");
  if (!s) return false;
  return (!!p.receiptCode && p.receiptCode.includes(s)) || (p.receiptNumber !== null && String(p.receiptNumber) === s);
}

/** Payments newest first: by date paid, then by receipt number. */
export function newestFirst(a: Pick<Payment, "paidOn" | "receiptCode" | "receiptNumber">, b: Pick<Payment, "paidOn" | "receiptCode" | "receiptNumber">): number {
  if (a.paidOn !== b.paidOn) return a.paidOn < b.paidOn ? 1 : -1;
  const ac = a.receiptCode ?? "", bc = b.receiptCode ?? "";
  if (ac !== bc) return ac < bc ? 1 : -1;
  return (b.receiptNumber ?? 0) - (a.receiptNumber ?? 0);
}

/** Format CDF for display: "125 000 FC" (fr) or "125,000 FC" (en). */
export function formatCdf(amount: number, locale: "en" | "fr"): string {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-CD" : "en-US", { maximumFractionDigits: 0 }).format(amount)} FC`;
}

/**
 * Whole numbers (francs, receipt numbers, seats) as people type them: "15000", "15 000", "15.000"
 * or "15,000" all mean 15000. Thousands separators must group by three and be the same throughout.
 * Anything with a decimal part ("15000,50", "2,5", "1.5") is NaN, never silently stripped (EDGE-1).
 * Empty input is null. Shared by the web forms and the phone.
 */
export function parseWholeNumber(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^\d{1,3}([ \u00a0\u202f.,'])\d{3}(?:\1\d{3})*$/.exec(v);
  return m ? Number(v.replace(/\D/g, "")) : NaN;
}
