import type { SchoolData } from "@eu/schools";

/** Kinds of "still in use" refusal; each has a message err.dep.<kind> naming the count. */
export type DependantKind = "class" | "year" | "term" | "fee" | "book" | "room";

/**
 * What still depends on a setup record, so removing it would orphan pupils, fees or payments.
 * Null when it can go. Voided records and pupils who have left do not count.
 */
export function dependants(d: SchoolData, entity: string, id: string, date: string): { kind: DependantKind; count: number } | null {
  const live = <T extends { voidedAt: string | null }>(rows: readonly T[]) => rows.filter((r) => !r.voidedAt);
  const hit = (kind: DependantKind, count: number) => (count > 0 ? { kind, count } : null);
  switch (entity) {
    case "school.class":
      return hit("class", live(d.enrolments).filter((e) => e.classId === id && (e.leftOn === null || e.leftOn > date)).length);
    case "school.academic_year":
      return hit("year", live(d.classes).filter((c) => c.academicYearId === id).length + live(d.terms).filter((t) => t.academicYearId === id).length
        + live(d.feeItems).filter((f) => f.academicYearId === id).length + live(d.feePlans ?? []).filter((f) => f.academicYearId === id).length);
    case "school.term":
      return hit("term", live(d.feeItems).filter((f) => f.termId === id).length);
    case "school.fee_item":
      return hit("fee", live(d.payments).filter((p) => p.feeItemIds.includes(id)).length + live(d.exemptions).filter((x) => x.feeItemId === id).length);
    case "school.fee_plan": {
      // A recurring fee can go while none of its periods has a payment or exemption; its items go with it.
      const items = new Set(live(d.feeItems).filter((f) => f.planId === id).map((f) => f.id));
      return hit("fee", live(d.payments).filter((p) => p.feeItemIds.some((f) => items.has(f))).length + live(d.exemptions).filter((x) => x.feeItemId !== null && items.has(x.feeItemId)).length);
    }
    case "school.receipt_book": {
      const b = d.receiptBooks.find((x) => x.id === id);
      return b ? hit("book", live(d.payments).filter((p) => p.receiptNumber >= b.firstNumber && p.receiptNumber <= b.lastNumber).length) : null;
    }
    case "school.classroom":
      return hit("room", live(d.classes).filter((c) => c.classroomId === id).length);
    default:
      return null;
  }
}
