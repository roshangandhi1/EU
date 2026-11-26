import type { Payment, ReceiptBook, Synced } from "@eu/schools";

/** The user's receipt books (not voided), lowest numbers first. */
export function booksOf(userId: string, books: readonly Synced<ReceiptBook>[]): Synced<ReceiptBook>[] {
  return books.filter((b) => !b.voidedAt && b.assignedTo === userId).sort((a, b) => a.firstNumber - b.firstNumber);
}

/**
 * The receipt number to suggest next: one after the highest number already used in the user's
 * current book, or the first number of the next book once a book is full. Null when every book is used up.
 */
export function suggestReceipt(userId: string, books: readonly Synced<ReceiptBook>[], payments: readonly Synced<Payment>[]): number | null {
  const used = payments.filter((p) => !p.voidedAt).map((p) => p.receiptNumber).filter((n): n is number => n !== null);
  const taken = new Set(used);
  for (const b of booksOf(userId, books)) {
    const inBook = used.filter((n) => n >= b.firstNumber && n <= b.lastNumber);
    let next = inBook.length ? Math.max(...inBook) + 1 : b.firstNumber;
    while (next <= b.lastNumber && taken.has(next)) next++;
    if (next <= b.lastNumber) return next;
  }
  return null;
}
