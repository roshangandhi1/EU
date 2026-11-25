import type { Payment, ReceiptBook, SchoolClass } from "@eu/schools/mobile";
import { streamAccent } from "@eu/core/tokens";
import type { Local } from "./data";

/** The schools stream colour, for the header stripe and icons. */
export const ACCENT = streamAccent.schools;

/** "1A", or "1A · Morning" when the school runs more than one shift. */
export function classLabel(c: Pick<SchoolClass, "level" | "section" | "shift">, shifts: number, t: (k: string) => string): string {
  return shifts > 1 ? `${c.level}${c.section} · ${t(`schools.shift.${c.shift}`)}` : `${c.level}${c.section}`;
}

/** The first receipt number in this person's books that no payment has used: what they will write next. */
export function nextReceipt(userId: string, books: readonly Local<ReceiptBook>[], payments: readonly Local<Payment>[]): number | null {
  const used = new Set(payments.filter((p) => !p.voidedAt).map((p) => p.receiptNumber));
  for (const b of books.filter((x) => !x.voidedAt && x.assignedTo === userId).sort((x, y) => x.firstNumber - y.firstNumber))
    for (let n = b.firstNumber; n <= b.lastNumber; n++) if (!used.has(n)) return n;
  return null;
}

/** Digits typed as DDMMYYYY shown as DD/MM/YYYY, and the ISO date once complete and real. */
export function maskDate(raw: string): { text: string; iso: string | null } {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  const text = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("/");
  if (d.length < 8) return { text, iso: null };
  const iso = `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
  const t = new Date(`${iso}T12:00:00Z`);
  return { text, iso: !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null };
}
