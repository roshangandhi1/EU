import type { z } from "zod";
import * as m from "./model";

export type SyncPolicy = "append_only" | "field_merge" | "lww_history" | "server_authoritative";

export interface SchoolsEntitySpec {
  name: `school.${string}`;
  schema: z.ZodType;
  policy: SyncPolicy;
  label: { en: string; fr: string };
}

/**
 * Sync policy per schools record type (scope doc, "Offline and sync conflict
 * handling"). Wrapped with defineEntity() from @eu/sync once the platform lands.
 */
export const schoolsEntitySpecs = [
  { name: "school.school", schema: m.school, policy: "server_authoritative", label: { en: "School", fr: "École" } },
  { name: "school.academic_year", schema: m.academicYear, policy: "server_authoritative", label: { en: "Academic year", fr: "Année scolaire" } },
  { name: "school.term", schema: m.term, policy: "server_authoritative", label: { en: "Term", fr: "Trimestre" } },
  { name: "school.classroom", schema: m.classroom, policy: "server_authoritative", label: { en: "Classroom", fr: "Salle de classe" } },
  { name: "school.class", schema: m.schoolClass, policy: "server_authoritative", label: { en: "Class", fr: "Classe" } },
  { name: "school.fee_item", schema: m.feeItem, policy: "server_authoritative", label: { en: "Fee item", fr: "Frais" } },
  { name: "school.receipt_book", schema: m.receiptBook, policy: "server_authoritative", label: { en: "Receipt book", fr: "Carnet de reçus" } },
  { name: "school.student", schema: m.student, policy: "field_merge", label: { en: "Student", fr: "Élève" } },
  { name: "school.enrolment", schema: m.enrolment, policy: "field_merge", label: { en: "Enrolment", fr: "Inscription" } },
  { name: "school.exemption", schema: m.exemption, policy: "append_only", label: { en: "Exemption", fr: "Exonération" } },
  { name: "school.absence", schema: m.absence, policy: "lww_history", label: { en: "Absence", fr: "Absence" } },
  { name: "school.register_taken", schema: m.registerTaken, policy: "lww_history", label: { en: "Register taken", fr: "Appel fait" } },
  { name: "school.payment", schema: m.payment, policy: "append_only", label: { en: "Payment", fr: "Paiement" } },
] as const satisfies readonly SchoolsEntitySpec[];
