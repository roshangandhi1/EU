import { sites, users, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    const r = await loadDemo(ctx);
    expect(r).toMatchObject({ ok: true });
    const st = await demoStatus(db);
    expect(new Set(st.sites.map((s) => s.stream))).toEqual(new Set(["schools", "bamboo", "miombo", "boreholes"]));
    expect(st.sites.every((s) => s.name.startsWith("DEMO-"))).toBe(true);
    expect(await loadDemo(ctx)).toMatchObject({ ok: false, reason: "already_loaded" });

    const rm = await removeDemo(ctx);
    expect(rm.ok && rm.voided).toBeGreaterThan(40);
    expect((await demoStatus(db)).loaded).toBe(false);
    expect((await (db as any).select().from(sites)).every((s: any) => !s.active)).toBe(true);

    expect(await loadDemo(ctx)).toMatchObject({ ok: true });
    expect((await demoStatus(db)).sites.some((s) => s.name.endsWith("-2"))).toBe(true);
  });

  it("is refused to anyone who cannot manage sites", async () => {
    const viewer = { ...ctx, user: { id: ctx.user.id, assignments: [{ role: "viewer" as const, scope: { type: "global" as const } }] } };
    expect(await loadDemo(viewer)).toEqual({ ok: false, reason: "forbidden" });
  });
});
