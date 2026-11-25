import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import type { Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { SyncClient, type Transport } from "@eu/sync/client";
import { MemoryStore } from "@eu/sync/memory-store";
import { handlePull, handlePush } from "@eu/sync/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tagForDevice, createSchoolSite, schoolsActions, schoolsEntities, schoolsTables, splitAsAt, studentBalance, type Synced, type Payment, type FeeItem } from "../src";

const permissions = new PermissionRegistry().register(platformActions).register(schoolsActions);
const entities = new EntityRegistry().register(...schoolsEntities);

const SITE = "school-luniemu";
const head: UserContext = { id: "11111111-1111-4111-8111-111111111111", assignments: [{ role: "headteacher", scope: { type: "site", siteId: SITE } }] };
const admin: UserContext = { id: "22222222-2222-4222-8222-222222222222", assignments: [{ role: "school_admin", scope: { type: "site", siteId: SITE } }] };
const otherHead: UserContext = { id: "33333333-3333-4333-8333-333333333333", assignments: [{ role: "headteacher", scope: { type: "site", siteId: "school-other" } }] };
const manager: UserContext = { id: "44444444-4444-4444-8444-444444444444", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "schools" } }] };

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const serverNow = { t: new Date("2026-12-10T08:00:00Z") };

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  // The committed migrations (platform + 0001_schools_init) create every table.
  ({ db, close } = await createTestDb());
  await createSchoolSite(db, { id: SITE, name: "École Luniemu" });
  await createSchoolSite(db, { id: "school-other", name: "Autre école" });
});
afterEach(async () => close());

function device(id: string, user: UserContext) {
  const ctx = () => ({ db, user, deviceId: id, permissions, entities, now: () => new Date(serverNow.t) });
  const transport: Transport = {
    push: async (req) => JSON.parse(JSON.stringify(await handlePush(ctx(), JSON.parse(JSON.stringify(req))))),
    pull: async (req) => JSON.parse(JSON.stringify(await handlePull(ctx(), req))),
  };
  const store = new MemoryStore();
  const clock = { now: new Date("2026-12-10T08:00:00Z") };
  return { store, clock, client: new SyncClient(store, transport, { newId: uuid, now: () => clock.now }) };
}

const pay = (studentId: string, receiptNumber: number, amount = 10_000) => ({
  studentId,
  paidOn: "2026-12-10",
  amount,
  receiptNumber,
  feeItemIds: [],
});

