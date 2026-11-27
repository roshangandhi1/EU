import type { LevelDef, SchoolClass, Student, Synced } from "@eu/schools";

type Tr = (k: string, v?: Record<string, string | number>) => string;

/**
 * The school's name for a level when it set one in Setup (e.g. "1re humanités"), else
 * "1re année", "2e année"… (French ordinals differ for 1) / "Year 1".
 */
export function levelLabel(n: number, tr: Tr, levels?: readonly LevelDef[]): string {
  const own = levels?.find((l) => l.level === n)?.name;
  if (own) return own;
  return n === 1 ? tr("levelFirst") : tr("levelName", { n });
}

export function classLabel(c: Pick<SchoolClass, "level" | "section" | "shift">, tr: Tr, levels?: readonly LevelDef[]): string {
  return `${levelLabel(c.level, tr, levels)} ${c.section} · ${tr(`shift.${c.shift}`)}`;
}

export function studentName(s: Pick<Student, "firstName" | "lastName" | "postName">): string {
  return [s.lastName.toUpperCase(), s.postName, s.firstName].filter(Boolean).join(" ");
}

export const byLevel = <T extends Synced<SchoolClass>>(a: T, b: T) =>
  a.level - b.level || a.section.localeCompare(b.section) || a.shift.localeCompare(b.shift);
