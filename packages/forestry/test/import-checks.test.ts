import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import { files, sites } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { handlePush } from "@eu/sync/server";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forestryActions } from "../src/actions";
import { plots } from "../src/db/schema";
import { forestryEntities } from "../src/entities";
import { ImportFileError, MAX_KML_BYTES, previewKmzOrKml } from "../src/import/kml";
import { computeIndicator } from "../src/indicators";
import { commitImport, loadStream, photoUploads, previewImport } from "../src/server";
import { square } from "./fixtures";

const permissions = new PermissionRegistry().register(platformActions).register(forestryActions);
const entities = new EntityRegistry().register(...forestryEntities);
const lead: UserContext = { id: "lead-b", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "bamboo" } }] };
const miomboLead: UserContext = { id: "lead-m", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "miombo" } }] };
const officer: UserContext = { id: "fo-b", assignments: [{ role: "field_officer", scope: { type: "stream", stream: "bamboo" } }] };

let db: any;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await createTestDb()));
afterEach(async () => close());
const NOW = new Date("2026-11-25T10:00:00Z");
const ctx = (user: UserContext) => ({ db, user, deviceId: `web:${user.id}`, permissions, entities, now: () => NOW });

const ring = (g: ReturnType<typeof square>) => g.coordinates[0]![0]!.map(([x, y]) => `${x},${y}`).join(" ");
const placemark = (name: string, ...shapes: ReturnType<typeof square>[]) =>
  `<Placemark>${name ? `<name>${name}</name>` : ""}<MultiGeometry>${shapes
    .map((g) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(g)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`)
    .join("")}</MultiGeometry></Placemark>`;
const kml = (...pms: string[]) => `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${pms.join("")}</Document></kml>`;
const opt = (stream: "bamboo" | "miombo") => ({ stream, village: "Kiabukwa", sourceName: "f.kml", status: "planted" as const, species: [] });

describe("KMZ import checks (DATA-6, DATA-18, SEC-17, SEC-18)", () => {
  it("flags shapes drawn twice, overlapping shapes and repeated codes in one file", async () => {
    const a = square(25, -8, 300);
    const p = await previewKmzOrKml("f.kml", kml(
      placemark("B-1", a, a), // the same land twice in one placemark
      placemark("B-2", square(25.001, -7.999, 300)), // overlaps B-1
      placemark("b-3", square(25.2, -8, 200)),
      placemark("B-3", square(25.3, -8, 200)), // same code as b-3, other case
      placemark("", square(25.4, -8, 200)),
    ));
    const by = Object.fromEntries(p.candidates.map((c) => [c.name, c.problems]));
    expect(by["B-1"]).toEqual(expect.arrayContaining(["self_overlap", "overlaps:B-2"]));
    expect(by["B-2"]).toEqual(["overlaps:B-1"]);
    expect(by["b-3"]).toEqual(["duplicate_code"]);
    expect(by["B-3"]).toEqual(["duplicate_code"]);
    expect(by["P-5"]).toEqual(["name_missing"]);
  });

  it("flags overlaps with live plots of either stream and existing codes in any case", async () => {
    await commitImport(ctx(miomboLead), (await previewKmzOrKml("m.kml", kml(placemark("M-1", square(25, -8, 300))))).candidates, opt("miombo"));
    await commitImport(ctx(lead), (await previewKmzOrKml("b.kml", kml(placemark("B-9", square(26, -8, 300))))).candidates, opt("bamboo"));
    const p = await previewImport(db, "bamboo", "n.kml", kml(placemark("N-1", square(25.0005, -7.9995, 300)), placemark("b-9", square(27, -8, 100)), placemark("N-3", square(28, -8, 100))));
    expect(p.candidates.map((c) => [c.name, c.problems])).toEqual([
      ["N-1", ["overlaps:M-1"]],
      ["b-9", ["already_exists"]],
      ["N-3", []],
    ]);
    // Committing the same code in another case is refused.
    const r = await commitImport(ctx(lead), [p.candidates[1]!], opt("bamboo"));
    expect(r.rejected).toEqual([{ code: "b-9", reason: "already_exists" }]);
  });

  it("never leaves a site behind for a refused candidate", async () => {
    const long = "X".repeat(45);
    const p = await previewKmzOrKml("f.kml", kml(placemark(long, square(25, -8, 100))));
    expect(p.candidates[0]!.problems).toContain("name_too_long");
    const r = await commitImport(ctx(lead), p.candidates, opt("bamboo"));
    expect(r.rejected[0]!.reason).toMatch(/^invalid:code/);
    expect(await db.select().from(sites)).toHaveLength(0);
    // A refusal from the sync engine itself (here: the lead may run imports but not write plots) rolls the site back too.
    const custom = new PermissionRegistry().register(platformActions).register({ ...forestryActions, "bamboo.plot.propose": { stream: "bamboo", roles: ["system_admin"] } });
    const ok = await previewKmzOrKml("g.kml", kml(placemark("G-1", square(25, -8, 100))));
    const r2 = await commitImport({ ...ctx(lead), permissions: custom }, ok.candidates, opt("bamboo"));
    expect(r2.rejected).toEqual([{ code: "G-1", reason: "forbidden" }]);
    expect(await db.select().from(sites)).toHaveLength(0);
    expect((await commitImport(ctx(lead), ok.candidates, opt("bamboo"))).created).toHaveLength(1);
    expect(await db.select().from(sites)).toHaveLength(1);
  });

  it("refuses a KMZ that inflates past the limit, and a KMZ without KML", async () => {
    const zip = new JSZip();
    zip.file("doc.kml", "<kml>" + " ".repeat(MAX_KML_BYTES + 10) + "</kml>");
    const bomb = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(bomb.byteLength).toBeLessThan(1_000_000);
    await expect(previewKmzOrKml("bomb.kmz", bomb)).rejects.toMatchObject({ code: "kml_too_large" });
    const empty = new JSZip();
    empty.file("readme.txt", "x");
    await expect(previewKmzOrKml("e.kmz", await empty.generateAsync({ type: "uint8array" }))).rejects.toBeInstanceOf(ImportFileError);
  });
});

describe("plot fields reserved for leads (SEC-7)", () => {
  it("a field officer cannot publish a plot or move it to another stream", async () => {
    await commitImport(ctx(lead), (await previewKmzOrKml("b.kml", kml(placemark("B-1", square(25, -8, 100))))).candidates, opt("bamboo"));
    const [row] = await db.select().from(plots);
    const now = NOW.toISOString();
    const upd = (fields: Record<string, unknown>) => ({
      mutationId: crypto.randomUUID(), entity: "bamboo.plot", recordId: row.id, op: "update" as const, scopeId: row.scopeId,
      fields, baseFieldVersions: Object.fromEntries(Object.keys(fields).map((k) => [k, row.fieldVersions[k] ?? 0])), deviceTime: now,
    });
    const asOfficer = await handlePush(ctx(officer), { deviceNow: now, mutations: [upd({ publicVisible: true }), upd({ stream: "miombo" }), upd({ village: "Luniemu" })] });
    expect(asOfficer.results.map((r) => r.reason ?? r.status)).toEqual(["forbidden_field", "stream_immutable", "applied"]);
    const asLead = await handlePush(ctx(lead), { deviceNow: now, mutations: [upd({ publicVisible: true })] });
    expect(asLead.results[0]!.status).toBe("applied");
  });
});

describe("photo evidence belongs to its own plot (SEC-5/DATA-17) and demo photos are not evidence (DATA-7)", () => {
  it("a photo uploaded for plot A does not evidence plot B", async () => {
    const p = await previewKmzOrKml("b.kml", kml(placemark("A", square(25, -8, 100)), placemark("B", square(25.1, -8, 100))));
    const r = await commitImport(ctx(lead), p.candidates, { ...opt("bamboo"), approveFrom: "2026-01-01" });
    const [a, b] = r.created;
    const photo = "6a1f0d1e-0000-4000-8000-000000000001";
    const demo = "6a1f0d1e-0000-4000-8000-000000000002";
    const fileRow = (id: string, scopeId: string, sha256: string) => ({
      id, entity: "bamboo.planting", scopeId, mime: "image/jpeg", bytes: 10, sha256, blobPath: "x", takenAt: NOW, createdBy: "x", uploadedAt: NOW,
    });
    await db.insert(files).values([fileRow(photo, a!.siteId, "abc"), fileRow(demo, b!.siteId, "demo")]);
    const plant = (siteId: string, photos: string[]) => ({
      mutationId: crypto.randomUUID(), entity: "bamboo.planting", recordId: crypto.randomUUID(), op: "insert" as const, scopeId: siteId,
      fields: { plantedOn: "2026-11-01", lines: [{ species: "bambusa_vulgaris", count: 5000 }], isGapFilling: false, photos }, deviceTime: NOW.toISOString(),
    });
    await handlePush(ctx(lead), { deviceNow: NOW.toISOString(), mutations: [plant(a!.siteId, [photo]), plant(b!.siteId, [photo])] });
    const { inputs } = await loadStream(db, "bamboo");
    const up = await photoUploads(db, inputs);
    const outcome = (mode: "captured" | "evidence") =>
      Object.fromEntries(computeIndicator(inputs, "2026-11-30", mode, { densityRulePerHa: 400, photoUploadedAt: up }).plots.map((x) => [x.code, x.outcome]));
    expect(outcome("captured")).toEqual({ A: "counted", B: "missing_evidence" });
    // Plot B with the demo placeholder photo: counts day to day, never as evidence.
    await handlePush(ctx(lead), { deviceNow: NOW.toISOString(), mutations: [plant(b!.siteId, [demo])] });
    const again = await loadStream(db, "bamboo");
    const up2 = await photoUploads(db, again.inputs);
    const out = (mode: "captured" | "evidence") =>
      Object.fromEntries(computeIndicator(again.inputs, "2026-11-30", mode, { densityRulePerHa: 400, photoUploadedAt: up2 }).plots.map((x) => [x.code, x.outcome]));
    expect(out("captured")).toEqual({ A: "counted", B: "counted" });
    expect(out("evidence").B).toBe("missing_evidence");
  });
});
