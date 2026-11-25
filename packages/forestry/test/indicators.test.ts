import { describe, expect, it } from "vitest";
import { computeIndicator, miomboRegeneratingHa, type PlotInput } from "../src/indicators";

const T = (s: string) => new Date(s);
const stamp = (id: string, captured: string, received = captured) => ({ id, deviceTime: T(captured), serverTime: T(received) });

function bambooPlot(over: Partial<PlotInput> = {}): PlotInput {
  return {
    siteId: "p1", code: "KBK-B-001", stream: "bamboo",
    boundaries: [{ ...stamp("b1", "2026-08-01T10:00:00Z"), areaHa: 10 }],
    approvals: [{ ...stamp("a1", "2026-08-01T11:00:00Z"), boundaryId: "b1", effectiveFrom: "2026-08-01" }],
    plantings: [{ ...stamp("e1", "2026-09-10T10:00:00Z"), plantedOn: "2026-09-10", lines: [{ species: "bambusa_vulgaris", count: 4200 }], isGapFilling: false, photos: ["f1"] }],
    visits: [],
    ...over,
  };
}
const bambooRules = { densityRulePerHa: 400 };

describe("2.2.1 bamboo", () => {
  it("counts a plot at density with evidence", () => {
    const r = computeIndicator([bambooPlot()], "2026-10-16", "captured", bambooRules);
    expect(r.hectaresCounted).toBe(10);
    expect(r.plots[0]!.plantedPerHa).toBe(420);
  });

  it("does not count planting after the as-at date", () => {
    const r = computeIndicator([bambooPlot()], "2026-09-09", "captured", bambooRules);
    expect(r.plots[0]!.outcome).toBe("not_planted");
  });

  it("below density goes to pipeline", () => {
    const p = bambooPlot({ plantings: [{ ...stamp("e1", "2026-09-10T10:00:00Z"), plantedOn: "2026-09-10", lines: [{ species: "x", count: 3000 }], isGapFilling: false, photos: ["f"] }] });
    const r = computeIndicator([p], "2026-10-16", "captured", bambooRules);
    expect(r.hectaresCounted).toBe(0);
    expect(r.hectaresPipeline).toBe(10);
    expect(r.plots[0]!.outcome).toBe("below_density");
  });

  it("gap filling is excluded from density by default", () => {
    const p = bambooPlot({ plantings: [
      { ...stamp("e1", "2026-09-10T10:00:00Z"), plantedOn: "2026-09-10", lines: [{ species: "x", count: 3500 }], isGapFilling: false, photos: ["f"] },
      { ...stamp("e2", "2026-10-01T10:00:00Z"), plantedOn: "2026-10-01", lines: [{ species: "x", count: 600 }], isGapFilling: true, photos: [] },
    ] });
    expect(computeIndicator([p], "2026-10-16", "captured", bambooRules).hectaresCounted).toBe(0);
    expect(computeIndicator([p], "2026-10-16", "captured", { ...bambooRules, countGapFilling: true }).hectaresCounted).toBe(10);
  });

  it("requires photo evidence", () => {
    const p = bambooPlot({ plantings: [{ ...stamp("e1", "2026-09-10T10:00:00Z"), plantedOn: "2026-09-10", lines: [{ species: "x", count: 4200 }], isGapFilling: false, photos: [] }] });
    expect(computeIndicator([p], "2026-10-16", "captured", bambooRules).plots[0]!.outcome).toBe("missing_evidence");
  });

  it("needs an authoritative boundary in force on the date", () => {
    const p = bambooPlot({ approvals: [] });
    expect(computeIndicator([p], "2026-10-16", "captured", bambooRules).plots[0]!.outcome).toBe("no_authoritative_boundary");
  });

  it("uses the boundary version in force at the as-at date", () => {
    const p = bambooPlot({
      boundaries: [{ ...stamp("b1", "2026-08-01T10:00:00Z"), areaHa: 10 }, { ...stamp("b2", "2028-01-01T10:00:00Z"), areaHa: 20 }],
      approvals: [
        { ...stamp("a1", "2026-08-01T11:00:00Z"), boundaryId: "b1", effectiveFrom: "2026-08-01" },
        { ...stamp("a2", "2028-01-01T11:00:00Z"), boundaryId: "b2", effectiveFrom: "2028-01-01" },
      ],
    });
    expect(computeIndicator([p], "2027-06-01", "captured", bambooRules).plots[0]!.areaHa).toBe(10);
    expect(computeIndicator([p], "2028-06-01", "captured", bambooRules).plots[0]!.areaHa).toBe(20);
  });

  it("a voided approval withdraws the boundary", () => {
    const p = bambooPlot();
    p.approvals[0]!.voidedAt = T("2026-09-01T00:00:00Z");
    expect(computeIndicator([p], "2026-10-16", "captured", bambooRules).plots[0]!.outcome).toBe("no_authoritative_boundary");
  });

  it("evidence mode: synced after cut-off is listed, not counted, until accepted", () => {
    const late = { ...stamp("e1", "2026-10-10T10:00:00Z", "2026-10-20T08:00:00Z"), plantedOn: "2026-10-10", lines: [{ species: "x", count: 4200 }], isGapFilling: false, photos: ["f"] };
    const p = bambooPlot({ plantings: [late] });
    const captured = computeIndicator([p], "2026-10-16", "captured", bambooRules);
    const evidence = computeIndicator([p], "2026-10-16", "evidence", bambooRules);
    expect(captured.hectaresCounted).toBe(10);
    expect(evidence.hectaresCounted).toBe(0);
    expect(evidence.plots[0]!.lateSynced).toEqual(["e1"]);
    const accepted = bambooPlot({ plantings: [{ ...late, lateAccepted: true }] });
    expect(computeIndicator([accepted], "2026-10-16", "evidence", bambooRules).hectaresCounted).toBe(10);
  });

  it("voided records do not count", () => {
    const p = bambooPlot();
    p.plantings[0]!.voidedAt = T("2026-09-11T00:00:00Z");
    expect(computeIndicator([p], "2026-10-16", "captured", bambooRules).hectaresCounted).toBe(0);
    // ...but an as-at date before the void still shows it
    expect(computeIndicator([p], "2026-09-10", "captured", bambooRules).hectaresCounted).toBe(10);
  });
});

