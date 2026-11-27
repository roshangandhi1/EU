import { sites, users, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addFlowTest, deleteFlowTest, editFlowTest, loadBoreholes, saveSettings, updateBorehole } from "@eu/boreholes/server";
import { visits } from "@eu/boreholes/db/schema";
import { computeIndicator } from "@eu/forestry";
import { addPlanting, deletePlanting, editPlanting, loadSettings, loadStream, photoUploads, rulesFrom } from "@eu/forestry/server";
import { plantingEvents } from "@eu/forestry/db/schema";
import { schoolsIndicators } from "@eu/schools";
import { loadDemo } from "../lib/demo";
import { deleteSite, linkedRecords, listArchived, restoreSite } from "../lib/site-delete";
import { entities, permissions } from "../lib/registry";

/* eslint-disable @typescript-eslint/no-explicit-any */
let db: Db;
let close: () => Promise<void>;
let admin: Parameters<typeof loadDemo>[0];
const as = (role: "programme_manager" | "stream_lead" | "field_officer") => ({ ...admin, user: { id: admin.user.id, assignments: [{ role, scope: { type: "global" as const } }] } });
const today = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await (db as any).insert(users).values({ email: "admin@example.org", name: "Admin", passwordHash: "x" }).returning();
  admin = { db, user: { id: u.id, assignments: [{ role: "system_admin", scope: { type: "global" } }] }, deviceId: "web:test", permissions, entities };
  const r = await loadDemo(admin);
  if (!r.ok) throw new Error(r.reason);
}, 120_000);
afterEach(async () => close());

const demoSite = async (kind: string, stream?: string) =>
  ((await (db as any).select().from(sites).where(eq(sites.kind, kind))) as any[]).find((s) => s.active && (!stream || s.stream === stream))!;
const hectares = async (stream: "bamboo" | "miombo") => {
  const { inputs } = await loadStream(db, stream);
  return computeIndicator(inputs, today, "captured", { ...rulesFrom(stream, await loadSettings(db, stream)), photoUploadedAt: await photoUploads(db, inputs) });
};

describe("archive and restore (items 1, 3, 5, 7)", () => {
  it("archives a borehole with its records, drops it from 1.1.1, and restores exactly what it archived", async () => {
    const before = await loadBoreholes(db, today, "captured", today);
    const counted = before.rows.find((r) => r.indicator.counted)!;
    const linked = await linkedRecords(db, entities, counted.siteId);
    expect(linked!.linked.some((l) => l.entity === "boreholes.visit")).toBe(true);

    expect(await deleteSite(as("programme_manager"), counted.siteId, "borehole", "x")).toEqual({ ok: false, reason: "forbidden" });
    expect(await deleteSite(admin, counted.siteId, "school", "x")).toEqual({ ok: false, reason: "not_found" });

    const r = await deleteSite(admin, counted.siteId, "borehole", "Duplicate entry");
    expect(r.ok).toBe(true);
    const after = await loadBoreholes(db, today, "captured", today);
    expect(after.rows.some((x) => x.siteId === counted.siteId)).toBe(false);
    expect(after.counted).toBe(before.counted - 1);
    expect((await listArchived(db, "borehole")).map((a) => a.siteId)).toEqual([counted.siteId]);

    expect(await restoreSite(as("programme_manager"), counted.siteId, "borehole")).toEqual({ ok: false, reason: "forbidden" });
    const back = await restoreSite(admin, counted.siteId, "borehole");
    expect(back.ok && back.voided).toBe(r.ok && r.voided);
    const restored = await loadBoreholes(db, today, "captured", today);
    expect(restored.counted).toBe(before.counted);
    expect(await listArchived(db, "borehole")).toEqual([]);
  }, 60_000);

  it("archives and restores bamboo and miombo plots, and the hectares follow", async () => {
    for (const stream of ["bamboo", "miombo"] as const) {
      const plot = await demoSite("plot", stream);
      const ha = (await hectares(stream)).hectaresCounted;
      expect((await deleteSite(admin, plot.id, "plot", "Drawn twice")).ok).toBe(true);
      expect((await loadStream(db, stream)).plots.some((p) => p.siteId === plot.id)).toBe(false);
      expect((await hectares(stream)).hectaresCounted).toBeLessThanOrEqual(ha);
      expect((await listArchived(db, "plot", stream)).length).toBe(1);
      expect((await restoreSite(admin, plot.id, "plot")).ok).toBe(true);
      expect((await hectares(stream)).hectaresCounted).toBeCloseTo(ha, 6);
    }
  }, 60_000);

  it("archives a school with its pupils and fees, and it leaves the school indicators", async () => {
    const school = await demoSite("school");
    const before = await schoolsIndicators(db, today, "operational");
    const linked = await linkedRecords(db, entities, school.id);
    expect(linked!.linked.some((l) => l.entity === "school.student")).toBe(true);
    expect(linked!.linked.some((l) => l.entity === "school.payment")).toBe(true);
    expect((await deleteSite(admin, school.id, "school", "Closed")).ok).toBe(true);
    const [s] = await (db as any).select().from(sites).where(eq(sites.id, school.id));
    expect(s.active).toBe(false);
    const after = await schoolsIndicators(db, today, "operational");
    expect(JSON.stringify(after)).not.toEqual(JSON.stringify(before));
    expect((await restoreSite(admin, school.id, "school")).ok).toBe(true);
    expect(JSON.stringify(await schoolsIndicators(db, today, "operational"))).toEqual(JSON.stringify(before));
  }, 60_000);
});

