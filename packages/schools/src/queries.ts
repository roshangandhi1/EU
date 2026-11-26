import { sites, type Db } from "@eu/db";
import type { Mutation } from "@eu/sync";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type * as mk from "./marks";
import type * as m from "./model";
import * as t from "./db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

/** Turn a DB row into a domain record: timestamps become ISO strings. */
function toRecord<T>(row: Record<string, unknown>): m.Synced<T> {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  return {
    ...(row as object),
    deviceTime: iso(row.deviceTime) as string,
    serverTime: iso(row.serverTime),
    voidedAt: iso(row.voidedAt),
    voidReason: (row.voidReason as string | null) ?? null,
  } as m.Synced<T>;
}

export interface SchoolSite {
  id: string;
  name: string;
  active: boolean;
}

export interface SchoolData {
  site: SchoolSite;
  school: m.Synced<m.School> | null;
  years: m.Synced<m.AcademicYear>[];
  terms: m.Synced<m.Term>[];
  classrooms: m.Synced<m.Classroom>[];
  classes: m.Synced<m.SchoolClass>[];
  students: m.Synced<m.Student>[];
  enrolments: m.Synced<m.Enrolment>[];
  absences: m.Synced<m.Absence>[];
  registers: m.Synced<m.RegisterTaken>[];
  feeItems: m.Synced<m.FeeItem>[];
  feePlans: m.Synced<m.FeePlan>[];
  exemptions: m.Synced<m.Exemption>[];
  receiptBooks: m.Synced<m.ReceiptBook>[];
  deviceTags: m.Synced<m.DeviceTag>[];
  payments: m.Synced<m.Payment>[];
  /** Marks: this school's schemes and subjects plus the programme-wide ones (scope "schools"). */
  gradingSchemes: m.Synced<mk.GradingScheme>[];
  subjects: m.Synced<mk.Subject>[];
  marks: m.Synced<mk.Mark>[];
}

export async function listSchoolSites(db: Db): Promise<SchoolSite[]> {
  const rows = await (db as AnyDb).select().from(sites).where(eq(sites.kind, "school"));
  return rows
    .map((r: any) => ({ id: r.id, name: r.name, active: r.active }))
    .sort((a: SchoolSite, b: SchoolSite) => a.name.localeCompare(b.name));
}

/**
 * Everything one school holds. School data is small (a few thousand pupils), so
 * pages load it whole and the domain rules compute the views. Voided records are
 * included; the rules skip them, and the audit views need them.
 */
export async function loadSchool(db: Db, siteId: string): Promise<SchoolData | null> {
  const d = db as AnyDb;
  const [site] = await d.select().from(sites).where(eq(sites.id, siteId));
  if (!site) return null;
  const all = async <T>(table: any): Promise<m.Synced<T>[]> =>
    ((await d.select().from(table).where(eq(table.scopeId, siteId))) as Record<string, unknown>[]).map((r) => toRecord<T>(r));
  const withProgramme = async <T>(table: any): Promise<m.Synced<T>[]> =>
    ((await d.select().from(table).where(inArray(table.scopeId, [siteId, "schools"]))) as Record<string, unknown>[]).map((r) => toRecord<T>(r));
  const [school] = await all<m.School>(t.schoolSchools);
  return {
    site: { id: site.id, name: site.name, active: site.active },
    school: school ?? null,
    years: await all(t.schoolAcademicYears),
    terms: await all(t.schoolTerms),
    classrooms: await all(t.schoolClassrooms),
    classes: await all(t.schoolClasses),
    students: await all(t.schoolStudents),
    enrolments: await all(t.schoolEnrolments),
    absences: await all(t.schoolAbsences),
    registers: await all(t.schoolRegisters),
    feeItems: await all(t.schoolFeeItems),
    feePlans: await all(t.schoolFeePlans),
    exemptions: await all(t.schoolExemptions),
    receiptBooks: await all(t.schoolReceiptBooks),
    deviceTags: await all(t.schoolDeviceTags),
    payments: await all(t.schoolPayments),
    gradingSchemes: await withProgramme(t.schoolGradingSchemes),
    subjects: await withProgramme(t.schoolSubjects),
    marks: await all(t.schoolMarks),
  };
}

/** Creates the sites row for a new school. Callers must hold sites.manage. */
export async function createSchoolSite(db: Db, s: { id: string; name: string; lat?: number | null; lng?: number | null }) {
  await (db as AnyDb)
    .insert(sites)
    .values({ id: s.id, kind: "school", stream: "schools", name: s.name, lat: s.lat ?? null, lng: s.lng ?? null })
    .onConflictDoNothing();
}

