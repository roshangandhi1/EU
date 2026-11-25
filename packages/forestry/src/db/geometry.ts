import { customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { MultiPolygon, Point } from "geojson";
import { parseWkbHex } from "../geo/wkb";

/** PostGIS MultiPolygon in WGS84. Written from GeoJSON, read back from WKB hex. */
export const multiPolygon = customType<{ data: MultiPolygon; driverData: string }>({
  dataType: () => "geometry(MultiPolygon,4326)",
  toDriver: (v) =>
    sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(v)}), 4326))` as unknown as string,
  fromDriver: (v) => parseWkbHex(v) as MultiPolygon,
});

/** PostGIS Point in WGS84. */
export const point = customType<{ data: Point; driverData: string }>({
  dataType: () => "geometry(Point,4326)",
  toDriver: (v) => sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(v)}), 4326)` as unknown as string,
  fromDriver: (v) => parseWkbHex(v) as Point,
});
