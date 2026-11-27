/**
 * Archiving (deleting) and restoring a borehole, plot or school (system administrators only).
 *
 * Nothing is erased: every live record held under the site is voided through the sync engine
 * (so phones drop it on their next sync and the audit log keeps who and why), then the site is
 * marked inactive so nothing new can be recorded against it. Voided records drop out of every
 * total, map, indicator and report, which all read live records only. The archive row lists
 * what was voided, so a restore brings back exactly that.
 */
import { siteArchives, sites, type Db } from "@eu/db";
import type { PermissionRegistry, UserContext } from "@eu/core";
import type { EntityRegistry, Mutation } from "@eu/sync";
import { handlePush, restoreVoided } from "@eu/sync/server";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { boreholes } from "@eu/boreholes/db/schema";
import { plots } from "@eu/forestry/db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

export type DeletableKind = "borehole" | "plot" | "school";

export interface DeleteCtx {
  db: Db;
  user: UserContext;
  deviceId: string;
  permissions: PermissionRegistry;
  entities: EntityRegistry;
  now?: () => Date;
}

export interface LinkedCount {
  entity: string;
  label: { en: string; fr: string };
  n: number;
}

export const canDeleteSites = (permissions: PermissionRegistry, user: UserContext) => permissions.can(user, "sites.delete", { stream: "platform" });

/** The site, and how many live records of each kind are held under it (the site's own record first). */
export async function linkedRecords(db: Db, entities: EntityRegistry, siteId: string): Promise<{ site: { id: string; name: string; kind: string; stream: string; active: boolean }; linked: LinkedCount[] } | null> {
  const d = db as AnyDb;
  const [site] = await d.select().from(sites).where(eq(sites.id, siteId));
  if (!site) return null;
  const linked: LinkedCount[] = [];
  for (const e of entities.all()) {
    if (e.stream !== site.stream) continue;
    const t = e.table as AnyDb;
    const [r] = await d.select({ n: count() }).from(t).where(and(eq(t.scopeId, siteId), isNull(t.voidedAt)));
    const n = Number(r?.n ?? 0);
    if (n > 0) linked.push({ entity: e.name, label: e.label, n });
  }
  return { site: { id: site.id, name: site.name, kind: site.kind, stream: site.stream, active: site.active }, linked };
}

export type DeleteResult = { ok: true; name: string; voided: number } | { ok: false; reason: string };

/**
 * Voids everything held under the site, records the archive, then deactivates the site. `kind`
 * must match the site, so a borehole page can never archive a school. Safe to retry.
 */
export async function deleteSite(ctx: DeleteCtx, siteId: string, kind: DeletableKind, reason: string): Promise<DeleteResult> {
  if (!canDeleteSites(ctx.permissions, ctx.user)) return { ok: false, reason: "forbidden" };
  const d = ctx.db as AnyDb;
  const [site] = await d.select().from(sites).where(eq(sites.id, siteId));
  if (!site || site.kind !== kind) return { ok: false, reason: "not_found" };
  const nowIso = (ctx.now?.() ?? new Date()).toISOString();
  const mutations: Mutation[] = [];
  const seen = new Set<string>();
  for (const e of ctx.entities.all()) {
    if (e.stream !== site.stream) continue;
    const t = e.table as AnyDb;
    const rows = await d.select({ id: t.id }).from(t).where(and(eq(t.scopeId, siteId), isNull(t.voidedAt)));
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      mutations.push({ mutationId: randomUUID(), entity: e.name, recordId: r.id, op: "void", scopeId: siteId, voidReason: reason, deviceTime: nowIso });
    }
  }
  const voided: { entity: string; recordId: string }[] = [];
  let failed: string | null = null;
  for (let i = 0; i < mutations.length && !failed; i += 100) {
    const batch = mutations.slice(i, i + 100);
    const res = await handlePush(ctx, { deviceNow: nowIso, mutations: batch });
    res.results.forEach((r, j) => {
      if (r.status === "applied") voided.push({ entity: batch[j]!.entity, recordId: batch[j]!.recordId });
      else if (r.status === "rejected" && !failed) failed = r.reason ?? "rejected";
    });
  }
  // Even a partial run is recorded, so whatever was voided can be restored.
  if (voided.length || !failed) {
    await d.insert(siteArchives).values({ siteId, kind, stream: site.stream, name: site.name, reason, records: voided, archivedBy: ctx.user.id });
  }
  if (failed) return { ok: false, reason: failed };
  await d.update(sites).set({ active: false }).where(eq(sites.id, siteId));
  return { ok: true, name: site.name, voided: voided.length };
}

