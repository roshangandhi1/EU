type Polygon = { type: "Polygon"; coordinates: number[][][] };
type MultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };

const R = 6371008.8; // mean earth radius, as @turf/area v7
const F = Math.PI / 180;

/** Spherical ring area in m² (Chamberlain & Duquette 2007), the same formula as @turf/area. */
function ringArea(coords: number[][]): number {
  const n = coords.length - 1;
  if (n <= 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const lower = coords[i]!;
    const middle = coords[i + 1 === n ? 0 : i + 1]!;
    const upper = coords[i + 2 >= n ? (i + 2) % n : i + 2]!;
    total += (upper[0]! * F - lower[0]! * F) * Math.sin(middle[1]! * F);
  }
  return (total * R * R) / 2;
}

const polygonArea = (rings: number[][][]) =>
  rings.length === 0 ? 0 : Math.abs(ringArea(rings[0]!)) - rings.slice(1).reduce((s, r) => s + Math.abs(ringArea(r)), 0);

/**
 * Geodesic area in hectares (spherical model, within about 0.3% of the ellipsoid at DRC latitudes).
 * Dependency-free so the phone can preview it; the server recomputes it from the stored geometry
 * for every indicator, so a phone can never supply its own area.
 */
export function areaHa(geom: Polygon | MultiPolygon): number {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.reduce((s, p) => s + polygonArea(p), 0) / 10_000;
}

/** Normalise any polygonal geometry to MultiPolygon, dropping Z values. */
export function toMultiPolygon(geom: Polygon | MultiPolygon): MultiPolygon {
  const strip = (rings: number[][][]) => rings.map((r) => r.map(([x, y]) => [x!, y!]));
  if (geom.type === "Polygon") return { type: "MultiPolygon", coordinates: [strip(geom.coordinates)] };
  return { type: "MultiPolygon", coordinates: geom.coordinates.map(strip) };
}
