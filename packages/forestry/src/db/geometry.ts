import { jsonb } from "drizzle-orm/pg-core";
import type { MultiPolygon, Point } from "geojson";

/**
 * Geometry is stored as GeoJSON (WGS84) in jsonb for now, because the PGlite test database has
 * no PostGIS. Areas are computed on the server with a geodesic formula (see geo/area.ts).
 * A later migration adds PostGIS geometry columns generated from these, for spatial queries
 * and tile serving, without changing the module's API.
 */
export const multiPolygon = (name: string) => jsonb(name).$type<MultiPolygon>();
export const point = (name: string) => jsonb(name).$type<Point>();
