import { describe, expect, it } from "vitest";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { estimateStocking, placeSamplePoints, sampleCount } from "../src/sampling";
import { areaHa } from "../src/geo/area";
import { square } from "./fixtures";

const settings = { samplesPerHa: 1, minSamplesPerPlot: 5, maxSamplesPerPlot: 30, sampleRadiusM: 10 };

describe("sampling", () => {
  it("sizes the sample to the plot, within bounds", () => {
    expect(sampleCount(2.3, settings)).toBe(5);
    expect(sampleCount(12.1, settings)).toBe(13);
    expect(sampleCount(400, settings)).toBe(30);
  });

  it("places reproducible points inside the plot", () => {
    const plot = square(25, -8, 400); // 16 ha
    expect(areaHa(plot)).toBeCloseTo(16, 0);
    const a = placeSamplePoints(plot, 42, settings);
    const b = placeSamplePoints(plot, 42, settings);
    expect(a).toEqual(b);
    expect(a).toHaveLength(16);
    for (const p of a) expect(booleanPointInPolygon([p.lng, p.lat], plot)).toBe(true);
    expect(placeSamplePoints(plot, 43, settings)).not.toEqual(a);
  });

  it("estimates plants/ha and survival with a confidence range", () => {
    const circleHa = (Math.PI * 100) / 10_000; // r = 10 m
    const mk = (alive: number, dead: number, nat = 0) => ({
      pointIndex: 0, lat: 0, lng: 0, radiusM: 10,
      counts: [{ species: "pterocarpus_angolensis", alive, dead, naturalAlive: nat }],
    });
    const samples = [mk(10, 2), mk(12, 0), mk(8, 4), mk(11, 1), { ...mk(0, 0), skipped: "flooded" as const }];
    const e = estimateStocking(samples);
    expect(e.samplesUsed).toBe(4);
    expect(e.samplesSkipped).toBe(1);
    expect(e.livingPerHa.value).toBeCloseTo(41 / 4 / circleHa, 5);
    expect(e.livingPerHa.low).toBeLessThan(e.livingPerHa.value);
    expect(e.survivalPct!.value).toBeCloseTo((41 / 48) * 100, 5);
    expect(e.survivalPct!.high).toBeLessThanOrEqual(100);
    const withNat = estimateStocking([mk(10, 2, 5)], { includeNatural: true });
    expect(withNat.livingPerHa.value).toBeCloseTo(15 / circleHa, 5);
    expect(withNat.survivalPct!.value).toBeCloseTo((10 / 12) * 100, 5); // natural excluded from survival
  });
});
