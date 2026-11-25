import { DatabaseSync } from "node:sqlite";
import type { SqlDriver } from "../src/sql-store";

/** node:sqlite adapter so the phone's SQLite store runs under the test harness. */
export function nodeSqliteDriver(): SqlDriver {
  const db = new DatabaseSync(":memory:");
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...(params as never[]));
    },
    async all(sql, params = []) {
      return db.prepare(sql).all(...(params as never[])) as never;
    },
    async transaction(fn) {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
