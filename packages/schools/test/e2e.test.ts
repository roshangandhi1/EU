/**
 * End to end: a month in the life of one school, through the real sync engine.
 * The web (programme manager) sets the school up; two phones (administrator and
 * headteacher) work offline, sync, correct each other, and the reports are then
 * computed from what the server holds, as the web pages do.
 */
import { PermissionRegistry, platformActions, type UserContext } from "@eu/core";
import type { Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { EntityRegistry } from "@eu/sync";
import { SyncClient, type Transport } from "@eu/sync/client";
import { MemoryStore } from "@eu/sync/memory-store";
import { handlePull, handlePush } from "@eu/sync/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activeOn, attendanceRate, checkReceiptNumber, classDay, createSchoolSite, enrolmentBreakdown, findLikelyDuplicates, loadSchool,
  nextStudentNumber, placesAsAt, planRegister, schoolsActions, schoolsEntities, splitAsAt, studentBalance, tagForDevice, type Absence,
} from "../src";

const permissions = new PermissionRegistry().register(platformActions).register(schoolsActions);
const entities = new EntityRegistry().register(...schoolsEntities);
const SITE = "school-luniemu";
const admin: UserContext = { id: "22222222-2222-4222-8222-222222222222", assignments: [{ role: "school_admin", scope: { type: "site", siteId: SITE } }] };
const head: UserContext = { id: "11111111-1111-4111-8111-111111111111", assignments: [{ role: "headteacher", scope: { type: "site", siteId: SITE } }] };
const manager: UserContext = { id: "44444444-4444-4444-8444-444444444444", assignments: [{ role: "programme_manager", scope: { type: "global" } }] };

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const server = { now: new Date("2026-10-01T07:00:00Z") };
let db: Db;
let close: () => Promise<void>;

function device(id: string, user: UserContext) {
  const ctx = () => ({ db, user, deviceId: id, permissions, entities, now: () => new Date(server.now) });
  const transport: Transport = {
    push: async (req) => JSON.parse(JSON.stringify(await handlePush(ctx(), JSON.parse(JSON.stringify(req))))),
    pull: async (req) => JSON.parse(JSON.stringify(await handlePull(ctx(), req))),
  };
  const store = new MemoryStore();
  const client = new SyncClient(store, transport, { newId: uuid, now: () => new Date(server.now) });
  const list = async <T>(entity: string) =>
    (await client.list(entity)).map((r) => ({ voidedAt: null, serverTime: null, deviceTime: server.now.toISOString(), ...r })) as unknown as Array<T & { id: string; voidedAt: string | null; serverTime: string | null; deviceTime: string }>;
  return { id, store, client, list };
}

const web = () => device("web:manager", manager);
const phoneA = () => device("phone-admin", admin);
const phoneH = () => device("phone-head", head);
let W: ReturnType<typeof web>, A: ReturnType<typeof phoneA>, H: ReturnType<typeof phoneH>;
const ids: Record<string, string> = {};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createSchoolSite(db, { id: SITE, name: "École Luniemu" });
  W = web();
  A = phoneA();
  H = phoneH();
});
afterAll(async () => close());

