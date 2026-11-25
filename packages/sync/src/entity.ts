import type { ConflictPolicy, Stream, UserContext } from "@eu/core";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";

/**
 * A record type that syncs between phones and the server.
 * `schema` validates the module's own fields (not the sync columns): the full object on insert,
 * a partial on update.
 */
export interface EntityDef {
  name: string;
  stream: Stream;
  table: PgTable;
  schema: z.ZodObject;
  policy: ConflictPolicy;
  actions: {
    /** Needed to receive these records on sync and see them on the web. */
    read: string;
    /** Needed to create (and, where the policy allows, edit) them. */
    write: string;
    /** Needed to void one; defaults to `write`. */
    void?: string;
    /** Needed to change server_authoritative records; defaults to `write`. */
    configure?: string;
  };
  label: { en: string; fr: string };
  /**
   * Site kinds (sites.kind) a record may be scoped to, e.g. ["plot"]. Omit to allow any kind in
   * the entity's stream. A record may also be scoped to the stream itself (scope_id = stream name).
   */
  siteKinds?: readonly string[];
  /**
   * Server-side business rules beyond the zod shape, run inside the push transaction after the
   * permission and scope checks. Return a short reason code to reject the change (the phone shows
   * it translated), or undefined to accept. Runs on the server only; never on the phone.
   */
  validate?: (ctx: EntityValidateContext, change: EntityChange) => Promise<string | undefined>;
  /**
   * Optional: add read-only fields to records sent to phones on pull (for example a name kept on
   * another table). The extra fields are for display; phones never send them back. Server only.
   */
  decorate?: (tx: any, records: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
}

/** What `validate` receives. `tx` is the Drizzle transaction (typed loosely to keep this file phone-safe). */
export interface EntityValidateContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any;
  user: UserContext;
  /** True when the user holds `action` at the record's scope. */
  can: (action: string) => boolean;
}

export interface EntityChange {
  op: "insert" | "update";
  recordId: string;
  scopeId: string;
  /** The parsed incoming fields (dates as Date objects, as they will be written). */
  fields: Record<string, unknown>;
  /** The row before the change (update only). */
  existing?: Record<string, unknown>;
}

export function defineEntity<T extends EntityDef>(def: T): T {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(def.name)) {
    throw new Error(`Entity name must look like "module.thing": ${def.name}`);
  }
  return def;
}

export class EntityRegistry {
  private byName = new Map<string, EntityDef>();

  register(...defs: EntityDef[]): this {
    for (const d of defs) {
      if (this.byName.has(d.name)) throw new Error(`Entity already registered: ${d.name}`);
      this.byName.set(d.name, d);
    }
    return this;
  }

  get(name: string): EntityDef | undefined {
    return this.byName.get(name);
  }

  all(): EntityDef[] {
    return [...this.byName.values()];
  }
}
