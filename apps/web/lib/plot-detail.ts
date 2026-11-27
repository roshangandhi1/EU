/** Read models for the plot list extras and the plot detail page (web only, read-only). */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { files, users } from "@eu/db";
import { boundaryApprovals, monitoringVisits, plantingEvents, plotBoundaries, plots } from "@eu/forestry/db/schema";
import { areaHa, estimateStocking, evaluatePlot, type ForestryStream, type PlotInput, type PlotResult, type StockingEstimate } from "@eu/forestry";
import { loadSettings, loadStream, photoUploads, rulesFrom, type StreamSettings } from "@eu/forestry/server";
import type { MultiPolygon } from "geojson";
import { db } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

export interface PlotExtras {
  /** First (non-replacement) planting date. */
  plantedOn: string | null;
  /** Every live plant planted, replacement included (it counts toward density). */
  plants: number;
  replacementPlants: number;
  /** Latest monitoring visit with sample counts. */
  survivalPct: number | null;
  survivalOn: string | null;
}

/** Planting totals and latest survival for one plot, from the same inputs the indicator uses. */
export function plotExtras(p: Pick<PlotInput, "plantings" | "visits">): PlotExtras {
  const live = p.plantings.filter((e) => !e.voidedAt);
  const count = (es: typeof live) => es.reduce((n, e) => n + e.lines.reduce((m, l) => m + (l.count || 0), 0), 0);
  const first = live.filter((e) => !e.isGapFilling).map((e) => e.plantedOn).sort()[0] ?? live.map((e) => e.plantedOn).sort()[0] ?? null;
  const sampled = p.visits.filter((v) => !v.voidedAt && v.samples.length > 0).sort((a, b) => (a.visitedOn < b.visitedOn ? 1 : -1))[0];
  const est = sampled ? estimateStocking(sampled.samples) : null;
  return {
    plantedOn: first,
    plants: count(live),
    replacementPlants: count(live.filter((e) => e.isGapFilling)),
    survivalPct: est?.survivalPct?.value ?? null,
    survivalOn: sampled?.visitedOn ?? null,
  };
}

export interface PlotDetail {
  stream: ForestryStream;
  plot: typeof plots.$inferSelect;
  result: PlotResult;
  extras: PlotExtras;
  settings: StreamSettings;
  /** Latest live boundary and whether an approval names it; the approval in force (any boundary). */
  latest: { id: string; geom: MultiPolygon; source: string; recordedAt: Date; areaHa: number } | null;
  latestApproved: boolean;
  approval: { effectiveFrom: string; checkedAgainst: string | null; boundaryId: string } | null;
  plantings: { id: string; plantedOn: string; isGapFilling: boolean; lines: { species: string; count: number }[]; team: string | null; notes: string | null; by: string; photos: string[] }[];
  visits: { id: string; visitedOn: string; by: string; estimate: StockingEstimate | null; threats: string[]; meanHeightCm: number | null; photos: string[] }[];
}

/** Everything the plot page shows, or null when the plot does not exist in this stream (or was voided). */
export async function loadPlotDetail(stream: ForestryStream, siteId: string, asAt: string): Promise<PlotDetail | null> {
  const d = db() as AnyDb;
  const [plot] = await d.select().from(plots).where(and(eq(plots.scopeId, siteId), eq(plots.stream, stream), isNull(plots.voidedAt)));
  if (!plot) return null;
  const [{ inputs }, settings, bounds, approvals, pls, vs] = await Promise.all([
    loadStream(db(), stream),
    loadSettings(db(), stream),
    d.select().from(plotBoundaries).where(and(eq(plotBoundaries.scopeId, siteId), isNull(plotBoundaries.voidedAt))),
    d.select().from(boundaryApprovals).where(and(eq(boundaryApprovals.scopeId, siteId), isNull(boundaryApprovals.voidedAt))),
    d.select().from(plantingEvents).where(and(eq(plantingEvents.scopeId, siteId), isNull(plantingEvents.voidedAt))),
    d.select().from(monitoringVisits).where(and(eq(monitoringVisits.scopeId, siteId), isNull(monitoringVisits.voidedAt))),
  ]);
  const input = inputs.find((p) => p.siteId === siteId);
  if (!input) return null;
  const result = evaluatePlot(input, asAt, "captured", { ...rulesFrom(stream, settings), photoUploadedAt: await photoUploads(db(), [input]) });

  const latestRow = [...bounds].sort((a: any, b: any) => b.deviceTime - a.deviceTime)[0];
  const approval = [...approvals]
    .filter((a: any) => a.effectiveFrom <= asAt)
    .sort((a: any, b: any) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : b.deviceTime - a.deviceTime))[0];
  const authorIds = [...new Set<string>([...pls, ...vs].map((r: any) => r.createdBy))].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const names = new Map<string, string>(
    authorIds.length ? (await d.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds))).map((u: any) => [u.id, u.name]) : [],
  );
  const photoIds = [...new Set<string>([...pls.flatMap((e: any) => e.photos ?? []), ...vs.flatMap((v: any) => (v.photos ?? []).map((p: any) => p.fileId))])].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const uploaded = new Set<string>(photoIds.length ? (await d.select({ id: files.id }).from(files).where(inArray(files.id, photoIds))).map((f: any) => f.id) : []);

  return {
    stream, plot, result, settings,
    extras: plotExtras(input),
    latest: latestRow ? { id: latestRow.id, geom: latestRow.geom, source: latestRow.source, recordedAt: latestRow.deviceTime, areaHa: areaHa(latestRow.geom) } : null,
    latestApproved: latestRow ? approvals.some((a: any) => a.boundaryId === latestRow.id) : false,
    approval: approval ? { effectiveFrom: approval.effectiveFrom, checkedAgainst: approval.checkedAgainst ?? null, boundaryId: approval.boundaryId } : null,
    plantings: pls
      .sort((a: any, b: any) => (a.plantedOn < b.plantedOn ? 1 : -1))
      .map((e: any) => ({ id: e.id, plantedOn: e.plantedOn, isGapFilling: e.isGapFilling, lines: e.lines, team: e.team ?? null, notes: e.notes ?? null, by: names.get(e.createdBy) ?? "—", photos: (e.photos ?? []).filter((p: string) => uploaded.has(p)) })),
    visits: vs
      .sort((a: any, b: any) => (a.visitedOn < b.visitedOn ? 1 : -1))
      .map((v: any) => ({
        id: v.id, visitedOn: v.visitedOn, by: names.get(v.createdBy) ?? "—",
        estimate: v.samples?.length ? estimateStocking(v.samples, stream === "miombo" ? { includeNatural: true } : {}) : null,
        threats: v.threats ?? [], meanHeightCm: v.meanHeightCm ?? null,
        photos: (v.photos ?? []).map((p: any) => p.fileId).filter((p: string) => uploaded.has(p)),
      })),
  };
}
