import { describe, expect, it } from "vitest";
import { assemble, INDICATORS, milestone, PERIODS, totals } from "../lib/indicator-defs";

describe("programme dashboard", () => {
  it("lists all 13 Annex III indicators and their caps add to the contract ceiling", () => {
    expect(INDICATORS.map((i) => i.code)).toHaveLength(13);
    for (const i of INDICATORS) expect(i.capEur).toBe(i.unitEur * i.finalTarget);
  });

  it("matches the Year 1 submission: period 1 validated and period 2 forecast amounts", () => {
    const eur = (f: (i: (typeof INDICATORS)[number]) => number) => INDICATORS.reduce((s, i) => s + f(i) * i.unitEur, 0);
    expect(eur((i) => i.p1.target)).toBe(PERIODS[0].budgetEur);
    expect(eur((i) => i.p1.validated)).toBe(PERIODS[0].validatedEur);
    expect(eur((i) => i.p2.units)).toBe(PERIODS[1].budgetEur);
  });

  it("period 2 milestones are cumulative and never pass the end target", () => {
    const m = (c: string) => milestone(INDICATORS.find((i) => i.code === c)!);
    expect(m("1.1.1")).toBe(67);
    expect(m("2.2.1")).toBe(299);
    expect(m("3.2.2")).toBe(1_600);
    for (const i of INDICATORS) expect(milestone(i)).toBeLessThanOrEqual(i.finalTarget);
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
