import { sites } from "@eu/db";
import { defineEntity } from "@eu/sync";
import { inArray } from "drizzle-orm";
import * as m from "./model";
import * as t from "./db/schema";
import * as mk from "./marks";
import { validatePayment } from "./queries";

/** Phones show the school's name, which lives on the sites table: add it to pulled school records. */
async function withSiteName(tx: any, records: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const ids = [...new Set(records.map((r) => r.siteId as string))];
  if (ids.length === 0) return records;
  const rows = (await tx.select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, ids))) as { id: string; name: string }[];
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return records.map((r) => ({ ...r, name: names.get(r.siteId as string) ?? null }));
}

const config = { read: "school.read", write: "school.configure", configure: "school.configure" } as const;

/**
 * Schools record types and their sync policies (scope doc, "Offline and sync conflict
 * handling"). Register with: entities.register(...schoolsEntities).
 */
export const schoolsEntities = [
  defineEntity({ name: "school.school", stream: "schools", table: t.schoolSchools, schema: m.school, policy: "server_authoritative", actions: config, label: { en: "School", fr: "École" }, decorate: withSiteName }),
  defineEntity({ name: "school.academic_year", stream: "schools", table: t.schoolAcademicYears, schema: m.academicYear, policy: "server_authoritative", actions: config, label: { en: "Academic year", fr: "Année scolaire" } }),
  defineEntity({ name: "school.term", stream: "schools", table: t.schoolTerms, schema: m.term, policy: "server_authoritative", actions: config, label: { en: "Term", fr: "Trimestre" } }),
  defineEntity({ name: "school.classroom", stream: "schools", table: t.schoolClassrooms, schema: m.classroom, policy: "server_authoritative", actions: config, label: { en: "Classroom", fr: "Salle de classe" } }),
  defineEntity({ name: "school.class", stream: "schools", table: t.schoolClasses, schema: m.schoolClass, policy: "server_authoritative", actions: config, label: { en: "Class", fr: "Classe" } }),
  defineEntity({ name: "school.fee_item", stream: "schools", table: t.schoolFeeItems, schema: m.feeItem, policy: "server_authoritative", actions: config, label: { en: "Fee item", fr: "Frais" } }),
  defineEntity({ name: "school.fee_plan", stream: "schools", table: t.schoolFeePlans, schema: m.feePlan, policy: "server_authoritative", actions: config, label: { en: "Recurring fee", fr: "Frais récurrent" } }),
  defineEntity({ name: "school.device_tag", stream: "schools", table: t.schoolDeviceTags, schema: m.deviceTag, policy: "server_authoritative", actions: config, label: { en: "Phone letter", fr: "Lettre du téléphone" } }),
  defineEntity({ name: "school.receipt_book", stream: "schools", table: t.schoolReceiptBooks, schema: m.receiptBook, policy: "server_authoritative", actions: config, label: { en: "Receipt book", fr: "Carnet de reçus" } }),
  defineEntity({ name: "school.student", stream: "schools", table: t.schoolStudents, schema: m.student, policy: "field_merge", actions: { read: "school.read", write: "student.write" }, label: { en: "Student", fr: "Élève" } }),
  defineEntity({ name: "school.enrolment", stream: "schools", table: t.schoolEnrolments, schema: m.enrolment, policy: "field_merge", actions: { read: "school.read", write: "enrolment.write" }, label: { en: "Enrolment", fr: "Inscription" } }),
  defineEntity({ name: "school.exemption", stream: "schools", table: t.schoolExemptions, schema: m.exemption, policy: "append_only", actions: { read: "school.read", write: "school.configure" }, label: { en: "Exemption", fr: "Exonération" } }),
  defineEntity({ name: "school.absence", stream: "schools", table: t.schoolAbsences, schema: m.absence, policy: "lww_history", actions: { read: "school.read", write: "attendance.write" }, label: { en: "Absence", fr: "Absence" } }),
  defineEntity({ name: "school.register", stream: "schools", table: t.schoolRegisters, schema: m.registerTaken, policy: "lww_history", actions: { read: "school.read", write: "attendance.write" }, label: { en: "Register taken", fr: "Appel fait" } }),
  defineEntity({ name: "school.payment", stream: "schools", table: t.schoolPayments, schema: m.payment, policy: "append_only", actions: { read: "school.read", write: "payment.write", void: "payment.void" }, label: { en: "Payment", fr: "Paiement" }, validate: validatePayment }),
  // Marks (notes)
  defineEntity({ name: "school.grading_scheme", stream: "schools", table: t.schoolGradingSchemes, schema: mk.gradingScheme, policy: "server_authoritative", actions: config, label: { en: "Grading scheme", fr: "Barème de notation" } }),
  defineEntity({ name: "school.subject", stream: "schools", table: t.schoolSubjects, schema: mk.subject, policy: "server_authoritative", actions: config, label: { en: "Subject", fr: "Branche" } }),
  defineEntity({ name: "school.mark", stream: "schools", table: t.schoolMarks, schema: mk.mark, policy: "lww_history", actions: { read: "school.read", write: "marks.write" }, label: { en: "Mark", fr: "Note" } }),
];
