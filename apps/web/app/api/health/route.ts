import { sql } from "drizzle-orm";
import { db, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) return json({ ok: true, database: "not_configured" });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db() as any).execute(sql`select 1`);
    return json({ ok: true, database: "ok" });
  } catch {
    return json({ ok: false, database: "error" }, 503);
  }
}
