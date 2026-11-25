import { describe, expect, it } from "vitest";
import { distanceM, distanceToGeomM, pointInMultiPolygon } from "../src/geo/pip";

const sq = (x: number, y: number, d: number) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];
const geom = { type: "MultiPolygon" as const, coordinates: [[sq(25, -8, 0.01), sq(25.003, -7.997, 0.004)]] };

describe("phone geometry", () => {
  it("finds points inside the outer ring and outside holes", () => {
    expect(pointInMultiPolygon(25.001, -7.999, geom)).toBe(true);
    expect(pointInMultiPolygon(25.005, -7.995, geom)).toBe(false); // in the hole
    expect(pointInMultiPolygon(25.02, -7.995, geom)).toBe(false);
  });
  it("measures distance in metres", () => {
    expect(Math.round(distanceM(-8, 25, -8, 25.01))).toBe(1101);
    expect(distanceToGeomM(-8, 25.02, geom)).toBeGreaterThan(1000);
  });
});
