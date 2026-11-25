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
});
export type School = z.infer<typeof school>;

/** Primary levels: 1ère to 6ème année. */
export const level = z.number().int().min(1).max(6);

export const academicYear = z.object({
  label: z.string(), // e.g. "2026-2027"
  startsOn: isoDate,
  endsOn: isoDate,
});
export type AcademicYear = z.infer<typeof academicYear>;

export const term = z.object({
  academicYearId: id,
  number: z.number().int().min(1).max(3),
  startsOn: isoDate,
  endsOn: isoDate,
});
export type Term = z.infer<typeof term>;

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
});
export type FeeItem = z.infer<typeof feeItem>;

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
  receiptNumber: z.number().int().positive().max(MAX_INT),
  /** Fee items this payment is allocated to, in order; any remainder is credit. */
  feeItemIds: z.array(id),
});
export type Payment = z.infer<typeof payment>;

// Payments are never edited or deleted. A mistake is voided through the
// platform's voided_at / void_reason columns, which is the only mutation the
// append_only policy allows.
