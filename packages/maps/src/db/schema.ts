/**
 * Public map snapshots. The public map never reads live records: a stream lead publishes a
 * snapshot (only records marked public, with generalised geometry), and the public page shows
 * the latest snapshot per layer. Every publish is kept, so what was public when is auditable.
 */
import type { FeatureCollection } from "geojson";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const publicMapSnapshots = pgTable(
  "public_map_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    layer: text("layer").notNull(), // bamboo | miombo | boreholes
    publishedBy: text("published_by").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    asAt: text("as_at").notNull(),
    data: jsonb("data").$type<FeatureCollection>().notNull(),
    summary: jsonb("summary").$type<Record<string, number>>().notNull(),
  },
  (t) => [index("public_map_layer_idx").on(t.layer, t.publishedAt)],
);
