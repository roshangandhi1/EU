import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import { sites } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { SyncClient, type Transport } from "@eu/sync/client";
import { MemoryStore } from "@eu/sync/memory-store";
import { handlePull, handlePush } from "@eu/sync/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import { forestryActions } from "../src/actions";
import { forestryEntities } from "../src/entities";

const permissions = new PermissionRegistry().register(platformActions).register(forestryActions);
const entities = new EntityRegistry().register(...forestryEntities);

const miomboOfficer: UserContext = { id: "fo-m", assignments: [{ role: "field_officer", scope: { type: "stream", stream: "miombo" } }] };
const bambooLead: UserContext = { id: "lead-b", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "bamboo" } }] };

let db: any;
let close: () => Promise<void>;
beforeEach(async () => {
  // The platform migrations include this module's tables (0001_field_modules).
  ({ db, close } = await createTestDb());
  await db.insert(sites).values([
    { id: "plot-MLB-001", kind: "plot", stream: "miombo", name: "MLB-001" },
    { id: "plot-KBK-001", kind: "plot", stream: "bamboo", name: "KBK-001" },
  ]);
});
afterEach(async () => close());

let n = 0;
const id = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
function device(user: UserContext, devId: string) {
  const store = new MemoryStore();
  const ctx = () => ({ db, user, deviceId: devId, permissions, entities, now: () => new Date("2026-12-16T15:00:00Z") });
  const transport: Transport = {
    push: async (r) => JSON.parse(JSON.stringify(await handlePush(ctx(), JSON.parse(JSON.stringify(r))))),
    pull: async (r) => JSON.parse(JSON.stringify(await handlePull(ctx(), r))),
  };
  const client = new SyncClient(store, transport, { newId: id, now: () => new Date("2026-12-16T14:58:00Z") });
  return { store, client };
}

describe("forestry records through the platform sync engine", () => {
  it("a miombo officer records a planting offline and it reaches the server", async () => {
    const d = device(miomboOfficer, "phone-1");
    const rec = await d.client.create("miombo.planting", "plot-MLB-001", {
      plantedOn: "2026-12-16",
      lines: [{ species: "pterocarpus_angolensis", count: 900 }, { species: "afzelia_quanzensis", count: 700 }],
      isGapFilling: false,
      photos: ["file-1"],
      gpsLat: -8.7, gpsLng: 24.8, gpsAccuracyM: 6,
    });
    const res = await d.client.sync();
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(schema.plantingEvents);
    expect(row.id).toBe(rec);
    expect(row.scopeId).toBe("plot-MLB-001");
    expect(row.lines).toHaveLength(2);
    expect(row.deviceTime.toISOString()).toBe("2026-12-16T14:58:00.000Z");
    expect(row.serverTime.toISOString()).toBe("2026-12-16T15:00:00.000Z");
  });

  it("rejects invalid counts on the server too", async () => {
    const d = device(miomboOfficer, "phone-1");
    await d.client.create("miombo.planting", "plot-MLB-001", { plantedOn: "2026-12-16", lines: [{ species: "x", count: -5 }], isGapFilling: false, photos: [] });
    await d.client.sync();
    expect((await d.store.rejections()).length).toBe(1);
    expect(await db.select().from(schema.plantingEvents)).toHaveLength(0);
  });

  it("a bamboo lead cannot write miombo records, and planting edits are refused (append-only)", async () => {
    const b = device(bambooLead, "phone-2");
    await b.client.create("miombo.planting", "plot-MLB-001", { plantedOn: "2026-12-16", lines: [{ species: "x", count: 5 }], isGapFilling: false, photos: [] });
    await b.client.sync();
    expect((await b.store.rejections())[0]?.reason).toBe("forbidden");

    const m = device(miomboOfficer, "phone-1");
    const rid = await m.client.create("miombo.planting", "plot-MLB-001", { plantedOn: "2026-12-16", lines: [{ species: "x", count: 5 }], isGapFilling: false, photos: [] });
    await m.client.sync();
    await m.client.update("miombo.planting", rid, { lines: [{ species: "x", count: 500 }] });
    await m.client.sync();
    expect((await m.store.rejections()).map((r) => r.reason)).toContain("append_only");
  });

  it("a miombo officer cannot file a miombo record against a bamboo plot", async () => {
    const m = device(miomboOfficer, "phone-1");
    await m.client.create("miombo.planting", "plot-KBK-001", { plantedOn: "2026-12-16", lines: [{ species: "x", count: 5 }], isGapFilling: false, photos: [] });
    await m.client.sync();
    expect((await m.store.rejections())[0]?.reason).toBe("scope_wrong_stream");
  });
});
