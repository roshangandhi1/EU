/**
 * Pupil import through the real sync engine: rows read from a CSV are saved by the web, reach a
 * school phone at its next sync, are billed from their enrolment date, and a chunk sent twice
 * saves nothing new.
 */
import type { UserContext } from "@eu/core";
import type { Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { createSchoolSite, enrolmentBalance, loadSchool, type Synced } from "@eu/schools";
import { SyncClient, type Transport } from "@eu/sync/client";
import { MemoryStore } from "@eu/sync/memory-store";
import { handlePull, handlePush } from "@eu/sync/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildImport, planImport, readPupilFile } from "../lib/pupil-import";
import { entities, permissions } from "../lib/registry";

const SITE = "school-kiabukwa";
const admin: UserContext = { id: "22222222-2222-4222-8222-222222222222", assignments: [{ role: "school_admin", scope: { type: "site", siteId: SITE } }] };
const manager: UserContext = { id: "44444444-4444-4444-8444-444444444444", assignments: [{ role: "programme_manager", scope: { type: "global" } }] };
const TODAY = "2026-11-26";
const now = new Date(`${TODAY}T08:00:00Z`);
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
let db: Db;
let close: () => Promise<void>;
const ids: Record<string, string> = {};

function device(id: string, user: UserContext) {
  const ctx = () => ({ db, user, deviceId: id, permissions, entities, now: () => now });
  const transport: Transport = {
    push: async (req) => JSON.parse(JSON.stringify(await handlePush(ctx(), JSON.parse(JSON.stringify(req))))),
    pull: async (req) => JSON.parse(JSON.stringify(await handlePull(ctx(), req))),
  };
  const store = new MemoryStore();
  return { store, client: new SyncClient(store, transport, { newId: uuid, now: () => now }) };
}
const webPush = (mutations: any[]) => handlePush({ db, user: manager, deviceId: "web:manager", permissions, entities, now: () => now }, { deviceNow: now.toISOString(), mutations });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await createSchoolSite(db, { id: SITE, name: "EP Kiabukwa" });
  const c = device("web:setup", manager).client;
  await c.create("school.school", SITE, { siteId: SITE, code: "KIA", locale: "fr", shiftsRunning: ["morning"] });
  ids.year = await c.create("school.academic_year", SITE, { label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-02" });
  ids.t1 = await c.create("school.term", SITE, { academicYearId: ids.year, label: "T1", startsOn: "2026-09-01", endsOn: "2026-11-15" });
  ids.c1a = await c.create("school.class", SITE, { academicYearId: ids.year, level: 1, section: "A", shift: "morning", classroomId: null });
  ids.c2a = await c.create("school.class", SITE, { academicYearId: ids.year, level: 2, section: "A", shift: "morning", classroomId: null });
  // A first-trimester fee (period ended 15 Nov) and a whole-year fee.
  await c.create("school.fee_item", SITE, { academicYearId: ids.year, termId: ids.t1, name: "Minerval T1", levels: [1, 2], amount: 20_000, dueOn: "2026-10-15", planId: null, periodEndsOn: "2026-11-15" });
  await c.create("school.fee_item", SITE, { academicYearId: ids.year, termId: null, name: "Assurance", levels: [1, 2], amount: 5_000, dueOn: "2026-10-15", planId: null, periodEndsOn: null });
  const out = await c.sync();
  expect(out.ok).toBe(true);
});
afterAll(async () => close());

const CSV = [
  "NOM;Post-nom;Prénom;Sexe;Date de naissance;Lieu de naissance;N° ID;N° perm;Classe;Date d'inscription;Parent ou tuteur;Téléphone du parent",
  "KABEYA;Mwamba;Bénédicte;F;15/03/2019;Lubumbashi;ID-001;P-001;1A;;Mukendi Jean;+243 970 000 001",
  "ILUNGA;;Patrick;G;2018;;;;2A;;;",
  "NGOY;Kasongo;Héritier;G;02/02/2018;;;;2A;20/11/2026;;",
].join("\r\n");

describe("importing pupils from a CSV", () => {
  const key = "9b2f4c1e-0000-4000-8000-000000000001";
  let chunk: { line: number; pupil: any }[];

  it("saves the pupils and their enrolments, with report-card fields and web student numbers", async () => {
    const d = (await loadSchool(db, SITE))!;
    const plan = planImport(d, readPupilFile(CSV, TODAY), { defaultClassId: "", defaultEnrolledOn: "2026-09-01", today: TODAY });
    expect(plan.map((r) => r.status)).toEqual(["ready", "ready", "ready"]);
    chunk = plan.map((r) => ({ line: r.line, pupil: r.pupil! }));
    const built = buildImport(d, SITE, key, chunk, TODAY);
    expect(built.skipped).toEqual([]);
    const res = await webPush(built.muts);
    expect(res.results.map((r) => r.status)).toEqual(Array(6).fill("applied"));

    const after = (await loadSchool(db, SITE))!;
    const kabeya = after.students.find((s) => s.lastName === "KABEYA")!;
    expect(kabeya).toMatchObject({ firstName: "Bénédicte", postName: "Mwamba", dateOfBirth: "2019-03-15", birthPlace: "Lubumbashi", idNumber: "ID-001", permNumber: "P-001", guardianPhone: "+243 970 000 001" });
    expect(after.students.map((s) => s.studentNumber).sort()).toEqual(["KIA-2026-W0001", "KIA-2026-W0002", "KIA-2026-W0003"]);
    expect(after.enrolments.map((e) => [after.classes.find((c) => c.id === e.classId)!.level, e.enrolledOn, e.status]).sort()).toEqual([
      [1, "2026-09-01", "active"], [2, "2026-09-01", "active"], [2, "2026-11-20", "active"],
    ]);
  });

  it("bills from the enrolment date: a pupil enrolled after the first trimester is not charged for it", async () => {
    const d = (await loadSchool(db, SITE))!;
    const bal = (last: string) => {
      const s = d.students.find((x) => x.lastName === last)!;
      return enrolmentBalance(d, d.enrolments.find((e) => e.studentId === s.id)!, TODAY).charged;
    };
    expect(bal("KABEYA")).toBe(25_000);
    expect(bal("NGOY")).toBe(5_000);
  });

  it("reaches the school's phone at its next sync", async () => {
    const phone = device("phone-admin", admin);
    const out = await phone.client.sync();
    expect(out.ok).toBe(true);
    const students = (await phone.client.list("school.student")) as unknown as Synced<{ lastName: string; permNumber: string }>[];
    const enrolments = await phone.client.list("school.enrolment");
    expect(students.map((s) => s.lastName).sort()).toEqual(["ILUNGA", "KABEYA", "NGOY"]);
    expect(students.find((s) => s.lastName === "KABEYA")!.permNumber).toBe("P-001");
    expect(enrolments).toHaveLength(3);
  });

  it("saves nothing new when the same chunk is sent again, and flags the pupils as duplicates in a new import", async () => {
    const d = (await loadSchool(db, SITE))!;
    const again = buildImport(d, SITE, key, chunk, TODAY);
    expect(again).toMatchObject({ muts: [], already: 3 });
    const plan = planImport(d, readPupilFile(CSV, TODAY), { defaultClassId: "", defaultEnrolledOn: "2026-09-01", today: TODAY });
    expect(plan.map((r) => r.status)).toEqual(["duplicate", "duplicate", "duplicate"]);
    expect((await loadSchool(db, SITE))!.students).toHaveLength(3);
  });
});
