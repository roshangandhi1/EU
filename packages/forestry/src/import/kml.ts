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
import { bboxOf, overlapHa, selfOverlapHa, significantOverlap } from "../geo/overlap";

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

/** Largest upload accepted (Vercel refuses request bodies above about 4.5 MB anyway). */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
/** Largest total of KML text a KMZ may inflate to: stops a "zip bomb" exhausting memory (SEC-17). */
export const MAX_KML_BYTES = 20 * 1024 * 1024;
/** More placemarks than this in one file is not a plot list. */
export const MAX_PLACEMARKS = 2000;

/** A file the import refuses, with a code the screen translates. */
export class ImportFileError extends Error {
  constructor(public code: "kml_too_large" | "no_kml_in_kmz" | "too_many_placemarks" | "file_too_large") {
    super(code);
  }
}

export async function readKmz(data: ArrayBuffer | Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(data);
  const files = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith(".kml"));
  if (files.length === 0) throw new ImportFileError("no_kml_in_kmz");
  // The zip directory states each entry's inflated size: refuse before inflating anything.
  const declared = files.reduce((n, f) => n + Number((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
  if (declared > MAX_KML_BYTES) throw new ImportFileError("kml_too_large");
  // doc.kml is the KMZ convention; include any others (some exporters nest several).
  files.sort((a, b) => (a.name === "doc.kml" ? -1 : b.name === "doc.kml" ? 1 : a.name.localeCompare(b.name)));
  const out: string[] = [];
  let total = 0;
  for (const f of files) {
    // Inflate one entry at a time and check the real size too (the directory can lie).
    const bytes = await f.async("uint8array");
    total += bytes.length;
    if (total > MAX_KML_BYTES) throw new ImportFileError("kml_too_large");
    out.push(new TextDecoder().decode(bytes));
  }
  return out;
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

/** The plot code a placemark name becomes (spaces to underscores). */
export function plotCode(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

/** Codes are compared without regard to case: "b01" and "B01" are the same plot (DATA-18). */
export const codeKey = (code: string) => plotCode(code).toLowerCase();

export function previewFeatures(fc: FeatureCollection, sourceName: string): ImportPreview {
  const candidates: ImportCandidate[] = [];
  const skipped: ImportPreview["skipped"] = [];
  if (fc.features.length > MAX_PLACEMARKS) throw new ImportFileError("too_many_placemarks");
  fc.features.forEach((f: Feature, index) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const rawName = String(props.name ?? "").trim();
    // Unnamed placemarks get a neutral code; flagged so the user names them (I18N-16, EDGE-6).
    const name = rawName || `P-${index + 1}`;
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
    if (!rawName) problems.push("name_missing");
    if (plotCode(name).length > 40) problems.push("name_too_long");
    const a = areaHa(geom);
    if (geom.coordinates.length > 1 && selfOverlapHa(geom) > 0.01) problems.push("self_overlap");
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

  // Within the file: the same code twice, and polygons covering the same land. Against existing
  // plots (both streams), see flagExisting, which the server runs before showing the preview.
  const seen = new Map<string, number>();
  for (const c of candidates) seen.set(codeKey(c.name), (seen.get(codeKey(c.name)) ?? 0) + 1);
  for (const c of candidates) if ((seen.get(codeKey(c.name)) ?? 0) > 1) c.problems.push("duplicate_code");
  const boxes = candidates.map((c) => bboxOf(c.geom));
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (!significantOverlap(overlapHa(a.geom, b.geom, 60, { a: boxes[i], b: boxes[j] }), a.areaHa, b.areaHa)) continue;
      a.problems.push(`overlaps:${plotCode(b.name)}`);
      b.problems.push(`overlaps:${plotCode(a.name)}`);
    }
  for (const c of candidates) c.problems = [...new Set(c.problems)];
  return {
    sourceName,
    candidates,
    skipped,
    totalAreaHa: Math.round(candidates.reduce((s, c) => s + c.areaHa, 0) * 10_000) / 10_000,
  };
}

/** A live plot already in the system (either stream), for the overlap and code checks. */
export interface ExistingPlot {
  code: string;
  stream: string;
  geom: MultiPolygon | null;
}

/**
 * Flags candidates that repeat an existing live plot: the same code in this stream
 * ("already_exists"), or land overlapping a live plot of either stream ("overlaps:<code>").
 * The preview leaves flagged candidates unticked; the user can still tick one on purpose.
 */
export function flagExisting(preview: ImportPreview, stream: string, existing: readonly ExistingPlot[]): ImportPreview {
  const codes = new Set(existing.filter((e) => e.stream === stream).map((e) => codeKey(e.code)));
  const shapes = existing.filter((e): e is ExistingPlot & { geom: MultiPolygon } => !!e.geom).map((e) => ({ ...e, box: bboxOf(e.geom), area: areaHa(e.geom) }));
  for (const c of preview.candidates) {
    if (codes.has(codeKey(c.name))) c.problems.push("already_exists");
    const box = bboxOf(c.geom);
    for (const e of shapes) {
      if (significantOverlap(overlapHa(c.geom, e.geom, 60, { a: box, b: e.box }), c.areaHa, e.area)) c.problems.push(`overlaps:${e.code}`);
    }
    c.problems = [...new Set(c.problems)];
  }
  return preview;
}

export async function previewKmzOrKml(name: string, data: ArrayBuffer | Uint8Array | string): Promise<ImportPreview> {
  const lower = name.toLowerCase();
  const size = typeof data === "string" ? data.length : data.byteLength;
  if (size > MAX_IMPORT_BYTES) throw new ImportFileError("file_too_large");
  const texts = typeof data === "string" ? [data]
    : lower.endsWith(".kmz") ? await readKmz(data)
    : [new TextDecoder().decode(data)];
  const features = texts.flatMap((t) => kmlToFeatures(t).features);
  return previewFeatures({ type: "FeatureCollection", features }, name);
}
