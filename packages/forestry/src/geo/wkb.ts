import type { Geometry, Position } from "geojson";

/**
 * Minimal (E)WKB reader for the geometry types we store: Point, LineString,
 * Polygon, MultiPoint, MultiLineString, MultiPolygon. 2D only; Z/M values skipped.
 */
export function parseWkbHex(hex: string): Geometry {
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < buf.length; i++) buf[i] = parseInt(hex.substr(i * 2, 2), 16);
  const view = new DataView(buf.buffer);
  let o = 0;

  function readGeom(): Geometry {
    const le = view.getUint8(o) === 1;
    o += 1;
    const raw = view.getUint32(o, le);
    o += 4;
    // EWKB flags (PostGIS) or ISO offsets (1000 = Z, 2000 = M, 3000 = ZM).
    const base = raw & 0x0fffffff;
    const iso = Math.floor(base / 1000);
    const type = base % 1000;
    const hasZ = (raw & 0x80000000) !== 0 || iso === 1 || iso === 3;
    const hasM = (raw & 0x40000000) !== 0 || iso === 2 || iso === 3;
    if ((raw & 0x20000000) !== 0) o += 4; // SRID
    const extra = (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    const pos = (): Position => {
      const x = view.getFloat64(o, le);
      const y = view.getFloat64(o + 8, le);
      o += 16 + extra * 8;
      return [x, y];
    };
    const u32 = () => {
      const n = view.getUint32(o, le);
      o += 4;
      return n;
    };
    const ring = () => Array.from({ length: u32() }, pos);

    switch (type) {
      case 1:
        return { type: "Point", coordinates: pos() };
      case 2:
        return { type: "LineString", coordinates: ring() };
      case 3:
        return { type: "Polygon", coordinates: Array.from({ length: u32() }, ring) };
      case 4:
        return { type: "MultiPoint", coordinates: Array.from({ length: u32() }, () => (readGeom() as any).coordinates) };
      case 5:
        return { type: "MultiLineString", coordinates: Array.from({ length: u32() }, () => (readGeom() as any).coordinates) };
      case 6:
        return { type: "MultiPolygon", coordinates: Array.from({ length: u32() }, () => (readGeom() as any).coordinates) };
      default:
        throw new Error(`Unsupported WKB geometry type ${type}`);
    }
  }
  return readGeom();
}
