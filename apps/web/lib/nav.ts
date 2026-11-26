import type { Principal } from "./auth";
import { permissions } from "./registry";

export type StreamKey = "schools" | "boreholes" | "bamboo" | "miombo";

/** Does the user hold any role in this stream (global, stream-wide or at one of its sites)? */
export function inStream(me: Principal, stream: StreamKey): boolean {
  return me.user.assignments.some(
    (a) => a.scope.type === "global" || (a.scope.type === "stream" && a.scope.stream === stream) || (a.scope.type === "site" && a.scope.stream === stream),
  );
}

export interface NavAccess {
  dashboard: boolean;
  opsMap: boolean;
  streams: Record<StreamKey, boolean>;
  users: boolean;
  phones: boolean;
  cutoffs: boolean;
  periods: boolean;
  templates: boolean;
  demo: boolean;
}

/**
 * Can the user read at least one school? `school.read` is held per school for headteachers and
 * school administrators, so this checks the roles behind it rather than one site.
 */
export function readsSchools(me: Principal): boolean {
  const roles = permissions.get("school.read")?.roles ?? [];
  return me.user.assignments.some(
    (a) => roles.includes(a.role) && (a.scope.type === "global" || ("stream" in a.scope && a.scope.stream === "schools")),
  );
}

export function navAccess(me: Principal): NavAccess {
  const P = { stream: "platform" as const };
  const streams = {
    schools: readsSchools(me),
    boreholes: inStream(me, "boreholes") && permissions.can(me.user, "boreholes.read", { stream: "boreholes" }),
    bamboo: inStream(me, "bamboo") && permissions.can(me.user, "bamboo.plot.read", { stream: "bamboo" }),
    miombo: inStream(me, "miombo") && permissions.can(me.user, "miombo.plot.read", { stream: "miombo" }),
  };
  return {
    dashboard: permissions.can(me.user, "dashboard.read", P),
    opsMap: streams.boreholes || streams.bamboo || streams.miombo || permissions.can(me.user, "dashboard.read", P),
    streams,
    users: permissions.can(me.user, "users.manage", P),
    phones: permissions.can(me.user, "devices.manage", P),
    cutoffs: permissions.can(me.user, "evidence.manage", P),
    periods: permissions.can(me.user, "periods.manage", P),
    templates: permissions.can(me.user, "boreholes.template.write", { stream: "boreholes" }),
    demo: permissions.can(me.user, "sites.manage", P),
  };
}
