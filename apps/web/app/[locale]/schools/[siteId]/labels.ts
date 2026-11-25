import type { SchoolClass, Student, Synced } from "@eu/schools";

type Tr = (k: string, v?: Record<string, string | number>) => string;

export function classLabel(c: Pick<SchoolClass, "level" | "section" | "shift">, tr: Tr): string {
  return `${tr("levelName", { n: c.level })} ${c.section} · ${tr(`shift.${c.shift}`)}`;
}

export function studentName(s: Pick<Student, "firstName" | "lastName" | "postName">): string {
  return [s.lastName.toUpperCase(), s.postName, s.firstName].filter(Boolean).join(" ");
}

export const byLevel = <T extends Synced<SchoolClass>>(a: T, b: T) =>
  a.level - b.level || a.section.localeCompare(b.section) || a.shift.localeCompare(b.shift);
