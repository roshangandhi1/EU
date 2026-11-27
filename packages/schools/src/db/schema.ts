import { syncColumns } from "@eu/db";
import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * Schools tables. Every table is synced and spreads syncColumns(); scope_id is the
 * school's site id. Calendar dates are Postgres `date` in string mode (YYYY-MM-DD),
 * matching the zod wire schemas in ../model.ts. Money is whole Congolese francs.
 */

/** School attributes, keyed by the platform sites row. */
export const schoolSchools = pgTable("school_schools", {
  ...syncColumns(),
  siteId: text("site_id").notNull().unique(),
  code: text("code").notNull(),
  locale: text("locale").notNull().default("fr"),
  shiftsRunning: jsonb("shifts_running").$type<string[]>().notNull(),
  /** Whether every payment must carry the number of a paper receipt from the school's books. */
  paperReceiptRequired: boolean("paper_receipt_required").notNull().default(true),
  ministryCode: text("ministry_code").notNull().default(""),
  province: text("province").notNull().default(""),
  city: text("city").notNull().default(""),
  commune: text("commune").notNull().default(""),
  /** The school's levels with names and trimesters/semesters; null = the DRC default list. */
  levels: jsonb("levels").$type<{ level: number; name: string; semesters: boolean }[]>(),
});

export const schoolAcademicYears = pgTable("school_academic_years", {
  ...syncColumns(),
  label: text("label").notNull(),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  endsOn: date("ends_on", { mode: "string" }).notNull(),
});

export const schoolTerms = pgTable("school_terms", {
  ...syncColumns(),
  academicYearId: uuid("academic_year_id").notNull(),
  kind: text("kind").notNull().default("trimester"), // trimester | semester
  number: integer("number").notNull(),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  endsOn: date("ends_on", { mode: "string" }).notNull(),
});

/** Capacity register: the basis for indicator 3.2.2. */
export const schoolClassrooms = pgTable("school_classrooms", {
  ...syncColumns(),
  name: text("name").notNull(),
  seatsPerShift: integer("seats_per_shift").notNull(),
  basis: text("basis").notNull(), // baseline | new
  commissionedOn: date("commissioned_on", { mode: "string" }).notNull(),
  decommissionedOn: date("decommissioned_on", { mode: "string" }),
  evidenceUrl: text("evidence_url"),
});

export const schoolClasses = pgTable("school_classes", {
  ...syncColumns(),
  academicYearId: uuid("academic_year_id").notNull(),
  level: integer("level").notNull(),
  section: text("section").notNull().default("A"),
  shift: text("shift").notNull(),
  classroomId: uuid("classroom_id"),
});

