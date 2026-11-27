/** Read models for the borehole list extras and the borehole detail page (web only, read-only). */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { files, users } from "@eu/db";
import { boreholes, faults, populationEstimates, visits } from "@eu/boreholes/db/schema";
import { loadBoreholes, loadTemplates, type BoreholeRow } from "@eu/boreholes/server";
import type { MaintenanceTaskDef, TaskResult } from "@eu/boreholes";
import { db } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

export interface BoreholeExtras {
  population: number | null;
  populationOn: string | null;
  flowLpm: number | null;
  flowOn: string | null;
}

/** The flow a visit measured: the operational check's reading, else the visit's own flow field. */
export const visitFlow = (v: { flowLpm?: number | null; operational?: { flowLpm?: number | null } | null }): number | null =>
  v.operational?.flowLpm ?? v.flowLpm ?? null;

/** Latest population estimate and latest measured flow per borehole (live records only). */
export function extrasFrom(
  pops: { scopeId: string; estimatedOn: string; population: number; voidedAt?: Date | null }[],
  vs: { scopeId: string; visitedOn: string; flowLpm?: number | null; operational?: { flowLpm?: number | null } | null; voidedAt?: Date | null }[],
): Map<string, BoreholeExtras> {
  const out = new Map<string, BoreholeExtras>();
  const get = (id: string) => out.get(id) ?? out.set(id, { population: null, populationOn: null, flowLpm: null, flowOn: null }).get(id)!;
  for (const p of pops) {
    if (p.voidedAt) continue;
    const e = get(p.scopeId);
    if (!e.populationOn || p.estimatedOn > e.populationOn) { e.population = p.population; e.populationOn = p.estimatedOn; }
  }
  for (const v of vs) {
    const f = visitFlow(v);
    if (v.voidedAt || f === null) continue;
    const e = get(v.scopeId);
    if (!e.flowOn || v.visitedOn > e.flowOn) { e.flowLpm = f; e.flowOn = v.visitedOn; }
  }
  return out;
}

export async function boreholeExtras(): Promise<Map<string, BoreholeExtras>> {
  const d = db() as AnyDb;
  const [pops, vs] = await Promise.all([
    d.select().from(populationEstimates).where(isNull(populationEstimates.voidedAt)),
    d.select({ scopeId: visits.scopeId, visitedOn: visits.visitedOn, flowLpm: visits.flowLpm, operational: visits.operational, voidedAt: visits.voidedAt }).from(visits).where(isNull(visits.voidedAt)),
  ]);
  return extrasFrom(pops, vs);
}

/** How a visit's checklist went: tasks done, and how many failed (a "problem" tick or a reading out of range). */
export function checklistOutcome(results: TaskResult[], tasks: MaintenanceTaskDef[]): { done: number; bad: number } {
  const done = results.filter((r) => r.done);
  const bad = done.filter((r) => {
    if (r.pass === false) return true;
    const t = tasks.find((x) => x.key === r.taskKey);
    if (t?.proof.kind === "reading" && r.value !== undefined) {
      if (t.proof.min !== undefined && r.value < t.proof.min) return true;
      if (t.proof.max !== undefined && r.value > t.proof.max) return true;
    }
    return false;
  });
  return { done: done.length, bad: bad.length };
}

export interface BoreholeDetail {
  attrs: typeof boreholes.$inferSelect;
  row: BoreholeRow;
  extras: BoreholeExtras;
  visits: { id: string; visitedOn: string; kind: string; technician: string; done: number; bad: number; flowLpm: number | null; notes: string | null; photos: string[] }[];
  openFaults: { id: string; openedOn: string; description: string; severity: string; taskKey: string | null; photos: string[] }[];
  populations: (typeof populationEstimates.$inferSelect)[];
  /** Every live visit with a flow reading; `editable` = a flow test (no maintenance checklist), which the web can edit or delete. */
  flowTests: { id: string; testedOn: string; flowLpm: number; pumpDelivers: boolean | null; tankFillsTapsOk: boolean | null; undertaker: string; notes: string | null; editable: boolean }[];
  taskLabels: Map<string, { en: string; fr: string }>;
}

