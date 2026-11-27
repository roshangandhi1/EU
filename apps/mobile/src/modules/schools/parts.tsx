import { DEFAULT_LEVELS, levelsOf, type LevelDef, type Payment, type ReceiptBook, type School, type SchoolClass } from "@eu/schools/mobile";
import { streamAccent } from "@eu/core/tokens";
import type { Local } from "./data";

/** The schools stream colour, for the header stripe and icons. */
export const ACCENT = streamAccent.schools;

/** The levels a school runs (its own list from Setup on the web, else the DRC default). */
export const schoolLevels = (school: Pick<School, "levels"> | null | undefined): LevelDef[] => levelsOf(school);

/**
 * "1A", or "1A · Morning" when the school runs more than one shift. Years 1-8 keep the short
 * number; a level the school renamed in Setup, or one above 8 (humanités), shows its name
 * ("1re humanités A"), because "9A" means nothing to a headteacher.
 */
export function classLabel(c: Pick<SchoolClass, "level" | "section" | "shift">, shifts: number, t: (k: string) => string, levels: readonly LevelDef[] = DEFAULT_LEVELS): string {
  const name = levels.find((l) => l.level === c.level)?.name;
  const standard = DEFAULT_LEVELS.find((l) => l.level === c.level)?.name;
  const base = c.level <= 8 && (!name || name === standard) ? `${c.level}${c.section}` : `${name ?? standard ?? c.level} ${c.section}`;
  return shifts > 1 ? `${base} · ${t(`schools.shift.${c.shift}`)}` : base;
}

/** True when any of these labels is too long for three buttons in a row on a small phone. */
export const longLabels = (labels: readonly string[]) => labels.some((l) => l.length > 6);

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

/**
 * The school's name for headers. The name lives on the site; the phone shows it when the synced
 * school record carries it (`name`), and falls back to the short code otherwise.
 */
export function schoolName(s: { code: string }): string {
  const name = (s as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : s.code;
}
