import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.uuid();
const siteId = z.string().min(1).max(64);
const bi = z.object({ en: z.string().min(1), fr: z.string().min(1) });

export const frequencySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("each_visit") }),
  z.object({ kind: z.literal("every_n_days"), n: z.number().int().min(1).max(3650) }),
  z.object({ kind: z.literal("every_n_months"), n: z.number().int().min(1).max(60), day: z.number().int().min(1).max(28) }),
  z.object({ kind: z.literal("yearly"), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
]);

export const proofSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tick") }),
  z.object({ kind: z.literal("reading"), unit: z.string().min(1), min: z.number().optional(), max: z.number().optional() }),
  z.object({ kind: z.literal("photo") }),
]);

export const appliesToSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ pumpRatingsKw: z.array(z.number()).optional(), villages: z.array(z.string()).optional(), siteIds: z.array(siteId).optional() }),
]);

export const taskDefSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  label: bi,
  frequency: frequencySchema,
  assignee: z.string().optional(),
  appliesTo: appliesToSchema,
  proof: proofSchema,
  failOpensFault: z.boolean(),
});

export const templateSchema = z.object({
  templateKey: z.string().regex(/^[a-z0-9_]{2,40}$/),
  templateVersion: z.number().int().positive(),
  active: z.boolean().default(true),
  name: bi,
  tasks: z.array(taskDefSchema).min(1).refine((ts) => new Set(ts.map((t) => t.key)).size === ts.length, "duplicate_task_key"),
});

export const boreholeSchema = z.object({
  code: z.string().min(1).max(40),
  village: z.string().min(1),
  gpsLat: z.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.number().min(-180).max(180).nullable().optional(),
  gpsAccuracyM: z.number().min(0).nullable().optional(),
  lifecycle: z.enum(["planned", "drilled", "equipped", "commissioned", "handed_over", "operational", "needs_repair", "non_functional"]),
  drilledOn: isoDate.nullable().optional(),
  contractor: z.string().nullable().optional(),
  depthM: z.number().min(0).max(1000).nullable().optional(),
  staticWaterLevelM: z.number().min(0).max(1000).nullable().optional(),
  pumpModel: z.string().nullable().optional(),
  pumpRatingKw: z.number().positive().max(50).nullable().optional(),
  panelCount: z.number().int().min(0).nullable().optional(),
  panelRatingW: z.number().int().min(0).nullable().optional(),
  tankLitres: z.number().int().min(0).nullable().optional(),
  pumpTestYieldLpm: z.number().min(0).nullable().optional(),
  commissionedOn: isoDate.nullable().optional(),
  handedOverOn: isoDate.nullable().optional(),
  waterCommittee: z.string().nullable().optional(),
  sopHandedOver: z.boolean().default(false),
  casing: z.string().nullable().optional(),
  serials: z.record(z.string(), z.string()).nullable().optional(),
  drawdownM: z.number().min(0).max(1000).nullable().optional(),
  recoveryMin: z.number().min(0).nullable().optional(),
  waterQuality: z.array(z.object({ testedOn: isoDate, turbidityNtu: z.number().min(0).optional(), ecoliPer100ml: z.number().min(0).optional(), notes: z.string().optional() })).nullable().optional(),
  caretakersTrained: z.array(z.object({ name: z.string().min(1), phone: z.string().optional(), trainedOn: isoDate })).nullable().optional(),
  attachments: z.record(z.string(), z.array(z.string())).default({}),
  publicVisible: z.boolean().default(false),
  notes: z.string().max(4000).nullable().optional(),
});

export const taskResultSchema = z.object({
  taskKey: z.string(),
  done: z.boolean(),
  pass: z.boolean().optional(),
  value: z.number().optional(),
  photoFileId: z.string().optional(),
  note: z.string().max(1000).optional(),
});

export const visitSchema = z.object({
  visitedOn: isoDate,
  kind: z.enum(["routine", "repair", "inspection", "commissioning"]),
  templateKey: z.string().nullable().optional(),
  templateVersion: z.number().int().nullable().optional(),
  results: z.array(taskResultSchema).default([]),
  operational: z.object({ pumpDelivers: z.boolean(), flowLpm: z.number().min(0).max(2000).nullable(), tankFillsTapsOk: z.boolean() }).nullable().optional(),
  flowLpm: z.number().min(0).max(2000).nullable().optional(),
  tankLevelPct: z.number().int().min(0).max(100).nullable().optional(),
  panelCondition: z.string().nullable().optional(),
  downtimeDays: z.number().int().min(0).nullable().optional(),
  repairsDone: z.string().nullable().optional(),
  partsUsed: z.array(z.object({ part: z.string(), qty: z.number().positive(), fromStore: z.string() })).default([]),
  faultsClosed: z.array(uuid).default([]),
  photos: z.array(z.string()).default([]),
  notes: z.string().max(4000).nullable().optional(),
  gpsLat: z.number().nullable().optional(),
  gpsLng: z.number().nullable().optional(),
  gpsAccuracyM: z.number().nullable().optional(),
});

export const populationEstimateSchema = z.object({
  estimatedOn: isoDate,
  method: z.enum(["household_count", "collection_headcount", "village_census"]),
  households: z.number().int().min(0).nullable().optional(),
  avgHouseholdSize: z.number().min(0).max(30).nullable().optional(),
  headcount: z.number().int().min(0).nullable().optional(),
  population: z.number().int().min(0),
  otherUsers: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
}).refine((e) => e.method !== "household_count" || (e.households != null && e.avgHouseholdSize != null), {
  message: "household_count_needs_households_and_size",
});

export const faultSchema = z.object({
  openedOn: isoDate,
  openedByVisitId: uuid.nullable().optional(),
  taskKey: z.string().nullable().optional(),
  description: z.string().min(1),
  severity: z.enum(["no_water", "reduced", "minor"]),
  closedOn: isoDate.nullable().optional(),
  closedByVisitId: uuid.nullable().optional(),
  photos: z.array(z.string()).default([]),
});