describe("flow tests (item 2) and configurable 1.1.1 checks (item 4)", () => {
  it("adds, edits and deletes a flow test as a visit that counts like a phone check", async () => {
    const { rows } = await loadBoreholes(db, today, "captured", today);
    const b = rows.find((r) => !r.indicator.counted && r.indicator.fails.includes("no_recent_check")) ?? rows[0]!;
    const input = { testedOn: today, flowLpm: 18.5, pumpDelivers: true, tankFillsTapsOk: true, undertaker: "Aqua Services SARL", notes: null };
    const added = await addFlowTest(admin, b.siteId, input);
    expect(added.ok).toBe(true);
    const [v] = await (db as any).select().from(visits).where(eq(visits.id, (added as any).id));
    expect(v).toMatchObject({ kind: "inspection", flowLpm: 18.5, undertaker: "Aqua Services SARL", operational: { pumpDelivers: true, flowLpm: 18.5, tankFillsTapsOk: true } });
    const after = (await loadBoreholes(db, today, "captured", today)).rows.find((r) => r.siteId === b.siteId)!;
    expect(after.indicator.fails).not.toContain("no_recent_check");
    expect(after.indicator.checkedOn).toBe(today);

    expect(await editFlowTest(as("field_officer"), b.siteId, (added as any).id, input)).toEqual({ ok: false, reason: "forbidden" });
    const edited = await editFlowTest(admin, b.siteId, (added as any).id, { ...input, flowLpm: 0, pumpDelivers: false });
    expect(edited.ok).toBe(true);
    const [old] = await (db as any).select().from(visits).where(eq(visits.id, (added as any).id));
    expect(old.voidedAt).not.toBeNull();
    const failing = (await loadBoreholes(db, today, "captured", today)).rows.find((r) => r.siteId === b.siteId)!;
    expect(failing.indicator.fails).toEqual(expect.arrayContaining(["pump_delivers", "flow_min"]));

    expect((await deleteFlowTest(admin, b.siteId, (edited as any).id)).ok).toBe(true);
    expect((await deleteFlowTest(admin, b.siteId, (edited as any).id)).ok).toBe(false);
  }, 60_000);

  it("skips the taps check for boreholes without taps, and follows the saved checks", async () => {
    const { rows } = await loadBoreholes(db, today, "captured", today);
    const b = rows.find((r) => r.indicator.counted)!;
    // A grazing-cluster test: no taps.
    await addFlowTest(admin, b.siteId, { testedOn: today, flowLpm: 12, pumpDelivers: true, tankFillsTapsOk: null, undertaker: "GoCongo" });
    const one = async () => (await loadBoreholes(db, today, "captured", today)).rows.find((r) => r.siteId === b.siteId)!.indicator;
    expect((await one()).fails).toContain("tank_taps");
    expect((await updateBorehole(admin, b.siteId, { hasTaps: false })).ok).toBe(true);
    expect((await one()).fails).not.toContain("tank_taps");

    // Programme managers may change other settings but not which checks count.
    expect(await saveSettings(as("programme_manager"), { criteria: { on: { gps: true } } })).toEqual({ ok: false, reason: "forbidden_field" });
    expect((await saveSettings(as("programme_manager"), { maxCheckAgeDays: 60 })).ok).toBe(true);
    // Switching on "photo" fails a check with no photo; switching off everything but GPS counts on GPS alone.
    expect((await saveSettings(admin, { criteria: { on: { photo: true }, waterQualityMaxAgeDays: null } })).ok).toBe(true);
    expect((await one()).fails).toContain("photo");
    const allOff = { commissioned: false, water_quality: false, caretaker: false, sop: false, recent_check: false, pump_delivers: false, tank_taps: false, flow_min: false, gps: true, photo: false, population: false, handover: false };
    expect((await saveSettings(admin, { criteria: { on: allOff, waterQualityMaxAgeDays: null } })).ok).toBe(true);
    const all = await loadBoreholes(db, today, "captured", today);
    expect(all.rows.every((r) => r.indicator.counted === (r.lat !== null && r.lng !== null))).toBe(true);
  }, 60_000);
});

describe("planting on the web (item 6)", () => {
  it("adds, edits (keeping photos) and deletes a planting in both streams, counted like a phone entry", async () => {
    for (const stream of ["bamboo", "miombo"] as const) {
      const plot = await demoSite("plot", stream);
      const species = (await loadSettings(db, stream)).speciesList[0]!.key;
      const plants = async () => (await loadStream(db, stream)).inputs.find((i) => i.siteId === plot.id)!.plantings.filter((e) => !e.voidedAt).reduce((n, e) => n + e.lines.reduce((m, l) => m + l.count, 0), 0);
      const n0 = await plants();
      const added = await addPlanting(admin, stream, plot.id, { plantedOn: today, lines: [{ species, count: 120 }], isGapFilling: true, team: "Équipe A" });
      expect(added.ok).toBe(true);
      expect(await plants()).toBe(n0 + 120);
      // Same validation as the phone: no empty planting.
      expect((await addPlanting(admin, stream, plot.id, { plantedOn: today, lines: [], isGapFilling: false })).ok).toBe(false);

      await (db as any).update(plantingEvents).set({ photos: ["photo-1"] }).where(eq(plantingEvents.id, (added as any).id));
      const edited = await editPlanting(admin, stream, plot.id, (added as any).id, { plantedOn: today, lines: [{ species, count: 80 }], isGapFilling: true });
      expect(edited.ok).toBe(true);
      expect(await plants()).toBe(n0 + 80);
      const [row] = await (db as any).select().from(plantingEvents).where(eq(plantingEvents.id, (edited as any).id));
      expect(row.photos).toEqual(["photo-1"]);
      expect((await deletePlanting(admin, stream, plot.id, (edited as any).id)).ok).toBe(true);
      expect(await plants()).toBe(n0);
    }
  }, 60_000);
});
