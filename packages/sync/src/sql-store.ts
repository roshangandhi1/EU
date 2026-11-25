import type { LocalStore, OutboxEntry, Rejection } from "./client";
import type { Mutation, WireRecord } from "./protocol";

/**
 * The few SQLite calls the store needs. The Android app adapts expo-sqlite to this;
 * tests adapt node:sqlite. Keeping the store itself here means the exact code that runs
 * on phones also runs under the sync test harness.
 */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction(fn: () => Promise<void>): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  mutation_id TEXT NOT NULL UNIQUE,
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_record ON outbox(entity, record_id);
CREATE TABLE IF NOT EXISTS records (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  scope_id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (entity, id)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rejections (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL);
`;

export class SqlStore implements LocalStore {
  private constructor(private db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<SqlStore> {
    await db.exec(SCHEMA);
    return new SqlStore(db);
  }

  async enqueue(m: Mutation) {
    await this.db.run("INSERT INTO outbox (mutation_id, entity, record_id, body) VALUES (?, ?, ?, ?)", [
      m.mutationId,
      m.entity,
      m.recordId,
      JSON.stringify(m),
    ]);
  }

  async outbox(limit?: number): Promise<OutboxEntry[]> {
    const rows = await this.db.all<{ seq: number; body: string }>(
      `SELECT seq, body FROM outbox ORDER BY seq${limit === undefined ? "" : " LIMIT ?"}`,
      limit === undefined ? [] : [limit],
    );
    return rows.map((r) => ({ seq: Number(r.seq), mutation: JSON.parse(r.body) as Mutation }));
  }

  async outboxForRecord(entity: string, recordId: string): Promise<Mutation[]> {
    const rows = await this.db.all<{ body: string }>("SELECT body FROM outbox WHERE entity = ? AND record_id = ? ORDER BY seq", [entity, recordId]);
    return rows.map((r) => JSON.parse(r.body) as Mutation);
  }

  async removeFromOutbox(ids: string[]) {
    if (ids.length === 0) return;
    await this.db.transaction(async () => {
      for (const id of ids) await this.db.run("DELETE FROM outbox WHERE mutation_id = ?", [id]);
    });
  }

  async outboxSize() {
    const [row] = await this.db.all<{ n: number }>("SELECT COUNT(*) AS n FROM outbox");
    return Number(row?.n ?? 0);
  }

  async getServerRecord(entity: string, id: string) {
    const [row] = await this.db.all<{ body: string }>("SELECT body FROM records WHERE entity = ? AND id = ?", [entity, id]);
    return row ? (JSON.parse(row.body) as WireRecord) : undefined;
  }

  async putServerRecord(entity: string, record: WireRecord) {
    // Keep whichever copy is newer; an older copy arriving late must not overwrite.
    await this.db.run(
      `INSERT INTO records (entity, id, version, scope_id, body) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (entity, id) DO UPDATE SET version = excluded.version, scope_id = excluded.scope_id, body = excluded.body
       WHERE excluded.version > records.version`,
      [entity, record.id, Number(record.version), String(record.scopeId), JSON.stringify(record)],
    );
  }

  async listServerRecords(entity: string) {
    const rows = await this.db.all<{ body: string }>("SELECT body FROM records WHERE entity = ? ORDER BY id", [entity]);
    return rows.map((r) => JSON.parse(r.body) as WireRecord);
  }

  async getCursor() {
    const [row] = await this.db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'cursor'");
    return row ? Number(row.value) : 0;
  }

  async setCursor(cursor: number) {
    await this.db.run("INSERT INTO meta (key, value) VALUES ('cursor', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [String(cursor)]);
  }

  async addRejection(r: Rejection) {
    await this.db.run("INSERT INTO rejections (body) VALUES (?)", [JSON.stringify(r)]);
  }

  async rejections() {
    const rows = await this.db.all<{ body: string }>("SELECT body FROM rejections ORDER BY id");
    return rows.map((r) => JSON.parse(r.body) as Rejection);
  }

  async wipe() {
    await this.db.transaction(async () => {
      for (const t of ["outbox", "records", "meta", "rejections"]) await this.db.run(`DELETE FROM ${t}`);
    });
  }
}
