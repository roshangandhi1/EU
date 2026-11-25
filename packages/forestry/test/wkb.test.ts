import { describe, expect, it } from "vitest";
import { parseWkbHex } from "../src/geo/wkb";

describe("WKB", () => {
  it("parses EWKB point with SRID (PostGIS output)", () => {
    // SELECT ST_SetSRID(ST_MakePoint(25.5,-8.25),4326)
    expect(parseWkbHex("0101000020E6100000000000000080394000000000008020C0")).toEqual({ type: "Point", coordinates: [25.5, -8.25] });
  });
  it("parses a multipolygon", () => {
    // ST_GeomFromText('MULTIPOLYGON(((0 0,1 0,1 1,0 0)))')
    const hex = "0106000000010000000103000000010000000400000000000000000000000000000000000000000000000000F03F0000000000000000000000000000F03F000000000000F03F00000000000000000000000000000000";
    expect(parseWkbHex(hex)).toEqual({ type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] });
  });
});
