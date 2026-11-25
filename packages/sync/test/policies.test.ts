import { auditLog, changeLog, syncConflicts, type Db } from "@eu/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePull, handlePush } from "../src/server";
import { entities, headA, adminA, headB, makeDevice, permissions, serverClock, setupDb, sysadmin, readings } from "./fixtures";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await setupDb());
  serverClock.now = new Date("2026-12-01T08:00:00Z");
});
afterEach(async () => close());

const at = (iso: string) => new Date(iso);

describe("append_only", () => {
  it("creates once, rejects edits, allows one audited void", async () => {
    const d = makeDevice(db, "dev1", headA);
    const id = await d.client.create("test.reading", "A", { value: 5 });
    expect((await d.client.sync()).ok).toBe(true);

    await d.client.update("test.reading", id, { value: 6 });
    await d.client.void("test.reading", id, "entered twice");
    await d.client.void("test.reading", id, "again");
    await d.client.sync();

    const rec = await d.store.getServerRecord("test.reading", id);
    expect(rec?.value).toBe(5);
    expect(rec?.voidReason).toBe("entered twice");
    const rej = await d.store.rejections();
    expect(rej.map((r) => r.reason)).toEqual(["append_only"]);
    const audits = await (db as any).select().from(auditLog).where(eq(auditLog.recordId, id));
    expect(audits.map((a: { op: string }) => a.op).sort()).toEqual(["insert", "rejected", "void"]);
  });

  it("requires a void reason and the void permission", async () => {
    const d = makeDevice(db, "dev1", adminA);
    const id = await d.client.create("test.reading", "A", { value: 1 });
    await d.client.void("test.reading", id, "  ");
    await d.client.sync();
    const rec = await d.store.getServerRecord("test.reading", id);
    expect(rec?.voidedAt).toBeNull();
    // school_admin lacks t.void
    expect((await d.store.rejections())[0]?.reason).toBe("forbidden");
  });
});

describe("field_merge", () => {
  it("merges edits to different fields and flags same-field conflicts", async () => {
    const a = makeDevice(db, "devA", headA, undefined, 1);
    const b = makeDevice(db, "devB", adminA, undefined, 2);
    const id = await a.client.create("test.person", "A", { name: "Mwamba", phone: "0991", village: "Kiabukwa" });
    await a.client.sync();
    await b.client.sync();

    await a.client.update("test.person", id, { phone: "0992" });
    await b.client.update("test.person", id, { village: "Luniemu" });
    await a.client.update("test.person", id, { name: "Mwamba K." });
    await b.client.update("test.person", id, { name: "Mwamba Kasongo" });
    await a.client.sync();
    await b.client.sync();
    await a.client.sync();

    const rec = await a.store.getServerRecord("test.person", id);
    expect(rec).toMatchObject({ phone: "0992", village: "Luniemu", name: "Mwamba K." });
    const conflicts = await (db as any).select().from(syncConflicts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: "name", serverValue: "Mwamba K.", clientValue: "Mwamba Kasongo", status: "open" });
    expect((await b.store.rejections())[0]).toMatchObject({ status: "partial", conflicts: ["name"] });
  });

  it("does not conflict with the phone's own queued edits", async () => {
    const a = makeDevice(db, "devA", headA);
    const id = await a.client.create("test.person", "A", { name: "X" });
    await a.client.update("test.person", id, { name: "Y" });
    await a.client.update("test.person", id, { name: "Z" });
    await a.client.sync();
    expect((await a.store.getServerRecord("test.person", id))?.name).toBe("Z");
    expect(await a.store.rejections()).toEqual([]);
  });

  it("treats an identical concurrent change as no conflict", async () => {
    const a = makeDevice(db, "devA", headA, undefined, 1);
    const b = makeDevice(db, "devB", adminA, undefined, 2);
    const id = await a.client.create("test.person", "A", { name: "X" });
    await a.client.sync();
    await b.client.sync();
    await a.client.update("test.person", id, { phone: "1" });
    await b.client.update("test.person", id, { phone: "1" });
    await a.client.sync();
    await b.client.sync();
    expect(await (db as any).select().from(syncConflicts)).toHaveLength(0);
  });
});

describe("lww_history", () => {
  it("keeps the later device-time edit regardless of arrival order", async () => {
    const a = makeDevice(db, "devA", headA, undefined, 1);
    const b = makeDevice(db, "devB", adminA, undefined, 2);
    const id = await a.client.create("test.mark", "A", { score: 10 });
    await a.client.sync();
    await b.client.sync();

    a.clock.now = at("2026-12-01T09:00:00Z");
    b.clock.now = at("2026-12-01T10:00:00Z");
    await a.client.update("test.mark", id, { score: 40 });
    await b.client.update("test.mark", id, { score: 70 });
    // Both phones' clocks are right; they sync later, at 10:30.
    a.clock.now = b.clock.now = serverClock.now = at("2026-12-01T10:30:00Z");
    await b.client.sync(); // later edit arrives first
    await a.client.sync(); // earlier edit arrives second and is superseded
    await b.client.sync();

    expect((await a.store.getServerRecord("test.mark", id))?.score).toBe(70);
    expect((await a.store.rejections())[0]?.status).toBe("superseded");
    const audits = await (db as any).select().from(auditLog).where(eq(auditLog.recordId, id));
    expect(audits.map((x: { op: string }) => x.op)).toContain("superseded");
  });
});

