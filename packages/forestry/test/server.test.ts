import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import { sites } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forestryActions } from "../src/actions";
import { forestryEntities } from "../src/entities";
import { previewKmzOrKml } from "../src/import/kml";
import { computeIndicator } from "../src/indicators";
import { commitImport, loadStream } from "../src/server";
import { KML } from "./fixtures";

const permissions = new PermissionRegistry().register(platformActions).register(forestryActions);
const entities = new EntityRegistry().register(...forestryEntities);
const lead: UserContext = { id: "lead-b", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "bamboo" } }] };
const officer: UserContext = { id: "fo-b", assignments: [{ role: "field_officer", scope: { type: "stream", stream: "bamboo" } }] };

let db: any;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await createTestDb()));
afterEach(async () => close());

const ctx = (user: UserContext) => ({ db, user, deviceId: `web:${user.id}`, permissions, entities, now: () => new Date("2026-11-25T10:00:00Z") });

describe("KMZ import commit", () => {
  it("creates sites, plots and approved boundaries; re-import is a no-op", async () => {
    const preview = await previewKmzOrKml("kiabukwa.kml", KML);
    const ok = preview.candidates.filter((c) => c.problems.length === 0);
    const opt = { stream: "bamboo" as const, village: "Kiabukwa", sourceName: "kiabukwa.kml", status: "planted" as const, species: ["bambusa_vulgaris"], approveFrom: "2026-10-11" };
    const r = await commitImport(ctx(lead), ok, opt);
    expect(r.rejected).toEqual([]);
    expect(r.created.map((c) => c.code)).toEqual(["KBK-B-001"]);
    expect(await db.select().from(sites)).toHaveLength(1);

    const again = await commitImport(ctx(lead), ok, opt);
    expect(again.rejected).toEqual([{ code: "KBK-B-001", reason: "already_exists" }]);

    const { plots, inputs } = await loadStream(db, "bamboo");
    expect(plots[0]!.geomApproved).toBe(true);
    const ind = computeIndicator(inputs, "2026-11-30", "captured", { densityRulePerHa: 400 });
    expect(ind.plots[0]!.outcome).toBe("not_planted");
    expect(ind.plots[0]!.areaHa).toBeGreaterThan(95);
    // An approval recorded today cannot make a boundary count in an earlier as-at report.
    const before = computeIndicator(inputs, "2026-10-16", "captured", { densityRulePerHa: 400 });
    expect(before.plots[0]!.outcome).toBe("no_authoritative_boundary");
  });

  it("field officers cannot import, leads approve only with the approve action", async () => {
    const preview = await previewKmzOrKml("kiabukwa.kml", KML);
    const r = await commitImport(ctx(officer), preview.candidates.slice(0, 1), { stream: "bamboo", village: "K", sourceName: "x", status: "planted", species: [] });
    expect(r.rejected[0]!.reason).toBe("forbidden");
    expect(await db.select().from(sites)).toHaveLength(0);
  });
});