describe("schools entities on the sync engine", () => {
  it("payments are append-only: school admin cannot void, headteacher can, edits are rejected", async () => {
    const a = device("phone-admin", admin);
    const h = device("phone-head", head);
    const student = uuid();
    const pid = await a.client.create("school.payment", SITE, pay(student, 101));
    expect((await a.client.sync()).ok).toBe(true);

    await a.client.void("school.payment", pid, "wrong amount");
    await a.client.update("school.payment", pid, { amount: 5_000 });
    await a.client.sync();
    expect((await a.store.rejections()).map((r) => r.reason).sort()).toEqual(["append_only", "forbidden"]);

    await h.client.sync();
    await h.client.void("school.payment", pid, "wrong amount");
    await h.client.sync();
    const rec = await h.store.getServerRecord("school.payment", pid);
    expect(rec?.amount).toBe(10_000);
    expect(rec?.voidReason).toBe("wrong amount");
  });

  it("rejects payments with fractional francs", async () => {
    const a = device("phone-admin", admin);
    await a.client.create("school.payment", SITE, pay(uuid(), 102, 99.5));
    await a.client.sync();
    expect((await a.store.rejections())[0]?.reason).toMatch(/invalid/i);
  });

  it("student records merge field edits from two phones and keep data scoped to the school", async () => {
    const a = device("phone-admin", admin);
    const h = device("phone-head", head);
    const sid = await a.client.create("school.student", SITE, {
      studentNumber: "LUN-2026-A0001",
      firstName: "Mwamba",
      lastName: "Kalenga",
      postName: "",
      sex: "F",
      dateOfBirth: "2018-03-04",
      birthYearEstimate: null,
      guardianName: "Kalenga",
      guardianPhone: "0970123456",
      village: "Luniemu",
    });
    await a.client.sync();
    await h.client.sync();
    await a.client.update("school.student", sid, { guardianPhone: "0970999999" });
    await h.client.update("school.student", sid, { village: "Kiabukwa" });
    await a.client.sync();
    await h.client.sync();
    await a.client.sync();
    const rec = await a.store.getServerRecord("school.student", sid);
    expect(rec).toMatchObject({ guardianPhone: "0970999999", village: "Kiabukwa" });

    const o = device("phone-other", otherHead);
    await o.client.sync();
    expect(await o.store.getServerRecord("school.student", sid)).toBeUndefined();
  });

  it("configuration is server-authoritative: only programme roles may change fee items", async () => {
    const a = device("phone-admin", admin);
    const m = device("web-manager", manager);
    const item = { academicYearId: uuid(), termId: null, name: "Minerval", levels: [1, 2, 3], amount: 30_000, dueOn: "2026-10-01" };
    await a.client.create("school.fee_item", SITE, item);
    await a.client.sync();
    expect((await a.store.rejections())[0]?.reason).toBe("forbidden");
    const fid = await m.client.create("school.fee_item", SITE, item);
    expect((await m.client.sync()).ok).toBe(true);
    await a.client.sync();
    expect((await a.store.getServerRecord("school.fee_item", fid))?.amount).toBe(30_000);
  });

  it("phone letters for student numbers are assigned by programme staff only, and W is reserved", async () => {
    const a = device("phone-admin", admin);
    const m = device("web-manager", manager);
    await a.client.create("school.device_tag", SITE, { phoneId: "phone-admin", tag: "A" });
    await m.client.create("school.device_tag", SITE, { phoneId: "phone-admin", tag: "W" });
    await a.client.sync();
    await m.client.sync();
    expect((await a.store.rejections())[0]?.reason).toBe("forbidden");
    expect((await m.store.rejections())[0]?.reason).toMatch(/invalid/);
    await m.client.create("school.device_tag", SITE, { phoneId: "phone-admin", tag: "B" });
    await m.client.sync();
    await a.client.sync();
    const tags = (await a.store.listServerRecords("school.device_tag")) as unknown as Array<{ phoneId: string; tag: string; voidedAt: string | null }>;
    expect(tagForDevice(tags, "phone-admin")).toBe("B");
    expect(tagForDevice(tags, "phone-other")).toBeNull();
  });

  it("server records feed the domain rules: balances and the evidence cut-off", async () => {
    const m = device("web-manager", manager);
    const a = device("phone-admin", admin);
    const student = uuid();
    const fid = await m.client.create("school.fee_item", SITE, {
      academicYearId: uuid(), termId: null, name: "Minerval", levels: [3], amount: 30_000, dueOn: "2026-10-01",
    });
    await m.client.sync();
    await a.client.sync();
    await a.client.create("school.payment", SITE, pay(student, 103, 12_000));
    await a.client.sync();

    // A payment captured on the 15th but synced on the 20th.
    a.clock.now = new Date("2026-12-15T09:00:00Z");
    await a.client.create("school.payment", SITE, pay(student, 104, 3_000));
    serverNow.t = new Date("2026-12-20T09:00:00Z");
    a.clock.now = new Date("2026-12-20T09:00:00Z");
    await a.client.sync();

    const rows = (await (db as any).select().from(schoolsTables.schoolPayments)) as Array<Record<string, any>>;
    const payments: Synced<Payment>[] = rows.map((r) => ({
      ...r,
      deviceTime: new Date(r.deviceTime).toISOString(),
      serverTime: new Date(r.serverTime).toISOString(),
      voidedAt: r.voidedAt ? new Date(r.voidedAt).toISOString() : null,
    })) as Synced<Payment>[];
    const items = [(await a.store.getServerRecord("school.fee_item", fid)) as unknown as Synced<FeeItem>];

    expect(studentBalance(student, 3, items, [], payments, "2026-12-31").balance).toBe(15_000);
    const split = splitAsAt(payments, "2026-12-16", "evidence");
    expect(split.counted.map((p) => p.receiptNumber)).toEqual([103]);
    expect(split.lateSynced.map((p) => p.receiptNumber)).toEqual([104]);
  });
});
