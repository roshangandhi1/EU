/**
 * Server-side borehole functions for the web admin. Writes go through the platform sync engine
 * (handlePush), so they are permission-checked, validated and audited like phone writes.
 */
import type { PermissionRegistry, UserContext } from "@eu/core";
import { sites, type Db } from "@eu/db";
import type { EntityRegistry } from "@eu/sync";
import { handlePush } from "@eu/sync/server";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { boreholes, boreholeSettings, faults, maintenanceTemplates, populationEstimates, visits, type MaintenanceTaskDef } from "../db/schema";
import { defaultSettings, defaultTemplate } from "../defaults";
import { dueList, type DueItem } from "../maintenance";
import { indicator111, type BoreholeIndicatorRow } from "../operational";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

export interface ServerCtx {
  db: Db;
  user: UserContext;
  deviceId: string;
  permissions: PermissionRegistry;
  entities: EntityRegistry;
  now?: () => Date;
}

export type Settings = typeof defaultSettings;

export async function loadSettings(db: Db): Promise<Settings> {
  const [row] = await (db as AnyDb).select().from(boreholeSettings).where(isNull(boreholeSettings.voidedAt));
  return row ?? defaultSettings;
}

export interface TemplateRow {
  recordId: string | null;
  templateKey: string;
  templateVersion: number;
  name: { en: string; fr: string };
  tasks: MaintenanceTaskDef[];
}

/** The latest active version of each template; the built-in starting template if none saved. */
export async function loadTemplates(db: Db): Promise<TemplateRow[]> {
  const rows = await (db as AnyDb).select().from(maintenanceTemplates).where(isNull(maintenanceTemplates.voidedAt));
  const latest = new Map<string, any>();
  for (const r of rows) {
    const cur = latest.get(r.templateKey);
    if (!cur || r.templateVersion > cur.templateVersion) latest.set(r.templateKey, r);
  }
  const out = [...latest.values()].filter((r) => r.active).map((r) => ({
    recordId: r.id, templateKey: r.templateKey, templateVersion: r.templateVersion, name: r.name, tasks: r.tasks,
  }));
  return out.length ? out : [{ recordId: null, templateKey: defaultTemplate.templateKey, templateVersion: 0, name: defaultTemplate.name, tasks: defaultTemplate.tasks }];
}

export interface BoreholeRow {
  siteId: string;
  code: string;
  village: string;
  lifecycle: string;
  lat: number | null;
  lng: number | null;
  pumpRatingKw: number | null;
  lastVisitOn: string | null;
  due: DueItem[];
  worstDue: "ok" | "due_soon" | "due" | "overdue" | "none";
  openFaults: number;
  indicator: BoreholeIndicatorRow;
}

const RANK = { none: 0, ok: 1, due_soon: 2, due: 3, overdue: 4 } as const;

export async function loadBoreholes(db: Db, asAt: string, mode: "captured" | "evidence", today: string): Promise<{ rows: BoreholeRow[]; counted: number }> {
  const d = db as AnyDb;
  const [attrs, vs, fs, templates, settings] = await Promise.all([
    d.select().from(boreholes).where(isNull(boreholes.voidedAt)),
    d.select().from(visits),
    d.select().from(faults).where(and(isNull(faults.voidedAt), isNull(faults.closedOn))),
    loadTemplates(db),
    loadSettings(db),
  ]);
  const tasks = templates.flatMap((t) => t.tasks);
  const ind = indicator111(
    attrs.map((b: any) => ({
      borehole: { siteId: b.scopeId, code: b.code, pumpRatingKw: b.pumpRatingKw, commissionedOn: b.commissionedOn, waterQuality: b.waterQuality, caretakersTrained: b.caretakersTrained, sopHandedOver: b.sopHandedOver },
      visits: vs.filter((v: any) => v.scopeId === b.scopeId).map((v: any) => ({ id: v.id, visitedOn: v.visitedOn, operational: v.operational, deviceTime: v.deviceTime, serverTime: v.serverTime, voidedAt: v.voidedAt })),
    })),
    asAt, mode, settings,
  );
  const rows: BoreholeRow[] = attrs.map((b: any, i: number) => {
    const mine = vs.filter((v: any) => v.scopeId === b.scopeId && !v.voidedAt);
    const due = dueList(
      { siteId: b.scopeId, village: b.village, pumpRatingKw: b.pumpRatingKw, handedOverOn: b.handedOverOn, commissionedOn: b.commissionedOn },
      tasks, mine.map((v: any) => ({ visitedOn: v.visitedOn, results: v.results })), today, settings,
    );
    const worst = due.reduce<BoreholeRow["worstDue"]>((w, x) => (x.status !== "each_visit" && RANK[x.status] > RANK[w] ? x.status : w), "none");
    return {
      siteId: b.scopeId, code: b.code, village: b.village, lifecycle: b.lifecycle, lat: b.gpsLat, lng: b.gpsLng, pumpRatingKw: b.pumpRatingKw,
      lastVisitOn: mine.map((v: any) => v.visitedOn).sort().at(-1) ?? null,
      due, worstDue: worst, openFaults: fs.filter((f: any) => f.scopeId === b.scopeId).length,
      indicator: ind.rows[i]!,
    };
  });
  return { rows, counted: ind.counted };
}

const mut = (entity: string, scopeId: string, fields: Record<string, unknown>, now: Date, recordId = randomUUID(), op: "insert" | "update" = "insert") => ({
  mutationId: randomUUID(), entity, recordId, op, scopeId, deviceTime: now.toISOString(), fields,
});

