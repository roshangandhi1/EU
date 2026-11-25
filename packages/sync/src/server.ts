import {
  isClockSuspect,
  clockSkewMs,
  type ActionTarget,
  type PermissionRegistry,
  type UserContext,
} from "@eu/core";
import { auditLog, changeLog, sites, syncConflicts, syncMutations, SYNC_MANAGED_KEYS, type Db } from "@eu/db";
import { and, asc, eq, getTableColumns, gt, inArray, sql } from "drizzle-orm";
import type { EntityDef, EntityRegistry } from "./entity";
import {
  DEFAULT_PULL_LIMIT,
  type Mutation,
  type MutationResult,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type WireRecord,
} from "./protocol";

export interface SyncContext {
  db: Db;
  user: UserContext;
  deviceId: string;
  permissions: PermissionRegistry;
  entities: EntityRegistry;
  now?: () => Date;
}

/**
 * Serialises change_log writes so that sequence order equals commit order.
 * Without it, a device could pull seq 11 before seq 10 commits and never see 10.
 * Write volume here is low (tens of devices), so a single lock is cheap.
 */
const CHANGE_LOG_LOCK = 734_220_001;

// Drizzle's dynamic-table typing is too strict for a generic engine; keep the escape hatch local.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;
type Row = Record<string, unknown>;

const MANAGED = new Set<string>(SYNC_MANAGED_KEYS);

export async function handlePush(ctx: SyncContext, req: PushRequest): Promise<PushResponse> {
  const now = ctx.now?.() ?? new Date();
  const skew = clockSkewMs(now, new Date(req.deviceNow));
  const clockSuspect = isClockSuspect(skew);
  const results: MutationResult[] = [];
  for (const m of req.mutations) {
    results.push(await applyOne(ctx, m, now, clockSuspect));
  }
  return { results, serverNow: now.toISOString(), clockSuspect };
}

async function applyOne(ctx: SyncContext, m: Mutation, now: Date, clockSuspect: boolean): Promise<MutationResult> {
  const db = ctx.db as AnyDb;
  return db.transaction(async (tx: AnyDb) => {
    // Idempotency: claim the mutation id first; a replay returns the stored result.
    const claimed = await tx
      .insert(syncMutations)
      .values({
        mutationId: m.mutationId,
        deviceId: ctx.deviceId,
        userId: ctx.user.id,
        entity: m.entity,
        recordId: m.recordId,
        status: "pending",
        result: {},
        receivedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: syncMutations.mutationId });
    if (claimed.length === 0) {
      const [prev] = await tx.select().from(syncMutations).where(eq(syncMutations.mutationId, m.mutationId));
      const stored = (prev?.result ?? {}) as MutationResult;
      const entity = ctx.entities.get(m.entity);
      const record = entity ? await currentRecord(tx, ctx, entity, m.recordId) : undefined;
      return { mutationId: m.mutationId, status: "duplicate", reason: stored.status, ...(record ? { record } : {}) };
    }

    const result = await decide(tx, ctx, m, now, clockSuspect);
    await tx
      .update(syncMutations)
      .set({ status: result.status, result: { status: result.status, reason: result.reason, conflicts: result.conflicts } })
      .where(eq(syncMutations.mutationId, m.mutationId));
    return result;
  });
}

