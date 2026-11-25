/**
 * KMZ / KML import -> candidate plot boundaries.
 *
 * Produces a preview the admin reviews before anything is written: one row per polygon placemark,
 * with its name, description fields, computed area and any problems found. Points and lines are
 * reported but not imported as plots.
 */
import { kml as kmlToGeoJson } from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { areaHa, toMultiPolygon } from "../geo/area";

export interface ImportCandidate {
  index: number;
  name: string;
  folder?: string;
  properties: Record<string, unknown>;
  geom: MultiPolygon;
  areaHa: number;
  problems: string[];
}

export interface ImportPreview {
  sourceName: string;
  candidates: ImportCandidate[];
  skipped: { index: number; name: string; geometryType: string }[];
  totalAreaHa: number;
}

export async function readKmz(data: ArrayBuffer | Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const files = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith(".kml"));
  // doc.kml is the KMZ convention; include any others (some exporters nest several).
  files.sort((a, b) => (a.name === "doc.kml" ? -1 : b.name === "doc.kml" ? 1 : a.name.localeCompare(b.name)));
  return Promise.all(files.map((f) => f.async("string")));
}

export function kmlToFeatures(kmlText: string): FeatureCollection {
  const dom = new DOMParser().parseFromString(kmlText, "text/xml");
  return kmlToGeoJson(dom as unknown as Document) as FeatureCollection;
}

function polygonsOf(g: Geometry | null): (Polygon | MultiPolygon)[] {
  if (!g) return [];
  if (g.type === "Polygon" || g.type === "MultiPolygon") return [g];
  if (g.type === "GeometryCollection") return g.geometries.flatMap(polygonsOf);
  return [];
}

export function previewFeatures(fc: FeatureCollection, sourceName: string): ImportPreview {
  const candidates: ImportCandidate[] = [];
  const skipped: ImportPreview["skipped"] = [];
  fc.features.forEach((f: Feature, index) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const name = String(props.name ?? `Placemark ${index + 1}`).trim();
    const polys = polygonsOf(f.geometry);
    if (polys.length === 0) {
      skipped.push({ index, name, geometryType: f.geometry?.type ?? "none" });
      return;
    }
    const geom: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: polys.flatMap((p) => toMultiPolygon(p).coordinates),
    };
    const problems: string[] = [];
    const a = areaHa(geom);
    if (a < 0.01) problems.push("area_tiny");
    if (a > 200) problems.push("area_implausible");
    for (const poly of geom.coordinates) {
      const ring = poly[0] ?? [];
      if (ring.length < 4) problems.push("ring_too_short");
      for (const [x, y] of ring) {
        // Haut-Lomami sits roughly 22-28 E, 5-10 S; flag anything far outside the DRC.
        if (x! < 12 || x! > 32 || y! < -14 || y! > 6) {
          problems.push("outside_drc");
          break;
        }
      }
    }
    const { name: _n, styleUrl: _s, ...rest } = props;
    candidates.push({
      index,
      name,
      folder: typeof props.folder === "string" ? props.folder : undefined,
      properties: rest,
      geom,
      areaHa: Math.round(a * 10_000) / 10_000,
      problems: [...new Set(problems)],
    });
  });

  // Overlaps between candidates are checked server-side with PostGIS (ST_Intersects), and against
  // existing plots in both streams, before commit.
  return {
    sourceName,
    candidates,
    skipped,
    totalAreaHa: Math.round(candidates.reduce((s, c) => s + c.areaHa, 0) * 10_000) / 10_000,
  };
}

export async function previewKmzOrKml(name: string, data: ArrayBuffer | Uint8Array | string): Promise<ImportPreview> {
  const lower = name.toLowerCase();
  const texts = typeof data === "string" ? [data]
    : lower.endsWith(".kmz") ? await readKmz(data)
    : [new TextDecoder().decode(data)];
  const features = texts.flatMap((t) => kmlToFeatures(t).features);
  return previewFeatures({ type: "FeatureCollection", features }, name);
}
