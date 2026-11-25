import { inArray } from "drizzle-orm";
import { sites } from "@eu/db";
import { db } from "./http";

/** Site names by id, for showing where a record belongs (read-only). */
export async function siteNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)].filter(Boolean).slice(0, 500);
  if (!uniq.length) return new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db() as any).select({ id: sites.id, name: sites.name }).from(sites).where(inArray(sites.id, uniq));
  return new Map(rows.map((r: { id: string; name: string }) => [r.id, r.name]));
}
