/**
 * Server-side forestry functions used by the web admin and API routes.
 * All writes go through the platform sync engine (handlePush), so they get the same permission
 * checks, validation and audit trail as writes from phones.
 */
import type { UserContext } from "@eu/core";
import { sites, type Db } from "@eu/db";
import type { EntityRegistry } from "@eu/sync";
import type { PermissionRegistry } from "@eu/core";
import { handlePush } from "@eu/sync/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { MultiPolygon } from "geojson";
import { randomUUID } from "node:crypto";
import centroidOf from "@turf/centroid";
import { boundaryApprovals, forestrySettings, monitoringVisits, plantingEvents, plotBoundaries, plots } from "../db/schema";
import { defaultSettings } from "../defaults";
import { boundaryAsAt, evaluatePlot, type IndicatorRules } from "../indicators";
import { areaHa } from "../geo/area";
import type { PlotInput } from "../indicators";
import type { ImportCandidate } from "../import/kml";
import { fa, type ForestryStream } from "../actions";

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

const stamp = (r: any) => ({
  id: r.id as string,
  deviceTime: r.deviceTime as Date,
  serverTime: r.serverTime as Date,
  voidedAt: (r.voidedAt as Date | null) ?? null,
});

export interface PlotRow {
  siteId: string;
  code: string;
  village: string;
  status: string;
  species: string[];
  /** Latest boundary (approved or not), for the map. */
  geom: MultiPolygon | null;
  geomApproved: boolean;
  publicVisible: boolean;
}

/** Everything the indicator and the map need for one stream. */
export async function loadStream(db: Db, stream: ForestryStream): Promise<{ plots: PlotRow[]; inputs: PlotInput[] }> {
  const d = db as AnyDb;
  const plotRows = await d.select().from(plots).where(and(eq(plots.stream, stream), isNull(plots.voidedAt)));
  const ids: string[] = plotRows.map((p: any) => p.scopeId);
  if (ids.length === 0) return { plots: [], inputs: [] };
  const [bounds, approvals, plantings, visits] = await Promise.all([
    d.select().from(plotBoundaries).where(inArray(plotBoundaries.scopeId, ids)),
    d.select().from(boundaryApprovals).where(inArray(boundaryApprovals.scopeId, ids)),
    d.select().from(plantingEvents).where(inArray(plantingEvents.scopeId, ids)),
    d.select().from(monitoringVisits).where(inArray(monitoringVisits.scopeId, ids)),
  ]);
  const by = <T extends { scopeId: string }>(rows: T[], id: string) => rows.filter((r) => r.scopeId === id);

  const inputs: PlotInput[] = plotRows.map((p: any) => ({
    siteId: p.scopeId,
    code: p.code,
    stream,
    targetDensityPerHa: p.targetDensityPerHa,
    boundaries: by(bounds, p.scopeId).map((b: any) => ({ ...stamp(b), areaHa: areaHa(b.geom), geom: b.geom })),
    approvals: by(approvals, p.scopeId).map((a: any) => ({ ...stamp(a), boundaryId: a.boundaryId, effectiveFrom: a.effectiveFrom })),
    plantings: by(plantings, p.scopeId).map((e: any) => ({ ...stamp(e), plantedOn: e.plantedOn, lines: e.lines, isGapFilling: e.isGapFilling, photos: e.photos })),
    visits: by(visits, p.scopeId).map((v: any) => ({ ...stamp(v), visitedOn: v.visitedOn, samples: v.samples, photos: v.photos })),
  }));

  const rows: PlotRow[] = plotRows.map((p: any, i: number) => {
    const input = inputs[i]!;
    const live = input.boundaries.filter((b) => !b.voidedAt).sort((a, b) => b.deviceTime.getTime() - a.deviceTime.getTime());
    const latest = live[0];
    const approvedIds = new Set(input.approvals.filter((a) => !a.voidedAt).map((a) => a.boundaryId));
    return {
      siteId: p.scopeId, code: p.code, village: p.village, status: p.status, species: p.species,
      geom: latest?.geom ?? null, geomApproved: latest ? approvedIds.has(latest.id) : false,
      publicVisible: !!p.publicVisible,
    };
  });
  return { plots: rows, inputs };
}

