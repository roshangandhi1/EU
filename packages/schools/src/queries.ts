import { sites, type Db } from "@eu/db";
import type { Mutation } from "@eu/sync";
import { eq } from "drizzle-orm";
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
  exemptions: m.Synced<m.Exemption>[];
  receiptBooks: m.Synced<m.ReceiptBook>[];
  deviceTags: m.Synced<m.DeviceTag>[];
  payments: m.Synced<m.Payment>[];
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
    exemptions: await all(t.schoolExemptions),
    receiptBooks: await all(t.schoolReceiptBooks),
    deviceTags: await all(t.schoolDeviceTags),
    payments: await all(t.schoolPayments),
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