/** Everything the borehole page shows, or null when the borehole does not exist (or was voided). */
export async function loadBoreholeDetail(siteId: string, today: string): Promise<BoreholeDetail | null> {
  const d = db() as AnyDb;
  const [attrs] = await d.select().from(boreholes).where(and(eq(boreholes.scopeId, siteId), isNull(boreholes.voidedAt)));
  if (!attrs) return null;
  const [{ rows }, vs, fs, pops, templates] = await Promise.all([
    loadBoreholes(db(), today, "captured", today),
    d.select().from(visits).where(and(eq(visits.scopeId, siteId), isNull(visits.voidedAt))),
    d.select().from(faults).where(and(eq(faults.scopeId, siteId), isNull(faults.voidedAt), isNull(faults.closedOn))),
    d.select().from(populationEstimates).where(and(eq(populationEstimates.scopeId, siteId), isNull(populationEstimates.voidedAt))),
    loadTemplates(db()),
  ]);
  const row = rows.find((r) => r.siteId === siteId);
  if (!row) return null;
  const tasks = templates.flatMap((t) => t.tasks);
  const authorIds = [...new Set<string>(vs.map((v: any) => v.createdBy))].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const names = new Map<string, string>(
    authorIds.length ? (await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds))).map((u: any) => [u.id, u.name]) : [],
  );
  // Only photos that actually reached the server can be shown.
  const photoIds = [...new Set<string>([...vs.flatMap((v: any) => v.photos ?? []), ...fs.flatMap((f: any) => f.photos ?? [])])].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const uploaded = new Set<string>(photoIds.length ? (await d.select({ id: files.id }).from(files).where(inArray(files.id, photoIds))).map((f: any) => f.id) : []);

  return {
    attrs,
    row,
    extras: extrasFrom(pops, vs).get(siteId) ?? { population: null, populationOn: null, flowLpm: null, flowOn: null },
    visits: vs
      .sort((a: any, b: any) => (a.visitedOn < b.visitedOn ? 1 : a.visitedOn > b.visitedOn ? -1 : b.deviceTime - a.deviceTime))
      .map((v: any) => ({
        id: v.id, visitedOn: v.visitedOn, kind: v.kind, technician: names.get(v.createdBy) ?? "—",
        ...checklistOutcome(v.results ?? [], tasks), flowLpm: visitFlow(v), notes: v.notes ?? null,
        photos: (v.photos ?? []).filter((p: string) => uploaded.has(p)),
      })),
    openFaults: fs
      .sort((a: any, b: any) => (a.openedOn < b.openedOn ? 1 : -1))
      .map((f: any) => ({ id: f.id, openedOn: f.openedOn, description: f.description, severity: f.severity, taskKey: f.taskKey ?? null, photos: (f.photos ?? []).filter((p: string) => uploaded.has(p)) })),
    flowTests: vs
      .filter((v: any) => visitFlow(v) !== null)
      .sort((a: any, b: any) => (a.visitedOn < b.visitedOn ? 1 : a.visitedOn > b.visitedOn ? -1 : b.deviceTime - a.deviceTime))
      .map((v: any) => ({
        id: v.id, testedOn: v.visitedOn, flowLpm: visitFlow(v)!, pumpDelivers: v.operational?.pumpDelivers ?? null,
        tankFillsTapsOk: v.operational ? (v.operational.tankFillsTapsOk ?? null) : null,
        undertaker: v.undertaker || names.get(v.createdBy) || "—", notes: v.notes ?? null, editable: (v.results ?? []).length === 0,
      })),
    populations: pops.sort((a: any, b: any) => (a.estimatedOn < b.estimatedOn ? 1 : -1)),
    taskLabels: new Map(tasks.map((t) => [t.key, t.label])),
  };
}
