/**
 * Dependency-free geometry for the phone: point-in-polygon and distance, so the Android app can
 * find the plot a planter is standing in without bundling turf.
 */
/** Structural so the phone needs no @types/geojson. */
type MultiPolygon = { type: "MultiPolygon"; coordinates: number[][][][] };

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when [lng, lat] lies inside the multipolygon (outer ring in, holes out). */
export function pointInMultiPolygon(lng: number, lat: number, geom: MultiPolygon): boolean {
  return geom.coordinates.some((poly) => {
    const [outer, ...holes] = poly;
    return !!outer && inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h));
  });
}

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_008.8;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Rough distance from a point to the nearest vertex of a geometry (good enough to say "300 m away"). */
export function distanceToGeomM(lat: number, lng: number, geom: MultiPolygon): number {
  let best = Infinity;
  for (const poly of geom.coordinates) for (const ring of poly) for (const [x, y] of ring) best = Math.min(best, distanceM(lat, lng, y!, x!));
  return best;
}
