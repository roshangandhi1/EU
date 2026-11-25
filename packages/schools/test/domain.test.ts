import { describe, expect, it } from "vitest";
import {
  attendanceRate,
  checkReceiptNumber,
  chronicAbsentees,
  classDay,
  dailyCollections,
  duplicateReceipts,
  findLikelyDuplicates,
  formatCdf,
  nextStudentNumber,
  placesAsAt,
  schoolsEn,
  schoolsFr,
  splitAsAt,
  studentBalance,
  student,
  payment,
  type Absence,
  type Classroom,
  type Enrolment,
  type FeeItem,
  type Payment,
  type ReceiptBook,
  type RegisterTaken,
  type Synced,
  type SyncMeta,
} from "../src";

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const meta = (over: Partial<SyncMeta> = {}): SyncMeta => ({
  id: uid(),
  scopeId: "school-1",
  deviceTime: "2026-12-10T08:00:00+02:00",
  serverTime: "2026-12-10T09:00:00+02:00",
  voidedAt: null,
  ...over,
});

describe("as-at rule", () => {
  const onTime = meta();
  const late = meta({ deviceTime: "2026-12-15T10:00:00+02:00", serverTime: "2026-12-20T10:00:00+02:00" });
  const unsynced = meta({ deviceTime: "2026-12-15T10:00:00+02:00", serverTime: null });
  const afterCutoff = meta({ deviceTime: "2026-12-17T10:00:00+02:00" });
  const voided = meta({ voidedAt: "2026-12-12T10:00:00+02:00" });
  const all = [onTime, late, unsynced, afterCutoff, voided];

  it("operational mode counts by capture time", () => {
    const r = splitAsAt(all, "2026-12-16", "operational");
    expect(r.counted.map((x) => x.id)).toEqual([onTime.id, late.id, unsynced.id]);
    expect(r.lateSynced).toEqual([]);
  });

  it("evidence mode counts only server-received records, lists late ones separately", () => {
    const r = splitAsAt(all, "2026-12-16", "evidence");
    expect(r.counted.map((x) => x.id)).toEqual([onTime.id]);
    expect(r.lateSynced.map((x) => x.id)).toEqual([late.id, unsynced.id]);
  });

  it("evidence mode admits reviewed late records", () => {
    const r = splitAsAt(all, "2026-12-16", "evidence", new Set([late.id]));
    expect(r.counted.map((x) => x.id)).toEqual([onTime.id, late.id]);
  });
});

describe("capacity register (3.2.2)", () => {
  const room = (over: Partial<Classroom>): Synced<Classroom> => ({
    ...meta(),
    name: "Room",
    seatsPerShift: 40,
    basis: "new",
    commissionedOn: "2026-09-01",
    decommissionedOn: null,
    evidenceUrl: null,
    ...over,
  });
  const rooms = [
    room({ basis: "baseline", seatsPerShift: 25 }),
    room({}),
    room({ seatsPerShift: 35 }),
    room({ commissionedOn: "2027-01-10" }),
    room({ basis: "baseline", decommissionedOn: "2026-10-01" }),
  ];

  it("counts places per running shift", () => {
    const r = placesAsAt({ shiftsRunning: ["morning", "afternoon"] }, rooms, "2026-12-01");
    expect(r).toMatchObject({ baselinePlaces: 50, newPlaces: 150, totalPlaces: 200 });
  });

  it("a single-shift school counts one shift", () => {
    const r = placesAsAt({ shiftsRunning: ["morning"] }, rooms, "2026-12-01");
    expect(r.totalPlaces).toBe(100);
  });

  it("respects commissioning dates", () => {
    expect(placesAsAt({ shiftsRunning: ["morning"] }, rooms, "2027-01-10").newPlaces).toBe(115);
  });
});

describe("students", () => {
  const base = {
    firstName: "Mwamba",
    lastName: "Kalenga",
    postName: "Ilunga",
    sex: "F" as const,
    dateOfBirth: "2018-03-04",
    birthYearEstimate: null,
    guardianPhone: "+243 970 123 456",
  };

  it("flags likely duplicates despite accents and phone formatting", () => {
    const existing = [
      { ...base, id: "a", firstName: "Mwámba", guardianPhone: "0970123456" },
      { ...base, id: "b", firstName: "Ngoy", lastName: "Mukendi", postName: "", dateOfBirth: "2017-01-01" },
      { ...base, id: "c", sex: "M" as const },
    ];
    const r = findLikelyDuplicates({ ...base, id: "new" }, existing);
    expect(r.map((x) => x.id)).toEqual(["a"]);
    expect(r[0]?.reasons).toContain("guardian phone");
  });

  it("issues device-tagged student numbers that cannot collide across devices", () => {
    const existing = ["LUN-2027-A0001", "LUN-2027-A0002", "LUN-2027-B0001"];
    expect(nextStudentNumber("lun", 2027, "A", existing)).toBe("LUN-2027-A0003");
    expect(nextStudentNumber("lun", 2027, "B", existing)).toBe("LUN-2027-B0002");
  });

  it("validates student records", () => {
    const ok = student.safeParse({ studentNumber: "LUN-2027-A0001", ...base, guardianName: "Kalenga" });
    expect(ok.success).toBe(true);
    expect(student.safeParse({ ...base, studentNumber: "x", sex: "X" }).success).toBe(false);
  });
});