describe("2.1.1 miombo, both readings", () => {
  const native = new Set(["pterocarpus_angolensis", "afzelia_quanzensis"]);
  const rules = { densityRulePerHa: 300, isNative: (s: string) => native.has(s) };
  const sample = (alive: number, natural: number) => ({
    pointIndex: 0, lat: 0, lng: 0, radiusM: 10,
    counts: [{ species: "pterocarpus_angolensis", alive, dead: 0, naturalAlive: natural }, { species: "eucalyptus", alive: 50, dead: 0 }],
  });
  const plot: PlotInput = {
    siteId: "m1", code: "MLB-M-001", stream: "miombo",
    boundaries: [{ ...stamp("b", "2026-12-01T10:00:00Z"), areaHa: 5 }],
    approvals: [{ ...stamp("a", "2026-12-01T11:00:00Z"), boundaryId: "b", effectiveFrom: "2026-12-01" }],
    plantings: [{ ...stamp("e", "2026-12-15T10:00:00Z"), plantedOn: "2026-12-15", isGapFilling: false, photos: ["f"],
      lines: [{ species: "pterocarpus_angolensis", count: 1000 }, { species: "afzelia_quanzensis", count: 600 }, { species: "eucalyptus", count: 5000 }] }],
    visits: [{ ...stamp("v", "2027-06-01T10:00:00Z"), visitedOn: "2027-06-01", photos: [], samples: [sample(8, 2), sample(9, 1)] }],
  };

  it("reading A counts native seedlings only", () => {
    const r = computeIndicator([plot], "2026-12-31", "captured", rules);
    expect(r.plots[0]!.plantedPerHa).toBe(320);
    expect(r.hectaresCounted).toBe(5);
    expect(r.plots[0]!.regeneration).toBeNull();
  });

  it("reading B uses the latest sample, natural regenerants included, non-native excluded", () => {
    const r = computeIndicator([plot], "2027-06-30", "captured", rules);
    const reg = r.plots[0]!.regeneration!;
    // 10 living natives per 314 m2 circle ≈ 318/ha
    expect(reg.livingNativePerHa.value).toBeCloseTo(10 / (Math.PI * 100 / 10_000), 3);
    expect(reg.meets).toBe(true);
    expect(miomboRegeneratingHa(r)).toBe(5);
  });
});
