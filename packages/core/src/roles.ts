export const ROLES = [
  "system_admin",
  "programme_manager",
  "stream_lead",
  "field_officer",
  "viewer",
  "headteacher",
  "school_admin",
] as const;
export type Role = (typeof ROLES)[number];

export const STREAMS = ["platform", "schools", "bamboo", "miombo", "boreholes"] as const;
export type Stream = (typeof STREAMS)[number];

/** Where a role assignment applies. */
export type Scope =
  | { type: "global" }
  | { type: "stream"; stream: Stream }
  /** `stream` is the site's own stream; it lets a site role read that stream's stream-wide records. */
  | { type: "site"; siteId: string; stream?: Stream };

export interface RoleAssignment {
  role: Role;
  scope: Scope;
}

export interface UserContext {
  id: string;
  assignments: RoleAssignment[];
}

/**
 * A named action (e.g. "payment.void") and the roles that hold it.
 * `stream` says which stream a stream-scoped role must lead to hold it.
 */
export interface ActionDef {
  stream: Stream;
  roles: readonly Role[];
}

export type ActionMap = Record<string, ActionDef>;

/**
 * Where the action is being performed: a site and the stream that site belongs to.
 * `streamWide` marks a record scoped to the whole stream (scope_id = the stream name), such as
 * templates and settings. Site roles in that stream can read them; only stream or global roles
 * can write them. Callers set it only for read checks.
 */
export interface ActionTarget {
  stream: Stream;
  siteId?: string | null;
  streamWide?: boolean;
}

export class PermissionRegistry {
  private actions = new Map<string, ActionDef>();

  register(map: ActionMap): this {
    for (const [name, def] of Object.entries(map)) {
      if (this.actions.has(name)) throw new Error(`Action already registered: ${name}`);
      this.actions.set(name, def);
    }
    return this;
  }

  get(name: string): ActionDef | undefined {
    return this.actions.get(name);
  }

  names(): string[] {
    return [...this.actions.keys()];
  }

  /**
   * Does `user` hold `action` at `target`?
   * - global assignments cover every site and stream;
   * - stream assignments cover every site in that stream, if the action's stream matches;
   * - site assignments cover only that site, plus reads of stream-wide records in the site's stream,
   *   and only for actions of the site's own stream (a borehole site role never holds a bamboo action).
   * Unknown actions are always denied.
   */
  can(user: UserContext, action: string, target: ActionTarget): boolean {
    const def = this.actions.get(action);
    if (!def) return false;
    return user.assignments.some((a) => {
      if (!def.roles.includes(a.role)) return false;
      switch (a.scope.type) {
        case "global":
          return true;
        case "stream":
          return a.scope.stream === def.stream && a.scope.stream === target.stream;
        case "site":
          // A site role only counts for actions of its own site's stream (or platform actions).
          if (a.scope.stream && a.scope.stream !== target.stream) return false;
          if (def.stream !== "platform" && def.stream !== target.stream) return false;
          if (target.streamWide) return a.scope.stream === target.stream && def.stream === target.stream;
          return target.siteId != null && a.scope.siteId === target.siteId;
      }
    });
  }

  /** Sites (or "all") at which the user holds `action`; used to filter sync pulls. */
  readableScope(user: UserContext, action: string, stream: Stream): { all: true } | { all: false; siteIds: Set<string> } {
    const def = this.actions.get(action);
    if (!def) return { all: false, siteIds: new Set() };
    const siteIds = new Set<string>();
    for (const a of user.assignments) {
      if (!def.roles.includes(a.role)) continue;
      if (a.scope.type === "global") return { all: true };
      if (a.scope.type === "stream" && a.scope.stream === def.stream && a.scope.stream === stream) return { all: true };
      if (a.scope.type === "site") siteIds.add(a.scope.siteId);
    }
    return { all: false, siteIds };
  }
}

/** Actions owned by the platform itself. */
export const platformActions: ActionMap = {
  "platform.admin": { stream: "platform", roles: ["system_admin"] },
  "users.manage": { stream: "platform", roles: ["system_admin", "programme_manager"] },
  "sites.read": {
    stream: "platform",
    roles: ["system_admin", "programme_manager", "stream_lead", "field_officer", "viewer", "headteacher", "school_admin"],
  },
  "sites.manage": { stream: "platform", roles: ["system_admin", "programme_manager"] },
  "devices.manage": { stream: "platform", roles: ["system_admin", "programme_manager"] },
  "audit.read": { stream: "platform", roles: ["system_admin", "programme_manager"] },
  "evidence.manage": { stream: "platform", roles: ["system_admin", "programme_manager"] },
  "periods.manage": { stream: "platform", roles: ["system_admin", "programme_manager"] },
};
