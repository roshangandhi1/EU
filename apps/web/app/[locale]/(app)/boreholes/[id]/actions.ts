"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale } from "@eu/core/i18n";
import { addFlowTest, deleteFlowTest, editFlowTest, updateBorehole, type FlowTestInput } from "@eu/boreholes/server";
import { handlePush } from "@eu/sync/server";
import { boreholeSchema } from "@eu/boreholes";
import { boreholes } from "@eu/boreholes/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";
import { currentPrincipal } from "@/lib/session";
import { isIsoDate, todayDrc } from "@/lib/dates";
import { parseDecimal } from "@/lib/format";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const LIFECYCLE = boreholeSchema.shape.lifecycle.options;

async function ctxFor(fd: FormData) {
  const locale = str(fd, "locale");
  if (!isLocale(locale)) redirect("/fr");
  const siteId = str(fd, "siteId");
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const path = `/${locale}/boreholes/${encodeURIComponent(siteId)}`;
  const back = (q: Record<string, string>, hash = ""): never => redirect(`${path}?${new URLSearchParams(q)}${hash}`);
  const ctx = { db: db(), user: me.user, deviceId: me.deviceId ?? `web:${me.user.id}`, permissions, entities };
  return { locale, siteId, me, path, back, ctx };
}

/** Number field: empty = null, otherwise a decimal typed with "," or "."; NaN when it is not a number. */
const dec = (fd: FormData, k: string) => parseDecimal(str(fd, k));
const bad = (n: number | null, min: number, max: number) => n !== null && (Number.isNaN(n) || n < min || n > max);

/** Edit a borehole's basic attributes (stream leads and managers). Field versions guard against silent overwrites. */
export async function updateBoreholeAction(fd: FormData) {
  const { siteId, me, path, back, ctx } = await ctxFor(fd);
  if (!permissions.can(me.user, "boreholes.write", { stream: "boreholes" })) back({ error: "forbidden" }, "#edit");
  const lat = dec(fd, "lat");
  const lng = dec(fd, "lng");
  if (bad(lat, -14, 6) || bad(lng, 12, 32) || (lat === null) !== (lng === null)) back({ error: "coords" }, "#edit");
  const pump = dec(fd, "pump");
  const lifecycle = str(fd, "lifecycle");
  const village = str(fd, "village");
  const dates = ["commissionedOn", "handedOverOn"].map((k) => str(fd, k));
  if (!village || village.length > 120 || !LIFECYCLE.includes(lifecycle as never) || bad(pump, 0.01, 50) || dates.some((x) => x && !isIsoDate(x))) back({ error: "invalid" }, "#edit");

  const fields: Record<string, unknown> = {
    village, lifecycle, gpsLat: lat, gpsLng: lng, pumpRatingKw: pump,
    waterCommittee: str(fd, "waterCommittee") || null,
    commissionedOn: dates[0] || null, handedOverOn: dates[1] || null,
    sopHandedOver: fd.get("sopHandedOver") === "yes",
    hasTaps: fd.get("hasTaps") === "yes",
    notes: str(fd, "notes") || null,
  };
  // Optional additions to the lists: a water-quality test and a trained caretaker.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [current] = (await (db() as any).select().from(boreholes).where(eq(boreholes.scopeId, siteId))) as { waterQuality?: unknown[] | null; caretakersTrained?: unknown[] | null }[];
  if (!current) back({ error: "not_found" });
  const wqOn = str(fd, "wqOn");
  if (wqOn) {
    const ntu = dec(fd, "wqNtu");
    const ecoli = dec(fd, "wqEcoli");
    if (!isIsoDate(wqOn) || wqOn > todayDrc() || bad(ntu, 0, 10_000) || bad(ecoli, 0, 1_000_000)) back({ error: "invalid" }, "#edit");
    fields.waterQuality = [...(current!.waterQuality ?? []), { testedOn: wqOn, ...(ntu !== null ? { turbidityNtu: ntu } : {}), ...(ecoli !== null ? { ecoliPer100ml: ecoli } : {}) }];
  }
  const ctName = str(fd, "ctName");
  if (ctName) {
    const ctOn = str(fd, "ctOn");
    if (!isIsoDate(ctOn) || ctOn > todayDrc() || ctName.length > 120) back({ error: "invalid" }, "#edit");
    const phone = str(fd, "ctPhone");
    fields.caretakersTrained = [...(current!.caretakersTrained ?? []), { name: ctName, trainedOn: ctOn, ...(phone ? { phone } : {}) }];
  }

  let seen: Record<string, number> | undefined;
  try { seen = JSON.parse(str(fd, "seen") || "null") ?? undefined; } catch { seen = undefined; }
  const r = await updateBorehole(ctx, siteId, fields, seen);
  revalidatePath(path);
  if (r.ok) back({ ok: "saved" });
  if (r.reason === "partial" || (r.conflicts?.length ?? 0) > 0) back({ ok: "conflict" });
  back({ error: r.reason ?? "unknown" }, "#edit");
}

