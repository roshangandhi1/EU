"use server";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLocale } from "@eu/core/i18n";
import { fa, plotSchema, type ForestryStream } from "@eu/forestry";
import { plotBoundaries, plots } from "@eu/forestry/db/schema";
import { handlePush } from "@eu/sync/server";
import { db } from "@/lib/http";
import { entities, permissions } from "@/lib/registry";
import { currentPrincipal } from "@/lib/session";
import { isIsoDate, todayDrc } from "@/lib/dates";

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const STATUSES = plotSchema.shape.status.options;

async function ctxFor(fd: FormData) {
  const locale = str(fd, "locale");
  if (!isLocale(locale)) redirect("/fr");
  const stream = str(fd, "stream");
  if (stream !== "bamboo" && stream !== "miombo") redirect(`/${locale}`);
  const siteId = str(fd, "siteId");
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const path = `/${locale}/forestry/${stream}/${encodeURIComponent(siteId)}`;
  const back = (q: Record<string, string>, hash = ""): never => redirect(`${path}?${new URLSearchParams(q)}${hash}`);
  const ctx = { db: db(), user: me.user, deviceId: me.deviceId ?? `web:${me.user.id}`, permissions, entities };
  return { stream: stream as ForestryStream, siteId, me, path, back, ctx };
}

/**
 * Approve the plot's latest boundary as its reference from a date (stream leads and managers).
 * Append-only: the approval history is never lost, and a later approval supersedes it.
 */
export async function approveBoundaryAction(fd: FormData) {
  const { stream, siteId, me, path, back, ctx } = await ctxFor(fd);
  if (!permissions.can(me.user, fa(stream, "boundary.approve"), { stream, siteId })) back({ error: "forbidden" }, "#boundary");
  const from = str(fd, "effectiveFrom");
  const boundaryId = str(fd, "boundaryId");
  if (!isIsoDate(from) || from > todayDrc()) back({ error: "invalid" }, "#boundary");
  const [b] = await (db() as any).select({ id: plotBoundaries.id }).from(plotBoundaries)
    .where(and(eq(plotBoundaries.id, boundaryId), eq(plotBoundaries.scopeId, siteId), isNull(plotBoundaries.voidedAt)));
  if (!b) back({ error: "not_found" }, "#boundary");
  const now = new Date().toISOString();
  const res = await handlePush(ctx, {
    deviceNow: now,
    mutations: [{
      mutationId: randomUUID(), entity: `${stream}.boundary_approval`, recordId: randomUUID(), op: "insert", scopeId: siteId, deviceTime: now,
      fields: { boundaryId, effectiveFrom: from, checkedAgainst: str(fd, "checkedAgainst").slice(0, 200) || null, note: str(fd, "note").slice(0, 4000) || null },
    }],
  });
  const r = res.results[0]!;
  revalidatePath(path);
  if (r.status === "applied" || r.status === "duplicate") back({ ok: "approved" }, "#boundary");
  back({ error: r.reason ?? r.status }, "#boundary");
}

/** Edit a plot's basic attributes (stream leads and managers): village, local name, status, public visibility. */
export async function updatePlotAction(fd: FormData) {
  const { stream, siteId, me, path, back, ctx } = await ctxFor(fd);
  if (!permissions.can(me.user, fa(stream, "plot.write"), { stream, siteId })) back({ error: "forbidden" }, "#edit");
  const village = str(fd, "village");
  const status = str(fd, "status");
  const localName = str(fd, "localName");
  if (!village || village.length > 120 || localName.length > 120 || !STATUSES.includes(status as never)) back({ error: "invalid" }, "#edit");
  const [row] = await (db() as any).select().from(plots).where(and(eq(plots.scopeId, siteId), eq(plots.stream, stream)));
  if (!row) back({ error: "not_found" });
  const fields: Record<string, unknown> = {
    village, status, localName: localName || null, publicVisible: fd.get("publicVisible") === "yes",
    species: fd.getAll("species").map(String).filter(Boolean),
  };
  let seen: Record<string, number> = {};
  try { seen = JSON.parse(str(fd, "seen") || "{}"); } catch { /* fall back to the current versions */ }
  const base = Object.fromEntries(Object.keys(fields).map((k) => [k, seen[k] ?? row.fieldVersions?.[k] ?? 0]));
  const now = new Date().toISOString();
  const res = await handlePush(ctx, {
    deviceNow: now,
    mutations: [{ mutationId: randomUUID(), entity: `${stream}.plot`, recordId: row.id, op: "update", scopeId: siteId, deviceTime: now, fields, baseFieldVersions: base }],
  });
  const r = res.results[0]!;
  revalidatePath(path);
  if (r.status === "applied") back({ ok: "saved" });
  if (r.status === "partial") back({ ok: "conflict" });
  back({ error: r.reason ?? r.status }, "#edit");
}