async function decide(tx: AnyDb, ctx: SyncContext, m: Mutation, now: Date, clockSuspect: boolean): Promise<MutationResult> {
  const entity = ctx.entities.get(m.entity);
  const reject = async (reason: string): Promise<MutationResult> => {
    await audit(tx, ctx, m, { op: "rejected", scopeId: m.scopeId, clockSuspect, note: reason, newValues: m.fields ?? null });
    return { mutationId: m.mutationId, status: "rejected", reason };
  };
  if (!entity) return reject("unknown_entity");

  const table = entity.table as AnyDb;
  const cols = getTableColumns(entity.table) as Record<string, AnyDb>;
  const [existing] = (await tx.select().from(table).where(eq(cols.id, m.recordId)).for("update")) as Row[];
  const target = writeTarget(entity, existing ? String(existing.scopeId) : m.scopeId);
  const deviceTime = new Date(m.deviceTime);

  if (m.op === "insert") {
    const needed = entity.policy === "server_authoritative" ? (entity.actions.configure ?? entity.actions.write) : entity.actions.write;
    if (!ctx.permissions.can(ctx.user, needed, target)) return reject("forbidden");
    if (existing) return reject("id_exists");
    const scopeProblem = await checkScope(tx, entity, m.scopeId);
    if (scopeProblem) return reject(scopeProblem);
    const parsed = parseFields(entity, cols, m.fields ?? {}, "insert");
    if (!parsed.ok) return reject(parsed.reason);
    const fieldVersions: Record<string, number> = {};
    if (entity.policy === "field_merge") for (const k of Object.keys(parsed.values)) fieldVersions[k] = 1;
    const row = {
      ...parsed.values,
      id: m.recordId,
      scopeId: m.scopeId,
      createdBy: ctx.user.id,
      deviceId: ctx.deviceId,
      deviceTime,
      serverTime: now,
      updatedServerTime: now,
      editedDeviceTime: deviceTime,
      version: 1,
      fieldVersions,
      clockSuspect,
    };
    await tx.insert(table).values(row);
    await audit(tx, ctx, m, { op: "insert", scopeId: m.scopeId, clockSuspect, newValues: toJson(parsed.values) });
    await logChange(tx, entity.name, m.recordId, m.scopeId, now);
    return applied(tx, ctx, entity, m);
  }

  if (!existing) return reject("not_found");
  const scopeId = String(existing.scopeId);

  if (m.op === "void") {
    const needed =
      entity.policy === "server_authoritative"
        ? (entity.actions.configure ?? entity.actions.write)
        : (entity.actions.void ?? entity.actions.write);
    if (!ctx.permissions.can(ctx.user, needed, target)) return reject("forbidden");
    if (existing.voidedAt) {
      return { mutationId: m.mutationId, status: "duplicate", reason: "already_voided", ...(await recordIfReadable(tx, ctx, entity, m.recordId)) };
    }
    const reason = (m.voidReason ?? "").trim();
    if (!reason) return reject("void_reason_required");
    await tx
      .update(table)
      .set({ voidedAt: now, voidReason: reason, version: Number(existing.version) + 1, updatedServerTime: now })
      .where(eq(cols.id, m.recordId));
    await audit(tx, ctx, m, { op: "void", scopeId, clockSuspect, oldValues: null, newValues: { voidReason: reason } });
    await logChange(tx, entity.name, m.recordId, scopeId, now);
    return applied(tx, ctx, entity, m);
  }

  // op === "update"
  if (existing.voidedAt) return reject("voided");
  if (entity.policy === "append_only") return reject("append_only");
  const needed = entity.policy === "server_authoritative" ? (entity.actions.configure ?? entity.actions.write) : entity.actions.write;
  if (!ctx.permissions.can(ctx.user, needed, target)) return reject("forbidden");
  const parsed = parseFields(entity, cols, m.fields ?? {}, "update");
  if (!parsed.ok) return reject(parsed.reason);
  const incoming = parsed.values;
  if (Object.keys(incoming).length === 0) return reject("no_fields");

  if (entity.policy === "lww_history" || entity.policy === "server_authoritative") {
    const lastEdit = new Date(existing.editedDeviceTime as Date | string);
    if (entity.policy === "lww_history" && deviceTime < lastEdit) {
      await audit(tx, ctx, m, { op: "superseded", scopeId, clockSuspect, newValues: toJson(incoming) });
      return { mutationId: m.mutationId, status: "superseded", ...(await recordIfReadable(tx, ctx, entity, m.recordId)) };
    }
    const old = pick(existing, Object.keys(incoming));
    await tx
      .update(table)
      .set({ ...incoming, version: Number(existing.version) + 1, updatedServerTime: now, editedDeviceTime: deviceTime })
      .where(eq(cols.id, m.recordId));
    await audit(tx, ctx, m, { op: "update", scopeId, clockSuspect, oldValues: toJson(old), newValues: toJson(incoming) });
    await logChange(tx, entity.name, m.recordId, scopeId, now);
    return applied(tx, ctx, entity, m);
  }

  // field_merge
  const fv = { ...((existing.fieldVersions as Record<string, number>) ?? {}) };
  const base = m.baseFieldVersions ?? {};
  const toApply: Row = {};
  const conflicts: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    const current = fv[k] ?? 0;
    if ((base[k] ?? 0) === current) {
      toApply[k] = v;
      fv[k] = current + 1;
    } else if (sameValue(existing[k], v)) {
      // Someone else already made the same change: nothing to do, nothing to flag.
    } else {
      conflicts.push(k);
      await tx.insert(syncConflicts).values({
        entity: entity.name,
        recordId: m.recordId,
        scopeId,
        field: k,
        serverValue: toJson({ v: existing[k] }).v ?? null,
        clientValue: toJson({ v }).v ?? null,
        mutationId: m.mutationId,
        userId: ctx.user.id,
        deviceId: ctx.deviceId,
      });
    }
  }
  if (Object.keys(toApply).length > 0) {
    const old = pick(existing, Object.keys(toApply));
    await tx
      .update(table)
      .set({ ...toApply, fieldVersions: fv, version: Number(existing.version) + 1, updatedServerTime: now, editedDeviceTime: deviceTime })
      .where(eq(cols.id, m.recordId));
    await audit(tx, ctx, m, { op: "update", scopeId, clockSuspect, oldValues: toJson(old), newValues: toJson(toApply) });
    await logChange(tx, entity.name, m.recordId, scopeId, now);
  }
  if (conflicts.length > 0) {
    await audit(tx, ctx, m, { op: "conflict", scopeId, clockSuspect, newValues: toJson(pick(incoming, conflicts)), note: conflicts.join(",") });
    return { mutationId: m.mutationId, status: "partial", conflicts, ...(await recordIfReadable(tx, ctx, entity, m.recordId)) };
  }
  return applied(tx, ctx, entity, m);
}

