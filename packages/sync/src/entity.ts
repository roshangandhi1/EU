import type { ConflictPolicy, Stream } from "@eu/core";
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
