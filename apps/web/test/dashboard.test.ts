import { describe, expect, it } from "vitest";
import { afterEach, beforeEach } from "vitest";
import { createTestDb } from "@eu/db/testing";
import type { Db } from "@eu/db";
import { assemble, INDICATORS, totals } from "../lib/indicator-defs";
import { addPeriod, budgetEur, checkPeriod, loadOutcomes, loadPeriods, milestone, pickPeriods, savePeriod, validatedEur, validatedToDate } from "../lib/periods";

describe("programme dashboard", () => {
  it("lists all 13 Annex III indicators and their caps add to the contract ceiling", () => {
    expect(INDICATORS.map((i) => i.code)).toHaveLength(13);
    for (const i of INDICATORS) expect(i.capEur).toBe(i.unitEur * i.finalTarget);
  });

  it("values measured indicators at the unit rate, capped at the maximum", () => {
    const rows = assemble({ "2.2.1": { value: 39.28 }, "1.1.1": { value: 200 } });
    const bamboo = rows.find((r) => r.code === "2.2.1")!;
    expect(bamboo.status).toBe("live");
    expect(bamboo.valueEur).toBe(117_840);
    expect(rows.find((r) => r.code === "1.1.1")!.valueEur).toBe(1_848_000);
  });

  it("explains indicators the app cannot count yet", () => {
    const rows = assemble({});
    const status = (c: string) => rows.find((r) => r.code === c)!.status;
    expect(status("1.2.3")).toBe("awaiting_api");
    expect(status("3.1.4")).toBe("parked");
    expect(status("3.2.2")).toBe("awaiting_module");
    expect(status("4.1.1")).toBe("manual");
    expect(status("1.1.1")).toBe("awaiting_module");
    expect(totals(rows).earned).toBe(0);
  });
});

describe("payment periods", () => {
  let db: Db;
  let close: () => Promise<void>;
  beforeEach(async () => ({ db, close } = await createTestDb()));
  afterEach(() => close());

  it("seeds the Year 1 submission: period 1 budget and validated amount, period 2 forecast", async () => {
    const ps = await loadPeriods(db);
    expect(ps.map((p) => [p.n, p.status])).toEqual([[1, "validated"], [2, "open"]]);
    expect(budgetEur(ps[0]!)).toBe(2_067_800);
    expect(validatedEur(ps[0]!)).toBe(2_119_650);
    expect(budgetEur(ps[1]!)).toBe(5_053_750);
    expect(validatedEur(ps[1]!)).toBeNull();
    expect(ps[1]!.indicators["2.2.1"]!.noteEn).toMatch(/320/);
    expect((await loadOutcomes(db)).map((o) => o.code)).toEqual(["1.1", "1.2", "2.1", "3.1", "3.2"]);
  });

  it("milestones are cumulative and never pass the end target", async () => {
    const ps = await loadPeriods(db);
    const { last, next } = pickPeriods(ps);
    expect([last?.n, next?.n]).toEqual([1, 2]);
    expect(milestone(ps, 2, "1.1.1")).toBe(67);
    expect(milestone(ps, 2, "2.2.1")).toBe(299);
    expect(milestone(ps, 2, "3.2.2")).toBe(1_600);
    expect(validatedToDate(ps, "1.2.3")).toBe(520);
    for (const i of INDICATORS) expect(milestone(ps, 2, i.code)).toBeLessThanOrEqual(i.finalTarget);
  });

  it("adds the next period after the last one and saves edits, audited", async () => {
    const n = await addPeriod(db, "u1");
    let ps = await loadPeriods(db);
    const p3 = ps.find((p) => p.n === n)!;
    expect([p3.n, p3.startsOn, p3.endsOn, budgetEur(p3)]).toEqual([3, "2027-10-17", "2028-10-16", 0]);
    const p2 = ps.find((p) => p.n === 2)!;
    const r = await savePeriod(db, { ...p2, status: "validated", indicators: { ...p2.indicators, "1.1.1": { ...p2.indicators["1.1.1"]!, validated: 60 } } }, "u1");
    expect(r).toEqual({ ok: true });
    ps = await loadPeriods(db);
    expect(pickPeriods(ps).next?.n).toBe(3);
    // Period 2 validated 60 of 65: period 3's milestone builds on what was validated.
    expect(milestone(ps, 3, "1.1.1")).toBe(62);
  });

  it("refuses overlapping dates, reversed dates and negative numbers", async () => {
    const ps = await loadPeriods(db);
    const p2 = ps[1]!;
    expect(checkPeriod({ ...p2, startsOn: "2026-10-01" }, ps)).toEqual({ ok: false, reason: "overlap" });
    expect(checkPeriod({ ...p2, endsOn: "2026-01-01" }, ps)).toEqual({ ok: false, reason: "dates" });
    expect(checkPeriod({ ...p2, tpaFrom: "2027-10-20", tpaTo: null }, ps)).toEqual({ ok: false, reason: "dates" });
    expect(checkPeriod({ ...p2, indicators: { "1.1.1": { target: -1, validated: null, noteEn: null, noteFr: null } } }, ps)).toEqual({ ok: false, reason: "number" });
  });
});
