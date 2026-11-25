/** Writing and reading public map snapshots (server only). */
import { auditLog, type Db } from "@eu/db";
import { desc, eq } from "drizzle-orm";
import type { FeatureCollection } from "geojson";
import { publicMapSnapshots } from "./db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

export const PUBLIC_LAYERS = ["bamboo", "miombo", "boreholes"] as const;
export type PublicLayer = (typeof PUBLIC_LAYERS)[number];

export interface PublicLayerData {
  layer: PublicLayer;
  publishedAt: string;
  asAt: string;
  data: FeatureCollection;
  summary: Record<string, number>;
}

/** Store a snapshot and record who published it. Strips every property not in `allowed`. */
export async function publishSnapshot(
  db: Db,
  input: { layer: PublicLayer; userId: string; asAt: string; data: FeatureCollection; summary: Record<string, number>; allowed: string[] },
): Promise<{ id: string; features: number }> {
  const allowed = new Set(input.allowed);
  const data: FeatureCollection = {
    type: "FeatureCollection",
    features: input.data.features.map((f, i) => ({
      type: "Feature",
      id: i,
      geometry: f.geometry,
      properties: Object.fromEntries(Object.entries(f.properties ?? {}).filter(([k]) => allowed.has(k))),
    })),
  };
  const d = db as AnyDb;
  const [row] = await d.insert(publicMapSnapshots).values({ layer: input.layer, publishedBy: input.userId, asAt: input.asAt, data, summary: input.summary }).returning({ id: publicMapSnapshots.id });
  await d.insert(auditLog).values({
    entity: "public_map.snapshot", recordId: row.id, scopeId: input.layer, op: "publish", userId: input.userId,
    note: `${data.features.length} features as at ${input.asAt}`,
  });
  return { id: row.id, features: data.features.length };
}

/** Latest snapshot for each layer that has been published. */
export async function latestSnapshots(db: Db): Promise<PublicLayerData[]> {
  const d = db as AnyDb;
  const out: PublicLayerData[] = [];
  for (const layer of PUBLIC_LAYERS) {
    const [row] = await d.select().from(publicMapSnapshots).where(eq(publicMapSnapshots.layer, layer)).orderBy(desc(publicMapSnapshots.publishedAt)).limit(1);
    if (row) out.push({ layer, publishedAt: new Date(row.publishedAt).toISOString(), asAt: row.asAt, data: row.data, summary: row.summary });
  }
  return out;
}