export interface ImportOptions {
  stream: ForestryStream;
  village: string;
  parentSiteId?: string | null;
  sourceName: string;
  status: "planned" | "pegged" | "planted" | "established";
  species: string[];
  /** Approve the imported boundaries as authoritative from this date (lead only). */
  approveFrom?: string | null;
  checkedAgainst?: string | null;
}

export interface ImportResult {
  created: { code: string; siteId: string; areaHa: number }[];
  rejected: { code: string; reason: string }[];
}

/**
 * When the boundary was drawn, from the file's own metadata (ArcGIS/Google Earth "creation_date"),
 * so the record keeps its original date; the server time still shows when it was imported.
 */
function drawnAt(c: ImportCandidate, now: Date): string {
  const raw = c.properties.creation_date;
  const t = typeof raw === "string" ? Date.parse(raw) : NaN;
  return Number.isFinite(t) && t <= now.getTime() ? new Date(t).toISOString() : now.toISOString();
}

/**
 * Commit reviewed KMZ candidates: a platform site per plot, then the plot record, its boundary and
 * (optionally) an approval, each through the sync engine. Codes that already exist in the stream are
 * skipped, so re-running an import is safe.
 */
export async function commitImport(ctx: ServerCtx, candidates: ImportCandidate[], opt: ImportOptions): Promise<ImportResult> {
  const d = ctx.db as AnyDb;
  const target = { stream: opt.stream };
  if (!ctx.permissions.can(ctx.user, fa(opt.stream, "import.run"), target)) {
    return { created: [], rejected: candidates.map((c) => ({ code: c.name, reason: "forbidden" })) };
  }
  if (opt.approveFrom && !ctx.permissions.can(ctx.user, fa(opt.stream, "boundary.approve"), target)) {
    return { created: [], rejected: candidates.map((c) => ({ code: c.name, reason: "forbidden_approve" })) };
  }
  const existing = new Set<string>(
    (await d.select({ code: plots.code }).from(plots).where(eq(plots.stream, opt.stream))).map((r: any) => r.code),
  );
  const now = ctx.now?.() ?? new Date();
  const created: ImportResult["created"] = [];
  const rejected: ImportResult["rejected"] = [];

  for (const c of candidates) {
    const code = c.name.replace(/\s+/g, "_");
    if (existing.has(code)) {
      rejected.push({ code, reason: "already_exists" });
      continue;
    }
    const siteId = randomUUID();
    const [lng, lat] = centroidOf(c.geom).geometry.coordinates as [number, number];
    await d.insert(sites).values({ id: siteId, kind: "plot", stream: opt.stream, name: code, parentId: opt.parentSiteId ?? null, lat, lng });

    const boundaryId = randomUUID();
    const iso = now.toISOString();
    const mutations = [
      { mutationId: randomUUID(), entity: `${opt.stream}.plot`, recordId: randomUUID(), op: "insert" as const, scopeId: siteId, deviceTime: iso,
        fields: { stream: opt.stream, code, village: opt.village, species: opt.species, status: opt.status, publicVisible: false, notes: `Imported from ${opt.sourceName}` } },
      { mutationId: randomUUID(), entity: `${opt.stream}.boundary`, recordId: boundaryId, op: "insert" as const, scopeId: siteId, deviceTime: drawnAt(c, now),
        fields: { geom: c.geom, source: "kmz_import", sourceRef: `${opt.sourceName}#${c.name}` } },
      ...(opt.approveFrom
        ? [{ mutationId: randomUUID(), entity: `${opt.stream}.boundary_approval`, recordId: randomUUID(), op: "insert" as const, scopeId: siteId, deviceTime: iso,
            fields: { boundaryId, effectiveFrom: opt.approveFrom, checkedAgainst: opt.checkedAgainst ?? null, note: "Approved at import" } }]
        : []),
    ];
    const res = await handlePush(ctx, { deviceNow: iso, mutations });
    const bad = res.results.find((r) => r.status === "rejected");
    if (bad) {
      rejected.push({ code, reason: bad.reason ?? "rejected" });
      continue;
    }
    existing.add(code);
    created.push({ code, siteId, areaHa: Math.round(areaHa(c.geom) * 10_000) / 10_000 });
  }
  return { created, rejected };
}

