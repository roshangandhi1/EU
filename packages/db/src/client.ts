import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import ws from "ws";

/** Any Drizzle Postgres database (Neon in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

let cached: Db | undefined;

/** Production/preview database, from DATABASE_URL (set by the Vercel Neon integration). */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: url });
  cached = drizzleNeon(pool) as unknown as Db;
  return cached;
}
