import { isLocale, t, type Locale } from "@eu/core/i18n";
import { loadSchool, listSchoolSites, type SchoolData } from "@eu/schools";
import type { Mutation, MutationResult } from "@eu/sync";
import { handlePush } from "@eu/sync/server";
import { notFound, redirect } from "next/navigation";
import type { Principal } from "./auth";
import { db } from "./http";
import { entities, permissions } from "./registry";
import { currentPrincipal } from "./session";

export type SchoolAction = Parameters<typeof permissions.can>[1];

export function today(): string {
  // Haut-Lomami is UTC+2 all year.
  return new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
}

export function tr(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => t(locale, `schools.${key}`, vars);
}

export async function signedIn(locale: string): Promise<{ me: Principal; locale: Locale }> {
  if (!isLocale(locale)) notFound();
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  return { me, locale };
}

export function can(me: Principal, action: string, siteId?: string | null): boolean {
  return permissions.can(me.user, action, { stream: "schools", siteId: siteId ?? null });
}

/** Schools the user can read. */
export async function mySchools(me: Principal) {
  const all = await listSchoolSites(db());
  return all.filter((s) => can(me, "school.read", s.id));
}

/** Loads a school the user may read, or 404s. */
export async function schoolFor(me: Principal, siteId: string): Promise<SchoolData> {
  if (!can(me, "school.read", siteId)) notFound();
  const data = await loadSchool(db(), siteId);
  if (!data) notFound();
  return data;
}

/**
 * Applies web edits through the sync engine, so permissions, conflict policies and
 * the audit log apply exactly as for a phone. The web session is its own "device".
 */
export async function push(me: Principal, mutations: Mutation[]): Promise<MutationResult[]> {
  const now = new Date();
  const res = await handlePush(
    { db: db(), user: me.user, deviceId: me.deviceId ?? `web:${me.user.id}`, permissions, entities },
    { deviceNow: now.toISOString(), mutations },
  );
  return res.results;
}

export function firstRejection(results: MutationResult[]): string | null {
  const bad = results.find((r) => r.status === "rejected");
  return bad ? (bad.reason ?? "rejected") : null;
}

export const newId = () => crypto.randomUUID();

/** Read a trimmed string from a form. */
export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
export function int(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(/[\s,.]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}
export const orNull = (s: string) => (s === "" ? null : s);

/** Parses "1-6" or "1,2,3" into levels 1..6. */
export function parseLevels(s: string): number[] {
  const out = new Set<number>();
  for (const part of s.split(",").map((p) => p.trim()).filter(Boolean)) {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    if (a === undefined || !Number.isInteger(a)) continue;
    const end = b !== undefined && Number.isInteger(b) ? b : a;
    for (let i = Math.min(a, end); i <= Math.max(a, end); i++) if (i >= 1 && i <= 6) out.add(i);
  }
  return [...out].sort();
}

/** Redirect back with a message code shown by <Flash>. */
export function back(path: string, msg: Record<string, string>): never {
  const q = new URLSearchParams(msg);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q.toString()}`);
}

/** Users with a role at this school (for receipt-book assignment). */
export async function schoolStaff(siteId: string): Promise<{ id: string; name: string; role: string }[]> {
  const { roleAssignments, users } = await import("@eu/db");
  const { and, eq } = await import("drizzle-orm");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db() as any)
    .select({ id: users.id, name: users.name, role: roleAssignments.role })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(and(eq(roleAssignments.scopeType, "site"), eq(roleAssignments.scopeValue, siteId)));
  return rows;
}