export type StreamSettings = {
  densityRulePerHa: number;
  sampleRadiusM: number;
  samplesPerHa: number;
  minSamplesPerPlot: number;
  maxSamplesPerPlot: number;
  speciesList: { key: string; latin: string; en?: string; fr?: string; native?: boolean }[];
};

/** The stream's settings from the database, or the seeded defaults if none are saved yet. */
export async function loadSettings(db: Db, stream: ForestryStream): Promise<StreamSettings> {
  const [row] = await (db as AnyDb).select().from(forestrySettings).where(and(eq(forestrySettings.stream, stream), isNull(forestrySettings.voidedAt)));
  return row ?? (defaultSettings[stream] as unknown as StreamSettings);
}

/** Indicator rules from settings. Miombo: every species counts as native unless marked otherwise. */
export function rulesFrom(stream: ForestryStream, s: StreamSettings): IndicatorRules {
  const nonNative = new Set(s.speciesList.filter((x) => x.native === false).map((x) => x.key));
  return {
    densityRulePerHa: s.densityRulePerHa,
    isNative: stream === "miombo" ? (k) => !nonNative.has(k) : undefined,
  };
}

/** Properties a public plot feature may carry; anything else is dropped before publishing. */
export const PUBLIC_PLOT_PROPS = ["code", "village", "stream", "species", "areaHa", "plantedPerHa", "counted", "status"];

const roundCoords = (g: MultiPolygon, dp: number): MultiPolygon => {
  const f = 10 ** dp;
  return { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map((r) => r.map(([x, y]) => [Math.round(x! * f) / f, Math.round(y! * f) / f]))) };
};

/**
 * The public layer for a stream: only plots marked public that have an approved boundary as at
 * `asAt`, with the boundary rounded to about 10 m and evidence-mode indicator figures.
 */
export async function buildPublicLayer(db: Db, stream: ForestryStream, asAt: string) {
  const { plots: rows, inputs } = await loadStream(db, stream);
  const settings = await loadSettings(db, stream);
  const rules = rulesFrom(stream, settings);
  const latin = new Map(settings.speciesList.map((s) => [s.key, s.latin]));
  const features: import("geojson").Feature[] = [];
  let ha = 0;
  let countedHa = 0;
  rows.forEach((row, i) => {
    if (!row.publicVisible) return;
    const input = inputs[i]!;
    const b = boundaryAsAt(input, asAt, "evidence");
    if (!b?.geom) return;
    const r = evaluatePlot(input, asAt, "evidence", rules);
    const area = Math.round(r.areaHa * 10) / 10;
    ha += r.areaHa;
    if (r.outcome === "counted") countedHa += r.areaHa;
    features.push({
      type: "Feature",
      geometry: roundCoords(b.geom as MultiPolygon, 4),
      properties: {
        code: row.code, village: row.village, stream, status: row.status,
        species: row.species.map((k) => latin.get(k) ?? k).join(", "),
        areaHa: area, plantedPerHa: Math.round(r.plantedPerHa), counted: r.outcome === "counted",
      },
    });
  });
  return {
    data: { type: "FeatureCollection" as const, features },
    summary: { plots: features.length, hectares: Math.round(ha * 10) / 10, countedHectares: Math.round(countedHa * 10) / 10 },
  };
}
