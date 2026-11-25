import type { Mutation, MutationResult, PullRequest, PullResponse, PushRequest, PushResponse, WireRecord } from "./protocol";

export const PUSH_BATCH = 50;

/** A mutation waiting on the phone, plus whether it is currently being sent. */
export interface OutboxEntry {
  mutation: Mutation;
  seq: number;
}

/** What the server said no to, kept so the user can see and act on it. */
export interface Rejection {
  mutationId: string;
  entity: string;
  recordId: string;
  status: MutationResult["status"];
  reason?: string;
  conflicts?: string[];
  at: string;
}

/**
 * Storage on the phone. The Android app implements this on SQLite; tests use the in-memory one.
 * Rule: a mutation leaves the outbox only after the server has answered for it.
 */
export interface LocalStore {
  enqueue(m: Mutation): Promise<void>;
  outbox(limit?: number): Promise<OutboxEntry[]>;
  outboxForRecord(entity: string, recordId: string): Promise<Mutation[]>;
  removeFromOutbox(mutationIds: string[]): Promise<void>;
  outboxSize(): Promise<number>;
  /** The last copy received from the server (never includes unsent local changes). */
  getServerRecord(entity: string, id: string): Promise<WireRecord | undefined>;
  /** Stores a server copy unless an equal or newer version is already held. */
  putServerRecord(entity: string, record: WireRecord): Promise<void>;
  listServerRecords(entity: string): Promise<WireRecord[]>;
  getCursor(): Promise<number>;
  setCursor(cursor: number): Promise<void>;
  addRejection(r: Rejection): Promise<void>;
  rejections(): Promise<Rejection[]>;
  /** Removes everything (used when the phone is revoked). */
  wipe(): Promise<void>;
}

export interface Transport {
  push(req: PushRequest): Promise<PushResponse>;
  pull(req: PullRequest): Promise<PullResponse>;
}

export class DeviceRevokedError extends Error {
  constructor() {
    super("device_revoked");
  }
}

/**
 * The server ended this phone's session but the phone itself is still enrolled: the password was
 * reset, the user was deactivated, or the token expired (401 {"error":"session_ended"}).
 * The phone must ask for an online sign-in and KEEP all its data; never wipe on this.
 */
export class SessionEndedError extends Error {
  constructor() {
    super("session_ended");
  }
}

export interface SyncOutcome {
  ok: boolean;
  pushed: number;
  pulled: number;
  clockSuspect: boolean;
  error?: string;
  /** The phone was removed by an admin (401 device_revoked): local data has been wiped. */
  revoked?: boolean;
  /** The session ended (password reset, deactivation, expiry): sign in again; nothing was wiped. */
  sessionEnded?: boolean;
}

type Fields = Record<string, unknown>;

export class SyncClient {
  private running: Promise<SyncOutcome> | null = null;

  constructor(
    private store: LocalStore,
    private transport: Transport,
    private opts: { newId: () => string; now?: () => Date },
  ) {}

  private nowIso(): string {
    return (this.opts.now?.() ?? new Date()).toISOString();
  }

  async create(entity: string, scopeId: string, fields: Fields, id = this.opts.newId()): Promise<string> {
    await this.store.enqueue({
      mutationId: this.opts.newId(),
      entity,
      recordId: id,
      op: "insert",
      scopeId,
      fields,
      deviceTime: this.nowIso(),
    });
    return id;
  }

  async update(entity: string, id: string, fields: Fields): Promise<void> {
    const current = await this.get(entity, id);
    if (!current) throw new Error(`Cannot update unknown record ${entity}/${id}`);
    const expected = await this.expectedFieldVersions(entity, id);
    const baseFieldVersions: Record<string, number> = {};
    for (const k of Object.keys(fields)) baseFieldVersions[k] = expected[k] ?? 0;
    await this.store.enqueue({
      mutationId: this.opts.newId(),
      entity,
      recordId: id,
      op: "update",
      scopeId: String(current.scopeId),
      fields,
      baseFieldVersions,
      deviceTime: this.nowIso(),
    });
  }

  async void(entity: string, id: string, reason: string): Promise<void> {
    const current = await this.get(entity, id);
    if (!current) throw new Error(`Cannot void unknown record ${entity}/${id}`);
    await this.store.enqueue({
      mutationId: this.opts.newId(),
      entity,
      recordId: id,
      op: "void",
      scopeId: String(current.scopeId),
      voidReason: reason,
      deviceTime: this.nowIso(),
    });
  }

