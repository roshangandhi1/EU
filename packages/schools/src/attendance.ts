import type { Absence, Enrolment, RegisterTaken, Synced } from "./model";
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
): ClassDay {
  const roster = new Set(activeOn(enrolments, date).filter((e) => e.classId === classId).map((e) => e.studentId));
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
    if (a.voidedAt || a.date < from || a.date > to) continue;
    const set = days.get(a.studentId) ?? new Set<string>();
    set.add(a.date);
    days.set(a.studentId, set);
  }
  return [...days]
    .map(([studentId, d]) => ({ studentId, days: d.size }))
    .filter((r) => r.days >= threshold)
    .sort((a, b) => b.days - a.days);
}