async function applied(tx: AnyDb, ctx: SyncContext, entity: EntityDef, m: Mutation): Promise<MutationResult> {
  return { mutationId: m.mutationId, status: "applied", ...(await recordIfReadable(tx, ctx, entity, m.recordId)) };
}

async function recordIfReadable(tx: AnyDb, ctx: SyncContext, entity: EntityDef, id: string): Promise<{ record?: WireRecord }> {
  const record = await currentRecord(tx, ctx, entity, id);
  return record ? { record } : {};
}

async function currentRecord(tx: AnyDb, ctx: SyncContext, entity: EntityDef, id: string): Promise<WireRecord | undefined> {
  const cols = getTableColumns(entity.table) as Record<string, AnyDb>;
  const [row] = (await tx.select().from(entity.table).where(eq(cols.id, id))) as Row[];
  if (!row) return undefined;
  if (!ctx.permissions.can(ctx.user, entity.actions.read, readTarget(entity, String(row.scopeId)))) return undefined;
  return toWire(row);
}

type Parsed = { ok: true; values: Row } | { ok: false; reason: string };

function parseFields(entity: EntityDef, cols: Record<string, AnyDb>, fields: Row, mode: "insert" | "update"): Parsed {
  for (const k of Object.keys(fields)) {
    if (MANAGED.has(k)) return { ok: false, reason: `managed_field:${k}` };
  }
  const schema = mode === "insert" ? entity.schema.strict() : entity.schema.partial().strict();
  const res = schema.safeParse(fields);
  if (!res.success) {
    const issue = res.error.issues[0];
    return { ok: false, reason: `invalid:${issue?.path.join(".") ?? ""}:${issue?.code ?? ""}` };
  }
  const values: Row = {};
  for (const [k, v] of Object.entries(res.data as Row)) {
    const col = cols[k];
    if (!col) return { ok: false, reason: `unknown_column:${k}` };
    values[k] = col.dataType === "date" && typeof v === "string" ? new Date(v) : v;
  }
  return { ok: true, values };
}

