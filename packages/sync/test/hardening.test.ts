import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import { auditLog, type Db } from "@eu/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEntity, EntityRegistry, type EntityDef } from "../src";
import { SessionEndedError, SyncClient, type Transport } from "../src/client";
import { DB_REJECT_REASON, handlePull, handlePush, type SyncContext } from "../src/server";
import { entities, headA, makeDevice, marks, permissions, readings, seqUuid, serverClock, setupDb, sysadmin } from "./fixtures";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await setupDb());
  serverClock.now = new Date("2026-12-01T08:00:00Z");
});
afterEach(async () => close());

const at = (iso: string) => new Date(iso);

describe("one bad record does not block the push (DATA-2)", () => {
  it("rejects only the mutation the database refuses and applies the rest", async () => {
    const d = makeDevice(db, "dev1", headA);
    const good1 = await d.client.create("test.reading", "A", { value: 1 });
    const bad = await d.client.create("test.reading", "A", { value: 15_000_000_000 }); // > int4
    const good2 = await d.client.create("test.reading", "A", { value: 2 });
    const out = await d.client.sync();
    expect(out.ok).toBe(true);
    expect(await d.store.outboxSize()).toBe(0);
    expect(await d.store.getServerRecord("test.reading", good1)).toBeDefined();
    expect(await d.store.getServerRecord("test.reading", good2)).toBeDefined();
    expect(await d.store.getServerRecord("test.reading", bad)).toBeUndefined();
    expect((await d.store.rejections()).map((r) => [r.recordId, r.reason])).toEqual([[bad, DB_REJECT_REASON]]);
    const audits = await (db as any).select().from(auditLog).where(eq(auditLog.recordId, bad));
    expect(audits.map((a: { op: string; note: string }) => [a.op, a.note])).toEqual([["rejected", `${DB_REJECT_REASON}:22003`]]);
    // A replay of the refused mutation answers duplicate, not another error.
    const again = await d.client.sync();
    expect(again.ok).toBe(true);
  });
});

describe("shared tables across streams (SEC-1)", () => {
  // A second entity in another stream on the same table, as bamboo.* and miombo.* share forestry tables.
  const other: EntityDef = defineEntity({
    name: "other.reading", stream: "bamboo", table: readings, policy: "field_merge", label: { en: "x", fr: "x" },
    schema: z.object({ value: z.number().int(), note: z.string().nullable().optional() }),
    actions: { read: "o.read", write: "o.write", void: "o.write" },
  });
  const ents = new EntityRegistry().register(...entities.all(), other);
  const perms = new PermissionRegistry().register(platformActions).register({
    "t.read": permissions.get("t.read")!, "t.write": permissions.get("t.write")!, "t.void": permissions.get("t.void")!,
    "t.configure": permissions.get("t.configure")!,
    "o.read": { stream: "bamboo", roles: ["stream_lead"] }, "o.write": { stream: "bamboo", roles: ["stream_lead"] },
  });
  const bambooLead: UserContext = { id: "bl", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "bamboo" } }] };

  it("a lead of one stream cannot void, edit or read another stream's row through its own entity", async () => {
    const d = makeDevice(db, "dev1", headA);
    const id = await d.client.create("test.reading", "A", { value: 5 });
    await d.client.sync();
    const ctx: SyncContext = { db, user: bambooLead, deviceId: "x", permissions: perms, entities: ents, now: () => serverClock.now };
    const base = { entity: "other.reading", recordId: id, scopeId: "bamboo", deviceTime: serverClock.now.toISOString() };
    const res = await handlePush(ctx, {
      deviceNow: serverClock.now.toISOString(),
      mutations: [
        { ...base, mutationId: seqUuid(9), op: "void", voidReason: "x" },
        { ...base, mutationId: seqUuid(9), op: "update", fields: { note: "hacked" }, baseFieldVersions: { note: 0 } },
      ],
    });
    expect(res.results.map((r) => [r.status, r.reason, r.record])).toEqual([
      ["rejected", "scope_wrong_stream", undefined],
      ["rejected", "scope_wrong_stream", undefined],
    ]);
    const [row] = await (db as any).select().from(readings).where(eq(readings.id, id));
    expect(row.voidedAt).toBeNull();
    expect(row.note).toBeNull();
  });
});

describe("pull backfills when the user's roles change (DATA-3)", () => {
  it("delivers records written before the user could read them", async () => {
    const admin = makeDevice(db, "devRoot", sysadmin, undefined, 1);
    const idB = await admin.client.create("test.reading", "B", { value: 7 });
    await admin.client.sync();

    // Head of A pulls: sees nothing of B, and the cursor moves past it.
    const user: UserContext = { id: "head-a", assignments: [...headA.assignments] };
    const head = makeDevice(db, "devHead", user, undefined, 2);
    await head.client.sync();
    expect(await head.store.getServerRecord("test.reading", idB)).toBeUndefined();

    // Then the head is also given school B: the next pull restarts and brings B's older records.
    user.assignments.push({ role: "headteacher", scope: { type: "site", siteId: "B" } });
    await head.client.sync();
    expect((await head.store.getServerRecord("test.reading", idB))?.value).toBe(7);

    // With unchanged roles the cursor is stable: nothing is re-sent.
    const ctx: SyncContext = { db, user, deviceId: "devHead", permissions, entities };
    const again = await handlePull(ctx, { cursor: await head.store.getCursor() });
    expect(again.changes).toEqual([]);
  });

  it("restarts an old plain cursor once", async () => {
    const admin = makeDevice(db, "devRoot", sysadmin, undefined, 1);
    await admin.client.create("test.reading", "A", { value: 1 });
    await admin.client.sync();
    const ctx: SyncContext = { db, user: headA, deviceId: "d", permissions, entities };
    const first = await handlePull(ctx, { cursor: 1 }); // a pre-fingerprint cursor
    expect(first.changes).toHaveLength(1);
    const second = await handlePull(ctx, { cursor: first.cursor });
    expect(second.changes).toHaveLength(0);
  });
});

