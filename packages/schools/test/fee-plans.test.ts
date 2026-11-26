import { describe, expect, it } from "vitest";
import { enrolmentBalance, feePlan, planFeePlanItems, planPeriods, studentBalance, type FeeItem, type Synced } from "../src";

const year = { startsOn: "2026-09-01", endsOn: "2027-07-02" };
const terms = [
  { id: "t1", number: 1, startsOn: "2026-09-01", endsOn: "2026-12-20", voidedAt: null },
  { id: "t2", number: 2, startsOn: "2027-01-04", endsOn: "2027-03-31", voidedAt: null },
  { id: "t3", number: 3, startsOn: "2027-04-12", endsOn: "2027-07-02", voidedAt: null },
];
const monthly = { academicYearId: "00000000-0000-4000-8000-000000000001", name: "Minerval", levels: [1, 2, 3], amount: 1_000, frequency: "monthly" as const, dueDay: 5, dueOn: null, startsOn: "2026-09-01", endsOn: "2027-06-30" };
const meta = (id: string) => ({ id, scopeId: "s1", deviceTime: "2026-09-01T08:00:00Z", serverTime: "2026-09-01T08:00:00Z", voidedAt: null as string | null });
const toItems = (ops: ReturnType<typeof planFeePlanItems>["ops"]) =>
  ops.flatMap((o, i) => (o.op === "create" ? [{ ...o.fields, ...meta(`i${i}`) } as Synced<FeeItem>] : []));

describe("recurring fees: periods (item 3)", () => {
  it("a monthly fee of 1,000 is due every month, on the chosen day", () => {
    const ps = planPeriods(monthly, year, terms, "en");
    expect(ps).toHaveLength(10); // September to June
    expect(ps[0]).toMatchObject({ dueOn: "2026-09-05", periodEndsOn: "2026-09-30", termId: null });
    expect(ps[5]).toMatchObject({ dueOn: "2027-02-05", periodEndsOn: "2027-02-28" });
    expect(ps.at(-1)).toMatchObject({ dueOn: "2027-06-05", periodEndsOn: "2027-06-30" });
    expect(ps[1]!.label).toBe("Oct 2026");
    expect(feePlan.safeParse(monthly).success).toBe(true);
  });
  it("per trimester follows the school's trimesters; a due day before the trimester starts moves to its first day", () => {
    const ps = planPeriods({ ...monthly, frequency: "per_term", dueDay: 2, startsOn: "2027-01-04", endsOn: "2027-07-02" }, year, terms);
    expect(ps.map((p) => [p.termId, p.dueOn, p.periodEndsOn])).toEqual([["t2", "2027-01-04", "2027-03-31"], ["t3", "2027-04-12", "2027-07-02"]]);
  });
  it("one-time and yearly fees give one item each; a one-time fee has no period end", () => {
    expect(planPeriods({ ...monthly, frequency: "one_time", dueOn: "2026-09-15" }, year, terms)).toEqual([{ key: "once", label: "", termId: null, dueOn: "2026-09-15", periodEndsOn: null }]);
    expect(planPeriods({ ...monthly, frequency: "per_year", dueOn: "2026-10-01" }, year, terms)[0]).toMatchObject({ dueOn: "2026-10-01", periodEndsOn: "2027-07-02" });
  });
  it("clamps the last month to the end of the year", () => {
    const ps = planPeriods({ ...monthly, endsOn: "2027-07-02" }, year, terms);
    expect(ps.at(-1)).toMatchObject({ periodEndsOn: "2027-07-02" });
  });
});

describe("recurring fees: generated items", () => {
  it("creates one item per period, named with the period", () => {
    const { ops } = planFeePlanItems([], "p1", monthly, planPeriods(monthly, year, terms, "en"), () => false);
    expect(ops).toHaveLength(10);
    expect(ops[0]).toMatchObject({ op: "create", fields: { name: "Minerval · Sep 2026", amount: 1_000, planId: "p1", levels: [1, 2, 3] } });
  });
  it("editing the plan updates items in place, adds new periods and voids unused ones, keeping those already paid", () => {
    const items = toItems(planFeePlanItems([], "p1", monthly, planPeriods(monthly, year, terms, "en"), () => false).ops);
    const shorter = { ...monthly, amount: 1_200, endsOn: "2027-03-31" }; // Sep..Mar
    const paidJune = items.at(-1)!.id;
    const { ops, kept } = planFeePlanItems(items, "p1", shorter, planPeriods(shorter, year, terms, "en"), (id) => id === paidJune);
    expect(ops.filter((o) => o.op === "update")).toHaveLength(7);
    expect(ops.find((o) => o.op === "update")).toMatchObject({ fields: { amount: 1_200 } });
    expect(ops.filter((o) => o.op === "void")).toHaveLength(2); // April, May
    expect(kept).toEqual([paidJune]);
    expect(ops.some((o) => o.op === "create")).toBe(false);
  });
});

describe("recurring fees: balances per period", () => {
  const items = toItems(planFeePlanItems([], "p1", monthly, planPeriods(monthly, year, terms, "en"), () => false).ops);
  it("each month is its own line with its own due amount; a payment settles the oldest months first", () => {
    const pay = { studentId: "s1", paidOn: "2026-11-10", amount: 2_500, receiptNumber: 1, feeItemIds: [], ...meta("pay1") };
    const b = studentBalance("s1", 2, items, [], [pay], "2026-11-30", { academicYearId: monthly.academicYearId });
    expect(b.lines).toHaveLength(10);
    expect(b.lines.slice(0, 3).map((l) => l.outstanding)).toEqual([0, 0, 500]);
    expect(b.overdue).toBe(500); // Sep, Oct, Nov due; 2,500 paid
  });
  it("a pupil who enrols mid-year is not charged for months already over", () => {
    const d = { classes: [{ ...meta("c1"), academicYearId: monthly.academicYearId, level: 2, section: "A", shift: "morning" as const, classroomId: null }], years: [], feeItems: items, exemptions: [], payments: [] };
    const b = enrolmentBalance(d, { studentId: "s2", classId: "c1", academicYearId: monthly.academicYearId, enrolledOn: "2027-01-15" }, "2027-01-31");
    expect(b.lines[0]!.name).toBe("Minerval · Jan 2027");
    expect(b.charged).toBe(6_000); // January to June
  });
});
