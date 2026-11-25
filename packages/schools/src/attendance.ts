import type { AcademicYear, Absence, Enrolment, RegisterTaken, Synced } from "./model";
import { activeOn } from "./enrolment";

export interface ClassDay {
  classId: string;
  date: string;
  taken: boolean;
  enrolled: number;
  absent: number;
  present: number;
  absentStudentIds: string[];
}

/**
 * Attendance for one class on one day, recorded by exception. If no register was
 * taken, present/absent are 0 and taken is false: an untaken register is never
 * reported as full attendance.
 */
export function classDay(
  classId: string,
  date: string,
  enrolments: readonly Synced<Enrolment>[],
  absences: readonly Synced<Absence>[],
  registers: readonly Synced<RegisterTaken>[],
  years?: readonly Pick<Synced<AcademicYear>, "id" | "endsOn">[],
): ClassDay {
  const roster = new Set(activeOn(enrolments, date, years).filter((e) => e.classId === classId).map((e) => e.studentId));
  const taken = registers.some((r) => !r.voidedAt && r.classId === classId && r.date === date);
  const absentIds = [
    ...new Set(
      absences
        .filter((a) => !a.voidedAt && a.classId === classId && a.date === date && roster.has(a.studentId))
        .map((a) => a.studentId),
    ),
  ];
  return {
    classId,
    date,
    taken,
    enrolled: roster.size,
    absent: taken ? absentIds.length : 0,
    present: taken ? roster.size - absentIds.length : 0,
    absentStudentIds: taken ? absentIds : [],
  };
}

/**
 * One absence per pupil and day (DATA-10): two phones, or a phone and the web, typing up the same
 * paper register create separate records. Counts and exports use this; the latest capture wins.
 * Voided absences are dropped.
 */
export function dedupeAbsences<A extends Synced<Absence>>(absences: readonly A[]): A[] {
  const latest = new Map<string, A>();
  const key = (a: A) => `${a.studentId}|${a.date}`;
  const later = (a: A, b: A) => (a.deviceTime > b.deviceTime ? true : a.deviceTime < b.deviceTime ? false : (a.serverTime ?? "") > (b.serverTime ?? ""));
  for (const a of absences) {
    if (a.voidedAt) continue;
    const prev = latest.get(key(a));
    if (!prev || later(a, prev)) latest.set(key(a), a);
  }
  return [...latest.values()];
}

/** Attendance rate over class-days where a register was taken (present / enrolled). */
export function attendanceRate(days: readonly ClassDay[]): number | null {
  const taken = days.filter((d) => d.taken);
  const enrolled = taken.reduce((n, d) => n + d.enrolled, 0);
  if (enrolled === 0) return null;
  return taken.reduce((n, d) => n + d.present, 0) / enrolled;
}

/** Students absent on at least `threshold` days between from and to (inclusive). */
export function chronicAbsentees(
  absences: readonly Synced<Absence>[],
  from: string,
  to: string,
  threshold = 5,
): Array<{ studentId: string; days: number }> {
  const days = new Map<string, Set<string>>();
  for (const a of absences) {
    if (a.voidedAt || a.date < from || a.date > to) continue; // a Set per pupil already counts each day once
    const set = days.get(a.studentId) ?? new Set<string>();
    set.add(a.date);
    days.set(a.studentId, set);
  }
  return [...days]
    .map(([studentId, d]) => ({ studentId, days: d.size }))
    .filter((r) => r.days >= threshold)
    .sort((a, b) => b.days - a.days);
}

export type RegisterOp =
  | { op: "create_register" }
  | { op: "create_absence"; studentId: string; reason: Absence["reason"] }
  | { op: "update_reason"; absenceId: string; reason: Absence["reason"] }
  | { op: "void_absence"; absenceId: string };

/**
 * What saving a typed-up register must write, given what is already recorded for
 * this class and day and who is now marked absent (with reasons).
 */
export function planRegister(
  classId: string,
  date: string,
  absences: readonly Synced<Absence>[],
  registers: readonly Synced<RegisterTaken>[],
  absent: ReadonlyMap<string, Absence["reason"]>,
): RegisterOp[] {
  const ops: RegisterOp[] = [];
  if (!registers.some((r) => !r.voidedAt && r.classId === classId && r.date === date)) ops.push({ op: "create_register" });
  const existing = absences.filter((a) => !a.voidedAt && a.classId === classId && a.date === date);
  for (const [studentId, reason] of absent) {
    const prior = existing.find((a) => a.studentId === studentId);
    if (!prior) ops.push({ op: "create_absence", studentId, reason });
    else if (prior.reason !== reason) ops.push({ op: "update_reason", absenceId: prior.id, reason });
  }
  for (const a of existing) if (!absent.has(a.studentId)) ops.push({ op: "void_absence", absenceId: a.id });
  return ops;
}
