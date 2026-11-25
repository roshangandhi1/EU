import { createTestDb } from "@eu/db/testing";
import { auditLog } from "@eu/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { latestSnapshots, publishSnapshot } from "../src/server";

let db: any;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await createTestDb()));
afterEach(async () => close());

describe("public map snapshots", () => {
  it("strips non-public properties, keeps history and audits", async () => {
    const data = { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [24.8, -8.7] }, properties: { code: "BH-1", village: "K", caretakerPhone: "+243..." } }] };
    await publishSnapshot(db, { layer: "boreholes", userId: "u1", asAt: "2026-11-24", data, summary: { boreholes: 1 }, allowed: ["code", "village"] });
    await publishSnapshot(db, { layer: "boreholes", userId: "u1", asAt: "2026-11-25", data, summary: { boreholes: 1 }, allowed: ["code"] });
    const [l] = await latestSnapshots(db);
    expect(l!.asAt).toBe("2026-11-25");
    expect(l!.data.features[0]!.properties).toEqual({ code: "BH-1" });
    expect((await db.select().from(auditLog)).filter((a: any) => a.op === "publish")).toHaveLength(2);
  });
});
