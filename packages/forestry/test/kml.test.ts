import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { previewKmzOrKml } from "../src/import/kml";
import { KML } from "./fixtures";

describe("KMZ/KML import preview", () => {
  it("reads polygons, skips points, flags problems", async () => {
    const p = await previewKmzOrKml("kiabukwa.kml", KML);
    expect(p.candidates).toHaveLength(2);
    expect(p.skipped).toEqual([{ index: 1, name: "Nursery gate", geometryType: "Point" }]);
    const a = p.candidates[0]!;
    expect(a.name).toBe("KBK-B-001");
    expect(a.properties.species).toBe("Bambusa vulgaris");
    // ~1 km x 1 km at 8°S ≈ 99 ha
    expect(a.areaHa).toBeGreaterThan(95);
    expect(a.areaHa).toBeLessThan(102);
    expect(a.problems).toEqual([]);
    expect(p.candidates[1]!.problems).toContain("area_tiny");
  });

  it("reads a KMZ (zipped doc.kml)", async () => {
    const zip = new JSZip();
    zip.file("doc.kml", KML);
    const buf = await zip.generateAsync({ type: "uint8array" });
    const p = await previewKmzOrKml("kiabukwa.kmz", buf);
    expect(p.candidates).toHaveLength(2);
  });
});