  /** The record as the user should see it: server copy with unsent local changes on top. */
  async get(entity: string, id: string): Promise<Fields | undefined> {
    const server = await this.store.getServerRecord(entity, id);
    const pending = await this.store.outboxForRecord(entity, id);
    return overlay(server, pending);
  }

  async list(entity: string): Promise<Fields[]> {
    const out = new Map<string, Fields>();
    for (const r of await this.store.listServerRecords(entity)) out.set(r.id, r);
    for (const e of await this.store.outbox()) {
      const m = e.mutation;
      if (m.entity !== entity) continue;
      const merged = overlay(out.get(m.recordId) as WireRecord | undefined, [m]);
      if (merged) out.set(m.recordId, merged);
    }
    return [...out.values()];
  }

  /**
   * Field versions the server will hold once this phone's earlier unsent changes are applied.
   * Using these as the base stops a phone from conflicting with its own queued edits.
   */
  private async expectedFieldVersions(entity: string, id: string): Promise<Record<string, number>> {
    const server = await this.store.getServerRecord(entity, id);
    const fv: Record<string, number> = { ...((server?.fieldVersions as Record<string, number>) ?? {}) };
    for (const m of await this.store.outboxForRecord(entity, id)) {
      if (m.op === "insert") for (const k of Object.keys(m.fields ?? {})) fv[k] = 1;
      if (m.op === "update") for (const k of Object.keys(m.fields ?? {})) fv[k] = (fv[k] ?? 0) + 1;
    }
    return fv;
  }

  /** Push everything queued, then pull everything new. Concurrent calls share one run. */
  sync(): Promise<SyncOutcome> {
    if (!this.running) {
      this.running = this.runSync().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async runSync(): Promise<SyncOutcome> {
    let pushed = 0;
    let pulled = 0;
    let clockSuspect = false;
    try {
      for (;;) {
        const batch = await this.store.outbox(PUSH_BATCH);
        if (batch.length === 0) break;
        const res = await this.transport.push({ deviceNow: this.nowIso(), mutations: batch.map((e) => e.mutation) });
        clockSuspect = clockSuspect || res.clockSuspect;
        const answered: string[] = [];
        for (const r of res.results) {
          const sent = batch.find((e) => e.mutation.mutationId === r.mutationId);
          if (!sent) continue;
          answered.push(r.mutationId);
          if (r.record) await this.store.putServerRecord(sent.mutation.entity, r.record);
          if (r.status === "rejected" || r.status === "partial" || r.status === "superseded") {
            await this.store.addRejection({
              mutationId: r.mutationId,
              entity: sent.mutation.entity,
              recordId: sent.mutation.recordId,
              status: r.status,
              reason: r.reason,
              conflicts: r.conflicts,
              at: res.serverNow,
            });
          }
        }
        await this.store.removeFromOutbox(answered);
        pushed += answered.length;
        if (answered.length === 0) throw new Error("server answered none of the batch");
      }
      for (;;) {
        const cursor = await this.store.getCursor();
        const res = await this.transport.pull({ cursor });
        for (const c of res.changes) await this.store.putServerRecord(c.entity, c.record);
        pulled += res.changes.length;
        await this.store.setCursor(res.cursor);
        if (!res.hasMore) break;
      }
      return { ok: true, pushed, pulled, clockSuspect };
    } catch (err) {
      if (err instanceof SessionEndedError) {
        return { ok: false, pushed, pulled, clockSuspect, sessionEnded: true, error: err.message };
      }
      if (err instanceof DeviceRevokedError) {
        await this.store.wipe();
        return { ok: false, pushed, pulled, clockSuspect, revoked: true, error: err.message };
      }
      return { ok: false, pushed, pulled, clockSuspect, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function overlay(server: WireRecord | undefined, pending: Mutation[]): Fields | undefined {
  let rec: Fields | undefined = server ? { ...server } : undefined;
  for (const m of pending) {
    if (m.op === "insert" && !rec) {
      rec = { ...(m.fields ?? {}), id: m.recordId, scopeId: m.scopeId, pending: true };
    } else if (m.op === "update" && rec) {
      rec = { ...rec, ...(m.fields ?? {}), pending: true };
    } else if (m.op === "void" && rec) {
      rec = { ...rec, voidedAt: rec.voidedAt ?? m.deviceTime, voidReason: rec.voidReason ?? m.voidReason, pending: true };
    }
  }
  return rec;
}
