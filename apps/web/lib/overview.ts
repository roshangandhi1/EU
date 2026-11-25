/** Read-only figures for the overview page and the operations map. Every stream is loaded only if the user can see it. */
import { and, eq, isNull } from "drizzle-orm";
import type { FeatureCollection } from "geojson";
import { devices, roleAssignments, sites } from "@eu/db";
import { loadBoreholes, loadTemplates } from "@eu/boreholes/server";
import { populationEstimates } from "@eu/boreholes/db/schema";
import { areaHa, computeIndicator, type ForestryStream } from "@eu/forestry";
import { loadSettings, loadStream, photoUploads, rulesFrom } from "@eu/forestry/server";
import { activeOn, classDay, loadSchool } from "@eu/schools";
import type { Principal } from "./auth";
import { db } from "./http";
import { navAccess, type NavAccess } from "./nav";
import { mySchools } from "./schools";
import { todayDrc } from "./dates";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

export interface ForestrySummary { plots: number; haMapped: number; haCounted: number; planted: number }
export interface Overview {
  access: NavAccess;
  schools: { count: number; pupils: number; presentPct: number | null } | null;
  boreholes: { count: number; counted: number; overdue: number; people: number } | null;
  bamboo: ForestrySummary | null;
  miombo: ForestrySummary | null;
  setup: { users: number; phones: number; templates: number };
  map: MapLayers;
}

export interface MapLayers {
  bamboo: FeatureCollection;
  miombo: FeatureCollection;
  boreholes: FeatureCollection;
  schools: FeatureCollection;
}

const fc = (features: FeatureCollection["features"]): FeatureCollection => ({ type: "FeatureCollection", features });

async function forestry(stream: ForestryStream, today: string) {
  const d = db();
  const [{ plots, inputs }, settings] = await Promise.all([loadStream(d, stream), loadSettings(d, stream)]);
  const result = computeIndicator(inputs, today, "captured", { ...rulesFrom(stream, settings), photoUploadedAt: await photoUploads(d, inputs) });
  const planted = inputs.reduce(
    (n, p) => n + p.plantings.filter((e) => !e.voidedAt).reduce((m, e) => m + (e.lines as { count: number }[]).reduce((k, l) => k + (l.count || 0), 0), 0),
    0,
  );
  const summary: ForestrySummary = {
    plots: plots.length,
    haMapped: plots.reduce((n, p) => n + (p.geom ? areaHa(p.geom) : 0), 0),
    haCounted: result.hectaresCounted,
    planted,
  };
  const layer = fc(
    plots
      .filter((p) => p.geom)
      .map((p) => {
        const r = result.plots.find((x) => x.siteId === p.siteId);
        return {
          type: "Feature" as const,
          id: p.siteId,
          geometry: p.geom!,
          properties: { _id: p.siteId, kind: stream, code: p.code, village: p.village, status: p.status, areaHa: areaHa(p.geom!), outcome: r?.outcome ?? "", species: p.species.join(", ") },
        };
      }),
  );
  return { summary, layer };
}

export async function loadOverview(me: Principal): Promise<Overview> {
  const access = navAccess(me);
  const today = todayDrc();
  const d = db() as AnyDb;
  const empty = fc([]);

  const [bamboo, miombo, bh, schoolsPart, setup] = await Promise.all([
    access.streams.bamboo ? forestry("bamboo", today) : null,
    access.streams.miombo ? forestry("miombo", today) : null,
    access.streams.boreholes
      ? (async () => {
          const { rows, counted } = await loadBoreholes(db(), today, "captured", today);
          const pops = await d.select().from(populationEstimates).where(isNull(populationEstimates.voidedAt));
          const latestPop = (siteId: string) =>
            pops.filter((p: any) => p.scopeId === siteId).sort((a: any, b: any) => (a.estimatedOn < b.estimatedOn ? 1 : -1))[0]?.population ?? 0;
          const people = rows.filter((r) => r.indicator.counted || r.lifecycle === "operational").reduce((n, r) => n + latestPop(r.siteId), 0);
          return {
            summary: { count: rows.length, counted, overdue: rows.filter((r) => r.worstDue === "overdue").length, people },
            layer: fc(
              rows
                .filter((r) => r.lat != null && r.lng != null)
                .map((r) => ({
                  type: "Feature" as const,
                  id: r.siteId,
                  geometry: { type: "Point" as const, coordinates: [r.lng!, r.lat!] },
                  properties: { _id: r.siteId, kind: "boreholes", code: r.code, village: r.village, lifecycle: r.lifecycle, due: r.worstDue, counted: r.indicator.counted, people: latestPop(r.siteId), lastVisit: r.lastVisitOn ?? "" },
                })),
            ),
          };
        })()
      : null,
    access.streams.schools
      ? (async () => {
          const list = (await mySchools(me)).filter((s) => s.active);
          let pupils = 0;
          let marked = 0;
          let absent = 0;
          const feats: FeatureCollection["features"] = [];
          const siteRows = list.length ? await d.select().from(sites).where(eq(sites.kind, "school")) : [];
          for (const s of list) {
            const data = await loadSchool(db(), s.id);
            if (!data) continue;
            // Pupils enrolled today, in this year's classes only (DATA-11).
            const active = activeOn(data.enrolments, today, data.years).length;
            pupils += active;
            // classDay counts each absent pupil once, however many phones recorded them (DATA-10).
            const classIds = new Set(data.registers.filter((r) => !r.voidedAt && r.date === today).map((r) => r.classId));
            for (const classId of classIds) {
              const day = classDay(classId, today, data.enrolments, data.absences, data.registers, data.years);
              marked += day.enrolled;
              absent += day.absent;
            }
            const site = siteRows.find((r: any) => r.id === s.id);
            if (site?.lat != null && site?.lng != null) {
              feats.push({
                type: "Feature",
                id: s.id,
                geometry: { type: "Point", coordinates: [site.lng, site.lat] },
                properties: { _id: s.id, kind: "schools", code: data.school?.code ?? "", name: s.name, pupils: active },
              });
            }
          }
          return {
            summary: { count: list.length, pupils, presentPct: marked > 0 ? Math.round(((marked - absent) / marked) * 100) : null },
            layer: fc(feats),
          };
        })()
      : null,
    (async () => {
      const [u] = await d.select({ n: roleAssignments.userId }).from(roleAssignments).groupBy(roleAssignments.userId).then((r: any[]) => [r.length]);
      const p = (await d.select({ id: devices.id }).from(devices).where(isNull(devices.revokedAt))).length;
      const t = access.streams.boreholes ? (await loadTemplates(db())).length : 0;
      return { users: u, phones: p, templates: t };
    })(),
  ]);

  return {
    access,
    schools: schoolsPart?.summary ?? null,
    boreholes: bh?.summary ?? null,
    bamboo: bamboo?.summary ?? null,
    miombo: miombo?.summary ?? null,
    setup,
    map: { bamboo: bamboo?.layer ?? empty, miombo: miombo?.layer ?? empty, boreholes: bh?.layer ?? empty, schools: schoolsPart?.layer ?? empty },
  };
}

export { and };
