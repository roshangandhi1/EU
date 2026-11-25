import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import { files, sites, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { defineEntity, EntityRegistry } from "@eu/sync";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { acceptUpload, readableFile, uploadedFileIds, type BlobStore, type FileMeta } from "../lib/files";

const permissions = new PermissionRegistry().register(platformActions).register({
  "t.read": { stream: "bamboo", roles: ["system_admin", "field_officer", "viewer"] },
  "t.write": { stream: "bamboo", roles: ["system_admin", "field_officer"] },
});
const entities = new EntityRegistry().register(
  defineEntity({ name: "test.visit", stream: "bamboo", table: sites, schema: z.object({}), policy: "append_only", actions: { read: "t.read", write: "t.write" }, label: { en: "x", fr: "x" } }),
);
const officer: UserContext = { id: "fo", assignments: [{ role: "field_officer", scope: { type: "site", siteId: "P1", stream: "bamboo" } }] };
const other: UserContext = { id: "fo2", assignments: [{ role: "field_officer", scope: { type: "site", siteId: "P2", stream: "bamboo" } }] };

let db: Db;
let close: () => Promise<void>;
let stored: Map<string, Uint8Array>;
const blobs: BlobStore = {
  put: async (p, b) => void stored.set(p, b),
  get: async (p) => (stored.has(p) ? { stream: new Blob([stored.get(p)! as BlobPart]).stream(), mime: "image/jpeg" } : null),
};
const now = new Date("2026-12-01T10:00:00Z");
const ctx = (user: UserContext) => ({ db, user, deviceId: "dev1", permissions, entities, blobs, now });

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  stored = new Map();
  await (db as any).insert(sites).values([
    { id: "P1", kind: "plot", stream: "bamboo", name: "Plot 1" },
    { id: "P2", kind: "plot", stream: "bamboo", name: "Plot 2" },
    { id: "S1", kind: "school", stream: "schools", name: "School" },
  ]);
});
afterEach(async () => close());

const bytes = new TextEncoder().encode("fake jpeg bytes");
const sha = createHash("sha256").update(bytes).digest("hex");
const meta = (over: Partial<FileMeta> = {}): FileMeta => ({
  id: "6a1f0d1e-0000-4000-8000-000000000001",
  entity: "test.visit",
  scopeId: "P1",
  mime: "image/jpeg",
  sha256: sha,
  lat: -8.1,
  lng: 26.5,
  accuracyM: 6,
  takenAt: "2026-12-01T09:00:00Z",
  deviceNow: "2026-12-01T10:00:00Z",
  ...over,
});

describe("evidence files", () => {
  it("stores a photo once and answers duplicate on retry", async () => {
    expect(await acceptUpload(ctx(officer), meta(), bytes)).toEqual({ status: "uploaded", id: meta().id });
    expect(await acceptUpload(ctx(officer), meta(), bytes)).toEqual({ status: "duplicate", id: meta().id });
    expect(stored.size).toBe(1);
    const rows = await (db as any).select().from(files);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ createdBy: "fo", deviceId: "dev1", scopeId: "P1", clockSuspect: false, bytes: bytes.byteLength });
  });

  it("rejects bad checksums, other people's sites, other streams and reused ids", async () => {
    expect(await acceptUpload(ctx(officer), meta({ sha256: "0".repeat(64) }), bytes)).toEqual({ status: "rejected", reason: "checksum_mismatch" });
    expect(await acceptUpload(ctx(other), meta(), bytes)).toEqual({ status: "rejected", reason: "forbidden" });
    const admin: UserContext = { id: "root", assignments: [{ role: "system_admin", scope: { type: "global" } }] };
    expect(await acceptUpload(ctx(admin), meta({ scopeId: "S1" }), bytes)).toEqual({ status: "rejected", reason: "scope_wrong_stream" });
    await acceptUpload(ctx(officer), meta(), bytes);
    const other2 = new TextEncoder().encode("different");
    expect(await acceptUpload(ctx(officer), meta({ sha256: createHash("sha256").update(other2).digest("hex") }), other2)).toEqual({ status: "rejected", reason: "id_exists" });
    expect(stored.size).toBe(1);
  });

  it("flags a wrong phone clock and respects the evidence cut-off", async () => {
    await acceptUpload(ctx(officer), meta({ deviceNow: "2026-11-29T10:00:00Z" }), bytes);
    const [row] = await (db as any).select().from(files);
    expect(row.clockSuspect).toBe(true);
    expect(await uploadedFileIds(db, [meta().id, "6a1f0d1e-0000-4000-8000-000000000009"])).toEqual(new Set([meta().id]));
    expect(await uploadedFileIds(db, [meta().id], new Date("2026-12-01T09:59:00Z"))).toEqual(new Set());
  });

  it("only lets readers of the site see the file", async () => {
    await acceptUpload(ctx(officer), meta(), bytes);
    expect(await readableFile({ db, user: officer, permissions, entities }, meta().id)).not.toBeNull();
    expect(await readableFile({ db, user: other, permissions, entities }, meta().id)).toBeNull();
  });
});
