/**
 * Shared wording helpers for the schools pages: plurals and server error codes in plain language.
 * Never shows a raw code such as "invalid:amount:too_big" to a user.
 */

export type Tr = (k: string, v?: Record<string, string | number>) => string;

/** "{n} élève" / "{n} élèves": picks `<key>_one` or `<key>_other` with the locale's plural rules (French 0 and 1 are singular). */
export function plural(locale: string, tr: Tr, key: string, n: number, vars: Record<string, string | number> = {}): string {
  const form = new Intl.PluralRules(locale === "fr" ? "fr-FR" : "en-GB").select(n) === "one" ? "one" : "other";
  return tr(`${key}_${form}`, { n, count: n, ...vars });
}

/** Field names in server codes ("invalid:<field>:<code>") mapped to their labels. */
const FIELD_LABELS: Record<string, string> = {
  amount: "fees.amount", receiptNumber: "fees.receiptNumber", paidOn: "fees.paidOn", studentId: "fees.student", feeItemIds: "setup.feeItems",
  firstName: "student.firstName", lastName: "student.lastName", postName: "student.postName", sex: "student.sex", dateOfBirth: "student.dateOfBirth",
  birthYearEstimate: "student.birthYearEstimate", guardianName: "student.guardianName", guardianPhone: "student.guardianPhone", village: "student.village",
  classId: "common.class", enrolledOn: "student.enrolledOn", leftOn: "student.leftOn", status: "common.status",
  label: "setup.yearLabel", startsOn: "setup.startsOn", endsOn: "setup.endsOn", number: "setup.termNumber", academicYearId: "setup.yearLabel",
  name: "common.name", seatsPerShift: "capacity.seatsPerShift", basis: "capacity.basis", commissionedOn: "capacity.commissionedOn",
  decommissionedOn: "capacity.decommissionedOn", evidenceUrl: "capacity.evidenceUrl", level: "common.level", section: "setup.section", shift: "common.shift",
  classroomId: "setup.classroom", termId: "setup.termNumber", levels: "setup.levels", dueOn: "setup.dueOn", firstNumber: "setup.firstNumber",
  lastNumber: "setup.lastNumber", assignedTo: "setup.assignedTo", kind: "setup.kind", value: "setup.value", reason: "setup.reason",
  code: "list.code", tag: "setup.letter", phoneId: "setup.device", shiftsRunning: "setup.shiftsRunning", date: "common.date",
};

export function fieldLabel(field: string, tr: Tr): string {
  const k = FIELD_LABELS[field];
  return k ? tr(k) : field;
}

/**
 * A translated sentence for a code the server (or a web action) returned. Unknown codes get a
 * generic message; receipt and receipt-book codes get a receipt-specific one.
 */
export function errorText(code: string, tr: Tr, extra: Record<string, string> = {}): string {
  const known: Record<string, string> = {
    forbidden: tr("common.forbidden"),
    invalid: tr("common.invalid"),
    not_in_assigned_book: tr("fees.notInBook"),
    already_used: tr("fees.alreadyUsed"),
    letter_taken: tr("setup.letterTaken"),
    already_voided: tr("err.alreadyVoided"),
    voided: tr("err.alreadyVoided"),
    not_found: tr("err.notFound"),
    append_only: tr("err.appendOnly"),
    void_reason_required: tr("err.reasonRequired"),
    no_fields: tr("err.nothingChanged"),
    site_taken: tr("err.siteTaken"),
    code_taken: tr("err.codeTaken"),
    conflict: tr("err.conflict"),
    duplicate_receipt: tr("fees.alreadyUsed"),
    receipt_used: tr("fees.alreadyUsed"),
    duplicate_class: tr("err.duplicateClass"),
    book_overlap: tr("err.bookOverlap"),
    no_book: tr("err.noBookShort"),
    bulk_empty: tr("bulk.empty"),
    bulk_too_many: tr("bulk.tooMany"),
    bulk_columns: tr("bulk.columns"),
  };
  if (known[code]) return known[code];
  if (code.startsWith("dep_")) return tr(`err.dep.${code.slice(4)}`, { n: extra.count ?? "?" });
  const m = /^invalid:([^:]*):?/.exec(code);
  if (m) return m[1] ? tr("err.invalidField", { field: fieldLabel(m[1].split(".")[0]!, tr) }) : tr("common.invalid");
  if (/receipt|book|carnet/i.test(code)) return tr("err.receiptGeneric");
  return tr("err.unknown");
}
