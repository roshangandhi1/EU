import { z } from "zod";

/**
 * Schools domain model: the business fields of each record type, as zod schemas.
 * Sync columns (id, scope_id, created_by, device_id, device_time, server_time,
 * version, voided_at, void_reason) are added by the platform's syncColumns();
 * the logic in this package only relies on the subset typed in SyncMeta.
 */

export const id = z.uuid();
export const isoDate = z.iso.date(); // YYYY-MM-DD
export const isoDateTime = z.iso.datetime({ offset: true });
/** Largest amount or count accepted anywhere: fits a Postgres integer (int4) with room to spare. */
export const MAX_INT = 2_000_000_000;
/** Whole Congolese francs. Integers only: no fractional amounts; at most 2 000 000 000 FC. */
export const cdf = z.number().int().nonnegative().max(MAX_INT);

export interface SyncMeta {
  id: string;
  /** The school's site id. */
  scopeId: string;
  /** Device clock when the record was captured (ISO datetime). */
  deviceTime: string;
  /** Server clock when sync delivered it; null while still on the device. */
  serverTime: string | null;
  voidedAt: string | null;
  voidReason?: string | null;
}

/** A synced record: business fields plus sync metadata. */
export type Synced<T> = T & SyncMeta;

export const shift = z.enum(["morning", "afternoon"]);
export type Shift = z.infer<typeof shift>;

export const sex = z.enum(["F", "M"]);
export type Sex = z.infer<typeof sex>;

export const locale = z.enum(["en", "fr"]);

/** School attributes, keyed by the platform sites row (kind 'school'). */
export const school = z.object({
  siteId: z.string().min(1),
  code: z.string().min(2).max(12),
  locale,
  /** Shifts this school actually runs. Places are only counted for shifts listed here. */
  shiftsRunning: z.array(shift).min(1),
  /** Every payment must carry a paper receipt number from the school's books (default yes). */
  paperReceiptRequired: z.boolean().optional(),
  /** Report card header (bulletin): the ministry's school code and where the school is. */
  ministryCode: z.string().max(20).optional(),
  province: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  commune: z.string().max(80).optional(),
  /** The school's levels (classes, fees, marks), set by the admin. Null or empty = the DRC default list. */
  levels: z.array(z.lazy(() => levelDef)).max(20).nullable().optional(),
});
export type School = z.infer<typeof school>;

/** Level numbers: primary 1-6, 7e-8e (basic education, CTEB), then 9 and up (humanités, pédagogie...). */
export const level = z.number().int().min(1).max(20);

/**
 * One level a school runs: its number (1re année = 1, 7e = 7, 1re humanités = 9...), its name as
 * shown on screens, and whether its year runs on two semesters (secondary) or three trimesters.
 */
export const levelDef = z.object({
  level,
  name: z.string().min(1).max(40),
  semesters: z.boolean(),
});
export type LevelDef = z.infer<typeof levelDef>;

export const academicYear = z.object({
  label: z.string(), // e.g. "2026-2027"
  startsOn: isoDate,
  endsOn: isoDate,
});
export type AcademicYear = z.infer<typeof academicYear>;

/** Primary classes run on trimesters, secondary on semesters; a year can hold both sets of dates. */
export const termKind = z.enum(["trimester", "semester"]);
export type TermKind = z.infer<typeof termKind>;

export const term = z.object({
  academicYearId: id,
  kind: termKind.default("trimester"),
  number: z.number().int().min(1).max(3),
  startsOn: isoDate,
  endsOn: isoDate,
});
/** Older records and callers may leave out kind (trimester). */
export type Term = z.input<typeof term>;

export const schoolClass = z.object({
  academicYearId: id,
  level,
  section: z.string().max(4).default("A"),
  shift,
  classroomId: id.nullable(),
});
export type SchoolClass = z.infer<typeof schoolClass>;

/**
 * Capacity register: the evidential basis for indicator 3.2.2 (new student places).
 * Places are counted per shift, so a classroom with 40 seats used across two
 * running shifts provides 80 places.
 */
export const classroom = z.object({
  name: z.string().min(1),
  seatsPerShift: z.number().int().positive().max(1000),
  basis: z.enum(["baseline", "new"]),
  commissionedOn: isoDate,
  decommissionedOn: isoDate.nullable(),
  /** A web link to the evidence (http or https only). */
  evidenceUrl: z.url({ protocol: /^https?$/ }).nullable(),
});
export type Classroom = z.infer<typeof classroom>;

export const student = z.object({
  studentNumber: z.string().min(1), // school-unique, generated
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  postName: z.string().default(""), // DRC "post-nom"
  sex,
  dateOfBirth: isoDate.nullable(),
  birthYearEstimate: z.number().int().min(1990).max(2100).nullable(),
  guardianName: z.string().default(""),
  guardianPhone: z.string().default(""),
  village: z.string().default(""),
  /** Report card (bulletin) fields: national pupil ID ("N° ID"), permanent number ("N° perm.") and place of birth. */
  idNumber: z.string().max(30).default(""),
  permNumber: z.string().max(30).default(""),
  birthPlace: z.string().max(80).default(""),
});
export type Student = z.infer<typeof student>;

