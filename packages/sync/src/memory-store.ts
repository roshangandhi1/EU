import type { LocalStore, OutboxEntry, Rejection } from "./client";
import type { Mutation, WireRecord } from "./protocol";

/** In-memory LocalStore for tests and the web preview. Same contract as the SQLite store. */
export class MemoryStore implements LocalStore {
  private queue: OutboxEntry[] = [];
  private seq = 0;
  private records = new Map<string, Map<string, WireRecord>>();
  private cursor = 0;
  private rejected: Rejection[] = [];

  async enqueue(m: Mutation) {
    this.queue.push({ mutation: structuredClone(m), seq: ++this.seq });
  }
  async outbox(limit?: number) {
    const q = this.queue.map((e) => structuredClone(e));
    return limit === undefined ? q : q.slice(0, limit);
  }
  async outboxForRecord(entity: string, recordId: string) {
    return this.queue
      .filter((e) => e.mutation.entity === entity && e.mutation.recordId === recordId)
      .map((e) => structuredClone(e.mutation));
  }
  async removeFromOutbox(ids: string[]) {
    const set = new Set(ids);
    this.queue = this.queue.filter((e) => !set.has(e.mutation.mutationId));
  }
  async outboxSize() {
    return this.queue.length;
  }
  async getServerRecord(entity: string, id: string) {
    const r = this.records.get(entity)?.get(id);
    return r ? structuredClone(r) : undefined;
  }
  async putServerRecord(entity: string, record: WireRecord) {
    if (!this.records.has(entity)) this.records.set(entity, new Map());
    const m = this.records.get(entity)!;
    const prev = m.get(record.id);
    if (prev && Number(prev.version) >= Number(record.version)) return;
    m.set(record.id, structuredClone(record));
  }
  async listServerRecords(entity: string) {
    return [...(this.records.get(entity)?.values() ?? [])].map((r) => structuredClone(r));
  }
  async getCursor() {
    return this.cursor;
  }
  async setCursor(c: number) {
    this.cursor = c;
  }
  async addRejection(r: Rejection) {
    this.rejected.push(r);
  }
  async rejections() {
    return [...this.rejected];
  }
  async wipe() {
    this.queue = [];
    this.records.clear();
    this.cursor = 0;
    this.rejected = [];
  }
}
