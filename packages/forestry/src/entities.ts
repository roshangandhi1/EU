import { defineEntity } from "./platform";
import * as t from "./db/schema";
import * as v from "./validation";
import { z } from "zod";

const both = ["bamboo", "miombo"] as ("bamboo" | "miombo")[];

export const forestryEntities = [
  defineEntity({ name: "forestry.plot", stream: both, table: t.plots, schema: v.plotSchema, policy: "field_merge",
    actions: { read: "forestry.plot.read", write: "forestry.plot.propose" }, label: { en: "Plot", fr: "Parcelle" } }),
  defineEntity({ name: "forestry.boundary", stream: both, table: t.plotBoundaries, schema: v.boundarySchema, policy: "append_only",
    actions: { read: "forestry.plot.read", write: "forestry.boundary.write", void: "forestry.record.void" }, label: { en: "Plot boundary", fr: "Limite de parcelle" } }),
  defineEntity({ name: "forestry.planting", stream: both, table: t.plantingEvents, schema: v.plantingEventSchema, policy: "append_only",
    actions: { read: "forestry.plot.read", write: "forestry.planting.write", void: "forestry.record.void" }, label: { en: "Planting", fr: "Plantation" } }),
  defineEntity({ name: "forestry.visit", stream: both, table: t.monitoringVisits, schema: v.monitoringVisitSchema, policy: "append_only",
    actions: { read: "forestry.plot.read", write: "forestry.visit.write", void: "forestry.record.void" }, label: { en: "Monitoring visit", fr: "Visite de suivi" } }),
  defineEntity({ name: "forestry.validation", stream: both, table: t.validationVisits, schema: v.validationVisitSchema, policy: "append_only",
    actions: { read: "forestry.plot.read", write: "forestry.validation.write", void: "forestry.record.void" }, label: { en: "Community validation", fr: "Validation communautaire" } }),
  defineEntity({ name: "forestry.nursery_batch", stream: both, table: t.nurseryBatches, schema: v.nurseryBatchSchema, policy: "field_merge",
    actions: { read: "forestry.plot.read", write: "forestry.nursery.write" }, label: { en: "Nursery batch", fr: "Lot de pépinière" } }),
  defineEntity({ name: "forestry.nursery_event", stream: both, table: t.nurseryEvents, schema: v.nurseryEventSchema, policy: "append_only",
    actions: { read: "forestry.plot.read", write: "forestry.nursery.write", void: "forestry.record.void" }, label: { en: "Nursery count", fr: "Comptage pépinière" } }),
  defineEntity({ name: "forestry.imagery", stream: both, table: t.imageryLayers, schema: z.object({}).passthrough(), policy: "server_authoritative",
    actions: { read: "forestry.plot.read", write: "forestry.imagery.manage" }, label: { en: "Imagery layer", fr: "Couche d'imagerie" } }),
  defineEntity({ name: "forestry.settings", stream: both, table: t.forestrySettings, schema: z.object({}).passthrough(), policy: "server_authoritative",
    actions: { read: "forestry.plot.read", write: "forestry.settings.write" }, label: { en: "Forestry settings", fr: "Paramètres forestiers" } }),
];
