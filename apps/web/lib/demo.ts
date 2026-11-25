/**
 * Demo data: a small, clearly marked set of records in every stream, so a first look at the
 * phone app or the web is not empty. Everything is named "DEMO-…" and is written through the
 * sync engine like real work, so phones receive it and the audit log records it.
 *
 * Removing it voids every demo record (phones then drop them on their next sync) and marks the
 * demo sites inactive. Demo records count in dashboards while they are loaded, so remove them
 * before real reporting.
 */
import { sites, type Db } from "@eu/db";
import { createBorehole, loadTemplates, saveTemplate } from "@eu/boreholes/server";
import { defaultTemplate } from "@eu/boreholes";
import { commitImport } from "@eu/forestry/server";
import { areaHa, type ImportCandidate } from "@eu/forestry";
import { createSchoolSite } from "@eu/schools";
import { handlePush, type SyncContext } from "@eu/sync/server";
import type { Mutation } from "@eu/sync";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import type { MultiPolygon } from "geojson";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

export const DEMO_PREFIX = "DEMO-";
const SCHOOL_PREFIX = "demo-school-";
const VOID_REASON = "Demo data removed";

export interface DemoStatus {
  loaded: boolean;
  sites: { id: string; name: string; stream: string }[];
}

/** Demo sites still active. */
export async function demoStatus(db: Db): Promise<DemoStatus> {
  const rows = await (db as AnyDb)
    .select({ id: sites.id, name: sites.name, stream: sites.stream })
    .from(sites)
    .where(and(like(sites.name, `${DEMO_PREFIX}%`), eq(sites.active, true)));
  return { loaded: rows.length > 0, sites: rows };
}

/** A rough square plot of about `ha` hectares centred on (lng, lat). */
function square(lng: number, lat: number, ha: number): MultiPolygon {
  const sideM = Math.sqrt(ha * 10_000);
  const dLat = sideM / 2 / 111_320;
  const dLng = sideM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: "MultiPolygon",
    coordinates: [[[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]]],
  };
}

function candidate(i: number, name: string, lng: number, lat: number, ha: number): ImportCandidate {
  const geom = square(lng, lat, ha);
  return { index: i, name, properties: {}, geom, areaHa: areaHa(geom), problems: [] };
}

