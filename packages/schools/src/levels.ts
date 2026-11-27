import type { LevelDef, School, TermKind } from "./model";

/**
 * The levels a school runs. The admin sets them in Setup (number, name, trimesters or semesters);
 * a school that has not yet gets the DRC default: 1re-6e année on trimesters, then 7e-8e (CTEB)
 * and the four years of humanités on semesters. Phone-safe.
 */
export const DEFAULT_LEVELS: LevelDef[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ level: n, name: n === 1 ? "1re année" : `${n}e année`, semesters: false })),
  { level: 7, name: "7e année EB", semesters: true },
  { level: 8, name: "8e année EB", semesters: true },
  ...[1, 2, 3, 4].map((n) => ({ level: 8 + n, name: n === 1 ? "1re humanités" : `${n}e humanités`, semesters: true })),
];

/** A school's levels in order (its own list, else the default). */
export function levelsOf(school: Pick<School, "levels"> | null | undefined): LevelDef[] {
  const own = school?.levels;
  return [...(own && own.length ? own : DEFAULT_LEVELS)].sort((a, b) => a.level - b.level);
}

/** The level numbers a school runs. */
export const levelNumbers = (school: Pick<School, "levels"> | null | undefined): number[] => levelsOf(school).map((l) => l.level);

/** Whether a level runs on semesters. Levels the list does not name follow the default (7 and up). */
export function usesSemesters(levels: readonly LevelDef[], lvl: number): boolean {
  return levels.find((l) => l.level === lvl)?.semesters ?? lvl >= 7;
}

/** The term kind (trimester / semester) a level's fees, marks and dates follow. */
export const termKindFor = (levels: readonly LevelDef[], lvl: number): TermKind => (usesSemesters(levels, lvl) ? "semester" : "trimester");

/** The name the school gives a level, if it named it. */
export const levelName = (levels: readonly LevelDef[], lvl: number): string | undefined => levels.find((l) => l.level === lvl)?.name;

/** "T2" for a trimester, "S2" for a semester. */
export const termShort = (t: { kind?: TermKind | null; number: number }) => `${t.kind === "semester" ? "S" : "T"}${t.number}`;

/**
 * Checks a level list from the admin: numbers 1-20, each once, names not empty. Returns the
 * cleaned list (sorted) or the problem.
 */
export function checkLevels(rows: readonly LevelDef[]): { levels: LevelDef[] } | { error: "levels_empty" | "levels_duplicate" | "levels_invalid" } {
  if (rows.length === 0) return { error: "levels_empty" };
  const seen = new Set<number>();
  for (const r of rows) {
    if (!Number.isInteger(r.level) || r.level < 1 || r.level > 20 || !r.name.trim() || r.name.length > 40) return { error: "levels_invalid" };
    if (seen.has(r.level)) return { error: "levels_duplicate" };
    seen.add(r.level);
  }
  return { levels: [...rows].map((r) => ({ ...r, name: r.name.trim() })).sort((a, b) => a.level - b.level) };
}

/**
 * Default semester dates for a school year starting in `startYear`: 1 Sep-22 Dec and 11 Jan-2 Jul,
 * kept inside the year's dates.
 */
export function defaultSemesters(year: { startsOn: string; endsOn: string }): { number: number; startsOn: string; endsOn: string }[] {
  const y = Number(year.startsOn.slice(0, 4));
  const clip = (d: string) => (d < year.startsOn ? year.startsOn : d > year.endsOn ? year.endsOn : d);
  return [
    { number: 1, startsOn: clip(`${y}-09-01`), endsOn: clip(`${y}-12-22`) },
    { number: 2, startsOn: clip(`${y + 1}-01-11`), endsOn: clip(`${y + 1}-07-02`) },
  ];
}
