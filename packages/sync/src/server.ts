import {
  CLOCK_SKEW_LIMIT_MS,
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

/** The reason a mutation gets when the database itself refuses it (overflow, bad date, unique index...). */
export const DB_REJECT_REASON = "invalid:db";

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
      // Answer with the record the mutation was stored for, and only to the user who sent it.
      const entity = prev && prev.userId === ctx.user.id ? ctx.entities.get(String(prev.entity)) : undefined;
      const record = entity ? await currentRecord(tx, ctx, entity, String(prev.recordId)) : undefined;
      return { mutationId: m.mutationId, status: "duplicate", reason: stored.status, ...(record ? { record } : {}) };
    }

    let result: MutationResult;
    try {
      // A savepoint per mutation: if the database refuses this one record (an integer overflow, a
      // date Postgres rejects, a unique index), only this mutation is rejected and the push goes on.
      result = await tx.transaction((sp: AnyDb) => decide(sp, ctx, m, now, clockSuspect));
    } catch (err) {
      const code = dbErrorCode(err);
      await audit(tx, ctx, m, {
        op: "rejected",
        scopeId: m.scopeId,
        clockSuspect,
        note: `${DB_REJECT_REASON}${code ? `:${code}` : ""}`,
        newValues: safeJson(m.fields ?? null),
      });
      result = { mutationId: m.mutationId, status: "rejected", reason: DB_REJECT_REASON };
    }
    await tx
      .update(syncMutations)
      .set({ status: result.status, result: { status: result.status, reason: result.reason, conflicts: result.conflicts } })
      .where(eq(syncMutations.mutationId, m.mutationId));
    return result;
  });
}

