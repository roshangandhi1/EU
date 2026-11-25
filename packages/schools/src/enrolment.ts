import type { AcademicYear, Enrolment, SchoolClass, Sex, Shift, Student, Synced } from "./model";

/**
 * Enrolments active on a date: enrolled on or before it, not left before it, not voided.
 * Pass the school's academic years and an enrolment also ends when its year ends (DATA-11):
 * last year's pupils are not counted or billed in the new year until they are re-enrolled.
 */
export function activeOn<E extends Synced<Enrolment>>(
  enrolments: readonly E[],
  date: string,
  years?: readonly Pick<Synced<AcademicYear>, "id" | "endsOn">[],
): E[] {
  const ends = new Map((years ?? []).map((y) => [y.id, y.endsOn]));
  return enrolments.filter((e) => {
    if (e.voidedAt || e.enrolledOn > date || (e.leftOn !== null && e.leftOn <= date)) return false;
    const end = ends.get(e.academicYearId);
    return end === undefined || date <= end;
  });
}

export interface EnrolmentBreakdown {
  total: number;
  bySex: Record<Sex, number>;
  byLevel: Record<number, number>;
  byShift: Record<Shift, number>;
}

export function enrolmentBreakdown(
  active: readonly Synced<Enrolment>[],
  students: ReadonlyMap<string, Pick<Student, "sex">>,
  classes: ReadonlyMap<string, Pick<SchoolClass, "level" | "shift">>,
): EnrolmentBreakdown {
  const out: EnrolmentBreakdown = {
    total: 0,
    bySex: { F: 0, M: 0 },
    byLevel: {},
    byShift: { morning: 0, afternoon: 0 },
  };
  for (const e of active) {
    const s = students.get(e.studentId);
    const c = classes.get(e.classId);
    if (!s || !c) continue;
    out.total++;
    out.bySex[s.sex]++;
    out.byLevel[c.level] = (out.byLevel[c.level] ?? 0) + 1;
    out.byShift[c.shift]++;
  }
  return out;
}

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normaliseName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalisePhone(s: string): string {
  const digits = s.replace(/\D+/g, "");
  // DRC numbers: +243 XXX XXX XXX or 0XXX XXX XXX -> keep the 9 significant digits
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

type StudentLike = Pick<
  Student,
  "firstName" | "lastName" | "postName" | "sex" | "dateOfBirth" | "birthYearEstimate" | "guardianPhone"
> & { id: string };

export interface DuplicateMatch {
  id: string;
  score: number;
  reasons: string[];
}

function birthYear(s: StudentLike): number | null {
  if (s.dateOfBirth) return Number(s.dateOfBirth.slice(0, 4));
  return s.birthYearEstimate;
}

/**
 * Likely duplicates of a candidate student among existing records. There is no
 * national ID, so this scores names, birth date/year, sex and guardian phone.
 * Score >= 3 should block save until the user confirms it is a different child.
 */
export function findLikelyDuplicates(
  candidate: StudentLike,
  existing: readonly StudentLike[],
  minScore = 3,
): DuplicateMatch[] {
  const cNames = new Set(
    [candidate.firstName, candidate.lastName, candidate.postName].map(normaliseName).filter(Boolean),
  );
  const cPhone = normalisePhone(candidate.guardianPhone);
  const cYear = birthYear(candidate);
  const matches: DuplicateMatch[] = [];
  for (const s of existing) {
    if (s.id === candidate.id) continue;
    const reasons: string[] = [];
    let score = 0;
    const names = [s.firstName, s.lastName, s.postName].map(normaliseName).filter(Boolean);
    const shared = names.filter((n) => cNames.has(n)).length;
    if (shared >= 2) {
      score += 2;
      reasons.push("names");
    } else if (shared === 1) {
      score += 1;
      reasons.push("one name");
    }
    if (candidate.dateOfBirth && s.dateOfBirth && candidate.dateOfBirth === s.dateOfBirth) {
      score += 2;
      reasons.push("date of birth");
    } else {
      const y = birthYear(s);
      if (cYear !== null && y !== null && Math.abs(cYear - y) <= 1) {
        score += 1;
        reasons.push("birth year");
      }
    }
    if (candidate.sex === s.sex) score += 0; // necessary, not evidence
    else continue;
    if (cPhone && cPhone.length >= 9 && normalisePhone(s.guardianPhone) === cPhone) {
      score += 1;
      reasons.push("guardian phone");
    }
    if (score >= minScore) matches.push({ id: s.id, score, reasons });
  }
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Next school-unique student number, e.g. LUN-2027-B0042. Each device has its own
 * one-letter tag so two phones enrolling offline can never issue the same number.
 */
export function nextStudentNumber(
  schoolCode: string,
  year: number,
  deviceTag: string,
  existing: readonly string[],
): string {
  if (!/^[A-Z]$/.test(deviceTag)) throw new Error("deviceTag must be a single capital letter");
  const prefix = `${schoolCode.toUpperCase()}-${year}-${deviceTag}`;
  const max = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((m, n) => Math.max(m, n), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