describe("device time bounds for lww_history (DATA-9 / SEC-11)", () => {
  it("a fast phone clock cannot win every later edit", async () => {
    const fast = makeDevice(db, "devFast", headA, undefined, 1);
    fast.clock.now = at("2027-12-10T08:00:00Z"); // a year ahead
    const id = await fast.client.create("test.mark", "A", { score: 10 });
    const out = await fast.client.sync();
    expect(out.clockSuspect).toBe(true);
    const [row] = await (db as any).select().from(marks).where(eq(marks.id, id));
    expect(row.clockSuspect).toBe(true);
    expect(new Date(row.deviceTime).getTime()).toBe(serverClock.now.getTime());
    expect(new Date(row.editedDeviceTime).getTime()).toBe(serverClock.now.getTime());

    // A correct phone edits a little later and wins.
    serverClock.now = at("2026-12-01T09:00:00Z");
    const ok = makeDevice(db, "devOk", headA, undefined, 2);
    ok.clock.now = at("2026-12-01T09:00:00Z");
    await ok.client.sync();
    await ok.client.update("test.mark", id, { score: 40 });
    await ok.client.sync();
    expect((await ok.store.rejections())).toEqual([]);
    expect((await ok.store.getServerRecord("test.mark", id))?.score).toBe(40);
  });

  it("a record time more than 10 minutes in the future is clamped even with an honest deviceNow", async () => {
    const ctx: SyncContext = { db, user: headA, deviceId: "d", permissions, entities, now: () => serverClock.now };
    const id = seqUuid(5);
    const res = await handlePush(ctx, {
      deviceNow: serverClock.now.toISOString(),
      mutations: [{ mutationId: seqUuid(5), entity: "test.mark", recordId: id, op: "insert", scopeId: "A", fields: { score: 1 }, deviceTime: "2099-01-01T00:00:00Z" }],
    });
    expect(res.results[0]?.status).toBe("applied");
    const [row] = await (db as any).select().from(marks).where(eq(marks.id, id));
    expect(row.clockSuspect).toBe(true);
    expect(new Date(row.deviceTime).getTime()).toBe(serverClock.now.getTime());
  });
});

describe("entity validate hook", () => {
  it("rejects with the hook's reason code on insert and update", async () => {
    const strict: EntityDef = defineEntity({
      ...entities.get("test.person")!,
      name: "test.person",
      validate: async (_ctx, change) => (change.fields.name === "forbidden name" ? "name_taken" : undefined),
    });
    const ents = new EntityRegistry().register(...entities.all().filter((e) => e.name !== "test.person"), strict);
    const ctx: SyncContext = { db, user: headA, deviceId: "d", permissions, entities: ents, now: () => serverClock.now };
    const now = serverClock.now.toISOString();
    const id = seqUuid(6);
    const res = await handlePush(ctx, {
      deviceNow: now,
      mutations: [
        { mutationId: seqUuid(6), entity: "test.person", recordId: seqUuid(6), op: "insert", scopeId: "A", fields: { name: "forbidden name" }, deviceTime: now },
        { mutationId: seqUuid(6), entity: "test.person", recordId: id, op: "insert", scopeId: "A", fields: { name: "Ilunga" }, deviceTime: now },
        { mutationId: seqUuid(6), entity: "test.person", recordId: id, op: "update", scopeId: "A", fields: { name: "forbidden name" }, baseFieldVersions: { name: 1 }, deviceTime: now },
      ],
    });
    expect(res.results.map((r) => [r.status, r.reason])).toEqual([
      ["rejected", "name_taken"],
      ["applied", undefined],
      ["rejected", "name_taken"],
    ]);
  });
});

describe("session ended (DATA-1 / SEC-2)", () => {
  it("keeps every queued change and record when the session ends", async () => {
    const d = makeDevice(db, "dev1", headA);
    const kept = await d.client.create("test.reading", "A", { value: 1 });
    await d.client.sync();
    await d.client.create("test.reading", "A", { value: 2 });
    const ended: Transport = {
      push: async () => {
        throw new SessionEndedError();
      },
      pull: async () => {
        throw new SessionEndedError();
      },
    };
    const client = new SyncClient(d.store, ended, { newId: () => seqUuid(7) });
    const out = await client.sync();
    expect(out).toMatchObject({ ok: false, sessionEnded: true });
    expect(out.revoked).toBeUndefined();
    expect(await d.store.outboxSize()).toBe(1);
    expect(await d.store.getServerRecord("test.reading", kept)).toBeDefined();
  });
});
