/**
 * Demo data: a small, clearly marked set of records in every stream, so a first look at the
 * phone app or the web is not empty. Everything is named "DEMO-…" and is written through the
 * sync engine like real work, so phones receive it and the audit log records it.
 *
 * Removing it voids every demo record (phones then drop them on their next sync) and marks the
 * demo sites inactive. Demo records count in dashboards while they are loaded, so remove them
 * before real reporting.
 */
import { files, sites, type Db } from "@eu/db";
import { createBorehole, loadTemplates, saveTemplate } from "@eu/boreholes/server";
import { boreholes as boreholeTable } from "@eu/boreholes/db/schema";
import { defaultTemplate } from "@eu/boreholes";
import { commitImport } from "@eu/forestry/server";
import { areaHa, type ImportCandidate } from "@eu/forestry";
import { DRC_SCHEME, createSchoolSite, defaultSubjects, maxFor, periodsOf } from "@eu/schools";
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

/** Demo pupils' first names, by sex, so a girl is never called Daniel. */
/** Demo first names by sex, so a girl is never called Patrick. */
export const GIRLS = ["Amani", "Bijou", "Christelle", "Esther", "Grâce", "Joëlle", "Lydie", "Merveille", "Nathalie", "Rachel", "Sarah", "Ruth"];
export const BOYS = ["Daniel", "Fiston", "Héritier", "Israël", "Kevin", "Moïse", "Patrick", "Jonathan", "Samuel", "Trésor", "Junior", "Emmanuel"];
const FIRST = GIRLS.flatMap((g, i) => [g, BOYS[i]!]);
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
  /** Like push, but a rejected record is skipped (optional extras such as payments). */
  const softPush = async (mutations: Mutation[]) => {
    await handlePush(ctx, { deviceNow: nowIso, mutations });
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
          studentNumber: `DEMO-${String(i + 1).padStart(3, "0")}`, firstName: (i % 2 === 0 ? GIRLS : BOYS)[Math.floor(i / 2) % GIRLS.length], lastName: LAST[i % LAST.length], postName: "",
          sex: i % 2 === 0 ? "F" : "M", dateOfBirth: null, birthYearEstimate: now.getUTCFullYear() - 5 - level, guardianName: "", guardianPhone: "", village: "Kiabukwa",
        }, sid),
        ins("school.enrolment", schoolId, { studentId: sid, classId: classIds[level - 1], academicYearId: yearId, enrolledOn: y.startsOn, leftOn: null, status: "active" }),
      );
    }
    await push(pupils);
    // Attendance for the last five school days: every class register taken, a few pupils absent.
    const pupilRows = pupils.filter((m) => m.entity === "school.enrolment").map((m) => ({ studentId: m.fields!.studentId as string, classId: m.fields!.classId as string }));
    const days: string[] = [];
    for (let back = 0; days.length < 5 && back < 14; back++) {
      const day = new Date(now.getTime() - back * 86_400_000);
      if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) days.push(iso(day));
    }
    const reasons = ["sick", "fees", "work", "family", "unknown"];
    const attendance: Mutation[] = [];
    days.forEach((day, di) => {
      for (const cid of classIds) attendance.push(ins("school.register", schoolId, { classId: cid, date: day }));
      pupilRows.filter((_, pi) => (pi + di) % 9 === 0).forEach((pr, k) => attendance.push(ins("school.absence", schoolId, { studentId: pr.studentId, classId: pr.classId, date: day, reason: reasons[(di + k) % reasons.length] })));
    });
    await push(attendance);
    await push(demoMarks(schoolId, pupilRows, classIds, nowIso));
    // Fees: most pupils have paid part or all of the term fee, with paper receipt numbers.
    const bookFirst = 1001;
    const paid: Mutation[] = [ins("school.receipt_book", schoolId, { firstNumber: bookFirst, lastNumber: bookFirst + 99, assignedTo: ctx.user.id })];
    pupilRows.slice(0, 18).forEach((pr, i) => paid.push(ins("school.payment", schoolId, {
      studentId: pr.studentId, paidOn: days[i % days.length], amount: i % 3 === 0 ? 7_500 : 15_000, receiptNumber: bookFirst + i, feeItemIds: [feeId],
    })));
    await softPush(paid);
    created.push(`school ${schoolId}`);

    // Bamboo and miombo: plots near Kiabukwa with a planting each.
    const plots = [
      { stream: "bamboo" as const, name: `${DEMO_PREFIX}B01${sfx}`, lng: 24.775, lat: -8.705, ha: 4, species: "Bambusa vulgaris", count: 1700, approve: true },
      { stream: "bamboo" as const, name: `${DEMO_PREFIX}B02${sfx}`, lng: 24.782, lat: -8.705, ha: 3, species: "Bambusa vulgaris", count: 1250, approve: true },
      { stream: "bamboo" as const, name: `${DEMO_PREFIX}B03${sfx}`, lng: 24.768, lat: -8.712, ha: 6, species: "Oxytenanthera abyssinica", count: 900, approve: false },
      { stream: "miombo" as const, name: `${DEMO_PREFIX}M01${sfx}`, lng: 24.8, lat: -8.72, ha: 5, species: "Brachystegia spiciformis", count: 2500, approve: true },
      { stream: "miombo" as const, name: `${DEMO_PREFIX}M02${sfx}`, lng: 24.808, lat: -8.72, ha: 2, species: "Julbernardia paniculata", count: 900, approve: true },
      { stream: "miombo" as const, name: `${DEMO_PREFIX}M03${sfx}`, lng: 24.815, lat: -8.728, ha: 8, species: "Brachystegia boehmii", count: 0, approve: false },
    ];
    const approveFrom = iso(new Date(now.getTime() - 45 * 86_400_000));
    for (const [i, p] of plots.entries()) {
      const r = await commitImport(ctx, [candidate(i, p.name, p.lng, p.lat, p.ha)], {
        stream: p.stream, village: "Kiabukwa", sourceName: "demo", status: p.count ? "planted" : "pegged", species: [p.species],
        ...(p.approve ? { approveFrom, checkedAgainst: "Demo imagery" } : {}),
      });
      const made = r.created[0];
      if (!made) throw new Error(`demo plot ${r.rejected[0]?.reason}`);
      if (p.count) {
        // A placeholder photo record stands in for the planting photo, so demo hectares count as evidenced.
        const photoId = id();
        await d.insert(files).values({
          id: photoId, entity: `${p.stream}.planting`, scopeId: made.siteId, mime: "image/jpeg", bytes: 0, sha256: "demo", blobPath: "demo/placeholder.jpg",
          lat: p.lat, lng: p.lng, accuracyM: 5, takenAt: new Date(now.getTime() - 30 * 86_400_000), createdBy: ctx.user.id, deviceId: ctx.deviceId,
        });
        await push([ins(`${p.stream}.planting`, made.siteId, { plantedOn: iso(new Date(now.getTime() - 30 * 86_400_000)), lines: [{ species: p.species, count: p.count }], isGapFilling: false, photos: [photoId], notes: "Demo" })]);
      }
      created.push(`${p.stream} ${p.name}`);
    }

    // Boreholes: three, with the default maintenance checklist if none exists yet.
    if ((await loadTemplates(ctx.db)).length === 0) await saveTemplate(ctx, defaultTemplate);
    const holes = [
      { code: `${DEMO_PREFIX}BH01${sfx}`, village: "Kiabukwa", lat: -8.709, lng: 24.787, people: 640, state: "ok" },
      { code: `${DEMO_PREFIX}BH02${sfx}`, village: "Malambwe", lat: -8.74, lng: 24.83, people: 410, state: "ok" },
      { code: `${DEMO_PREFIX}BH03${sfx}`, village: "Kayumba", lat: -8.69, lng: 24.76, people: 0, state: "drilled" },
      { code: `${DEMO_PREFIX}BH04${sfx}`, village: "Mukanga", lat: -8.755, lng: 24.79, people: 520, state: "overdue" },
      { code: `${DEMO_PREFIX}BH05${sfx}`, village: "Kisanga", lat: -8.725, lng: 24.745, people: 300, state: "repair" },
    ];
    const daysAgo = (n: number) => iso(new Date(now.getTime() - n * 86_400_000));
    for (const [i, h] of holes.entries()) {
      const lifecycle = h.state === "drilled" ? "drilled" : h.state === "repair" ? "needs_repair" : "operational";
      const r = await createBorehole(ctx, { code: h.code, village: h.village, lat: h.lat, lng: h.lng, pumpRatingKw: i % 2 ? 1.1 : 2.2, lifecycle });
      if (!r.ok) throw new Error(`demo borehole ${r.reason}`);
      if (h.people) await push([ins("boreholes.population", r.siteId, { estimatedOn: iso(now), method: "village_census", population: h.people, otherUsers: [], notes: "Demo" })]);
      if (h.state !== "drilled") {
        // Commissioning facts, then a maintenance visit with the operational check.
        const [rec] = await d.select({ id: boreholeTable.id, fv: boreholeTable.fieldVersions }).from(boreholeTable).where(eq(boreholeTable.scopeId, r.siteId));
        if (rec) await softPush([{
          mutationId: id(), entity: "boreholes.borehole", recordId: rec.id, op: "update", scopeId: r.siteId, deviceTime: nowIso, baseFieldVersions: (rec.fv ?? {}) as Record<string, number>,
          fields: {
            commissionedOn: daysAgo(120), sopHandedOver: true,
            waterQuality: [{ testedOn: daysAgo(118), turbidityNtu: 1.2, ecoliPer100ml: 0 }],
            caretakersTrained: [{ name: `${FIRST[i]} ${LAST[i]}`, trainedOn: daysAgo(115) }],
          },
        }]);
        const visitedOn = daysAgo(h.state === "overdue" ? 70 : h.state === "repair" ? 12 : 9 + i);
        const ok = h.state !== "repair";
        await push([ins("boreholes.visit", r.siteId, {
          visitedOn, kind: "routine", templateKey: "routine", templateVersion: 1,
          results: defaultTemplate.tasks.map((task) => ({
            taskKey: task.key, done: true, pass: ok || task.key === "panels_clean",
            ...(task.key === "flow_measure" ? { value: ok ? 28 + i * 3 : 0 } : task.key === "water_quality" ? { value: 1.2 } : {}),
          })),
          operational: { pumpDelivers: ok, flowLpm: ok ? 28 + i * 3 : 0, tankFillsTapsOk: ok },
          flowLpm: ok ? 28 + i * 3 : 0, partsUsed: [], faultsClosed: [], photos: [], notes: ok ? "Demo visit" : "Demo: pump not delivering, controller suspected",
        })]);
      }
      created.push(`borehole ${h.code}`);
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), created };
  }
  return { ok: true, created };
}

