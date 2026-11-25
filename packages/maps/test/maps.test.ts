import { describe, expect, it } from "vitest";
import { bboxOf, featureCollection, generalise } from "../src";

describe("maps helpers", () => {
  const fc = featureCollection([
    { id: "a", geometry: { type: "Point", coordinates: [24.81234, -8.71234] }, properties: { code: "BH-1" } },
    { id: "b", geometry: { type: "Polygon", coordinates: [[[24.7, -8.8], [24.9, -8.8], [24.9, -8.6], [24.7, -8.8]]] }, properties: {} },
    { id: "c", geometry: null, properties: {} },
  ]);
  it("builds a collection, dropping features without geometry", () => {
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties!._id).toBe("a");
  });
  it("computes the bbox", () => expect(bboxOf([fc])).toEqual([24.7, -8.8, 24.9, -8.6]));
  it("generalises coordinates", () => expect((generalise(fc, 2).features[0]!.geometry as any).coordinates).toEqual([24.81, -8.71]));
});
