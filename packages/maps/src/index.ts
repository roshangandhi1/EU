/**
 * Shared map building blocks, free of module logic: the field modules, the public map and the
 * schools location picker all use them. Web rendering is in "@eu/maps/web".
 */
import type { BBox, Feature, FeatureCollection, Geometry } from "geojson";

export type LayerKind = "fill" | "circle";

export interface OverlayLayer {
  id: string;
  kind: LayerKind;
  data: FeatureCollection;
  /** Feature property used to pick a colour from `colors`; falls back to `defaultColor`. */
  colorBy?: string;
  colors?: Record<string, string>;
  defaultColor: string;
  /** Feature property shown as a label. */
  labelBy?: string;
  /** Dashed outline for features where this property is false (e.g. unapproved boundaries). */
  solidWhen?: string;
}

export interface RasterLayer {
  id: string;
  /** "pmtiles://https://..." for a PMTiles archive, or an XYZ template. */
  url: string;
  attribution?: string;
  maxzoom?: number;
}

export interface Basemap {
  kind: "osm" | "pmtiles-raster";
  url?: string;
}

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

/** Bounding box over all features, or null if there are none. */
export function bboxOf(collections: FeatureCollection[]): BBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as [number, number];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  const geom = (g: Geometry | null): void => {
    if (!g) return;
    if (g.type === "GeometryCollection") g.geometries.forEach(geom);
    else visit(g.coordinates);
  };
  for (const fc of collections) fc.features.forEach((f: Feature) => geom(f.geometry));
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

export function featureCollection<P extends Record<string, unknown>>(
  items: { id: string; geometry: Geometry | null; properties: P }[],
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.filter((i) => i.geometry).map((i) => ({ type: "Feature", id: i.id, geometry: i.geometry!, properties: { ...i.properties, _id: i.id } })),
  };
}

/** Rounds point coordinates (for public layers where exact locations are not shown). */
export function generalise(fc: FeatureCollection, decimals: number): FeatureCollection {
  const f = 10 ** decimals;
  const round = (c: unknown): unknown => (Array.isArray(c) && typeof c[0] === "number" ? (c as number[]).map((v) => Math.round(v * f) / f) : Array.isArray(c) ? c.map(round) : c);
  return { ...fc, features: fc.features.map((ft) => ({ ...ft, geometry: ft.geometry && "coordinates" in ft.geometry ? ({ ...ft.geometry, coordinates: round(ft.geometry.coordinates) } as Geometry) : ft.geometry })) };
}
export { publicMapStrings } from "./i18n";