async function audit(
  tx: AnyDb,
  ctx: SyncContext,
  m: Mutation,
  e: { op: string; scopeId: string; clockSuspect: boolean; oldValues?: unknown; newValues?: unknown; note?: string },
) {
  await tx.insert(auditLog).values({
    entity: m.entity,
    recordId: m.recordId,
    scopeId: e.scopeId,
    op: e.op,
    userId: ctx.user.id,
    deviceId: ctx.deviceId,
    deviceTime: new Date(m.deviceTime),
    clockSuspect: e.clockSuspect,
    mutationId: m.mutationId,
    oldValues: e.oldValues ?? null,
    newValues: e.newValues ?? null,
    note: e.note ?? null,
  });
}

async function logChange(tx: AnyDb, entity: string, recordId: string, scopeId: string, now: Date) {
  await tx.execute(sql`select pg_advisory_xact_lock(${CHANGE_LOG_LOCK})`);
  await tx.insert(changeLog).values({ entity, recordId, scopeId, changedAt: now });
}

export async function handlePull(ctx: SyncContext, req: PullRequest): Promise<PullResponse> {
  const db = ctx.db as AnyDb;
  const limit = req.limit ?? DEFAULT_PULL_LIMIT;
  const batch = (await db
    .select()
    .from(changeLog)
    .where(gt(changeLog.seq, req.cursor))
    .orderBy(asc(changeLog.seq))
    .limit(limit)) as { seq: number; entity: string; recordId: string; scopeId: string }[];

  const wanted = new Map<string, Set<string>>();
  for (const c of batch) {
    const entity = ctx.entities.get(c.entity);
    if (!entity) continue;
    if (!ctx.permissions.can(ctx.user, entity.actions.read, readTarget(entity, c.scopeId))) continue;
    if (!wanted.has(c.entity)) wanted.set(c.entity, new Set());
    wanted.get(c.entity)!.add(c.recordId);
  }

  const changes: PullResponse["changes"] = [];
  for (const [name, ids] of wanted) {
    const entity = ctx.entities.get(name)!;
    const cols = getTableColumns(entity.table) as Record<string, AnyDb>;
    const rows = (await db.select().from(entity.table).where(and(inArray(cols.id, [...ids])))) as Row[];
    for (const row of rows) changes.push({ entity: name, record: toWire(row) });
  }

  const last = batch.at(-1);
  return { changes, cursor: last ? Number(last.seq) : req.cursor, hasMore: batch.length === limit };
}

export function toWire(row: Row): WireRecord {
  return toJson(row) as WireRecord;
}

function toJson(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

function pick(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) out[k] = row[k];
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (x: unknown) => (x instanceof Date ? x.toISOString() : x);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** Writes to a stream-wide record need a stream or global role, so the target has no site. */
export function writeTarget(entity: EntityDef, scopeId: string): ActionTarget {
  return scopeId === entity.stream ? { stream: entity.stream, siteId: null } : { stream: entity.stream, siteId: scopeId };
}

function readTarget(entity: EntityDef, scopeId: string): ActionTarget {
  return scopeId === entity.stream ? { stream: entity.stream, siteId: null, streamWide: true } : { stream: entity.stream, siteId: scopeId };
}

/** A new record's scope must be the entity's own stream, or an active site of that stream (and of an allowed kind). */
export async function checkScope(tx: AnyDb, entity: EntityDef, scopeId: string): Promise<string | undefined> {
  if (scopeId === entity.stream) return undefined;
  const [site] = (await tx.select().from(sites).where(eq(sites.id, scopeId))) as { stream: string; kind: string; active: boolean }[];
  if (!site) return "unknown_scope";
  if (site.stream !== entity.stream) return "scope_wrong_stream";
  if (!site.active) return "scope_inactive";
  if (entity.siteKinds && !entity.siteKinds.includes(site.kind)) return "scope_wrong_kind";
  return undefined;
}
