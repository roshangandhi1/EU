/**
 * Boreholes module tables (indicator 1.1.1). Boreholes are platform `sites` rows (kind 'borehole').
 * Per-borehole records use scope_id = the borehole's site id; templates and settings use scope_id = 'boreholes'.
 * Only GoCongo technicians use the field app for this module (no caretaker view).
 */
import {
  boolean, date, uniqueIndex, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, uuid,
} from "drizzle-orm/pg-core";
import { syncColumns } from "../platform";
import type { Frequency, ProofSpec, AppliesTo, TaskResult, OperationalCheck, MaintenanceTaskDef } from "../types";

export const lifecycle = pgEnum("borehole_lifecycle", [
  "planned", "drilled", "equipped", "commissioned", "handed_over", "operational", "needs_repair", "non_functional",
]);

/** Borehole attributes. Policy: field_merge (master data edited on web; field edits are proposals). */
export const boreholes = pgTable("borehole_attributes", {
  ...syncColumns(),
  code: text("code").notNull(), // e.g. BH-017
  village: text("village").notNull(),
  gpsLat: doublePrecision("gps_lat"),
  gpsLng: doublePrecision("gps_lng"),
  gpsAccuracyM: doublePrecision("gps_accuracy_m"),
  lifecycle: lifecycle("lifecycle").notNull().default("planned"),
  // Construction
  drilledOn: date("drilled_on"),
  contractor: text("contractor"),
  depthM: doublePrecision("depth_m"),
  staticWaterLevelM: doublePrecision("static_water_level_m"),
  casing: text("casing"),
  // Equipment
  pumpModel: text("pump_model"),
  pumpRatingKw: doublePrecision("pump_rating_kw"), // 2.2 | 1.1 | 0.75
  panelCount: integer("panel_count"),
  panelRatingW: integer("panel_rating_w"),
  tankLitres: integer("tank_litres"),
  serials: jsonb("serials").$type<Record<string, string>>(),
  // Commissioning
  pumpTestYieldLpm: doublePrecision("pump_test_yield_lpm"),
  drawdownM: doublePrecision("drawdown_m"),
  recoveryMin: doublePrecision("recovery_min"),
  waterQuality: jsonb("water_quality").$type<{ testedOn: string; turbidityNtu?: number; ecoliPer100ml?: number; notes?: string }[]>(),
  commissionedOn: date("commissioned_on"),
  // Handover
  handedOverOn: date("handed_over_on"),
  waterCommittee: text("water_committee"),
  caretakersTrained: jsonb("caretakers_trained").$type<{ name: string; phone?: string; trainedOn: string }[]>(),
  sopHandedOver: boolean("sop_handed_over").notNull().default(false),
  // Attachments (platform file ids) keyed by evidence type: drilling_log, commissioning_report, handover_report, ...
  attachments: jsonb("attachments").$type<Record<string, string[]>>().notNull().default({}),
  publicVisible: boolean("public_visible").notNull().default(false),
  notes: text("notes"),
}, (t) => [uniqueIndex("borehole_site_unique").on(t.scopeId), index("borehole_village_idx").on(t.village)]);

/** Population served estimates. Append-only, always with the method used. */
export const populationEstimates = pgTable("borehole_population_estimates", {
  ...syncColumns(),
  estimatedOn: date("estimated_on").notNull(),
  method: text("method").$type<"household_count" | "collection_headcount" | "village_census">().notNull(),
  households: integer("households"),
  avgHouseholdSize: doublePrecision("avg_household_size"),
  headcount: integer("headcount"),
  population: integer("population").notNull(),
  otherUsers: jsonb("other_users").$type<string[]>().notNull().default([]), // school, clinic, nursery
  notes: text("notes"),
});

/**
 * Maintenance templates, built by stream leads on the web. Server-authoritative and versioned:
 * a change creates a new row (same templateKey, version+1) so old visits stay tied to the
 * checklist in force at the time.
 */
export const maintenanceTemplates = pgTable("borehole_maintenance_templates", {
  ...syncColumns(),
  templateKey: text("template_key").notNull(),
  templateVersion: integer("template_version").notNull(),
  active: boolean("active").notNull().default(true),
  name: jsonb("name").$type<{ en: string; fr: string }>().notNull(),
  tasks: jsonb("tasks").$type<MaintenanceTaskDef[]>().notNull(),
}, (t) => [index("borehole_tmpl_key_idx").on(t.templateKey, t.templateVersion)]);

export type { MaintenanceTaskDef } from "../types";

/** Technician visits. Append-only. */
export const visits = pgTable("borehole_visits", {
  ...syncColumns(),
  gpsLat: doublePrecision("gps_lat"),
  gpsLng: doublePrecision("gps_lng"),
  gpsAccuracyM: doublePrecision("gps_accuracy_m"),
  visitedOn: date("visited_on").notNull(),
  kind: text("kind").$type<"routine" | "repair" | "inspection" | "commissioning">().notNull(),
  templateKey: text("template_key"),
  templateVersion: integer("template_version"),
  results: jsonb("results").$type<TaskResult[]>().notNull().default([]),
  operational: jsonb("operational").$type<OperationalCheck>(),
  flowLpm: doublePrecision("flow_lpm"),
  tankLevelPct: integer("tank_level_pct"),
  panelCondition: text("panel_condition"),
  downtimeDays: integer("downtime_days"),
  repairsDone: text("repairs_done"),
  partsUsed: jsonb("parts_used").$type<{ part: string; qty: number; fromStore: string }[]>().notNull().default([]),
  faultsClosed: jsonb("faults_closed").$type<string[]>().notNull().default([]),
  photos: jsonb("photos").$type<string[]>().notNull().default([]),
  notes: text("notes"),
}, (t) => [index("borehole_visits_site_idx").on(t.scopeId, t.visitedOn)]);

/** Faults: opened by a failed check, closed by a repair visit. Later edit wins, history kept. */
export const faults = pgTable("borehole_faults", {
  ...syncColumns(),
  openedOn: date("opened_on").notNull(),
  openedByVisitId: uuid("opened_by_visit_id"),
  taskKey: text("task_key"),
  description: text("description").notNull(),
  severity: text("severity").$type<"no_water" | "reduced" | "minor">().notNull(),
  closedOn: date("closed_on"),
  closedByVisitId: uuid("closed_by_visit_id"),
  photos: jsonb("photos").$type<string[]>().notNull().default([]),
});

/** Module settings. Server-authoritative. Thresholds are settings, not code. */
export const boreholeSettings = pgTable("borehole_settings", {
  ...syncColumns(),
  /** Minimum flow (L/min) by pump rating to count as operational. Null = not yet agreed. */
  minFlowLpmByPumpKw: jsonb("min_flow_lpm_by_pump_kw").$type<Record<string, number | null>>().notNull(),
  /** A borehole counts for 1.1.1 only if its latest passing check is this recent. */
  maxCheckAgeDays: integer("max_check_age_days").notNull(),
  dueSoonDays: integer("due_soon_days").notNull(),
  overdueGraceDays: integer("overdue_grace_days").notNull(),
});