function dbErrorCode(err: unknown): string | undefined {
  for (let e: unknown = err, i = 0; e && i < 4; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/** JSON for the audit log, with NUL characters (which Postgres refuses in text and jsonb) removed. */
function safeJson(v: unknown): unknown {
  if (v == null) return null;
  return JSON.parse(JSON.stringify(v).replace(/\\u0000/g, ""));
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
  // Device time is self-reported. Never store one more than the allowed skew in the future, and
  // flag the record when the phone's clock (or this record's own time) looks wrong.
  const rawDeviceTime = new Date(m.deviceTime);
  const future = rawDeviceTime.getTime() - now.getTime() > CLOCK_SKEW_LIMIT_MS;
  const deviceTime = future ? now : rawDeviceTime;
  const recordSuspect = clockSuspect || future;
  // lww_history orders edits by device time; a suspect clock is ordered by server receive time.
  const editTime = recordSuspect ? now : deviceTime;
  const ruleCtx = (scopeId: string) => ({
    tx,
    user: ctx.user,
    can: (action: string) => ctx.permissions.can(ctx.user, action, writeTarget(entity, scopeId)),
  });

  if (m.op === "insert") {
    const needed = entity.policy === "server_authoritative" ? (entity.actions.configure ?? entity.actions.write) : entity.actions.write;
    if (!ctx.permissions.can(ctx.user, needed, target)) return reject("forbidden");
    if (existing) return reject("id_exists");
    const scopeProblem = await checkScope(tx, entity, m.scopeId);
    if (scopeProblem) return reject(scopeProblem);
    const parsed = parseFields(entity, cols, m.fields ?? {}, "insert");
    if (!parsed.ok) return reject(parsed.reason);
    if (entity.validate) {
      const problem = await entity.validate(ruleCtx(m.scopeId), { op: "insert", recordId: m.recordId, scopeId: m.scopeId, fields: parsed.values });
      if (problem) return reject(problem);
    }
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
      editedDeviceTime: editTime,
      version: 1,
      fieldVersions,
      clockSuspect: recordSuspect,
    };
    await tx.insert(table).values(row);
    await audit(tx, ctx, m, { op: "insert", scopeId: m.scopeId, clockSuspect: recordSuspect, newValues: toJson(parsed.values) });
    await logChange(tx, entity.name, m.recordId, m.scopeId, now);
    return applied(tx, ctx, entity, m);
  }

  if (!existing) return reject("not_found");
  const scopeId = String(existing.scopeId);
  // Some entities share a table (bamboo.* and miombo.*): the row must belong to this entity's stream.
  if (!(await inEntityStream(tx, entity, scopeId))) return reject("scope_wrong_stream");

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
    await audit(tx, ctx, m, { op: "void", scopeId, clockSuspect: recordSuspect, oldValues: null, newValues: { voidReason: reason } });
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
  if (entity.validate) {
    const problem = await entity.validate(ruleCtx(scopeId), { op: "update", recordId: m.recordId, scopeId, fields: incoming, existing });
    if (problem) return reject(problem);
  }

  if (entity.policy === "lww_history" || entity.policy === "server_authoritative") {
    const lastEdit = new Date(existing.editedDeviceTime as Date | string);
    if (entity.policy === "lww_history" && editTime < lastEdit) {
      await audit(tx, ctx, m, { op: "superseded", scopeId, clockSuspect: recordSuspect, newValues: toJson(incoming) });
      return { mutationId: m.mutationId, status: "superseded", ...(await recordIfReadable(tx, ctx, entity, m.recordId)) };
    }
    const old = pick(existing, Object.keys(incoming));
    await tx
      .update(table)
      .set({ ...incoming, version: Number(existing.version) + 1, updatedServerTime: now, editedDeviceTime: editTime })
      .where(eq(cols.id, m.recordId));
    await audit(tx, ctx, m, { op: "update", scopeId, clockSuspect: recordSuspect, oldValues: toJson(old), newValues: toJson(incoming) });
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
      .set({ ...toApply, fieldVersions: fv, version: Number(existing.version) + 1, updatedServerTime: now, editedDeviceTime: editTime })
      .where(eq(cols.id, m.recordId));
    await audit(tx, ctx, m, { op: "update", scopeId, clockSuspect: recordSuspect, oldValues: toJson(old), newValues: toJson(toApply) });
    await logChange(tx, entity.name, m.recordId, scopeId, now);
  }
  if (conflicts.length > 0) {
    await audit(tx, ctx, m, { op: "conflict", scopeId, clockSuspect: recordSuspect, newValues: toJson(pick(incoming, conflicts)), note: conflicts.join(",") });
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
  if (!(await inEntityStream(tx, entity, String(row.scopeId)))) return undefined;
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

/**
 * The pull cursor carries a fingerprint of the user's role assignments in its low bits:
 * cursor = seq * 2^20 + fingerprint. When the assignments change (a new school, site or stream),
 * the fingerprint no longer matches and the feed restarts from the beginning, so records written
 * before the user could read them are delivered too. Re-delivery is safe: phones keep the newer
 * version of each record. Phones just store the number they are given.
 */
const FP_BITS = 2 ** 20;

export function assignmentsFingerprint(user: UserContext): number {
  const keys = user.assignments
    .map((a) => `${a.role}|${a.scope.type}|${"stream" in a.scope ? (a.scope.stream ?? "") : ""}|${a.scope.type === "site" ? a.scope.siteId : ""}`)
    .sort()
    .join(";");
  // FNV-1a, folded to 20 bits; never 0, so a fresh cursor (0) always starts from the beginning.
  let h = 0x811c9dc5;
  for (let i = 0; i < keys.length; i++) {
    h ^= keys.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % (FP_BITS - 1)) + 1;
}

export function decodeCursor(cursor: number, fingerprint: number): number {
  if (cursor % FP_BITS !== fingerprint) return 0;
  return Math.floor(cursor / FP_BITS);
}

export function encodeCursor(seq: number, fingerprint: number): number {
  return seq * FP_BITS + fingerprint;
}

export async function handlePull(ctx: SyncContext, req: PullRequest): Promise<PullResponse> {
  const db = ctx.db as AnyDb;
  const limit = req.limit ?? DEFAULT_PULL_LIMIT;
  const fp = assignmentsFingerprint(ctx.user);
  const fromSeq = decodeCursor(req.cursor, fp);
  const batch = (await db
    .select()
    .from(changeLog)
    .where(gt(changeLog.seq, fromSeq))
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
    let records = rows.map(toWire) as Row[];
    if (entity.decorate) records = await entity.decorate(db, records);
    for (const record of records) changes.push({ entity: name, record: record as WireRecord });
  }

  const last = batch.at(-1);
  return { changes, cursor: encodeCursor(last ? Number(last.seq) : fromSeq, fp), hasMore: batch.length === limit };
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

/** Is a record scoped here part of the entity's stream? (The stream itself, or a site of that stream.) */
async function inEntityStream(tx: AnyDb, entity: EntityDef, scopeId: string): Promise<boolean> {
  if (scopeId === entity.stream) return true;
  const [site] = (await tx.select({ stream: sites.stream }).from(sites).where(eq(sites.id, scopeId))) as { stream: string }[];
  return site?.stream === entity.stream;
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
