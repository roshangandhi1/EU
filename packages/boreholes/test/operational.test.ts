import { describe, expect, it } from "vitest";
import { indicator111, type BoreholeForCheck } from "../src/operational";

const b: BoreholeForCheck = {
  siteId: "s1", code: "BH-001", pumpRatingKw: 1.1, commissionedOn: "2026-06-10",
  waterQuality: [{ testedOn: "2026-06-10", turbidityNtu: 1, ecoliPer100ml: 0 }],
  caretakersTrained: [{ trainedOn: "2026-06-12" }], sopHandedOver: true,
};
const visit = (id: string, on: string, flow: number | null, received = on) => ({
  id, visitedOn: on, deviceTime: new Date(`${on}T10:00:00Z`), serverTime: new Date(`${received}T10:00:00Z`),
  operational: { pumpDelivers: true, flowLpm: flow, tankFillsTapsOk: true },
});
const s = { minFlowLpmByPumpKw: { "1.1": 15 }, maxCheckAgeDays: 90 };

describe("1.1.1 operational", () => {
  it("counts a borehole passing a recent check", () => {
    const r = indicator111([{ borehole: b, visits: [visit("v1", "2026-10-01", 20)] }], "2026-10-16", "captured", s);
    expect(r.counted).toBe(1);
  });
  it("fails on low flow, stale check, or missing handover items", () => {
    expect(indicator111([{ borehole: b, visits: [visit("v1", "2026-10-01", 10)] }], "2026-10-16", "captured", s).rows[0]!.fails).toEqual(["flow_min"]);
    expect(indicator111([{ borehole: b, visits: [visit("v1", "2026-05-01", 20)] }], "2026-10-16", "captured", s).rows[0]!.fails).toEqual(["no_recent_check"]);
    expect(indicator111([{ borehole: { ...b, sopHandedOver: false, caretakersTrained: [] }, visits: [visit("v1", "2026-10-01", 20)] }], "2026-10-16", "captured", s).rows[0]!.fails)
      .toEqual(["caretaker", "sop"]);
  });
  it("not commissioned by the as-at date", () => {
    const r = indicator111([{ borehole: { ...b, commissionedOn: "2026-11-01" }, visits: [visit("v1", "2026-10-01", 20)] }], "2026-10-16", "captured", s);
    expect(r.rows[0]!.fails).toContain("commissioned");
  });
  it("no minimum set: any measured flow counts, zero flow fails", () => {
    const r = indicator111([{ borehole: b, visits: [visit("v1", "2026-10-01", 5)] }], "2026-10-16", "captured", { ...s, minFlowLpmByPumpKw: {} });
    expect(r.counted).toBe(1);
    expect(r.rows[0]!.fails).toEqual([]);
    const z = indicator111([{ borehole: b, visits: [visit("v1", "2026-10-01", 0)] }], "2026-10-16", "captured", { ...s, minFlowLpmByPumpKw: {} });
    expect(z.rows[0]!.fails).toEqual(["flow_min"]);
  });
  it("evidence mode excludes late-synced checks", () => {
    const r = indicator111([{ borehole: b, visits: [visit("v1", "2026-10-10", 20, "2026-10-20")] }], "2026-10-16", "evidence", s);
    expect(r.counted).toBe(0);
    expect(r.rows[0]!.lateSynced).toEqual(["v1"]);
  });
});