describe("server_authoritative", () => {
  it("only holders of the configure action can change it", async () => {
    const root = makeDevice(db, "web", sysadmin, undefined, 1);
    const head = makeDevice(db, "devA", headA, undefined, 2);
    const id = await root.client.create("test.setting", "A", { value: "v1" });
    await root.client.sync();
    await head.client.sync();
    await head.client.update("test.setting", id, { value: "hacked" });
    await head.client.sync();
    expect((await head.store.getServerRecord("test.setting", id))?.value).toBe("v1");
    expect((await head.store.rejections())[0]?.reason).toBe("forbidden");
    await root.client.update("test.setting", id, { value: "v2" });
    await root.client.sync();
    await head.client.sync();
    expect((await head.store.getServerRecord("test.setting", id))?.value).toBe("v2");
  });
});

describe("permissions and scope", () => {
  it("rejects writes outside the user's school and never sends other schools' records", async () => {
    const a = makeDevice(db, "devA", headA, undefined, 1);
    const b = makeDevice(db, "devB", headB, undefined, 2);
    await a.client.create("test.reading", "A", { value: 1 });
    await a.client.create("test.reading", "B", { value: 2 });
    await b.client.create("test.reading", "B", { value: 3 });
    await a.client.sync();
    await b.client.sync();
    await a.client.sync();
    expect((await a.store.rejections()).map((r) => r.reason)).toEqual(["forbidden"]);
    const aSees = (await a.store.listServerRecords("test.reading")).map((r) => r.scopeId);
    const bSees = (await b.store.listServerRecords("test.reading")).map((r) => r.scopeId);
    expect(new Set(aSees)).toEqual(new Set(["A"]));
    expect(new Set(bSees)).toEqual(new Set(["B"]));
  });

  it("rejects writes to sync-managed fields and unknown fields", async () => {
    const d = makeDevice(db, "dev1", headA);
    await d.client.create("test.reading", "A", { value: 1, serverTime: "2020-01-01T00:00:00Z" });
    await d.client.create("test.reading", "A", { value: 1, sneaky: true });
    await d.client.sync();
    const reasons = (await d.store.rejections()).map((r) => r.reason ?? "");
    expect(reasons[0]).toBe("managed_field:serverTime");
    expect(reasons[1]).toMatch(/^invalid:/);
  });
});

describe("evidence integrity", () => {
  it("records server time, flags wrong phone clocks, and is idempotent on replay", async () => {
    const d = makeDevice(db, "dev1", headA);
    d.clock.now = at("2026-11-01T08:00:00Z"); // phone a month behind
    serverClock.now = at("2026-12-01T08:00:00Z");
    const id = await d.client.create("test.reading", "A", { value: 9 });
    const [queued] = await d.store.outbox();
    const out = await d.client.sync();
    expect(out.clockSuspect).toBe(true);
    const rec = await d.store.getServerRecord("test.reading", id);
    expect(rec).toMatchObject({ clockSuspect: true, deviceTime: "2026-11-01T08:00:00.000Z", serverTime: "2026-12-01T08:00:00.000Z" });

    // Replay the exact same push: no second record, no second change.
    const [m] = (await (db as any).select().from(changeLog));
    const replay = await handlePush(
      { db, user: headA, deviceId: "dev1", permissions, entities },
      { deviceNow: new Date().toISOString(), mutations: [queued!.mutation] },
    );
    expect(m).toBeDefined();
    expect(replay.results[0]?.status).toBe("duplicate");
    expect(await (db as any).select().from(changeLog)).toHaveLength(1);
    expect(await (db as any).select().from(readings)).toHaveLength(1);
  });

  it("pull pages through the change feed with a cursor", async () => {
    const d = makeDevice(db, "dev1", headA, undefined, 1);
    for (let i = 0; i < 7; i++) await d.client.create("test.reading", "A", { value: i });
    await d.client.sync();
    const ctx = { db, user: headA, deviceId: "x", permissions, entities };
    const p1 = await handlePull(ctx, { cursor: 0, limit: 3 });
    const p2 = await handlePull(ctx, { cursor: p1.cursor, limit: 3 });
    const p3 = await handlePull(ctx, { cursor: p2.cursor, limit: 3 });
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false]);
    expect(p1.changes.length + p2.changes.length + p3.changes.length).toBe(7);
  });

  it("wipes the phone when the device is revoked", async () => {
    const d = makeDevice(db, "dev1", headA);
    await d.client.create("test.reading", "A", { value: 1 });
    await d.client.sync();
    d.transport.revoked = true;
    const out = await d.client.sync();
    expect(out.revoked).toBe(true);
    expect(await d.store.listServerRecords("test.reading")).toEqual([]);
  });
});
