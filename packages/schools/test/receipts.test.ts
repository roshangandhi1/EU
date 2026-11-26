/**
 * System receipt numbers and the per-school "paper receipt required" setting, through the real sync engine.
 */
import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import type { Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { SyncClient, type Transport } from "@eu/sync/client";
import { MemoryStore } from "@eu/sync/memory-store";
import { handlePull, handlePush } from "@eu/sync/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSchoolSite, dailyCollections, loadSchool, matchesReceipt, newestFirst, nextReceiptCode, receiptLabel, schoolsActions, schoolsEntities } from "../src";

const permissions = new PermissionRegistry().register(platformActions).register(schoolsActions);
const entities = new EntityRegistry().register(...schoolsEntities);
const SITE = "school-kiabukwa";
const manager: UserContext = { id: "44444444-4444-4444-8444-444444444444", assignments: [{ role: "programme_manager", scope: { type: "global" } }] };
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const now = new Date("2026-10-10T09:00:00Z");
let db: Db;
let close: () => Promise<void>;

function device(id: string) {
  const ctx = () => ({ db, user: manager, deviceId: id, permissions, entities, now: () => now });
  const transport: Transport = {
    push: async (req) => JSON.parse(JSON.stringify(await handlePush(ctx(), JSON.parse(JSON.stringify(req))))),
    pull: async (req) => JSON.parse(JSON.stringify(await handlePull(ctx(), req))),
  };
  const store = new MemoryStore();
  return { store, client: new SyncClient(store, transport, { newId: uuid, now: () => now }) };
}

describe("receipt numbers (pure rules)", () => {
  it("counts per school and letter, voided payments included, and pads to four digits", () => {
    const pays = [{ receiptCode: "KIA-W-0009" }, { receiptCode: "KIA-A-0040" }, { receiptCode: null }, { receiptCode: "KIA-W-0011" }];
    expect(nextReceiptCode("kia", "w", pays)).toBe("KIA-W-0012");
    expect(nextReceiptCode("KIA", "A", pays)).toBe("KIA-A-0041");
    expect(nextReceiptCode("KIA", "B", pays)).toBe("KIA-B-0001");
    expect(nextReceiptCode("KIA", "W", [{ receiptCode: "KIA-W-9999" }])).toBe("KIA-W-10000");
  });
  it("labels, searches and sorts payments with or without a system number", () => {
    const old = { receiptCode: null, receiptNumber: 42, paidOn: "2026-10-01" };
    const cur = { receiptCode: "KIA-W-0003", receiptNumber: null, paidOn: "2026-10-01" };
    const both = { receiptCode: "KIA-W-0004", receiptNumber: 1201, paidOn: "2026-10-02" };
    expect([receiptLabel(old), receiptLabel(cur)]).toEqual(["#42", "KIA-W-0003"]);
    expect(matchesReceipt(cur, "kia-w-0003")).toBe(true);
    expect(matchesReceipt(cur, "W-0003")).toBe(true);
    expect(matchesReceipt(both, "1201")).toBe(true);
    expect(matchesReceipt(old, "#42")).toBe(true);
    expect(matchesReceipt(old, "4")).toBe(false);
    expect([old, both, cur].sort(newestFirst)).toEqual([both, cur, old]);
  });
  it("daily collections give the range of system numbers", () => {
    const p = (code: string | null, num: number | null) => ({ id: uuid(), studentId: "s", paidOn: "2026-10-01", amount: 100, receiptNumber: num, receiptCode: code, feeItemIds: [], voidedAt: null, voidReason: null, deviceTime: "", serverTime: null, version: 1 });
    const [day] = dailyCollections([p("KIA-W-0002", null), p("KIA-W-0001", 7), p(null, 3)] as never, "2026-10-01", "2026-10-31");
    expect(day).toMatchObject({ count: 3, firstCode: "KIA-W-0001", lastCode: "KIA-W-0002", firstReceipt: 3, lastReceipt: 7 });
  });
});

describe("receipt numbers on the server", () => {
  let W: ReturnType<typeof device>;
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await createSchoolSite(db, { id: SITE, name: "EP Kiabukwa" });
    W = device("web:manager");
    const c = W.client;
    ids.school = await c.create("school.school", SITE, { siteId: SITE, code: "KIA", locale: "fr", shiftsRunning: ["morning"] });
    ids.year = await c.create("school.academic_year", SITE, { label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-02" });
    ids.cls = await c.create("school.class", SITE, { academicYearId: ids.year, level: 1, section: "A", shift: "morning", classroomId: null });
    ids.s = await c.create("school.student", SITE, { studentNumber: "KIA-0001", firstName: "Ilunga", lastName: "Kabamba", sex: "M", dateOfBirth: null, birthYearEstimate: 2019 });
    expect((await c.sync()).ok).toBe(true);
  });
  afterAll(async () => close());

  const pay = (f: Record<string, unknown>) => W.client.create("school.payment", SITE, { studentId: ids.s, paidOn: "2026-10-10", amount: 5_000, feeItemIds: [], ...f });
  const reasons = async () => (await W.store.rejections()).map((r) => r.reason);

  it("needs a paper number while the school requires one (the default)", async () => {
    await pay({ receiptNumber: null, receiptCode: "KIA-W-0001" });
    await W.client.sync();
    expect(await reasons()).toContain("paper_receipt_required");
  });

  it("takes a payment with only a system number once the school switches paper receipts off", async () => {
    await W.client.update("school.school", ids.school!, { paperReceiptRequired: false });
    await W.client.sync();
    const before = (await reasons()).length;
    await pay({ receiptNumber: null, receiptCode: "KIA-W-0002" });
    await W.client.sync();
    expect((await reasons()).length).toBe(before);
    const d = (await loadSchool(db, SITE))!;
    expect(d.school?.paperReceiptRequired).toBe(false);
    expect(d.payments.map((p) => p.receiptCode)).toContain("KIA-W-0002");
  });

  it("refuses a system number used before, or one from another school", async () => {
    await pay({ receiptNumber: null, receiptCode: "KIA-W-0002" });
    await pay({ receiptNumber: null, receiptCode: "LUN-W-0001" });
    await W.client.sync();
    const r = await reasons();
    expect(r).toContain("receipt_code_taken");
    expect(r).toContain("receipt_code_school");
  });

  it("editing a school setting leaves its other fields alone", async () => {
    const d = (await loadSchool(db, SITE))!;
    expect(d.school).toMatchObject({ code: "KIA", locale: "fr", shiftsRunning: ["morning"], paperReceiptRequired: false });
  });
});
