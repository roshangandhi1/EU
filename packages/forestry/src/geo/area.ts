import turfArea from "@turf/area";
import type { MultiPolygon, Polygon } from "geojson";

/**
 * Geodesic area in hectares (spherical model, within about 0.3% of the ellipsoid at DRC latitudes).
 * The phone uses it for previews; the server recomputes it from the stored geometry for every
 * indicator, so a phone can never supply its own area.
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