const FIRST = ["Amani", "Bijou", "Christelle", "Daniel", "Esther", "Fiston", "Grâce", "Héritier", "Israël", "Joëlle", "Kevin", "Lydie"];
const LAST = ["Kabila", "Mukendi", "Ilunga", "Kasongo", "Mwamba", "Ngoy", "Banza", "Kalenga"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** The academic year running on `now`: September to early July. */
function yearFor(now: Date) {
  const y = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { label: `${y}-${y + 1}`, startsOn: `${y}-09-01`, endsOn: `${y + 1}-07-02`, termEnds: `${y}-12-20` };
}

export type DemoResult = { ok: true; created: string[] } | { ok: false; reason: string; created?: string[] };

/** Loads the demo set. Needs a user who may manage sites, schools, plots and boreholes (a system admin). */
export async function loadDemo(ctx: SyncContext): Promise<DemoResult> {
  if (!ctx.permissions.can(ctx.user, "sites.manage", { stream: "platform" })) return { ok: false, reason: "forbidden" };
  if ((await demoStatus(ctx.db)).loaded) return { ok: false, reason: "already_loaded" };
  const d = ctx.db as AnyDb;
  const now = ctx.now?.() ?? new Date();
  const nowIso = now.toISOString();
  // Codes stay unique if demo data was loaded and removed before.
  const earlier = await d.select({ id: sites.id }).from(sites).where(like(sites.id, `${SCHOOL_PREFIX}%`));
  const run = earlier.length + 1;
  const sfx = run === 1 ? "" : `-${run}`;
  const created: string[] = [];
  const id = () => crypto.randomUUID();
  const push = async (mutations: Mutation[]) => {
    const res = await handlePush(ctx, { deviceNow: nowIso, mutations });
    const bad = res.results.find((r) => r.status === "rejected");
    if (bad) throw new Error(`demo ${bad.reason}`);
  };
  const ins = (entity: string, scopeId: string, fields: Record<string, unknown>, recordId = id()): Mutation => ({
    mutationId: id(), entity, recordId, op: "insert", scopeId, fields, deviceTime: nowIso,
  });

  try {
    // Schools: one primary school with a year, a term, six classes, fees and 24 pupils.
    const schoolId = `${SCHOOL_PREFIX}${run}`;
    await createSchoolSite(ctx.db, { id: schoolId, name: `${DEMO_PREFIX}École primaire Kiabukwa${sfx}`, lat: -8.712, lng: 24.79 });
    const y = yearFor(now);
    const yearId = id();
    const termId = id();
    const roomId = id();
    const classIds = [1, 2, 3, 4, 5, 6].map(() => id());
    const feeId = id();
    await push([
      ins("school.school", schoolId, { siteId: schoolId, code: run === 1 ? "DEMO" : `DEMO${run}`, locale: "fr", shiftsRunning: ["morning"] }),
      ins("school.academic_year", schoolId, { label: y.label, startsOn: y.startsOn, endsOn: y.endsOn }, yearId),
      ins("school.term", schoolId, { academicYearId: yearId, number: 1, startsOn: y.startsOn, endsOn: y.termEnds }, termId),
      ins("school.classroom", schoolId, { name: "Salle 1", seatsPerShift: 45, basis: "new", commissionedOn: y.startsOn, decommissionedOn: null, evidenceUrl: null }, roomId),
      ...classIds.map((cid, i) => ins("school.class", schoolId, { academicYearId: yearId, level: i + 1, section: "A", shift: "morning", classroomId: i === 0 ? roomId : null }, cid)),
      ins("school.fee_item", schoolId, { academicYearId: yearId, termId, name: "Minerval T1", levels: [1, 2, 3, 4, 5, 6], amount: 15_000, dueOn: y.termEnds }, feeId),
    ]);
    const pupils: Mutation[] = [];
    for (let i = 0; i < 24; i++) {
      const sid = id();
      const level = (i % 6) + 1;
      pupils.push(
        ins("school.student", schoolId, {
          studentNumber: `DEMO-${String(i + 1).padStart(3, "0")}`, firstName: FIRST[i % FIRST.length], lastName: LAST[i % LAST.length], postName: "",
          sex: i % 2 === 0 ? "F" : "M", dateOfBirth: null, birthYearEstimate: now.getUTCFullYear() - 5 - level, guardianName: "", guardianPhone: "", village: "Kiabukwa",
        }, sid),
        ins("school.enrolment", schoolId, { studentId: sid, classId: classIds[level - 1], academicYearId: yearId, enrolledOn: y.startsOn, leftOn: null, status: "active" }),
      );
    }
    await push(pupils);
    created.push(`school ${schoolId}`);

    // Bamboo and miombo: plots near Kiabukwa with a planting each.
    const plots = [
      { stream: "bamboo" as const, name: `${DEMO_PREFIX}B01${sfx}`, lng: 24.775, lat: -8.705, ha: 4, species: "Bambusa vulgaris", count: 1600 },
      { stream: "bamboo" as const, name: `${DEMO_PREFIX}B02${sfx}`, lng: 24.782, lat: -8.705, ha: 3, species: "Bambusa vulgaris", count: 1100 },
      { stream: "miombo" as const, name: `${DEMO_PREFIX}M01${sfx}`, lng: 24.8, lat: -8.72, ha: 5, species: "Brachystegia spiciformis", count: 2500 },
      { stream: "miombo" as const, name: `${DEMO_PREFIX}M02${sfx}`, lng: 24.808, lat: -8.72, ha: 2, species: "Julbernardia paniculata", count: 900 },
    ];
    for (const [i, p] of plots.entries()) {
      const r = await commitImport(ctx, [candidate(i, p.name, p.lng, p.lat, p.ha)], {
        stream: p.stream, village: "Kiabukwa", sourceName: "demo", status: "planted", species: [p.species],
      });
      const made = r.created[0];
      if (!made) throw new Error(`demo plot ${r.rejected[0]?.reason}`);
      await push([ins(`${p.stream}.planting`, made.siteId, { plantedOn: iso(new Date(now.getTime() - 30 * 86_400_000)), lines: [{ species: p.species, count: p.count }], isGapFilling: false, photos: [], notes: "Demo" })]);
      created.push(`${p.stream} ${p.name}`);
    }

    // Boreholes: three, with the default maintenance checklist if none exists yet.
    if ((await loadTemplates(ctx.db)).length === 0) await saveTemplate(ctx, defaultTemplate);
    const holes = [
      { code: `${DEMO_PREFIX}BH01${sfx}`, village: "Kiabukwa", lat: -8.709, lng: 24.787, people: 640 },
      { code: `${DEMO_PREFIX}BH02${sfx}`, village: "Malambwe", lat: -8.74, lng: 24.83, people: 410 },
      { code: `${DEMO_PREFIX}BH03${sfx}`, village: "Kayumba", lat: -8.69, lng: 24.76, people: 0 },
    ];
    for (const [i, h] of holes.entries()) {
      const r = await createBorehole(ctx, { code: h.code, village: h.village, lat: h.lat, lng: h.lng, pumpRatingKw: 1.1, lifecycle: i === 2 ? "drilled" : "operational" });
      if (!r.ok) throw new Error(`demo borehole ${r.reason}`);
      if (h.people) await push([ins("boreholes.population", r.siteId, { estimatedOn: iso(now), method: "village_census", population: h.people, otherUsers: [], notes: "Demo" })]);
      created.push(`borehole ${h.code}`);
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), created };
  }
  return { ok: true, created };
}

/** Voids every record held under a demo site and marks the sites inactive. */
export async function removeDemo(ctx: SyncContext): Promise<{ ok: true; voided: number } | { ok: false; reason: string }> {
  if (!ctx.permissions.can(ctx.user, "sites.manage", { stream: "platform" })) return { ok: false, reason: "forbidden" };
  const d = ctx.db as AnyDb;
  const { sites: demo } = await demoStatus(ctx.db);
  if (demo.length === 0) return { ok: true, voided: 0 };
  const nowIso = (ctx.now?.() ?? new Date()).toISOString();
  const mutations: Mutation[] = [];
  const seen = new Set<string>();
  for (const e of ctx.entities.all()) {
    const ids = demo.filter((s) => s.stream === e.stream).map((s) => s.id);
    if (ids.length === 0) continue;
    const t = e.table as AnyDb;
    const rows = await d.select({ id: t.id, scopeId: t.scopeId }).from(t).where(and(inArray(t.scopeId, ids), isNull(t.voidedAt)));
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      mutations.push({ mutationId: crypto.randomUUID(), entity: e.name, recordId: r.id, op: "void", scopeId: r.scopeId, voidReason: VOID_REASON, deviceTime: nowIso });
    }
  }
  const res = await handlePush(ctx, { deviceNow: nowIso, mutations });
  const bad = res.results.find((r) => r.status === "rejected");
  if (bad) return { ok: false, reason: bad.reason ?? "rejected" };
  await d.update(sites).set({ active: false }).where(inArray(sites.id, demo.map((s) => s.id)));
  return { ok: true, voided: mutations.length };
}
