/**
 * Forestry module tables: bamboo (indicator 2.2.1) and miombo (2.1.1), plus the shared nursery.
 *
 * Plots are platform `sites` rows (kind 'plot'); everything here is keyed by site_id.
 * scope_id (from syncColumns) is the site id for per-site records, which drives what each phone pulls.
 */
import {
  boolean, date, doublePrecision, index, integer, jsonb, numeric, pgEnum, pgTable, text, uuid,
} from "drizzle-orm/pg-core";
import { syncColumns } from "../platform";
import { multiPolygon, point } from "./geometry";

export const forestryStream = pgEnum("forestry_stream", ["bamboo", "miombo"]);

export const plotStatus = pgEnum("forestry_plot_status", [
  "planned", "pegged", "planted", "established", "failed", "harvested",
]);

export const boundarySource = pgEnum("forestry_boundary_source", [
  "phone_walk", "imagery_drawn", "kmz_import", "geojson_import", "shapefile_import", "survey",
]);

const gps = () => ({
  gpsLat: doublePrecision("gps_lat"),
  gpsLng: doublePrecision("gps_lng"),
  gpsAccuracyM: doublePrecision("gps_accuracy_m"),
});

/** Attributes of a plot. Policy: field_merge (edited mostly on web; field edits become proposals). */
export const plots = pgTable("forestry_plots", {
  ...syncColumns(),
  siteId: uuid("site_id").notNull().unique(),
  stream: forestryStream("stream").notNull(),
  code: text("code").notNull(), // e.g. KBK-B-007
  localName: text("local_name"),
  village: text("village").notNull(),
  species: jsonb("species").$type<string[]>().notNull().default([]),
  propagationMethod: text("propagation_method"), // bamboo: culm_cutting | offset | seedling
  targetDensityPerHa: integer("target_density_per_ha"), // null = use module setting
  status: plotStatus("status").notNull().default("planned"),
  restorationApproach: text("restoration_approach"), // miombo: gap_planting | anr | enrichment
  firebreakStatus: text("firebreak_status"), // miombo: none | partial | complete
  communityContacts: jsonb("community_contacts").$type<{ name: string; role: string; phone?: string }[]>(),
  publicVisible: boolean("public_visible").notNull().default(false),
  notes: text("notes"),
}, (t) => [index("forestry_plots_stream_idx").on(t.stream)]);

/**
 * Versioned plot boundaries. Append-only; exactly one per plot may be authoritative at a time
 * (enforced in server code when promoting). Area is computed by the server in an equal-area
 * projection, never trusted from the phone.
 */
export const plotBoundaries = pgTable("forestry_plot_boundaries", {
  ...syncColumns(),
  siteId: uuid("site_id").notNull(),
  geom: multiPolygon("geom").notNull(),
  source: boundarySource("source").notNull(),
  sourceRef: text("source_ref"), // file name / KML placemark id / imagery layer id
  gpsAccuracyM: doublePrecision("gps_accuracy_m"), // phone walks only
  areaHa: numeric("area_ha", { precision: 12, scale: 4 }), // server-computed
  authoritative: boolean("authoritative").notNull().default(false),
  authoritativeFrom: date("authoritative_from"), // as-at reports use the boundary in force on the date
  approvedBy: uuid("approved_by"),
}, (t) => [index("forestry_boundaries_site_idx").on(t.siteId)]);

export type PlantingLine = { species: string; count: number; batchId?: string; natural?: false };

/** Planting events. Append-only. */
export const plantingEvents = pgTable("forestry_planting_events", {
  ...syncColumns(),
  ...gps(),
  siteId: uuid("site_id").notNull(),
  plantedOn: date("planted_on").notNull(),
  lines: jsonb("lines").$type<PlantingLine[]>().notNull(),
  isGapFilling: boolean("is_gap_filling").notNull().default(false),
  spacingM: text("spacing_m"), // e.g. "5x5"
  team: text("team"),
  photos: jsonb("photos").$type<string[]>().notNull().default([]), // platform file ids
  notes: text("notes"),
}, (t) => [index("forestry_planting_site_idx").on(t.siteId, t.plantedOn)]);

export type SampleCount = {
  species: string;
  alive: number;
  dead: number;
  /** Miombo: natural regenerants counted separately from planted stock. */
  naturalAlive?: number;
  heightClass?: "lt50cm" | "50_150cm" | "150_300cm" | "gt300cm";
};

export type SamplePlot = {
  /** Index of the app-generated point for this visit, so the same draw can be reproduced. */
  pointIndex: number;
  lat: number;
  lng: number;
  gpsAccuracyM?: number;
  radiusM: number;
  counts: SampleCount[];
  skipped?: "inaccessible" | "flooded" | "other";
};

