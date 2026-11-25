import type { Exemption, FeeItem, Payment, ReceiptBook, Synced } from "./model";

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

/**
 * Balance for one student as at a date. Payments are allocated to the items they
 * name, in order, then to the oldest outstanding items; anything left is credit.
 * Voided payments are ignored.
 */
export function studentBalance(
  studentId: string,
  level: number,
  items: readonly Synced<FeeItem>[],
  exemptions: readonly Synced<Exemption>[],
  payments: readonly Synced<Payment>[],
  asAt: string,
): StudentBalance {
  const mine = exemptions.filter((e) => !e.voidedAt && e.studentId === studentId);
  const lines: ItemLine[] = items
    .filter((i) => !i.voidedAt && i.levels.includes(level))
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
    .map((i) => {
      const charged = chargeFor(i, i.id, mine);
      return { feeItemId: i.id, name: i.name, dueOn: i.dueOn, charged, paid: 0, outstanding: charged };
    });
  const byId = new Map(lines.map((l) => [l.feeItemId, l]));
  const paidTotal = { n: 0 };
  const pays = payments
    .filter((p) => !p.voidedAt && p.studentId === studentId && p.paidOn <= asAt)
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : a.receiptNumber - b.receiptNumber));
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

/** Same receipt number on two non-voided payments: possible after two devices sync. */
export function duplicateReceipts(payments: readonly Synced<Payment>[]): Map<number, string[]> {
  const seen = new Map<number, string[]>();
  for (const p of payments) {
    if (p.voidedAt) continue;
    seen.set(p.receiptNumber, [...(seen.get(p.receiptNumber) ?? []), p.id]);
  }
  return new Map([...seen].filter(([, ids]) => ids.length > 1));
}

/** Cash collected per day, for reconciliation against the cash box. */
export function dailyCollections(
  payments: readonly Synced<Payment>[],
  from: string,
  to: string,
): Array<{ date: string; count: number; total: number; firstReceipt: number; lastReceipt: number }> {
  const days = new Map<string, Synced<Payment>[]>();
  for (const p of payments) {
    if (p.voidedAt || p.paidOn < from || p.paidOn > to) continue;
    days.set(p.paidOn, [...(days.get(p.paidOn) ?? []), p]);
  }
  return [...days]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, ps]) => {
      const nums = ps.map((p) => p.receiptNumber);
      return {
        date,
        count: ps.length,
        total: ps.reduce((n, p) => n + p.amount, 0),
        firstReceipt: Math.min(...nums),
        lastReceipt: Math.max(...nums),
      };
    });
}

/** Format CDF for display: "125 000 FC" (fr) or "125,000 FC" (en). */
export function formatCdf(amount: number, locale: "en" | "fr"): string {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-CD" : "en-US", { maximumFractionDigits: 0 }).format(amount)} FC`;
}
