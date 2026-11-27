/**
 * Server-side borehole functions for the web admin. Writes go through the platform sync engine
 * (handlePush), so they are permission-checked, validated and audited like phone writes.
 */
import type { PermissionRegistry, UserContext } from "@eu/core";
import { sites, type Db } from "@eu/db";
import type { EntityRegistry } from "@eu/sync";
import { handlePush } from "@eu/sync/server";
import { and, eq, isNull, sql } from "drizzle-orm";
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

/** `admitted`: visit ids an admin admitted late for the evidence cut-off being reported (DATA-5). */
export async function loadBoreholes(
  db: Db,
  asAt: string,
  mode: "captured" | "evidence",
  today: string,
  admitted: ReadonlySet<string> = new Set(),
): Promise<{ rows: BoreholeRow[]; counted: number }> {
  const d = db as AnyDb;
  const [attrs, vs, fs, templates, settings, pops] = await Promise.all([
    d.select().from(boreholes).where(isNull(boreholes.voidedAt)),
    d.select().from(visits),
    d.select().from(faults).where(and(isNull(faults.voidedAt), isNull(faults.closedOn))),
    loadTemplates(db),
    loadSettings(db),
    d.select({ scopeId: populationEstimates.scopeId, estimatedOn: populationEstimates.estimatedOn }).from(populationEstimates).where(isNull(populationEstimates.voidedAt)),
  ]);
  const tasks = templates.flatMap((t) => t.tasks);
  const ind = indicator111(
    attrs.map((b: any) => ({
      borehole: {
        siteId: b.scopeId, code: b.code, pumpRatingKw: b.pumpRatingKw, commissionedOn: b.commissionedOn, waterQuality: b.waterQuality, caretakersTrained: b.caretakersTrained, sopHandedOver: b.sopHandedOver,
        hasTaps: b.hasTaps !== false, gpsLat: b.gpsLat, gpsLng: b.gpsLng, handedOverOn: b.handedOverOn,
        populationOn: pops.filter((p: any) => p.scopeId === b.scopeId).map((p: any) => String(p.estimatedOn)),
      },
      visits: vs.filter((v: any) => v.scopeId === b.scopeId).map((v: any) => ({ id: v.id, visitedOn: v.visitedOn, operational: v.operational, deviceTime: v.deviceTime, serverTime: v.serverTime, voidedAt: v.voidedAt, lateAccepted: admitted.has(v.id),
        photoCount: (v.photos?.length ?? 0) + (v.results ?? []).filter((r: any) => r.photoFileId).length })),
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

/**
 * Create a borehole: a platform site plus its attribute record, in one transaction, so a refused
 * record never leaves an orphan site (SEC-18). Codes are unique in any letter case (EDGE-7).
 */
export async function createBorehole(ctx: ServerCtx, input: { code: string; village: string; lat?: number | null; lng?: number | null; lifecycle?: string; pumpRatingKw?: number | null }) {
  if (!ctx.permissions.can(ctx.user, "boreholes.write", { stream: "boreholes" })) return { ok: false as const, reason: "forbidden" };
  const d = ctx.db as AnyDb;
  const code = input.code.trim();
  const dup = await d.select({ id: boreholes.id }).from(boreholes).where(and(sql`lower(${boreholes.code}) = ${code.toLowerCase()}`, isNull(boreholes.voidedAt)));
  if (dup.length) return { ok: false as const, reason: "already_exists" };
  const now = ctx.now?.() ?? new Date();
  const siteId = randomUUID();
  let reason: string | null = null;
  await d
    .transaction(async (tx: AnyDb) => {
      await tx.insert(sites).values({ id: siteId, kind: "borehole", stream: "boreholes", name: code, lat: input.lat ?? null, lng: input.lng ?? null });
      const res = await handlePush({ ...ctx, db: tx }, { deviceNow: now.toISOString(), mutations: [mut("boreholes.borehole", siteId, {
        code, village: input.village, gpsLat: input.lat ?? null, gpsLng: input.lng ?? null,
        lifecycle: input.lifecycle ?? "planned", pumpRatingKw: input.pumpRatingKw ?? null, sopHandedOver: false,
      }, now)] });
      const r = res.results[0]!;
      if (r.status !== "applied") {
        reason = r.reason ?? r.status;
        throw ROLLBACK;
      }
    })
    .catch((err: unknown) => {
      if (err !== ROLLBACK) throw err;
    });
  return reason ? { ok: false as const, reason } : { ok: true as const, siteId };
}

const ROLLBACK = new Error("rollback");

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

/** A water flow test logged on the web: stored as a technician visit (kind "inspection"), so it syncs and counts like a phone check. */
export interface FlowTestInput {
  testedOn: string;
  flowLpm: number;
  pumpDelivers: boolean;
  /** null = the borehole has no taps. */
  tankFillsTapsOk: boolean | null;
  undertaker: string;
  notes?: string | null;
}

const flowFields = (t: FlowTestInput) => ({
  visitedOn: t.testedOn, kind: "inspection", results: [], partsUsed: [], faultsClosed: [], photos: [],
  operational: { pumpDelivers: t.pumpDelivers, flowLpm: t.flowLpm, tankFillsTapsOk: t.tankFillsTapsOk },
  flowLpm: t.flowLpm, undertaker: t.undertaker, notes: t.notes ?? null,
});

type Done = { ok: true; id: string } | { ok: false; reason: string };
const outcome = (r: { status: string; reason?: string }, id: string): Done =>
  r.status === "applied" || r.status === "duplicate" ? { ok: true, id } : { ok: false, reason: r.reason ?? r.status };

export async function addFlowTest(ctx: ServerCtx, siteId: string, t: FlowTestInput): Promise<Done> {
  const now = ctx.now?.() ?? new Date();
  const id = randomUUID();
  const res = await handlePush(ctx, { deviceNow: now.toISOString(), mutations: [mut("boreholes.visit", siteId, flowFields(t), now, id)] });
  return outcome(res.results[0]!, id);
}

/** Only flow tests (visits without a maintenance checklist) can be edited or deleted on the web. */
async function flowTestRow(ctx: ServerCtx, siteId: string, id: string) {
  const [row] = await (ctx.db as AnyDb).select().from(visits).where(and(eq(visits.id, id), eq(visits.scopeId, siteId), isNull(visits.voidedAt)));
  if (!row) return null;
  return (row.results ?? []).length === 0 && row.flowLpm != null ? row : null;
}

/**
 * Edit a flow test. Visits are append-only (a phone never rewrites one), so an edit records the
 * corrected test and voids the old one, with the reason in the audit log.
 */
export async function editFlowTest(ctx: ServerCtx, siteId: string, id: string, t: FlowTestInput): Promise<Done> {
  if (!ctx.permissions.can(ctx.user, "boreholes.flowtest.fix", { stream: "boreholes", siteId })) return { ok: false, reason: "forbidden" };
  if (!(await flowTestRow(ctx, siteId, id))) return { ok: false, reason: "not_found" };
  const added = await addFlowTest(ctx, siteId, t);
  if (!added.ok) return added;
  const now = ctx.now?.() ?? new Date();
  const res = await handlePush(ctx, { deviceNow: now.toISOString(), mutations: [{ mutationId: randomUUID(), entity: "boreholes.visit", recordId: id, op: "void", scopeId: siteId, voidReason: `Corrected on the web (replaced by ${added.id})`, deviceTime: now.toISOString() }] });
  return outcome(res.results[0]!, added.id);
}

export async function deleteFlowTest(ctx: ServerCtx, siteId: string, id: string, reason = "Deleted on the web"): Promise<Done> {
  if (!ctx.permissions.can(ctx.user, "boreholes.flowtest.fix", { stream: "boreholes", siteId })) return { ok: false, reason: "forbidden" };
  if (!(await flowTestRow(ctx, siteId, id))) return { ok: false, reason: "not_found" };
  const now = ctx.now?.() ?? new Date();
  const res = await handlePush(ctx, { deviceNow: now.toISOString(), mutations: [{ mutationId: randomUUID(), entity: "boreholes.visit", recordId: id, op: "void", scopeId: siteId, voidReason: reason, deviceTime: now.toISOString() }] });
  return outcome(res.results[0]!, id);
}

/**
 * Save module settings (stream-wide record, scope "boreholes"): creates the record the first time,
 * otherwise updates only the fields given. Which 1.1.1 checks apply (`criteria`) needs
 * boreholes.criteria.write (system administrators); the entity enforces it.
 */
export async function saveSettings(ctx: ServerCtx, fields: Partial<Settings>): Promise<{ ok: true } | { ok: false; reason: string }> {
  const d = ctx.db as AnyDb;
  const [row] = await d.select().from(boreholeSettings).where(isNull(boreholeSettings.voidedAt));
  const now = ctx.now?.() ?? new Date();
  const m = row
    ? mut("boreholes.settings", "boreholes", fields, now, row.id, "update")
    : mut("boreholes.settings", "boreholes", { ...defaultSettings, ...fields }, now);
  const res = await handlePush(ctx, { deviceNow: now.toISOString(), mutations: [m] });
  const r = res.results[0]!;
  return r.status === "applied" || r.status === "duplicate" ? { ok: true } : { ok: false, reason: r.reason ?? r.status };
}