export const enrolmentStatus = z.enum(["active", "transferred", "dropped_out", "completed"]);

export const enrolment = z.object({
  studentId: id,
  classId: id,
  academicYearId: id,
  enrolledOn: isoDate,
  leftOn: isoDate.nullable(),
  status: enrolmentStatus,
});
export type Enrolment = z.infer<typeof enrolment>;

export const absenceReason = z.enum(["sick", "fees", "work", "family", "unknown"]);

/**
 * Attendance is recorded by exception: one record per absent student per day.
 * A class-day with no absences is recorded with a register-taken marker so that
 * "everyone present" is distinguishable from "register not entered".
 */
export const absence = z.object({
  studentId: id,
  classId: id,
  date: isoDate,
  reason: absenceReason.default("unknown"),
});
export type Absence = z.infer<typeof absence>;

export const registerTaken = z.object({
  classId: id,
  date: isoDate,
});
export type RegisterTaken = z.infer<typeof registerTaken>;

export const feeItem = z.object({
  academicYearId: id,
  termId: id.nullable(), // null = whole-year item
  name: z.string().min(1),
  levels: z.array(level).min(1),
  amount: cdf,
  dueOn: isoDate,
  /** The recurring fee (fee plan) that generated this item, if any. */
  planId: id.nullable().default(null),
  /**
   * Last day of the period the item charges for (a month, a trimester, the year). A pupil who
   * enrols after that day is not charged for it. Null = always charged (e.g. a one-off fee).
   */
  periodEndsOn: isoDate.nullable().default(null),
});
/** Older records and callers may leave out planId and periodEndsOn (both default to null). */
export type FeeItem = z.input<typeof feeItem>;

export const feeFrequency = z.enum(["one_time", "monthly", "per_term", "per_year"]);
export type FeeFrequency = z.infer<typeof feeFrequency>;

/**
 * A recurring fee ("fee plan"): a template that generates one ordinary fee item per period
 * (month, trimester or year), so balances and payments are tracked per period with the same rules
 * as any fee item. Editing the plan updates its items in place.
 */
export const feePlan = z.object({
  academicYearId: id,
  name: z.string().min(1).max(60),
  levels: z.array(level).min(1),
  amount: cdf.refine((n) => n > 0),
  frequency: feeFrequency,
  /** Monthly and per trimester: day of the period's first month the fee is due (1-28). */
  dueDay: z.number().int().min(1).max(28).nullable(),
  /** One-time and per year: the due date. */
  dueOn: isoDate.nullable(),
  /** First and last day of the span the plan covers (periods starting inside it are charged). */
  startsOn: isoDate,
  endsOn: isoDate,
});
export type FeePlan = z.infer<typeof feePlan>;

export const exemption = z.object({
  studentId: id,
  feeItemId: id.nullable(), // null = applies to every item
  kind: z.enum(["full", "percent", "fixed"]),
  value: z.number().int().nonnegative().max(MAX_INT), // percent 0-100, or CDF for fixed
  reason: z.string().min(1),
});
export type Exemption = z.infer<typeof exemption>;

export const receiptBook = z.object({
  firstNumber: z.number().int().positive().max(MAX_INT),
  lastNumber: z.number().int().positive().max(MAX_INT),
  assignedTo: id,
});
export type ReceiptBook = z.infer<typeof receiptBook>;

/**
 * The letter a phone (or "W" for the web) puts in student numbers it issues offline.
 * Assigned per school on the web, so two phones can never issue the same number.
 */
export const deviceTag = z.object({
  phoneId: z.string().min(1), // platform devices.id of the phone
  tag: z.string().regex(/^[A-VX-Z]$/), // W is reserved for the web
});
export type DeviceTag = z.infer<typeof deviceTag>;

/** The letter assigned to a device at a school, if any. */
export function tagForDevice(tags: readonly (DeviceTag & { voidedAt?: string | null })[], deviceId: string): string | null {
  return tags.find((t) => !t.voidedAt && t.phoneId === deviceId)?.tag ?? null;
}

export const payment = z.object({
  studentId: id,
  paidOn: isoDate,
  amount: cdf.positive(),
  /** Number printed on the paper receipt. Optional where the school does not require paper receipts. */
  receiptNumber: z.number().int().positive().max(MAX_INT).nullable(),
  /**
   * System receipt number, generated on every payment: school code, the letter of the phone (W on
   * the web), a running count, e.g. KIA-W-0042. Unique per school even when phones are offline.
   * Absent only on payments from older phone apps.
   */
  receiptCode: z.string().min(3).max(40).nullable().optional(),
  /** Fee items this payment is allocated to, in order; any remainder is credit. */
  feeItemIds: z.array(id),
});
export type Payment = z.infer<typeof payment>;

// Payments are never edited or deleted. A mistake is voided through the
// platform's voided_at / void_reason columns, which is the only mutation the
// append_only policy allows.
