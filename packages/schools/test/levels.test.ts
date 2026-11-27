/** School levels set by the admin, semester dates, and fees per semester for secondary levels. */
import { describe, expect, it } from "vitest";
import { checkLevels, DEFAULT_LEVELS, defaultSemesters, levelsOf, planPeriods, planTermKind, resolveScheme, termKindFor, usesSemesters, DRC_SCHEME } from "../src";

describe("levels", () => {
  it("defaults to 1re-6e année on trimesters, then 7e-8e and four years of humanités on semesters", () => {
    expect(levelsOf(null).map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(DEFAULT_LEVELS.filter((l) => l.semesters).map((l) => l.level)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(levelsOf({ levels: [] })).toHaveLength(12);
  });
  it("follows the school's own list: names, order and trimesters or semesters", () => {
    const own = [{ level: 9, name: "1re Pédagogie", semesters: true }, { level: 1, name: "1re année", semesters: false }, { level: 7, name: "7e EB", semesters: false }];
    expect(levelsOf({ levels: own }).map((l) => l.name)).toEqual(["1re année", "7e EB", "1re Pédagogie"]);
    expect([usesSemesters(own, 7), usesSemesters(own, 9), usesSemesters(own, 8)]).toEqual([false, true, true]);
    expect(termKindFor(own, 1)).toBe("trimester");
  });
  it("checks the admin's list", () => {
    expect(checkLevels([])).toEqual({ error: "levels_empty" });
    expect(checkLevels([{ level: 3, name: "a", semesters: false }, { level: 3, name: "b", semesters: false }])).toEqual({ error: "levels_duplicate" });
    expect(checkLevels([{ level: 21, name: "x", semesters: true }])).toEqual({ error: "levels_invalid" });
    expect(checkLevels([{ level: 2, name: " 2e ", semesters: false }, { level: 1, name: "1re", semesters: false }])).toEqual({ levels: [{ level: 1, name: "1re", semesters: false }, { level: 2, name: "2e", semesters: false }] });
  });
});

describe("semesters", () => {
  it("default to 1 Sep-22 Dec and 11 Jan-2 Jul, inside the year", () => {
    expect(defaultSemesters({ startsOn: "2026-09-01", endsOn: "2027-07-02" })).toEqual([
      { number: 1, startsOn: "2026-09-01", endsOn: "2026-12-22" },
      { number: 2, startsOn: "2027-01-11", endsOn: "2027-07-02" },
    ]);
    expect(defaultSemesters({ startsOn: "2026-09-07", endsOn: "2027-06-30" })[1]!.endsOn).toBe("2027-06-30");
  });
  it("charge a per-term fee per semester for secondary levels, labelled S1/S2, and refuse a mix", () => {
    const year = { startsOn: "2026-09-01", endsOn: "2027-07-02" };
    const sem = [
      { id: "s1", kind: "semester" as const, number: 1, startsOn: "2026-09-01", endsOn: "2026-12-22", voidedAt: null },
      { id: "s2", kind: "semester" as const, number: 2, startsOn: "2027-01-11", endsOn: "2027-07-02", voidedAt: null },
    ];
    const plan = { frequency: "per_term" as const, dueDay: 5, dueOn: null, startsOn: year.startsOn, endsOn: year.endsOn };
    expect(planPeriods(plan, year, sem).map((p) => [p.label, p.termId, p.dueOn])).toEqual([["S1", "s1", "2026-09-05"], ["S2", "s2", "2027-01-11"]]);
    expect(planTermKind([7, 8], DEFAULT_LEVELS)).toBe("semester");
    expect(planTermKind([1, 2], DEFAULT_LEVELS)).toBe("trimester");
    expect(planTermKind([6, 7], DEFAULT_LEVELS)).toBe("mixed");
  });
  it("give a semester level two semesters even when the school's catch-all scheme has trimesters", () => {
    const row = { ...DRC_SCHEME, name: "école", levels: [], id: "x", scopeId: "s1", deviceTime: "2026-10-01T00:00:00Z", voidedAt: null } as never;
    expect(resolveScheme([row], "s1", 10, true).scheme.terms).toHaveLength(2);
    expect(resolveScheme([row], "s1", 7, false).scheme.name).toBe("école");
  });
});
