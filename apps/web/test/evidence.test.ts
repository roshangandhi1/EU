import { auditLog, devices, syncColumns, users, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { defineEntity, EntityRegistry } from "@eu/sync";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { integer, pgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { admittedIds, admittedRecordIds, cutoffOn, createCutoff, decide, evidenceCsv, lateRecords, nextCutoff, recordDeviceStatus, summarise } from "../lib/evidence";

const visits = pgTable("test_visits", { ...syncColumns(), trees: integer("trees").notNull() });
const visit = defineEntity({
  name: "test.visit", stream: "bamboo", table: visits, schema: z.object({ trees: z.number() }), policy: "append_only",
  actions: { read: "x.read", write: "x.write" }, label: { en: "Visit", fr: "Visite" },
});
const registry = new EntityRegistry().register(visit);

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  const sqlStmts = await generateMigration(generateDrizzleJson({}), generateDrizzleJson({ visits }));
  ({ db, close } = await createTestDb(sqlStmts));
});
afterEach(async () => close());

const cut = new Date("2026-12-15T14:00:00Z"); // 16:00 in Haut-Lomami
let n = 0;
async function rec(deviceTime: string, serverTime: string, extra: Record<string, unknown> = {}) {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  await (db as any).insert(visits).values({
    id, scopeId: "P1", createdBy: "fo", deviceId: "phoneA", deviceTime: new Date(deviceTime), serverTime: new Date(serverTime),
    updatedServerTime: new Date(serverTime), editedDeviceTime: new Date(deviceTime), version: 1, fieldVersions: {}, trees: 10, ...extra,
  });
  return id;
}

describe("evidence cut-offs", () => {
  it("counts on-time records, holds late ones for review, and admits only with a reason", async () => {
    const onTime = await rec("2026-12-15T09:00:00Z", "2026-12-15T10:00:00Z");
    const late = await rec("2026-12-15T11:00:00Z", "2026-12-15T15:30:00Z");
    await rec("2026-12-15T15:00:00Z", "2026-12-15T15:10:00Z"); // captured after the cut-off: not evidence for it
    await rec("2026-12-15T08:00:00Z", "2026-12-15T09:00:00Z", { voidedAt: new Date("2026-12-15T12:00:00Z"), voidReason: "dup" });
    const c = await createCutoff(db, { label: "Q4 check", cutoffAt: cut, userId: "admin" });

    expect((await lateRecords(db, visit, c)).map((l) => l.recordId)).toEqual([late]);
    expect(await summarise(db, registry, c)).toEqual([
      { entity: "test.visit", label: visit.label, counted: 1, lateAdmitted: 0, latePending: 1, lateExcluded: 0, clockSuspect: 0 },
    ]);

    expect(await decide(db, { cutoffId: c.id, entity: visit, recordId: late, decision: "admitted", reason: " ", userId: "admin" })).toEqual({ ok: false, reason: "reason_required" });
    expect(await decide(db, { cutoffId: c.id, entity: visit, recordId: onTime, decision: "admitted", reason: "on time anyway", userId: "admin" })).toEqual({ ok: false, reason: "not_late" });
    expect(await decide(db, { cutoffId: c.id, entity: visit, recordId: late, decision: "admitted", reason: "No network at Kiabukwa that week", userId: "admin" })).toEqual({ ok: true });
    expect(await admittedIds(db, c.id, "test.visit")).toEqual(new Set([late]));
    // The dashboard's evidence mode for that day applies this cut-off's admissions (DATA-5).
    expect((await cutoffOn(db, "2026-12-15"))?.id).toBe(c.id);
    expect(await cutoffOn(db, "2026-12-16")).toBeUndefined();
    expect(await admittedRecordIds(db, c.id)).toEqual(new Set([late]));

    // A changed decision is kept, and both are audited.
    await decide(db, { cutoffId: c.id, entity: visit, recordId: late, decision: "excluded", reason: "Photo missing", userId: "pm" });
    expect(await admittedIds(db, c.id, "test.visit")).toEqual(new Set());
    const audits = await (db as any).select().from(auditLog);
    expect(audits.map((a: any) => [a.op, a.userId, a.note])).toEqual([
      ["evidence_admitted", "admin", "No network at Kiabukwa that week"],
      ["evidence_excluded", "pm", "Photo missing"],
    ]);

    const csv = await evidenceCsv(db, registry, c);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3); // header + counted + late
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"${onTime}","P1","counted"`);
    expect(csv).toContain(`"${late}","P1","late_excluded"`);
    const fr = await evidenceCsv(db, registry, c, "fr");
    expect(fr).toContain(`"${late}";"P1";"en_retard_exclu"`);
    expect(fr.split("\r\n")[0]).toContain('"statut";"heure_telephone"');
  });

  it("tells phones about the next cut-off and stores what they hold unsynced", async () => {
    expect(await nextCutoff(db, new Date("2026-12-01T00:00:00Z"))).toBeUndefined();
    await createCutoff(db, { label: "Past", cutoffAt: new Date("2026-11-01T00:00:00Z"), userId: "a" });
    await createCutoff(db, { label: "Next", cutoffAt: cut, userId: "a" });
    expect((await nextCutoff(db, new Date("2026-12-01T00:00:00Z")))?.label).toBe("Next");

    const [u] = await (db as any).insert(users).values({ email: "t@example.org", name: "T", passwordHash: "x" }).returning();
    await (db as any).insert(devices).values({ id: "phoneA", userId: u.id, name: "Android" });
    await recordDeviceStatus(db, "phoneA", { pendingChanges: 4, pendingPhotos: 2 });
    const [d] = await (db as any).select().from(devices);
    expect([d.pendingChanges, d.pendingPhotos, d.statusAt instanceof Date]).toEqual([4, 2, true]);
  });
});