describe("attendance by exception", () => {
  const classId = "class-1";
  const enrol = (studentId: string, over: Partial<Enrolment> = {}): Synced<Enrolment> => ({
    ...meta(),
    studentId,
    classId,
    academicYearId: "y",
    enrolledOn: "2026-09-07",
    leftOn: null,
    status: "active",
    ...over,
  });
  const enrolments = [enrol("s1"), enrol("s2"), enrol("s3"), enrol("s4", { leftOn: "2026-11-01", status: "dropped_out" })];
  const absent = (studentId: string, date: string): Synced<Absence> => ({ ...meta(), studentId, classId, date, reason: "unknown" });
  const taken = (date: string): Synced<RegisterTaken> => ({ ...meta(), classId, date });

  it("counts present as enrolled minus absent when the register was taken", () => {
    const d = classDay(classId, "2026-12-01", enrolments, [absent("s1", "2026-12-01")], [taken("2026-12-01")]);
    expect(d).toMatchObject({ taken: true, enrolled: 3, absent: 1, present: 2 });
  });

  it("does not report an untaken register as full attendance", () => {
    const d = classDay(classId, "2026-12-02", enrolments, [], []);
    expect(d).toMatchObject({ taken: false, present: 0 });
    expect(attendanceRate([d])).toBeNull();
  });

  it("finds chronic absentees", () => {
    const abs = ["01", "02", "03", "04", "05"].map((d) => absent("s2", `2026-12-${d}`));
    expect(chronicAbsentees(abs, "2026-12-01", "2026-12-31")).toEqual([{ studentId: "s2", days: 5 }]);
  });
});

describe("fees", () => {
  const item = (over: Partial<FeeItem>): Synced<FeeItem> => ({
    ...meta(),
    academicYearId: "y",
    termId: null,
    name: "Minerval",
    levels: [1, 2, 3, 4, 5, 6],
    amount: 30_000,
    dueOn: "2026-10-01",
    ...over,
  });
  const tuition = item({});
  const exam = item({ name: "Examen", amount: 10_000, dueOn: "2027-03-01" });
  const pay = (amount: number, receiptNumber: number, over: Partial<Synced<Payment>> = {}): Synced<Payment> => ({
    ...meta(),
    studentId: "s1",
    paidOn: "2026-11-15",
    amount,
    receiptNumber,
    feeItemIds: [],
    ...over,
  });

  it("allocates payments oldest-first and reports overdue", () => {
    const b = studentBalance("s1", 3, [exam, tuition], [], [pay(20_000, 101)], "2026-12-01");
    expect(b).toMatchObject({ charged: 40_000, paid: 20_000, balance: 20_000, overdue: 10_000 });
    expect(b.lines[0]?.name).toBe("Minerval");
  });

  it("ignores voided payments and applies exemptions", () => {
    const ex = { ...meta(), studentId: "s1", feeItemId: tuition.id, kind: "percent" as const, value: 50, reason: "Bursary" };
    const b = studentBalance(
      "s1",
      3,
      [tuition, exam],
      [ex],
      [pay(5_000, 102), pay(9_999, 103, { voidedAt: "2026-11-16T10:00:00+02:00" })],
      "2026-12-01",
    );
    expect(b).toMatchObject({ charged: 25_000, paid: 5_000, balance: 20_000 });
  });

  it("checks receipt numbers against assigned books", () => {
    const book: Synced<ReceiptBook> = { ...meta(), firstNumber: 101, lastNumber: 150, assignedTo: "u1" };
    const used = [pay(1000, 101)];
    expect(checkReceiptNumber(101, "u1", [book], used)).toBe("already_used");
    expect(checkReceiptNumber(151, "u1", [book], used)).toBe("not_in_assigned_book");
    expect(checkReceiptNumber(102, "u2", [book], used)).toBe("not_in_assigned_book");
    expect(checkReceiptNumber(102, "u1", [book], used)).toBeNull();
  });

  it("detects duplicate receipts after sync and summarises daily cash", () => {
    const ps = [pay(1000, 110), pay(2000, 110), pay(3000, 111, { paidOn: "2026-11-16" })];
    expect([...duplicateReceipts(ps).keys()]).toEqual([110]);
    expect(dailyCollections(ps, "2026-11-01", "2026-11-30")).toEqual([
      { date: "2026-11-15", count: 2, total: 3000, firstReceipt: 110, lastReceipt: 110 },
      { date: "2026-11-16", count: 1, total: 3000, firstReceipt: 111, lastReceipt: 111 },
    ]);
  });

  it("rejects fractional or zero payments", () => {
    const base = { studentId: uid(), paidOn: "2026-11-15", receiptNumber: 1, feeItemIds: [] };
    expect(payment.safeParse({ ...base, amount: 100.5 }).success).toBe(false);
    expect(payment.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(payment.safeParse({ ...base, amount: 500 }).success).toBe(true);
  });

  it("formats CDF", () => {
    expect(formatCdf(125000, "en")).toBe("125,000 FC");
    expect(formatCdf(125000, "fr").replace(/\s/g, " ")).toBe("125 000 FC");
  });
});

describe("i18n", () => {
  it("French covers every English key", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [p + k] : keys(v, `${p}${k}.`)));
    expect(keys(schoolsFr).sort()).toEqual(keys(schoolsEn).sort());
  });
});
