import { z } from "zod";
import { defineEntity } from "./platform";
import * as t from "./db/schema";
import * as v from "./validation";

export const boreholeEntities = [
  defineEntity({ name: "boreholes.borehole", stream: "boreholes", table: t.boreholes, schema: v.boreholeSchema, policy: "field_merge",
    actions: { read: "boreholes.read", write: "boreholes.propose" }, label: { en: "Borehole", fr: "Forage" } }),
  defineEntity({ name: "boreholes.visit", stream: "boreholes", table: t.visits, schema: v.visitSchema, policy: "append_only",
    actions: { read: "boreholes.read", write: "boreholes.visit.write", void: "boreholes.record.void" }, label: { en: "Technician visit", fr: "Visite technique" } }),
  defineEntity({ name: "boreholes.fault", stream: "boreholes", table: t.faults, schema: v.faultSchema, policy: "lww_history",
    actions: { read: "boreholes.read", write: "boreholes.fault.write" }, label: { en: "Fault", fr: "Panne" } }),
  defineEntity({ name: "boreholes.population", stream: "boreholes", table: t.populationEstimates, schema: v.populationEstimateSchema, policy: "append_only",
    actions: { read: "boreholes.read", write: "boreholes.population.write", void: "boreholes.record.void" }, label: { en: "Population served", fr: "Population desservie" } }),
  defineEntity({ name: "boreholes.template", stream: "boreholes", table: t.maintenanceTemplates, schema: v.templateSchema, policy: "server_authoritative",
    actions: { read: "boreholes.read", write: "boreholes.template.write", configure: "boreholes.template.write" }, label: { en: "Maintenance template", fr: "Modèle d'entretien" } }),
  defineEntity({ name: "boreholes.settings", stream: "boreholes", table: t.boreholeSettings, schema: z.object({ minFlowLpmByPumpKw: z.record(z.string(), z.number().positive().nullable()), maxCheckAgeDays: z.number().int().positive(), dueSoonDays: z.number().int().min(0), overdueGraceDays: z.number().int().min(0) }), policy: "server_authoritative",
    actions: { read: "boreholes.read", write: "boreholes.settings.write", configure: "boreholes.settings.write" }, label: { en: "Borehole settings", fr: "Paramètres forages" } }),
];
