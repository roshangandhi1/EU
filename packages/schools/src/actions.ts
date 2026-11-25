import type { ActionMap, Role } from "@eu/core";

const all: Role[] = ["system_admin", "programme_manager", "stream_lead", "headteacher", "school_admin"];
const managers: Role[] = ["system_admin", "programme_manager", "stream_lead"];

/**
 * Named schools actions and the roles that hold them (scope doc, "Users, roles and permissions").
 *
 * Site roles (headteacher, school_admin) are assigned to one school, so whatever they hold applies
 * to that school only. The headteacher sets up and runs their own school without the programme team:
 * academic years, terms, rooms, classes, fee schedule, exemptions, receipt books and phone letters
 * (school.configure), and may export their own pupils' records. The school administrator does the
 * daily work (pupils, registers, payments) but does not configure.
 */
export const schoolsActions = {
  "school.read": { stream: "schools", roles: all },
  "school.configure": { stream: "schools", roles: [...managers, "headteacher"] },
  "student.write": { stream: "schools", roles: all },
  "enrolment.write": { stream: "schools", roles: all },
  "attendance.write": { stream: "schools", roles: all },
  "payment.write": { stream: "schools", roles: all },
  /** Programme staff entering payments on behalf of a school are not tied to a receipt book of their own. */
  "payment.any_receipt": { stream: "schools", roles: managers },
  "payment.void": { stream: "schools", roles: ["system_admin", "programme_manager", "headteacher"] },
  "conflict.resolve": { stream: "schools", roles: ["system_admin", "programme_manager", "stream_lead", "headteacher"] },
  "export.identifiable": { stream: "schools", roles: [...managers, "headteacher"] },
  "report.aggregate": { stream: "schools", roles: [...all, "viewer"] },
  /** Evidence mode on the reports page (counts only what the server held by a cut-off): for assessors and programme staff. */
  "report.evidence": { stream: "schools", roles: managers },
} satisfies ActionMap;

export type SchoolsAction = keyof typeof schoolsActions;
