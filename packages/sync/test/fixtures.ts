import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import { syncColumns, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { defineEntity, EntityRegistry } from "../src";
import { handlePull, handlePush, type SyncContext } from "../src/server";
import { DeviceRevokedError, SyncClient, type Transport } from "../src/client";
import { MemoryStore } from "../src/memory-store";
import { SqlStore } from "../src/sql-store";
import type { LocalStore } from "../src/client";
import { nodeSqliteDriver } from "./node-sqlite";

// Four test record types, one per conflict policy.
export const readings = pgTable("test_readings", { ...syncColumns(), value: integer("value").notNull(), note: text("note") });
export const people = pgTable("test_people", { ...syncColumns(), name: text("name").notNull(), phone: text("phone"), village: text("village") });
export const marks = pgTable("test_marks", { ...syncColumns(), score: integer("score").notNull() });
export const settings = pgTable("test_settings", { ...syncColumns(), value: text("value").notNull() });

const label = { en: "x", fr: "x" };
export const entities = new EntityRegistry().register(
  defineEntity({
    name: "test.reading", stream: "schools", table: readings, policy: "append_only", label,
    schema: z.object({ value: z.number().int(), note: z.string().nullable().optional() }),
    actions: { read: "t.read", write: "t.write", void: "t.void" },
  }),
  defineEntity({
    name: "test.person", stream: "schools", table: people, policy: "field_merge", label,
    schema: z.object({ name: z.string().min(1), phone: z.string().nullable().optional(), village: z.string().nullable().optional() }),
    actions: { read: "t.read", write: "t.write" },
  }),
  defineEntity({
    name: "test.mark", stream: "schools", table: marks, policy: "lww_history", label,
    schema: z.object({ score: z.number().int().min(0).max(100) }),
    actions: { read: "t.read", write: "t.write" },
  }),
  defineEntity({
    name: "test.setting", stream: "schools", table: settings, policy: "server_authoritative", label,
    schema: z.object({ value: z.string() }),
    actions: { read: "t.read", write: "t.write", configure: "t.configure" },
  }),
);

export const permissions = new PermissionRegistry().register(platformActions).register({
  "t.read": { stream: "schools", roles: ["system_admin", "headteacher", "school_admin", "viewer"] },
  "t.write": { stream: "schools", roles: ["system_admin", "headteacher", "school_admin"] },
  "t.void": { stream: "schools", roles: ["system_admin", "headteacher"] },
  "t.configure": { stream: "schools", roles: ["system_admin"] },
});

export const headA: UserContext = { id: "head-a", assignments: [{ role: "headteacher", scope: { type: "site", siteId: "A" } }] };
export const adminA: UserContext = { id: "sadmin-a", assignments: [{ role: "school_admin", scope: { type: "site", siteId: "A" } }] };
export const headB: UserContext = { id: "head-b", assignments: [{ role: "headteacher", scope: { type: "site", siteId: "B" } }] };
export const sysadmin: UserContext = { id: "root", assignments: [{ role: "system_admin", scope: { type: "global" } }] };

export async function setupDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const empty = generateDrizzleJson({});
  const cur = generateDrizzleJson({ readings, people, marks, settings });
  const stmts = await generateMigration(empty, cur);
  return createTestDb(stmts);
}

let n = 0;
/** Deterministic UUIDs so failing fuzz runs can be replayed. */
export function seqUuid(prefix = 0): string {
  n += 1;
  const hex = (prefix * 1_000_000 + n).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Faults {
  dropRequest: number;
  dropResponse: number;
  duplicate: number;
}
export const NO_FAULTS: Faults = { dropRequest: 0, dropResponse: 0, duplicate: 0 };

/** Calls the real server functions, with injected network failures. */
export class FlakyTransport implements Transport {
  faults: Faults = NO_FAULTS;
  revoked = false;
  constructor(private ctx: () => SyncContext, private random: () => number = Math.random) {}
  async push(req: Parameters<Transport["push"]>[0]) {
    if (this.revoked) throw new DeviceRevokedError();
    if (this.random() < this.faults.dropRequest) throw new Error("network: request lost");
    const body = JSON.parse(JSON.stringify(req));
    const res = await handlePush(this.ctx(), body);
    if (this.random() < this.faults.duplicate) await handlePush(this.ctx(), body);
    if (this.random() < this.faults.dropResponse) throw new Error("network: response lost");
    return JSON.parse(JSON.stringify(res));
  }
  async pull(req: Parameters<Transport["pull"]>[0]) {
    if (this.revoked) throw new DeviceRevokedError();
    if (this.random() < this.faults.dropRequest) throw new Error("network: request lost");
    const res = await handlePull(this.ctx(), req);
    if (this.random() < this.faults.dropResponse) throw new Error("network: response lost");
    return JSON.parse(JSON.stringify(res));
  }
}

export type StoreKind = "memory" | "sqlite";

export async function openStore(kind: StoreKind): Promise<LocalStore> {
  return kind === "memory" ? new MemoryStore() : SqlStore.open(nodeSqliteDriver());
}

export interface Device {
  id: string;
  user: UserContext;
  store: LocalStore;
  transport: FlakyTransport;
  client: SyncClient;
  clock: { now: Date };
}

/** The server's clock; devices have their own (which can be wrong). */
export const serverClock = { now: new Date("2026-12-01T08:00:00Z") };

export function makeDevice(db: Db, id: string, user: UserContext, random?: () => number, prefix = 1, store: LocalStore = new MemoryStore()): Device {
  const clock = { now: new Date("2026-12-01T08:00:00Z") };
  const transport = new FlakyTransport(
    () => ({ db, user, deviceId: id, permissions, entities, now: () => new Date(serverClock.now.getTime()) }),
    random,
  );
  const client = new SyncClient(store, transport, { newId: () => seqUuid(prefix), now: () => clock.now });
  return { id, user, store, transport, client, clock };
}