/** Monitoring visits. Append-only. */
export const monitoringVisits = pgTable("forestry_monitoring_visits", {
  ...syncColumns(),
  ...gps(),
  siteId: uuid("site_id").notNull(),
  visitedOn: date("visited_on").notNull(),
  sampleSeed: integer("sample_seed"), // seed used to place sample points
  samples: jsonb("samples").$type<SamplePlot[]>().notNull().default([]),
  meanHeightCm: doublePrecision("mean_height_cm"),
  newShootsPerClump: doublePrecision("new_shoots_per_clump"), // bamboo
  pruningStage: integer("pruning_stage"), // miombo: 1-4
  threats: jsonb("threats").$type<string[]>().notNull().default([]), // fire, charcoal, grazing, encroachment, pests, disease, livestock
  weeding: text("weeding"), // done | partial | needed
  gapsFilled: integer("gaps_filled"),
  photos: jsonb("photos").$type<{ fileId: string; photoPoint?: string }[]>().notNull().default([]),
  droneSurveyOn: date("drone_survey_on"),
  orthomosaicLayerId: uuid("orthomosaic_layer_id"),
  notes: text("notes"),
}, (t) => [index("forestry_visits_site_idx").on(t.siteId, t.visitedOn)]);

/** Fixed photo points per plot, so the same view can be compared year on year. Field-merge. */
export const photoPoints = pgTable("forestry_photo_points", {
  ...syncColumns(),
  siteId: uuid("site_id").notNull(),
  label: text("label").notNull(),
  location: point("location").notNull(),
  bearingDeg: integer("bearing_deg"),
});

/** Community validation visits (logframe source of verification for 2.1.1). Append-only. */
export const validationVisits = pgTable("forestry_validation_visits", {
  ...syncColumns(),
  ...gps(),
  stream: forestryStream("stream").notNull(),
  heldOn: date("held_on").notNull(),
  village: text("village").notNull(),
  attendees: jsonb("attendees").$type<{ name: string; role: string }[]>().notNull(),
  plotSiteIds: jsonb("plot_site_ids").$type<string[]>().notNull(),
  attendanceSheetFileId: text("attendance_sheet_file_id"),
  notes: text("notes"),
});

/** Nursery batches (shared by bamboo and miombo). Field-merge; scope = the nursery site. */
export const nurseryBatches = pgTable("forestry_nursery_batches", {
  ...syncColumns(),
  nurserySiteId: uuid("nursery_site_id").notNull(),
  code: text("code").notNull(),
  stream: forestryStream("stream").notNull(),
  species: text("species").notNull(),
  method: text("method").notNull(), // seed | culm_cutting | offset | wildling
  startedOn: date("started_on").notNull(),
  quantityStarted: integer("quantity_started").notNull(),
  notes: text("notes"),
});

/** Nursery counts and dispatches. Append-only, so germination history is never overwritten. */
export const nurseryEvents = pgTable("forestry_nursery_events", {
  ...syncColumns(),
  batchId: uuid("batch_id").notNull(),
  occurredOn: date("occurred_on").notNull(),
  kind: text("kind").$type<"germination_count" | "loss" | "dispatch">().notNull(),
  quantity: integer("quantity").notNull(),
  toPlotSiteId: uuid("to_plot_site_id"), // dispatch only
  notes: text("notes"),
});

/** Imagery layers (drone orthomosaics as PMTiles in Blob). Server-authoritative. */
export const imageryLayers = pgTable("forestry_imagery_layers", {
  ...syncColumns(),
  name: text("name").notNull(),
  capturedOn: date("captured_on"),
  kind: text("kind").$type<"orthomosaic" | "satellite">().notNull(),
  pmtilesUrl: text("pmtiles_url"),
  bounds: jsonb("bounds").$type<[number, number, number, number]>(),
  sizeBytes: integer("size_bytes"),
  offline: boolean("offline").notNull().default(false), // ship to phones
});

/** Module settings (density rules, sampling). Server-authoritative, versioned via syncColumns.version. */
export const forestrySettings = pgTable("forestry_settings", {
  ...syncColumns(),
  stream: forestryStream("stream").notNull().unique(),
  densityRulePerHa: integer("density_rule_per_ha").notNull(), // bamboo 400, miombo 300
  sampleRadiusM: doublePrecision("sample_radius_m").notNull(),
  samplesPerHa: doublePrecision("samples_per_ha").notNull(),
  minSamplesPerPlot: integer("min_samples_per_plot").notNull(),
  maxSamplesPerPlot: integer("max_samples_per_plot").notNull(),
  speciesList: jsonb("species_list").$type<{ key: string; latin: string; en?: string; fr?: string }[]>().notNull(),
});
