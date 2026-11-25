/** Zod schemas shared by phone (validation before save), sync API and web forms. */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();
const siteId = z.string().min(1).max(64);
const count = z.number().int().min(0).max(1_000_000);
const gps = {
  gpsLat: z.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.number().min(-180).max(180).nullable().optional(),
  gpsAccuracyM: z.number().min(0).max(10_000).nullable().optional(),
};

export const stream = z.enum(["bamboo", "miombo"]);

export const plotSchema = z.object({
  stream,
  code: z.string().min(1).max(40),
  localName: z.string().max(120).nullable().optional(),
  village: z.string().min(1).max(120),
  species: z.array(z.string()).default([]),
  propagationMethod: z.enum(["culm_cutting", "offset", "seedling", "mixed"]).nullable().optional(),
  targetDensityPerHa: z.number().int().positive().max(5000).nullable().optional(),
  status: z.enum(["planned", "pegged", "planted", "established", "failed", "harvested"]),
  restorationApproach: z.enum(["gap_planting", "anr", "enrichment"]).nullable().optional(),
  firebreakStatus: z.enum(["none", "partial", "complete"]).nullable().optional(),
  communityContacts: z.array(z.object({ name: z.string(), role: z.string(), phone: z.string().optional() })).nullable().optional(),
  publicVisible: z.boolean().default(false),
  notes: z.string().max(4000).nullable().optional(),
});

const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export const multiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(lonLat).min(4)).min(1)).min(1),
});

export const boundarySchema = z.object({
  geom: multiPolygonSchema,
  source: z.enum(["phone_walk", "imagery_drawn", "kmz_import", "geojson_import", "shapefile_import", "survey"]),
  sourceRef: z.string().nullable().optional(),
  gpsAccuracyM: z.number().nullable().optional(),
});

export const plantingEventSchema = z.object({
  plantedOn: isoDate,
  lines: z.array(z.object({ species: z.string().min(1), count: count.min(1), batchId: uuid.optional() })).min(1),
  isGapFilling: z.boolean().default(false),
  spacingM: z.string().max(20).nullable().optional(),
  team: z.string().max(200).nullable().optional(),
  photos: z.array(z.string()).default([]),
  notes: z.string().max(4000).nullable().optional(),
  ...gps,
});

export const sampleCountSchema = z.object({
  species: z.string().min(1),
  alive: count,
  dead: count,
  naturalAlive: count.optional(),
  heightClass: z.enum(["lt50cm", "50_150cm", "150_300cm", "gt300cm"]).optional(),
});

export const samplePlotSchema = z.object({
  pointIndex: z.number().int().min(0),
  lat: z.number(),
  lng: z.number(),
  gpsAccuracyM: z.number().optional(),
  radiusM: z.number().positive().max(100),
  counts: z.array(sampleCountSchema),
  skipped: z.enum(["inaccessible", "flooded", "other"]).optional(),
});

export const monitoringVisitSchema = z.object({
  visitedOn: isoDate,
  sampleSeed: z.number().int().nullable().optional(),
  samples: z.array(samplePlotSchema).default([]),
  meanHeightCm: z.number().min(0).max(3000).nullable().optional(),
  newShootsPerClump: z.number().min(0).max(200).nullable().optional(),
  pruningStage: z.number().int().min(1).max(4).nullable().optional(),
  threats: z.array(z.enum(["fire", "charcoal", "grazing", "encroachment", "pests", "disease", "livestock", "flooding", "other"])).default([]),
  weeding: z.enum(["done", "partial", "needed"]).nullable().optional(),
  gapsFilled: count.nullable().optional(),
  photos: z.array(z.object({ fileId: z.string(), photoPoint: z.string().optional() })).default([]),
  droneSurveyOn: isoDate.nullable().optional(),
  orthomosaicLayerId: uuid.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  ...gps,
});

export const validationVisitSchema = z.object({
  stream,
  heldOn: isoDate,
  village: z.string().min(1),
  attendees: z.array(z.object({ name: z.string().min(1), role: z.string().min(1) })).min(1),
  plotSiteIds: z.array(siteId).min(1),
  attendanceSheetFileId: z.string().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  ...gps,
});

export const nurseryBatchSchema = z.object({
  code: z.string().min(1).max(40),
  stream,
  species: z.string().min(1),
  method: z.enum(["seed", "culm_cutting", "offset", "wildling"]),
  startedOn: isoDate,
  quantityStarted: count.min(1),
  notes: z.string().max(4000).nullable().optional(),
});

export const nurseryEventSchema = z.object({
  batchId: uuid,
  occurredOn: isoDate,
  kind: z.enum(["germination_count", "loss", "dispatch"]),
  quantity: count.min(1),
  toPlotSiteId: siteId.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
}).refine((e) => e.kind !== "dispatch" || !!e.toPlotSiteId, { message: "dispatch_needs_plot", path: ["toPlotSiteId"] });

export type PlotForm = z.infer<typeof plotSchema>;
export type PlantingEventForm = z.infer<typeof plantingEventSchema>;
export type MonitoringVisitForm = z.infer<typeof monitoringVisitSchema>;