describe("a month at École Luniemu", () => {
  it("1. the programme team sets the school up on the web", async () => {
    const c = W.client;
    await c.create("school.school", SITE, { siteId: SITE, code: "LUN", locale: "fr", shiftsRunning: ["morning", "afternoon"] });
    ids.year = await c.create("school.academic_year", SITE, { label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-02" });
    for (const [name, basis, on] of [["Salle 1", "baseline", "2010-01-01"], ["Salle 2", "baseline", "2010-01-01"], ["Salle 3 (EU)", "new", "2026-11-01"]] as const)
      await c.create("school.classroom", SITE, { name, seatsPerShift: name.includes("EU") ? 45 : 40, basis, commissionedOn: on, decommissionedOn: null, evidenceUrl: null });
    ids.p1m = await c.create("school.class", SITE, { academicYearId: ids.year, level: 1, section: "A", shift: "morning", classroomId: null });
    ids.p2a = await c.create("school.class", SITE, { academicYearId: ids.year, level: 2, section: "A", shift: "afternoon", classroomId: null });
    ids.fee = await c.create("school.fee_item", SITE, { academicYearId: ids.year, termId: null, name: "Minerval T1", levels: [1, 2], amount: 30_000, dueOn: "2026-10-15" });
    await c.create("school.receipt_book", SITE, { firstNumber: 1, lastNumber: 50, assignedTo: admin.id });
    await c.create("school.receipt_book", SITE, { firstNumber: 51, lastNumber: 100, assignedTo: head.id });
    await c.create("school.device_tag", SITE, { phoneId: "phone-admin", tag: "A" });
    await c.create("school.device_tag", SITE, { phoneId: "phone-head", tag: "B" });
    const out = await c.sync();
    expect(out.ok).toBe(true);
    expect(await W.store.rejections()).toEqual([]);
  });

  it("2. both phones enrol pupils offline and never clash on student numbers", async () => {
    await A.client.sync();
    await H.client.sync();
    const enrol = async (d: typeof A, p: { first: string; last: string; sex: "F" | "M"; year: number; classId: string; phone?: string }) => {
      const tags = await d.list<{ phoneId: string; tag: string }>("school.device_tag");
      const tag = tagForDevice(tags, d.id);
      expect(tag).not.toBeNull();
      const existing = await d.list<{ studentNumber: string }>("school.student");
      const studentNumber = nextStudentNumber("LUN", 2026, tag!, existing.map((s) => s.studentNumber));
      const sid = await d.client.create("school.student", SITE, {
        studentNumber, firstName: p.first, lastName: p.last, postName: "", sex: p.sex, dateOfBirth: null, birthYearEstimate: p.year,
        guardianName: "", guardianPhone: p.phone ?? "", village: "Luniemu",
      });
      await d.client.create("school.enrolment", SITE, { studentId: sid, classId: p.classId, academicYearId: ids.year, enrolledOn: "2026-10-01", leftOn: null, status: "active" });
      return sid;
    };
    ids.s1 = await enrol(A, { first: "Mwamba", last: "Kalenga", sex: "F", year: 2020, classId: ids.p1m! , phone: "0970123456" });
    ids.s2 = await enrol(A, { first: "Ilunga", last: "Banza", sex: "M", year: 2020, classId: ids.p1m! });
    ids.s3 = await enrol(H, { first: "Kapinga", last: "Mbuyi", sex: "F", year: 2019, classId: ids.p2a! });
    ids.s4 = await enrol(H, { first: "Ngoy", last: "Kasongo", sex: "M", year: 2020, classId: ids.p1m! });
    expect((await A.client.sync()).ok).toBe(true);
    expect((await H.client.sync()).ok).toBe(true);
    await A.client.sync();

    const students = await A.list<{ studentNumber: string; firstName: string; lastName: string; postName: string; sex: "F" | "M"; dateOfBirth: string | null; birthYearEstimate: number | null; guardianPhone: string }>("school.student");
    expect(students.map((s) => s.studentNumber).sort()).toEqual(["LUN-2026-A0001", "LUN-2026-A0002", "LUN-2026-B0001", "LUN-2026-B0002"]);

    // The same child brought again by a relative is caught before a fifth record is made.
    const again = { id: "", firstName: "Mwamba", lastName: "Kalenga", postName: "", sex: "F" as const, dateOfBirth: null, birthYearEstimate: 2021, guardianPhone: "+243 970 123 456" };
    expect(findLikelyDuplicates(again, students)[0]?.id).toBe(ids.s1);
  });

  it("3. registers are typed up on one phone and corrected on the other", async () => {
    server.now = new Date("2026-10-05T08:00:00Z");
    const day = "2026-10-05";
    type Abs = Absence & { id: string; voidedAt: string | null; serverTime: string | null; deviceTime: string };
    const write = async (d: typeof A, absent: Map<string, Absence["reason"]>) => {
      const ops = planRegister(ids.p1m!, day, await d.list<Abs>("school.absence"), await d.list<{ classId: string; date: string }>("school.register") as never, absent);
      for (const o of ops) {
        if (o.op === "create_register") await d.client.create("school.register", SITE, { classId: ids.p1m, date: day });
        else if (o.op === "create_absence") await d.client.create("school.absence", SITE, { studentId: o.studentId, classId: ids.p1m, date: day, reason: o.reason });
        else if (o.op === "update_reason") await d.client.update("school.absence", o.absenceId, { reason: o.reason });
        else await d.client.void("school.absence", o.absenceId, "marked present");
      }
      return ops.map((o) => o.op);
    };
    expect(await write(A, new Map([[ids.s1!, "sick"]]))).toEqual(["create_register", "create_absence"]);
    await A.client.sync();
    await H.client.sync();
    // Headteacher checks the paper register: Mwamba was off for fees, and Ilunga was absent too.
    expect(await write(H, new Map([[ids.s1!, "fees"], [ids.s2!, "unknown"]]))).toEqual(["update_reason", "create_absence"]);
    await H.client.sync();
    // And then Ilunga turns out to have been there after all.
    expect(await write(H, new Map([[ids.s1!, "fees"]]))).toEqual(["void_absence"]);
    expect((await H.client.sync()).ok).toBe(true);
    expect(await H.store.rejections()).toEqual([]);
  });

  it("4. fees are paid against paper receipts from each person's own book", async () => {
    server.now = new Date("2026-10-10T09:00:00Z");
    await A.client.sync();
    const books = await A.list<{ firstNumber: number; lastNumber: number; assignedTo: string }>("school.receipt_book");
    const pays = await A.list<{ receiptNumber: number; studentId: string; amount: number; paidOn: string; feeItemIds: string[] }>("school.payment");
    expect(checkReceiptNumber(51, admin.id, books, pays)).toBe("not_in_assigned_book");
    expect(checkReceiptNumber(1, admin.id, books, pays)).toBeNull();
    await A.client.create("school.payment", SITE, { studentId: ids.s1, paidOn: "2026-10-10", amount: 20_000, receiptNumber: 1, feeItemIds: [] });
    await A.client.sync();
    await H.client.sync();
    await H.client.create("school.payment", SITE, { studentId: ids.s1, paidOn: "2026-10-10", amount: 10_000, receiptNumber: 51, feeItemIds: [] });
    await H.client.create("school.payment", SITE, { studentId: ids.s3, paidOn: "2026-10-10", amount: 5_000, receiptNumber: 52, feeItemIds: [] });
    await H.client.sync();
    // Captured on the 30th, but the phone only finds a network on 3 November.
    server.now = new Date("2026-10-30T10:00:00Z");
    await A.client.create("school.payment", SITE, { studentId: ids.s2, paidOn: "2026-10-30", amount: 30_000, receiptNumber: 2, feeItemIds: [] });
    server.now = new Date("2026-11-03T10:00:00Z");
    expect((await A.client.sync()).ok).toBe(true);
    expect(await A.store.rejections()).toEqual([]);
  });

  it("5. the reports the web shows add up, as at any date and in evidence mode", async () => {
    const d = (await loadSchool(db, SITE))!;
    expect(d.school?.code).toBe("LUN");
    expect(d.students).toHaveLength(4);

    // 3.2.2: two baseline rooms of 40 seats, plus a new room of 45 from 1 November, both shifts.
    expect(placesAsAt(d.school!, d.classrooms, "2026-10-31").totalPlaces).toBe(160);
    const nov = placesAsAt(d.school!, d.classrooms, "2026-11-30");
    expect([nov.baselinePlaces, nov.newPlaces, nov.totalPlaces]).toEqual([160, 90, 250]);

    const b = enrolmentBreakdown(activeOn(d.enrolments, "2026-10-31"), new Map(d.students.map((s) => [s.id, s])), new Map(d.classes.map((c) => [c.id, c])));
    expect(b.total).toBe(4);
    expect(b.bySex).toEqual({ F: 2, M: 2 });
    expect(b.byShift).toEqual({ morning: 3, afternoon: 1 });

    const p1 = classDay(ids.p1m!, "2026-10-05", d.enrolments, d.absences, d.registers);
    expect([p1.taken, p1.enrolled, p1.absent, p1.present]).toEqual([true, 3, 1, 2]);
    expect(d.absences.find((a) => a.studentId === ids.s1 && !a.voidedAt)?.reason).toBe("fees");
    expect(attendanceRate([p1, classDay(ids.p2a!, "2026-10-05", d.enrolments, d.absences, d.registers)])).toBeCloseTo(2 / 3);

    const fee = (sid: string, level: number) => studentBalance(sid, level, d.feeItems, d.exemptions, d.payments, "2026-10-31");
    expect(fee(ids.s1!, 1).balance).toBe(0);
    expect(fee(ids.s3!, 2)).toMatchObject({ balance: 25_000, overdue: 25_000 });
    expect(fee(ids.s4!, 1).overdue).toBe(30_000);

    // An assessor's cut-off of 31 October excludes the payment that only reached the server on 3 November.
    const ev = splitAsAt(d.payments, "2026-10-31", "evidence");
    expect(ev.counted.map((p) => p.receiptNumber).sort((x, y) => x - y)).toEqual([1, 51, 52]);
    expect(ev.lateSynced.map((p) => p.receiptNumber)).toEqual([2]);
    expect(splitAsAt(d.payments, "2026-10-31", "operational").counted).toHaveLength(4);
  });
});
