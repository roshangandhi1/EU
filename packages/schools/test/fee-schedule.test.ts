import { describe, expect, it } from "vitest";
import { feeGrid, planFeeCopy, planFeeSchedule, type FeeGrid, type FeeItem, type Synced, type Term } from "../src";

const meta = { scopeId: "s", deviceTime: "2026-09-01T00:00:00Z", serverTime: "2026-09-01T00:00:00Z", voidedAt: null };
const Y = "year-1";
const item = (id: string, termId: string | null, levels: number[], amount: number, dueOn = "2026-10-01"): Synced<FeeItem> =>
  ({ id, ...meta, academicYearId: Y, termId, name: "Minerval", levels, amount, dueOn }) as Synced<FeeItem>;
const grid = (cells: Record<string, number>, dues: Record<string, string>): FeeGrid => ({ amounts: new Map(Object.entries(cells)), dues: new Map(Object.entries(dues)) });

describe("fee schedule grid", () => {
  it("reads existing items into cells", () => {
    const g = feeGrid([item("a", "t1", [1, 2, 3], 30_000), item("b", "t1", [4, 5, 6], 40_000)], Y, "Minerval");
    expect(g.amounts.get("t1:2")).toBe(30_000);
    expect(g.amounts.get("t1:6")).toBe(40_000);
    expect(g.dues.get("t1")).toBe("2026-10-01");
  });

  it("creates one item per amount per column from an empty grid", () => {
    const ops = planFeeSchedule([], Y, "Minerval", ["t1", null], grid({ "t1:1": 30_000, "t1:2": 30_000, "t1:3": 35_000, "year:1": 5_000 }, { t1: "2026-10-01", year: "2026-09-30" }));
    expect(ops).toEqual([
      { op: "create", fields: { academicYearId: Y, termId: "t1", name: "Minerval", levels: [1, 2], amount: 30_000, dueOn: "2026-10-01" } },
      { op: "create", fields: { academicYearId: Y, termId: "t1", name: "Minerval", levels: [3], amount: 35_000, dueOn: "2026-10-01" } },
      { op: "create", fields: { academicYearId: Y, termId: null, name: "Minerval", levels: [1], amount: 5_000, dueOn: "2026-09-30" } },
    ]);
  });

  it("edits in place, so payments and exemptions keep pointing at the same item", () => {
    const cells = { "t1:1": 32_000, "t1:2": 32_000, "t1:3": 32_000, "t1:4": 32_000, "t1:5": 32_000, "t1:6": 32_000 };
    expect(planFeeSchedule([item("a", "t1", [1, 2, 3, 4, 5, 6], 30_000)], Y, "Minerval", ["t1"], grid(cells, { t1: "2026-10-15" })))
      .toEqual([{ op: "update", id: "a", fields: { amount: 32_000, dueOn: "2026-10-15" } }]);
  });

  it("splits an item when one level now costs more, keeping the largest group on the old item", () => {
    const cells = { "t1:1": 30_000, "t1:2": 30_000, "t1:3": 30_000, "t1:4": 30_000, "t1:5": 30_000, "t1:6": 45_000 };
    expect(planFeeSchedule([item("a", "t1", [1, 2, 3, 4, 5, 6], 30_000)], Y, "Minerval", ["t1"], grid(cells, { t1: "2026-10-01" }))).toEqual([
      { op: "update", id: "a", fields: { levels: [1, 2, 3, 4, 5] } },
      { op: "create", fields: { academicYearId: Y, termId: "t1", name: "Minerval", levels: [6], amount: 45_000, dueOn: "2026-10-01" } },
    ]);
  });

  it("voids an item whose cells were all cleared, and changes nothing when nothing changed", () => {
    const existing = [item("a", "t1", [1, 2], 30_000), item("b", "t2", [1, 2], 30_000)];
    const cells = { "t2:1": 30_000, "t2:2": 30_000 };
    expect(planFeeSchedule(existing, Y, "Minerval", ["t1", "t2"], grid(cells, { t1: "2026-10-01", t2: "2026-10-01" }))).toEqual([{ op: "void", id: "a" }]);
    expect(planFeeSchedule(existing, Y, "Minerval", ["t1", "t2"], grid({ ...cells, "t1:1": 30_000, "t1:2": 30_000 }, { t1: "2026-10-01", t2: "2026-10-01" }))).toEqual([]);
  });

  it("copies a year to the next one, matching terms by number and moving due dates", () => {
    const term = (id: string, yearId: string, number: number) => ({ id, ...meta, academicYearId: yearId, number, startsOn: "", endsOn: "" }) as Synced<Term>;
    const plan = planFeeCopy(
      { items: [item("a", "t1", [1, 2], 30_000, "2026-10-01"), item("b", null, [1], 5_000, "2026-09-30"), item("c", "t3", [1], 1_000)], terms: [term("t1", Y, 1), term("t3", Y, 3)], yearId: Y, yearStart: "2026-09-01" },
      { items: [], terms: [term("n1", "year-2", 1)], yearId: "year-2", yearStart: "2027-09-06" },
    );
    expect(plan.creates).toEqual([
      { academicYearId: "year-2", termId: "n1", name: "Minerval", levels: [1, 2], amount: 30_000, dueOn: "2027-10-06" },
      { academicYearId: "year-2", termId: null, name: "Minerval", levels: [1], amount: 5_000, dueOn: "2027-10-05" },
    ]);
    expect(plan.skippedNoTerm).toBe(1);
  });

  it("never merges into a fee name the target year already has", () => {
    const plan = planFeeCopy(
      { items: [item("a", null, [1], 5_000)], terms: [], yearId: Y, yearStart: "2026-09-01" },
      { items: [{ ...item("x", null, [1], 9_000), academicYearId: "year-2" }], terms: [], yearId: "year-2", yearStart: "2026-09-01" },
    );
    expect(plan.creates).toEqual([]);
    expect(plan.skippedNames).toEqual(["Minerval"]);
  });
});

describe("copying into a year without terms", () => {
  it("lists the terms to create, with dates moved to the new year", async () => {
    const { missingTermsForCopy } = await import("../src");
    const meta = { scopeId: "s", deviceTime: "2026-09-01T00:00:00Z", serverTime: "2026-09-01T00:00:00Z", voidedAt: null };
    const t = (id: string, number: number, startsOn: string, endsOn: string) => ({ id, ...meta, academicYearId: "y1", number, startsOn, endsOn });
    const fee = (termId: string | null) => ({ id: `f-${termId}`, ...meta, academicYearId: "y1", termId, name: "Minerval", levels: [1], amount: 1, dueOn: "2026-10-01" });
    const out = missingTermsForCopy(
      { items: [fee("t1"), fee("t2"), fee(null)], terms: [t("t1", 1, "2026-09-01", "2026-12-20"), t("t2", 2, "2027-01-04", "2027-03-26"), t("t3", 3, "2027-04-12", "2027-07-02")], yearId: "y1", yearStart: "2026-09-01" },
      { terms: [], yearId: "y2", yearStart: "2027-09-06" },
    );
    expect(out).toEqual([
      { academicYearId: "y2", kind: "trimester", number: 1, startsOn: "2027-09-06", endsOn: "2027-12-25" },
      { academicYearId: "y2", kind: "trimester", number: 2, startsOn: "2028-01-09", endsOn: "2028-03-30" },
    ]);
  });
});
