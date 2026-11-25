import type { ActionMap, Role } from "@eu/core";

const all: Role[] = ["system_admin", "programme_manager", "stream_lead", "headteacher", "school_admin"];
const managers: Role[] = ["system_admin", "programme_manager", "stream_lead"];

/** Named schools actions and the roles that hold them (scope doc, "Users, roles and permissions"). */
export const schoolsActions = {
  "school.read": { stream: "schools", roles: all },
  "school.configure": { stream: "schools", roles: managers },
  "student.write": { stream: "schools", roles: all },
  "enrolment.write": { stream: "schools", roles: all },
  "attendance.write": { stream: "schools", roles: all },
  "payment.write": { stream: "schools", roles: all },
  "payment.void": { stream: "schools", roles: ["system_admin", "programme_manager", "headteacher"] },
  "conflict.resolve": { stream: "schools", roles: ["system_admin", "programme_manager", "stream_lead", "headteacher"] },
  "export.identifiable": { stream: "schools", roles: managers },
  "report.aggregate": { stream: "schools", roles: [...all, "viewer"] },
} satisfies ActionMap;

export type SchoolsAction = keyof typeof schoolsActions;