/** The active academic year on a date, if any. */
export function currentYear(data: Pick<SchoolData, "years">, date: string): m.Synced<m.AcademicYear> | undefined {
  return data.years.filter((y) => !y.voidedAt && y.startsOn <= date && y.endsOn >= date).sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0];
}

/** Unvoided records only. */
export const live = <T extends { voidedAt: string | null }>(rows: readonly T[]) => rows.filter((r) => !r.voidedAt);

// ---- Mutations: web writes go through the sync engine, so policies and audit apply. ----

export function insertMutation(
  entity: string,
  scopeId: string,
  fields: Record<string, unknown>,
  ids: { mutationId: string; recordId: string },
  now = new Date(),
): Mutation {
  return { mutationId: ids.mutationId, entity, recordId: ids.recordId, op: "insert", scopeId, fields, deviceTime: now.toISOString() };
}

export function voidMutation(entity: string, scopeId: string, recordId: string, reason: string, mutationId: string, now = new Date()): Mutation {
  return { mutationId, entity, recordId, op: "void", scopeId, voidReason: reason, deviceTime: now.toISOString() };
}

export function updateMutation(
  entity: string,
  scopeId: string,
  recordId: string,
  fields: Record<string, unknown>,
  mutationId: string,
  baseFieldVersions?: Record<string, number>,
  now = new Date(),
): Mutation {
  return { mutationId, entity, recordId, op: "update", scopeId, fields, deviceTime: now.toISOString(), ...(baseFieldVersions ? { baseFieldVersions } : {}) };
}


// ---- Server-side payment rules (SEC-6/DATA-16), run by the sync engine for phone and web alike. ----

/** Reason codes a refused payment comes back with (the fees screens translate them). */
export const PAYMENT_REJECT_REASONS = ["student_not_in_school", "fee_item_not_in_school", "not_in_assigned_book", "already_used"] as const;
export type PaymentRejectReason = (typeof PAYMENT_REJECT_REASONS)[number];

/**
 * Checks a new payment inside the push transaction:
 * - the pupil is a live pupil of this school, and every named fee item is this school's;
 * - the receipt number is in a live receipt book assigned to the author, unless the author holds
 *   payment.any_receipt (programme staff entering on a school's behalf);
 * - no live payment at the school already uses that receipt number.
 */
export async function validatePayment(
  ctx: { tx: unknown; user: { id: string }; can: (action: string) => boolean },
  change: { op: "insert" | "update"; scopeId: string; fields: Record<string, unknown> },
): Promise<PaymentRejectReason | undefined> {
  if (change.op !== "insert") return undefined;
  const tx = ctx.tx as AnyDb;
  const f = change.fields as { studentId: string; receiptNumber: number; feeItemIds: string[] };
  const [st] = await tx
    .select({ id: t.schoolStudents.id })
    .from(t.schoolStudents)
    .where(and(eq(t.schoolStudents.id, f.studentId), eq(t.schoolStudents.scopeId, change.scopeId), isNull(t.schoolStudents.voidedAt)));
  if (!st) return "student_not_in_school";
  if (f.feeItemIds.length > 0) {
    const found = await tx
      .select({ id: t.schoolFeeItems.id })
      .from(t.schoolFeeItems)
      .where(and(inArray(t.schoolFeeItems.id, f.feeItemIds), eq(t.schoolFeeItems.scopeId, change.scopeId)));
    if (new Set(found.map((r: { id: string }) => r.id)).size !== new Set(f.feeItemIds).size) return "fee_item_not_in_school";
  }
  if (!ctx.can("payment.any_receipt")) {
    const books = await tx
      .select({ id: t.schoolReceiptBooks.id })
      .from(t.schoolReceiptBooks)
      .where(
        and(
          eq(t.schoolReceiptBooks.scopeId, change.scopeId),
          eq(t.schoolReceiptBooks.assignedTo, ctx.user.id),
          isNull(t.schoolReceiptBooks.voidedAt),
          lte(t.schoolReceiptBooks.firstNumber, f.receiptNumber),
          gte(t.schoolReceiptBooks.lastNumber, f.receiptNumber),
        ),
      );
    if (books.length === 0) return "not_in_assigned_book";
  }
  const [dupe] = await tx
    .select({ id: t.schoolPayments.id })
    .from(t.schoolPayments)
    .where(and(eq(t.schoolPayments.scopeId, change.scopeId), eq(t.schoolPayments.receiptNumber, f.receiptNumber), isNull(t.schoolPayments.voidedAt)))
    .limit(1);
  if (dupe) return "already_used";
  return undefined;
}