/**
 * Marks for the demo school: P1 for every pupil, P2 for most pupils of years 1-3, with one absence, on the default
 * DRC subjects, so the marks and results screens are not empty. Scores are fixed (no randomness)
 * so screenshots and tests are stable. Removal voids them with the rest of the school's records.
 */
export function demoMarks(schoolId: string, pupils: { studentId: string; classId: string }[], classIds: string[], nowIso: string): Mutation[] {
  const [p1, p2] = periodsOf(DRC_SCHEME);
  const out: Mutation[] = [];
  pupils.forEach((pr, pi) => {
    const level = classIds.indexOf(pr.classId) + 1;
    defaultSubjects(level).forEach((sub, si) => {
      for (const [k, period] of [p1!, p2!].entries()) {
        if (k === 1 && (level > 3 || pi % 4 === 3)) continue; // P2 typed so far for years 1-3 only, a few pupils still to do
        const max = maxFor(sub, period, DRC_SCHEME);
        const absent = k === 1 && pi === 0 && si === 0;
        const ratio = 0.35 + (((pi * 7 + si * 3 + k * 5) % 13) / 13) * 0.6;
        out.push({
          mutationId: crypto.randomUUID(), entity: "school.mark", recordId: crypto.randomUUID(), op: "insert", scopeId: schoolId, deviceTime: nowIso,
          fields: { studentId: pr.studentId, classId: pr.classId, subject: sub.code, period: period.key, score: absent ? null : Math.round(max * ratio * 2) / 2, absent },
        });
      }
    });
  });
  return out;
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
