import type { Role, RoleAssignment } from "@eu/core";

export type ModuleKey = "schools" | "boreholes" | "bamboo" | "miombo";
export const MODULES: readonly ModuleKey[] = ["schools", "boreholes", "bamboo", "miombo"];

const EVERY_STREAM: readonly Role[] = ["system_admin", "programme_manager", "viewer"];
const SCHOOL_ONLY: readonly Role[] = ["headteacher", "school_admin"];

/**
 * Which modules a person's roles point to. A global admin, manager or viewer sees every module;
 * a stream lead or field officer sees their stream; a school role sees schools. The server still
 * decides what records each person may read: this only chooses which tiles to show.
 */
export function modulesFor(assignments: readonly RoleAssignment[] | undefined): Set<ModuleKey> {
  const out = new Set<ModuleKey>();
  for (const a of assignments ?? []) {
    if (a.scope.type === "global") {
      if (EVERY_STREAM.includes(a.role)) MODULES.forEach((m) => out.add(m));
      else if (SCHOOL_ONLY.includes(a.role)) out.add("schools");
      continue;
    }
    const stream = a.scope.type === "stream" ? a.scope.stream : (a.scope.stream ?? (SCHOOL_ONLY.includes(a.role) ? "schools" : undefined));
    if (stream && (MODULES as readonly string[]).includes(stream)) out.add(stream as ModuleKey);
  }
  return out;
}

const ROLE_ORDER: readonly Role[] = ["system_admin", "programme_manager", "stream_lead", "headteacher", "school_admin", "field_officer", "viewer"];
const ROLE_KEY: Record<Role, string> = {
  system_admin: "app.roleAdmin",
  programme_manager: "app.roleManager",
  stream_lead: "app.roleLead",
  field_officer: "app.roleField",
  viewer: "app.roleViewer",
  headteacher: "app.roleHead",
  school_admin: "app.roleSchoolAdmin",
};

/** The person's most senior role, as an i18n key, for the home header. */
export function mainRoleKey(assignments: readonly RoleAssignment[] | undefined): string | null {
  const roles = new Set((assignments ?? []).map((a) => a.role));
  const r = ROLE_ORDER.find((x) => roles.has(x));
  return r ? ROLE_KEY[r] : null;
}

/** May load demo data (the server checks again). */
export function canLoadDemo(assignments: readonly RoleAssignment[] | undefined): boolean {
  return (assignments ?? []).some((a) => (a.role === "system_admin" || a.role === "programme_manager") && a.scope.type === "global");
}