/** Record a population-served estimate (technicians and leads), append-only with its method. */
export async function addPopulationAction(fd: FormData) {
  const { siteId, me, path, back, ctx } = await ctxFor(fd);
  if (!permissions.can(me.user, "boreholes.population.write", { stream: "boreholes", siteId })) back({ error: "forbidden" }, "#population");
  const method = str(fd, "method");
  const on = str(fd, "estimatedOn");
  const households = dec(fd, "households");
  const size = dec(fd, "size");
  const headcount = dec(fd, "headcount");
  let population = dec(fd, "population");
  if (population === null && method === "household_count" && households !== null && size !== null) population = Math.round(households * size);
  if (population === null && method === "collection_headcount" && headcount !== null) population = headcount;
  if (!isIsoDate(on) || on > todayDrc() || population === null || bad(population, 0, 1_000_000) || bad(households, 0, 100_000) || bad(size, 0, 30) || bad(headcount, 0, 1_000_000)) {
    back({ error: "invalid" }, "#population");
  }
  const now = new Date();
  const res = await handlePush(ctx, {
    deviceNow: now.toISOString(),
    mutations: [{
      mutationId: randomUUID(), entity: "boreholes.population", recordId: randomUUID(), op: "insert", scopeId: siteId, deviceTime: now.toISOString(),
      fields: {
        estimatedOn: on, method, households: households === null ? null : Math.round(households), avgHouseholdSize: size,
        headcount: headcount === null ? null : Math.round(headcount), population: Math.round(population!), otherUsers: [], notes: str(fd, "notes") || null,
      },
    }],
  });
  const r = res.results[0]!;
  revalidatePath(path);
  if (r.status === "applied" || r.status === "duplicate") back({ ok: "pop" }, "#population");
  back({ error: r.reason ?? r.status }, "#population");
}

/** Reads and checks a flow test form: same limits as the phone (0 to 2,000 L/min, date not in the future). */
function flowInput(fd: FormData): FlowTestInput | null {
  const on = str(fd, "testedOn");
  const flow = dec(fd, "flowLpm");
  const pump = str(fd, "pump");
  const taps = str(fd, "taps");
  const undertaker = str(fd, "undertaker");
  if (!isIsoDate(on) || on > todayDrc() || flow === null || bad(flow, 0, 2000) || !["yes", "no"].includes(pump) || !["yes", "no", "na"].includes(taps)
    || !undertaker || undertaker.length > 200) return null;
  return { testedOn: on, flowLpm: flow, pumpDelivers: pump === "yes", tankFillsTapsOk: taps === "na" ? null : taps === "yes", undertaker, notes: str(fd, "notes").slice(0, 4000) || null };
}

/** Log a water flow test (anyone who can record visits). Stored as a visit, so it syncs and counts like a phone check. */
export async function addFlowTestAction(fd: FormData) {
  const { siteId, me, path, back, ctx } = await ctxFor(fd);
  if (!permissions.can(me.user, "boreholes.visit.write", { stream: "boreholes", siteId })) back({ error: "forbidden" }, "#flow");
  const input = flowInput(fd);
  if (!input) back({ error: "flow_invalid" }, "#flow");
  const r = await addFlowTest(ctx, siteId, input!);
  revalidatePath(path);
  if (r.ok) back({ ok: "flow_saved" }, "#flow");
  back({ error: r.ok ? "" : r.reason }, "#flow");
}

/** Correct a flow test (stream leads, managers, system administrators). */
export async function editFlowTestAction(fd: FormData) {
  const { siteId, me, path, back, ctx } = await ctxFor(fd);
  if (!permissions.can(me.user, "boreholes.record.void", { stream: "boreholes", siteId })) back({ error: "forbidden" }, "#flow");
  const input = flowInput(fd);
  if (!input) back({ error: "flow_invalid" }, "#flow");
  const r = await editFlowTest(ctx, siteId, str(fd, "testId"), input!);
  revalidatePath(path);
  if (r.ok) back({ ok: "flow_updated" }, "#flow");
  back({ error: r.ok ? "" : r.reason }, "#flow");
}

/** Delete a flow test (stream leads, managers, system administrators). */
export async function deleteFlowTestAction(fd: FormData) {
  const { siteId, me, path, back, ctx } = await ctxFor(fd);
  if (!permissions.can(me.user, "boreholes.record.void", { stream: "boreholes", siteId })) back({ error: "forbidden" }, "#flow");
  const r = await deleteFlowTest(ctx, siteId, str(fd, "testId"));
  revalidatePath(path);
  if (r.ok) back({ ok: "flow_deleted" }, "#flow");
  back({ error: r.ok ? "" : r.reason }, "#flow");
}
