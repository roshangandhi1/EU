import { defineEntity } from "./platform";
import * as t from "./db/schema";
import * as v from "./validation";
import { fa, FORESTRY_STREAMS, type ForestryStream } from "./actions";
import { z } from "zod";

const settingsSchema = z.object({
  densityRulePerHa: z.number().int().positive(),
  sampleRadiusM: z.number().positive(),
  samplesPerHa: z.number().positive(),
  minSamplesPerPlot: z.number().int().positive(),
  maxSamplesPerPlot: z.number().int().positive(),
  speciesList: z.array(z.object({ key: z.string(), latin: z.string(), en: z.string().optional(), fr: z.string().optional() })),
});
const imagerySchema = z.object({
  name: z.string().min(1),
  capturedOn: z.string().nullable().optional(),
  kind: z.enum(["orthomosaic", "satellite"]),
  pmtilesUrl: z.string().nullable().optional(),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
  offline: z.boolean().default(false),
});

const names = { bamboo: { en: "Bamboo", fr: "Bambou" }, miombo: { en: "Miombo", fr: "Miombo" } };

/**
 * One set of entities per stream over shared tables. The record's scope is its plot (or nursery)
 * site, whose stream must match the entity's stream (checked by the platform on push).
 */
function forStream(s: ForestryStream) {
  const L = (en: string, fr: string) => ({ en: `${names[s].en}: ${en}`, fr: `${names[s].fr} : ${fr}` });
  const read = fa(s, "plot.read");
  const voidA = fa(s, "record.void");
  return [
    defineEntity({ name: `${s}.plot`, stream: s, siteKinds: ["plot"], table: t.plots, schema: v.plotSchema, policy: "field_merge",
      actions: { read, write: fa(s, "plot.propose") }, label: L("plot", "parcelle") }),
    defineEntity({ name: `${s}.boundary`, stream: s, siteKinds: ["plot"], table: t.plotBoundaries, schema: v.boundarySchema, policy: "append_only",
      actions: { read, write: fa(s, "boundary.write"), void: voidA }, label: L("plot boundary", "limite de parcelle") }),
    defineEntity({ name: `${s}.boundary_approval`, stream: s, siteKinds: ["plot"], table: t.boundaryApprovals, schema: v.boundaryApprovalSchema, policy: "append_only",
      actions: { read, write: fa(s, "boundary.approve"), void: fa(s, "boundary.approve") }, label: L("boundary approval", "validation de limite") }),
    defineEntity({ name: `${s}.planting`, stream: s, siteKinds: ["plot"], table: t.plantingEvents, schema: v.plantingEventSchema, policy: "append_only",
      actions: { read, write: fa(s, "planting.write"), void: voidA }, label: L("planting", "plantation") }),
    defineEntity({ name: `${s}.visit`, stream: s, siteKinds: ["plot"], table: t.monitoringVisits, schema: v.monitoringVisitSchema, policy: "append_only",
      actions: { read, write: fa(s, "visit.write"), void: voidA }, label: L("monitoring visit", "visite de suivi") }),
    defineEntity({ name: `${s}.validation`, stream: s, siteKinds: ["village"], table: t.validationVisits, schema: v.validationVisitSchema, policy: "append_only",
      actions: { read, write: fa(s, "validation.write"), void: voidA }, label: L("community validation", "validation communautaire") }),
    defineEntity({ name: `${s}.nursery_batch`, stream: s, siteKinds: ["nursery"], table: t.nurseryBatches, schema: v.nurseryBatchSchema, policy: "field_merge",
      actions: { read, write: fa(s, "nursery.write") }, label: L("nursery batch", "lot de pépinière") }),
    defineEntity({ name: `${s}.nursery_event`, stream: s, siteKinds: ["nursery"], table: t.nurseryEvents, schema: v.nurseryEventSchema, policy: "append_only",
      actions: { read, write: fa(s, "nursery.write"), void: voidA }, label: L("nursery count", "comptage pépinière") }),
    defineEntity({ name: `${s}.imagery`, stream: s, table: t.imageryLayers, schema: imagerySchema, policy: "server_authoritative",
      actions: { read, write: fa(s, "imagery.manage"), configure: fa(s, "imagery.manage") }, label: L("imagery layer", "couche d'imagerie") }),
    defineEntity({ name: `${s}.settings`, stream: s, table: t.forestrySettings, schema: settingsSchema, policy: "server_authoritative",
      actions: { read, write: fa(s, "settings.write"), configure: fa(s, "settings.write") }, label: L("settings", "paramètres") }),
  ];
}

export const forestryEntities = FORESTRY_STREAMS.flatMap(forStream);
