import { sites, users, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBorehole, loadBoreholes } from "@eu/boreholes/server";
import { boreholes as boreholeTable } from "@eu/boreholes/db/schema";
import { computeIndicator } from "@eu/forestry";
import { loadSettings, loadStream, photoUploads, rulesFrom } from "@eu/forestry/server";
import { schoolsTables } from "@eu/schools";
import { demoStatus, loadDemo, removeDemo } from "../lib/demo";
import { entities, permissions } from "../lib/registry";

let db: Db;
let close: () => Promise<void>;
let ctx: Parameters<typeof loadDemo>[0];
beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await (db as any).insert(users).values({ email: "admin@example.org", name: "Admin", passwordHash: "x" }).returning();
  ctx = { db, user: { id: u.id, assignments: [{ role: "system_admin", scope: { type: "global" } }] }, deviceId: "web:test", permissions, entities };
});
afterEach(async () => close());

describe("demo data", () => {
  it("loads a marked set in every stream, refuses twice, removes it, and can load again", async () => {
    // A real borehole that happens to be named DEMO-…: it must neither block loading nor be removed (SEC-10).
    const real = await createBorehole({ ...ctx, deviceId: "web:lead" }, { code: "DEMO-REAL1", village: "Kiabukwa" });
    if (!real.ok) throw new Error(real.reason);
    const r = await loadDemo(ctx);
    expect(r).toMatchObject({ ok: true });
    const st = await demoStatus(db);
    expect(new Set(st.sites.map((s) => s.stream))).toEqual(new Set(["schools", "bamboo", "miombo", "boreholes"]));
    expect(st.sites.every((s) => s.name.startsWith("DEMO-"))).toBe(true);
    expect(st.sites.some((s) => s.id === real.siteId)).toBe(false);
    expect(await loadDemo(ctx)).toMatchObject({ ok: false, reason: "already_loaded" });

    // Every screen has something meaningful: counted boreholes, counted hectares, attendance and fees.
    const today = new Date().toISOString().slice(0, 10);
    const bhr = await loadBoreholes(db, today, "captured", today);
    expect(bhr.counted).toBeGreaterThanOrEqual(2);
    const { inputs } = await loadStream(db, "bamboo");
    const bamboo = computeIndicator(inputs, today, "captured", { ...rulesFrom("bamboo", await loadSettings(db, "bamboo")), photoUploadedAt: await photoUploads(db, inputs) });
    expect(bamboo.hectaresCounted).toBeGreaterThan(0);
    // The placeholder photos are not evidence (DATA-7).
    const ev = computeIndicator(inputs, today, "evidence", { ...rulesFrom("bamboo", await loadSettings(db, "bamboo")), photoUploadedAt: await photoUploads(db, inputs) });
    expect(ev.hectaresCounted).toBe(0);
    expect((await (db as any).select().from(schoolsTables.schoolRegisters)).length).toBeGreaterThan(0);
    expect((await (db as any).select().from(schoolsTables.schoolPayments)).length).toBeGreaterThan(0);
    const marks = await (db as any).select().from(schoolsTables.schoolMarks);
    expect(marks.length).toBeGreaterThan(100);
    expect(new Set(marks.map((m: any) => m.period))).toEqual(new Set(["P1", "P2"]));

    const rm = await removeDemo(ctx);
    expect(rm.ok && rm.voided).toBeGreaterThan(40);
    expect((await demoStatus(db)).loaded).toBe(false);
    const all = await (db as any).select().from(sites);
    expect(all.filter((s: any) => s.id !== real.siteId).every((s: any) => !s.active)).toBe(true);
    expect(all.find((s: any) => s.id === real.siteId).active).toBe(true);
    const [realRow] = await (db as any).select().from(boreholeTable).where((await import("drizzle-orm")).eq(boreholeTable.scopeId, real.siteId));
    expect(realRow.voidedAt).toBeNull();
    expect((await (db as any).select().from(schoolsTables.schoolMarks)).every((m: any) => m.voidedAt)).toBe(true);

    expect(await loadDemo(ctx)).toMatchObject({ ok: true });
    expect((await demoStatus(db)).sites.some((s) => s.name.endsWith("-2"))).toBe(true);
  }, 120_000);

  it("is refused to anyone who cannot manage sites", async () => {
    const viewer = { ...ctx, user: { id: ctx.user.id, assignments: [{ role: "viewer" as const, scope: { type: "global" as const } }] } };
    expect(await loadDemo(viewer)).toEqual({ ok: false, reason: "forbidden" });
  });
});
