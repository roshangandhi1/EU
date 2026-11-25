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
  enrolmentBalance,
  activeOn,
  dedupeAbsences,
  parseWholeNumber,
  classroom,
  yearOfDate,
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

describe("fees per academic year (DATA-4 / EDGE-3 / DATA-11)", () => {
  const y1 = { ...meta(), id: "y1", label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-02" };
  const y2 = { ...meta(), id: "y2", label: "2027-2028", startsOn: "2027-09-06", endsOn: "2028-07-01" };
  const years = [y1, y2];
  const fee = (id: string, academicYearId: string, dueOn: string): Synced<FeeItem> => ({
    ...meta({ id }), academicYearId, termId: null, name: "Minerval", levels: [3], amount: 10_000, dueOn,
  });
  const items = [fee("f1", "y1", "2026-10-01"), fee("f2", "y2", "2027-10-01")];
  const pay = (amount: number, paidOn: string, feeItemIds: string[] = []): Synced<Payment> => ({
    ...meta(), studentId: "s1", paidOn, amount, receiptNumber: Number(paidOn.replace(/-/g, "")) % 1000, feeItemIds,
  });

  it("charges only the fee items of the enrolment's year", () => {
    const b = studentBalance("s1", 3, items, [], [], "2027-11-01", { academicYearId: "y2", years });
    expect(b).toMatchObject({ charged: 10_000, overdue: 10_000 });
    expect(b.lines.map((l) => l.feeItemId)).toEqual(["f2"]);
    // Without the year (old callers) every item for the level is charged.
    expect(studentBalance("s1", 3, items, [], [], "2027-11-01").charged).toBe(20_000);
  });

  it("last year's payments do not offset this year's fees, and holiday payments count for the coming year", () => {
    const pays = [pay(10_000, "2026-11-05"), pay(4_000, "2027-08-20"), pay(1_000, "2027-09-10", ["f1"])];
    const y2b = studentBalance("s1", 3, items, [], pays, "2027-11-01", { academicYearId: "y2", years });
    expect(y2b).toMatchObject({ charged: 10_000, paid: 4_000, balance: 6_000 });
    const y1b = studentBalance("s1", 3, items, [], pays, "2027-11-01", { academicYearId: "y1", years });
    expect(y1b).toMatchObject({ charged: 10_000, paid: 11_000, balance: -1_000 });
    expect(yearOfDate(years, "2027-08-20")).toBe("y2");
    expect(yearOfDate(years, "2029-01-01")).toBe("y2");
  });

  it("an all-items exemption applies only in the year it was granted", () => {
    const ex = { ...meta({ deviceTime: "2026-09-15T08:00:00+02:00" }), studentId: "s1", feeItemId: null, kind: "full" as const, value: 0, reason: "Orphelin" };
    expect(studentBalance("s1", 3, items, [ex], [], "2027-11-01", { academicYearId: "y1", years }).charged).toBe(0);
    expect(studentBalance("s1", 3, items, [ex], [], "2027-11-01", { academicYearId: "y2", years }).charged).toBe(10_000);
  });

  it("enrolments end with their year, and enrolmentBalance bills the class's year", () => {
    const cls = (id: string, academicYearId: string) => ({ ...meta({ id }), academicYearId, level: 3, section: "A", shift: "morning" as const, classroomId: null });
    const enr = (id: string, classId: string, academicYearId: string, enrolledOn: string): Synced<Enrolment> => ({
      ...meta({ id }), studentId: "s1", classId, academicYearId, enrolledOn, leftOn: null, status: "active",
    });
    const e1 = enr("e1", "c1", "y1", "2026-09-01");
    const e2 = enr("e2", "c2", "y2", "2027-09-06");
    expect(activeOn([e1, e2], "2027-10-01", years).map((e) => e.id)).toEqual(["e2"]);
    expect(activeOn([e1], "2027-08-01", years)).toEqual([]);
    expect(activeOn([e1, e2], "2027-10-01").map((e) => e.id)).toEqual(["e1", "e2"]);
    const d = { classes: [cls("c1", "y1"), cls("c2", "y2")], years, feeItems: items, exemptions: [], payments: [] };
    expect(enrolmentBalance(d, e2, "2027-11-01").lines.map((l) => l.feeItemId)).toEqual(["f2"]);
  });
});

describe("input edges", () => {
  it("parses whole francs and refuses decimals (EDGE-1)", () => {
    for (const ok of ["15000", "15 000", "15.000", "15,000", "15\u202f000", "1 500 000", " 15000 "]) expect(parseWholeNumber(ok)).toBe(ok.includes("1 500 000") ? 1_500_000 : 15_000);
    for (const bad of ["15000,50", "2,5", "1.5", "15,00", "1.500,000", "-5", "abc", "15 00"]) expect(parseWholeNumber(bad)).toBeNaN();
    expect(parseWholeNumber("")).toBeNull();
  });

  it("classroom evidence links must be http(s) (SEC-16)", () => {
    const base = { name: "Salle 1", seatsPerShift: 40, basis: "new", commissionedOn: "2026-09-01", decommissionedOn: null };
    expect(classroom.safeParse({ ...base, evidenceUrl: "javascript:alert(1)//x" }).success).toBe(false);
    expect(classroom.safeParse({ ...base, evidenceUrl: "data:text/html,x" }).success).toBe(false);
    expect(classroom.safeParse({ ...base, evidenceUrl: "https://drive.example.org/x" }).success).toBe(true);
  });

  it("caps amounts at an int4-safe 2 000 000 000 FC and refuses impossible dates (EDGE-2)", () => {
    const base = { studentId: uid(), paidOn: "2026-11-15", receiptNumber: 1, feeItemIds: [] };
    expect(payment.safeParse({ ...base, amount: 2_000_000_000 }).success).toBe(true);
    expect(payment.safeParse({ ...base, amount: 2_000_000_001 }).success).toBe(false);
    expect(payment.safeParse({ ...base, amount: 5, paidOn: "2026-02-30" }).success).toBe(false);
  });

  it("counts each absent pupil once per day across phones (DATA-10)", () => {
    const a = (dev: string, deviceTime: string, reason: Absence["reason"]): Synced<Absence> => ({ ...meta({ deviceTime }), studentId: "s1", classId: "c1", date: "2026-12-01", reason });
    const rows = dedupeAbsences([a("p1", "2026-12-01T08:00:00Z", "sick"), a("p2", "2026-12-01T09:00:00Z", "fees"), { ...a("p3", "2026-12-01T10:00:00Z", "work"), voidedAt: "2026-12-01T11:00:00Z" }]);
    expect(rows.map((r) => r.reason)).toEqual(["fees"]);
  });
});