/** Create a borehole: a platform site plus its attribute record. */
export async function createBorehole(ctx: ServerCtx, input: { code: string; village: string; lat?: number | null; lng?: number | null; lifecycle?: string; pumpRatingKw?: number | null }) {
  if (!ctx.permissions.can(ctx.user, "boreholes.write", { stream: "boreholes" })) return { ok: false as const, reason: "forbidden" };
  const d = ctx.db as AnyDb;
  const dup = await d.select({ id: boreholes.id }).from(boreholes).where(eq(boreholes.code, input.code));
  if (dup.length) return { ok: false as const, reason: "already_exists" };
  const now = ctx.now?.() ?? new Date();
  const siteId = randomUUID();
  await d.insert(sites).values({ id: siteId, kind: "borehole", stream: "boreholes", name: input.code, lat: input.lat ?? null, lng: input.lng ?? null });
  const res = await handlePush(ctx, { deviceNow: now.toISOString(), mutations: [mut("boreholes.borehole", siteId, {
    code: input.code, village: input.village, gpsLat: input.lat ?? null, gpsLng: input.lng ?? null,
    lifecycle: input.lifecycle ?? "planned", pumpRatingKw: input.pumpRatingKw ?? null, sopHandedOver: false,
  }, now)] });
  const r = res.results[0]!;
  return r.status === "applied" ? { ok: true as const, siteId } : { ok: false as const, reason: r.reason ?? r.status };
}

/**
 * Save a template as a new version (stream-wide record, scope "boreholes"). Visits keep the version
 * they were done against, so history stays tied to the checklist in force at the time.
 */
export async function saveTemplate(ctx: ServerCtx, t: { templateKey: string; name: { en: string; fr: string }; tasks: MaintenanceTaskDef[] }) {
  const current = (await loadTemplates(ctx.db)).find((x) => x.templateKey === t.templateKey);
  const now = ctx.now?.() ?? new Date();
  const res = await handlePush(ctx, { deviceNow: now.toISOString(), mutations: [mut("boreholes.template", "boreholes", {
    templateKey: t.templateKey, templateVersion: (current?.templateVersion ?? 0) + 1, active: true, name: t.name, tasks: t.tasks,
  }, now)] });
  const r = res.results[0]!;
  return r.status === "applied" ? { ok: true as const } : { ok: false as const, reason: r.reason ?? r.status, issues: (r as any).issues };
}

/**
 * Edit a borehole's attributes from the web. Passes the field versions the editor saw, so a
 * concurrent field edit to the same field is flagged for review instead of silently overwritten.
 */
export async function updateBorehole(ctx: ServerCtx, siteId: string, fields: Record<string, unknown>, seenFieldVersions?: Record<string, number>) {
  const d = ctx.db as AnyDb;
  const [row] = await d.select().from(boreholes).where(eq(boreholes.scopeId, siteId));
  if (!row) return { ok: false as const, reason: "not_found" };
  const base = Object.fromEntries(Object.keys(fields).map((k) => [k, (seenFieldVersions ?? row.fieldVersions)[k] ?? 0]));
  const now = ctx.now?.() ?? new Date();
  const res = await handlePush(ctx, { deviceNow: now.toISOString(), mutations: [{ ...mut("boreholes.borehole", siteId, fields, now, row.id, "update"), baseFieldVersions: base }] });
  const r = res.results[0]!;
  return r.status === "applied" ? { ok: true as const } : { ok: false as const, reason: r.reason ?? r.status, conflicts: r.conflicts };
}

/** Properties a public borehole feature may carry; anything else is dropped before publishing. */
export const PUBLIC_BOREHOLE_PROPS = ["code", "village", "operational", "lifecycle", "populationServed"];

/**
 * The public boreholes layer: only boreholes marked public with a GPS position, rounded to about
 * 100 m, with whether they count as operational (evidence mode) and the latest population estimate.
 */
export async function buildPublicLayer(db: Db, asAt: string) {
  const d = db as AnyDb;
  const [{ rows }, attrs, pops] = await Promise.all([
    loadBoreholes(db, asAt, "evidence", asAt),
    d.select().from(boreholes).where(isNull(boreholes.voidedAt)),
    d.select().from(populationEstimates).where(isNull(populationEstimates.voidedAt)),
  ]);
  const isPublic = new Set(attrs.filter((a: any) => a.publicVisible).map((a: any) => a.scopeId));
  const latestPop = (siteId: string): number | null =>
    pops.filter((p: any) => p.scopeId === siteId && p.estimatedOn <= asAt).sort((a: any, b: any) => (a.estimatedOn < b.estimatedOn ? 1 : -1))[0]?.population ?? null;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const features = rows
    .filter((r) => isPublic.has(r.siteId) && r.lat !== null && r.lng !== null)
    .map((r) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [r3(r.lng!), r3(r.lat!)] },
      properties: { code: r.code, village: r.village, lifecycle: r.lifecycle, operational: r.indicator.counted, populationServed: latestPop(r.siteId) },
    }));
  const operational = features.filter((f) => f.properties.operational);
  return {
    data: { type: "FeatureCollection" as const, features },
    summary: {
      boreholes: features.length,
      operational: operational.length,
      peopleServed: operational.reduce((s, f) => s + (f.properties.populationServed ?? 0), 0),
    },
  };
}
