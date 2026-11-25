import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { handlePush } from "@eu/sync/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boreholeActions } from "../src/actions";
import { boreholeEntities } from "../src/entities";
import { defaultTemplate } from "../src/defaults";
import { createBorehole, loadBoreholes, loadTemplates, saveTemplate, updateBorehole } from "../src/server";

const permissions = new PermissionRegistry().register(platformActions).register(boreholeActions);
const entities = new EntityRegistry().register(...boreholeEntities);
const lead: UserContext = { id: "lead", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "boreholes" } }] };
const tech: UserContext = { id: "tech", assignments: [{ role: "field_officer", scope: { type: "stream", stream: "boreholes" } }] };

let db: any;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await createTestDb()));
afterEach(async () => close());
const ctx = (user: UserContext) => ({ db, user, deviceId: `web:${user.id}`, permissions, entities, now: () => new Date("2026-11-25T10:00:00Z") });

describe("borehole admin", () => {
  it("creates a borehole, versions templates, and builds the due list and 1.1.1", async () => {
    expect((await createBorehole(ctx(tech), { code: "BH-001", village: "Luniemu" })).ok).toBe(false);
    const r = await createBorehole(ctx(lead), { code: "BH-001", village: "Luniemu", lat: -8.6, lng: 24.9, lifecycle: "planned", pumpRatingKw: 1.1 });
    expect(r.ok).toBe(true);
    expect((await createBorehole(ctx(lead), { code: "BH-001", village: "X" })).ok).toBe(false);

    expect((await loadTemplates(db))[0]!.templateVersion).toBe(0); // built-in default
    expect((await saveTemplate(ctx(lead), defaultTemplate)).ok).toBe(true);
    expect((await saveTemplate(ctx(lead), { ...defaultTemplate, tasks: defaultTemplate.tasks.slice(0, 3) })).ok).toBe(true);
    expect((await saveTemplate(ctx(tech), defaultTemplate)).ok).toBe(false);
    const tpl = await loadTemplates(db);
    expect(tpl).toHaveLength(1);
    expect(tpl[0]!.templateVersion).toBe(2);
    expect(tpl[0]!.tasks).toHaveLength(3);

    // Commission it (lead edits attributes) and a technician records a visit
    const siteId = r.ok ? r.siteId : "";
    const iso = "2026-11-25T10:00:00.000Z";
    const u = await updateBorehole(ctx(lead), siteId, {
      lifecycle: "operational", commissionedOn: "2026-09-01", handedOverOn: "2026-09-05", sopHandedOver: true,
      caretakersTrained: [{ name: "A", trainedOn: "2026-09-05" }], waterQuality: [{ testedOn: "2026-09-01", turbidityNtu: 1, ecoliPer100ml: 0 }],
    });
    expect(u.ok).toBe(true);
    const v = await handlePush(ctx(tech), { deviceNow: iso, mutations: [{ mutationId: crypto.randomUUID(), entity: "boreholes.visit", recordId: crypto.randomUUID(), op: "insert", scopeId: siteId, deviceTime: iso,
      fields: { visitedOn: "2026-11-20", kind: "routine", templateKey: "routine", templateVersion: 2, results: [{ taskKey: "flow_measure", done: true, value: 25 }], operational: { pumpDelivers: true, flowLpm: 25, tankFillsTapsOk: true } } }] });
    expect(v.results[0]!.status).toBe("applied");

    const { rows, counted } = await loadBoreholes(db, "2026-11-25", "captured", "2026-11-25");
    expect(rows[0]!.lastVisitOn).toBe("2026-11-20");
    expect(rows[0]!.indicator.fails).toEqual([]);
    expect(counted).toBe(1);
    expect(rows[0]!.due.find((x) => x.taskKey === "flow_measure")!.dueOn).toBe("2026-12-01");
  });
});