export interface ArchivedSite { siteId: string; name: string; reason: string; archivedAt: Date; records: number }

/** Archived sites of one kind (and stream, for plots), newest first, not yet restored. */
export async function listArchived(db: Db, kind: DeletableKind, stream?: string): Promise<ArchivedSite[]> {
  const d = db as AnyDb;
  const rows = await d.select().from(siteArchives)
    .where(and(eq(siteArchives.kind, kind), isNull(siteArchives.restoredAt), ...(stream ? [eq(siteArchives.stream, stream)] : [])))
    .orderBy(desc(siteArchives.archivedAt));
  const bySite = new Map<string, ArchivedSite>();
  for (const r of rows) {
    const cur = bySite.get(r.siteId);
    if (cur) cur.records += r.records.length;
    else bySite.set(r.siteId, { siteId: r.siteId, name: r.name, reason: r.reason, archivedAt: r.archivedAt, records: r.records.length });
  }
  // Only sites that are still inactive (a site reactivated some other way is not "archived").
  const out: ArchivedSite[] = [];
  for (const a of bySite.values()) {
    const [s] = await d.select({ active: sites.active }).from(sites).where(eq(sites.id, a.siteId));
    if (s && !s.active) out.push(a);
  }
  return out;
}

/** Reactivates an archived site and restores every record its archive(s) voided. */
export async function restoreSite(ctx: DeleteCtx, siteId: string, kind: DeletableKind): Promise<DeleteResult> {
  if (!canDeleteSites(ctx.permissions, ctx.user)) return { ok: false, reason: "forbidden" };
  const d = ctx.db as AnyDb;
  const [site] = await d.select().from(sites).where(eq(sites.id, siteId));
  if (!site || site.kind !== kind) return { ok: false, reason: "not_found" };
  const archives = await d.select().from(siteArchives).where(and(eq(siteArchives.siteId, siteId), isNull(siteArchives.restoredAt)));
  if (archives.length === 0) return { ok: false, reason: "not_archived" };
  // Codes are unique among live records: refuse if a new borehole or plot took this one's code meanwhile.
  const own = archives.flatMap((a: any) => a.records).find((r: any) => r.entity === "boreholes.borehole" || r.entity.endsWith(".plot"));
  if (own) {
    const t: any = own.entity === "boreholes.borehole" ? boreholes : plots;
    const [mine] = await d.select({ code: t.code }).from(t).where(eq(t.id, own.recordId));
    if (mine) {
      const clash = await d.select({ id: t.id }).from(t).where(and(sql`lower(${t.code}) = ${String(mine.code).toLowerCase()}`, isNull(t.voidedAt)));
      if (clash.length) return { ok: false, reason: "code_taken" };
    }
  }
  // The site must be active again before its records are, so the restored records are writable.
  await d.update(sites).set({ active: true }).where(eq(sites.id, siteId));
  const n = await restoreVoided(ctx, archives.flatMap((a: any) => a.records), "Restored from archive");
  await d.update(siteArchives).set({ restoredAt: ctx.now?.() ?? new Date(), restoredBy: ctx.user.id })
    .where(and(eq(siteArchives.siteId, siteId), isNull(siteArchives.restoredAt)));
  return { ok: true, name: site.name, voided: n };
}