export const schoolStudents = pgTable(
  "school_students",
  {
    ...syncColumns(),
    studentNumber: text("student_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    postName: text("post_name").notNull().default(""),
    sex: text("sex").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    birthYearEstimate: integer("birth_year_estimate"),
    guardianName: text("guardian_name").notNull().default(""),
    guardianPhone: text("guardian_phone").notNull().default(""),
    village: text("village").notNull().default(""),
    idNumber: text("id_number").notNull().default(""),
    permNumber: text("perm_number").notNull().default(""),
    birthPlace: text("birth_place").notNull().default(""),
  },
  (t) => [index("school_students_scope").on(t.scopeId)],
);

export const schoolEnrolments = pgTable(
  "school_enrolments",
  {
    ...syncColumns(),
    studentId: uuid("student_id").notNull(),
    classId: uuid("class_id").notNull(),
    academicYearId: uuid("academic_year_id").notNull(),
    enrolledOn: date("enrolled_on", { mode: "string" }).notNull(),
    leftOn: date("left_on", { mode: "string" }),
    status: text("status").notNull(),
  },
  (t) => [index("school_enrolments_class").on(t.classId)],
);

export const schoolAbsences = pgTable(
  "school_absences",
  {
    ...syncColumns(),
    studentId: uuid("student_id").notNull(),
    classId: uuid("class_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    reason: text("reason").notNull().default("unknown"),
  },
  (t) => [index("school_absences_class_date").on(t.classId, t.date)],
);

export const schoolRegisters = pgTable(
  "school_registers",
  {
    ...syncColumns(),
    classId: uuid("class_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
  },
  (t) => [index("school_registers_class_date").on(t.classId, t.date)],
);

export const schoolFeeItems = pgTable("school_fee_items", {
  ...syncColumns(),
  academicYearId: uuid("academic_year_id").notNull(),
  termId: uuid("term_id"),
  name: text("name").notNull(),
  levels: jsonb("levels").$type<number[]>().notNull(),
  amount: integer("amount_cdf").notNull(),
  dueOn: date("due_on", { mode: "string" }).notNull(),
  /** The fee plan (recurring fee) that generated this item. */
  planId: uuid("plan_id"),
  /** Last day of the period charged; pupils enrolling after it are not charged. */
  periodEndsOn: date("period_ends_on", { mode: "string" }),
});

/** Recurring fees: templates that generate one fee item per month, trimester or year. */
export const schoolFeePlans = pgTable("school_fee_plans", {
  ...syncColumns(),
  academicYearId: uuid("academic_year_id").notNull(),
  name: text("name").notNull(),
  levels: jsonb("levels").$type<number[]>().notNull(),
  amount: integer("amount_cdf").notNull(),
  frequency: text("frequency").notNull(), // one_time | monthly | per_term | per_year
  dueDay: integer("due_day"),
  dueOn: date("due_on", { mode: "string" }),
  startsOn: date("starts_on", { mode: "string" }).notNull(),
  endsOn: date("ends_on", { mode: "string" }).notNull(),
});

export const schoolExemptions = pgTable("school_exemptions", {
  ...syncColumns(),
  studentId: uuid("student_id").notNull(),
  feeItemId: uuid("fee_item_id"),
  kind: text("kind").notNull(), // full | percent | fixed
  value: integer("value").notNull(),
  reason: text("reason").notNull(),
});

export const schoolReceiptBooks = pgTable("school_receipt_books", {
  ...syncColumns(),
  firstNumber: integer("first_number").notNull(),
  lastNumber: integer("last_number").notNull(),
  assignedTo: text("assigned_to").notNull(),
});

export const schoolPayments = pgTable(
  "school_payments",
  {
    ...syncColumns(),
    studentId: uuid("student_id").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    amount: integer("amount_cdf").notNull(),
    /** Paper receipt number (optional where the school does not require paper receipts). */
    receiptNumber: integer("receipt_number"),
    /** System receipt number, e.g. KIA-W-0042: school code, the device's letter, a running count. */
    receiptCode: text("receipt_code"),
    feeItemIds: jsonb("fee_item_ids").$type<string[]>().notNull().default([]),
  },
  (t) => [index("school_payments_student").on(t.studentId), index("school_payments_receipt").on(t.scopeId, t.receiptNumber), index("school_payments_code").on(t.scopeId, t.receiptCode)],
);

/** Per-school letter for each phone's offline student numbers. */
export const schoolDeviceTags = pgTable("school_device_tags", {
  ...syncColumns(),
  phoneId: text("phone_id").notNull(),
  tag: text("tag").notNull(),
});

// ---- Marks (notes). Kept together at the end of the file to ease merges. ----

/**
 * Grading scheme: how the year is cut into periods and exams, the pass mark and the mention
 * bands. scope_id is a school's site id, or "schools" for the programme-wide default; with
 * neither, the built-in DRC primary scheme applies (see ../marks.ts).
 */
export const schoolGradingSchemes = pgTable("school_grading_schemes", {
  ...syncColumns(),
  name: text("name").notNull(),
  /** Class levels this scheme grades; empty = the scope's fallback for every other level. */
  levels: jsonb("levels").$type<number[]>().notNull().default([]),
  /** One entry per trimester: how many periods, and whether it ends with an exam. */
  terms: jsonb("terms").$type<{ periods: number; exam: boolean }[]>().notNull(),
  /** Exam maximum = period maximum × this factor. */
  examFactor: doublePrecision("exam_factor").notNull().default(2),
  passPercent: integer("pass_percent").notNull().default(50),
  mentions: jsonb("mentions").$type<{ minPercent: number; en: string; fr: string }[]>().notNull().default([]),
  /** Report card domains, in order; subjects name one by key. */
  domains: jsonb("domains").$type<{ key: string; en: string; fr: string; subtotal: "branch" | "domain" }[]>().notNull().default([]),
  /** Letter grades for Application and Conduite, best first. */
  letters: jsonb("letters").$type<string[]>().notNull().default(["E", "TB", "B", "AB", "M"]),
});

/** Subjects ("branches") per level, with the maximum points for one period. */
export const schoolSubjects = pgTable(
  "school_subjects",
  {
    ...syncColumns(),
    level: integer("level").notNull(),
    /** Stable key that marks refer to, so renaming a subject keeps its marks. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    maxPoints: integer("max_points").notNull(),
    position: integer("position").notNull().default(0),
    /** Report card grouping: domain key (from the scheme) and branch heading, e.g. "Français". */
    domain: text("domain").notNull().default(""),
    branch: text("branch").notNull().default(""),
    /** Optional per pupil (Religion): a pupil with no mark in a period is not graded on it. */
    optional: boolean("optional").notNull().default(false),
  },
  (t) => [index("school_subjects_scope_level").on(t.scopeId, t.level)],
);

/** One pupil's mark in one subject for one period or exam (P1..P6, Ex1..Ex3). */
export const schoolMarks = pgTable(
  "school_marks",
  {
    ...syncColumns(),
    studentId: uuid("student_id").notNull(),
    classId: uuid("class_id").notNull(),
    subject: text("subject").notNull(),
    period: text("period").notNull(),
    /** Points, in steps of 0.5; null when the pupil was absent. */
    score: doublePrecision("score"),
    absent: boolean("absent").notNull().default(false),
    /** Letter grade (Application, Conduite), from the scheme's letters. */
    letter: text("letter"),
  },
  (t) => [index("school_marks_class_period").on(t.classId, t.period)],
);
