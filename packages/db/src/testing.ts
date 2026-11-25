import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

/** A fresh in-process Postgres with all platform migrations applied. For tests only. */
export async function createTestDb(extraSql: string[] = []): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
  for (const stmt of extraSql) await client.exec(stmt);
  return { db: db as unknown as Db, close: () => client.close() };
}
