import turfArea from "@turf/area";
import type { MultiPolygon, Polygon } from "geojson";

/**
 * Geodesic area in hectares. Used for previews on phone and web only;
 * the authoritative figure is ST_Area(geom::geography) computed by the server.
 * Both are geodesic, so they agree closely (tested).
 */
export function areaHa(geom: Polygon | MultiPolygon): number {
  return turfArea(geom) / 10_000;
}

/** Normalise any polygonal geometry to MultiPolygon, dropping Z values. */
export function toMultiPolygon(geom: Polygon | MultiPolygon): MultiPolygon {
  const strip = (rings: number[][][]) => rings.map((r) => r.map(([x, y]) => [x!, y!]));
  if (geom.type === "Polygon") return { type: "MultiPolygon", coordinates: [strip(geom.coordinates)] };
  return { type: "MultiPolygon", coordinates: geom.coordinates.map(strip) };
}
