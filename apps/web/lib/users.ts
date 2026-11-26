/**
 * User management for Admin → Users: add users, assign and remove roles, reset passwords, deactivate.
 * Rules (agreed with the platform thread):
 * - gated by "users.manage"; only a system_admin may grant system_admin or any global-scope role;
 * - each assignment must fit the role: stream roles need a stream, site roles need an active site of a matching kind;
 * - deactivating or resetting a password revokes every session, which also signs out their phones;
 * - the last active system admin can't be deactivated or lose that role;
 * - every change is audited; passwords and hashes never are.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { auditLog, roleAssignments, sessions, sites, users, type Db } from "@eu/db";
import { ROLES, type Role } from "@eu/core";
import { hashPassword, validPassword, type Principal } from "./auth";
import { permissions } from "./registry";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any;

const FIELD_STREAMS = ["schools", "bamboo", "miombo", "boreholes"] as const;
type ScopeKind = "global" | "stream" | "site";

/** Which scopes each role may be given. Site roles say which site kinds fit. */
export const ROLE_SCOPES: Record<Role, { kinds: ScopeKind[]; siteKinds?: string[] }> = {
  system_admin: { kinds: ["global"] },
  programme_manager: { kinds: ["global"] },
  viewer: { kinds: ["global", "stream"] },
  stream_lead: { kinds: ["stream"] },
  field_officer: { kinds: ["stream", "site"], siteKinds: ["plot", "borehole", "nursery", "village"] },
  headteacher: { kinds: ["site"], siteKinds: ["school"] },
  school_admin: { kinds: ["site"], siteKinds: ["school"] },
};

export interface UserRow {
  id: string; name: string; email: string; active: boolean; locale: string; mustChangePassword: boolean;
  roles: { id: string; role: string; scopeType: string; scopeValue: string | null; siteName?: string }[];
}

export type UsersResult = { ok: true; code: string } | { ok: false; code: string };

const fail = (code: string): UsersResult => ({ ok: false, code });

export async function listUsers(db: Db): Promise<UserRow[]> {
  const d = db as AnyDb;
  const [us, ras, ss] = await Promise.all([
    d.select().from(users).orderBy(asc(users.name)),
    d.select().from(roleAssignments),
    d.select({ id: sites.id, name: sites.name }).from(sites),
  ]);
  const siteName = new Map<string, string>(ss.map((s: any) => [s.id, s.name]));
  return us.map((u: any) => ({
    id: u.id, name: u.name, email: u.email, active: u.active, locale: u.locale, mustChangePassword: u.mustChangePassword === true,
    roles: ras.filter((r: any) => r.userId === u.id).map((r: any) => ({
      id: r.id, role: r.role, scopeType: r.scopeType, scopeValue: r.scopeValue,
      siteName: r.scopeType === "site" ? siteName.get(r.scopeValue) : undefined,
    })),
  }));
}

/** Sites a site-scoped role can be attached to. */
export async function assignableSites(db: Db): Promise<{ id: string; name: string; kind: string; stream: string }[]> {
  return (db as AnyDb)
    .select({ id: sites.id, name: sites.name, kind: sites.kind, stream: sites.stream })
    .from(sites)
    .where(eq(sites.active, true))
    .orderBy(asc(sites.stream), asc(sites.name));
}

const isSysAdmin = (me: Principal) => me.user.assignments.some((a) => a.role === "system_admin" && a.scope.type === "global");
const canManage = (me: Principal) => permissions.can(me.user, "users.manage", { stream: "platform" });

/** Parses "global" | "stream:<name>" | "site:<id>" and checks it fits the role. */
async function resolveScope(db: Db, me: Principal, role: string, scope: string): Promise<{ ok: true; type: ScopeKind; value: string | null } | { ok: false; code: string }> {
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, code: "invalid" };
  const rule = ROLE_SCOPES[role as Role];
  const [type, ...rest] = scope.split(":");
  const value = rest.join(":") || null;
  if (!rule.kinds.includes(type as ScopeKind)) return { ok: false, code: "bad_scope" };
  if ((role === "system_admin" || type === "global") && !isSysAdmin(me)) return { ok: false, code: "forbidden" };
  if (type === "global") return { ok: true, type: "global", value: null };
  if (type === "stream") {
    if (!value || !(FIELD_STREAMS as readonly string[]).includes(value)) return { ok: false, code: "bad_scope" };
    return { ok: true, type: "stream", value };
  }
  if (!value) return { ok: false, code: "bad_scope" };
  const [site] = await (db as AnyDb).select().from(sites).where(eq(sites.id, value));
  if (!site || !site.active || (rule.siteKinds && !rule.siteKinds.includes(site.kind))) return { ok: false, code: "bad_scope" };
  return { ok: true, type: "site", value };
}

async function activeAdminCount(tx: AnyDb, excludingUser?: string, excludingAssignment?: string): Promise<number> {
  const rows = await tx
    .select({ uid: roleAssignments.userId, aid: roleAssignments.id })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(and(eq(roleAssignments.role, "system_admin"), eq(roleAssignments.scopeType, "global"), eq(users.active, true)));
  return new Set(rows.filter((r: any) => r.uid !== excludingUser && r.aid !== excludingAssignment).map((r: any) => r.uid)).size;
}

const audit = (tx: AnyDb, me: Principal, recordId: string, op: string, newValues: unknown, oldValues: unknown = null) =>
  tx.insert(auditLog).values({ entity: "platform.user", recordId, scopeId: "platform", op, userId: me.user.id, oldValues, newValues });

const revokeSessions = (tx: AnyDb, userId: string) =>
  tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

export async function createUser(db: Db, me: Principal, input: { name: string; email: string; password: string; role: string; scope: string; locale: string }): Promise<UsersResult> {
  if (!canManage(me)) return fail("forbidden");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("invalid");
  if (!validPassword(input.password)) return fail("weak_password");
  const scope = await resolveScope(db, me, input.role, input.scope);
  if (!scope.ok) return fail(scope.code);
  const d = db as AnyDb;
  const [dupe] = await d.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (dupe) return fail("exists");
  const hash = await hashPassword(input.password);
  await d.transaction(async (tx: AnyDb) => {
    const [u] = await tx.insert(users).values({ email, name, passwordHash: hash, mustChangePassword: true, locale: input.locale === "en" ? "en" : "fr" }).returning({ id: users.id });
    await tx.insert(roleAssignments).values({ userId: u.id, role: input.role, scopeType: scope.type, scopeValue: scope.value, createdBy: me.user.id });
    await audit(tx, me, u.id, "insert", { name, email, role: input.role, scopeType: scope.type, scopeValue: scope.value });
  });
  return { ok: true, code: "created" };
}

export async function addRole(db: Db, me: Principal, userId: string, role: string, scopeStr: string): Promise<UsersResult> {
  if (!canManage(me)) return fail("forbidden");
  const scope = await resolveScope(db, me, role, scopeStr);
  if (!scope.ok) return fail(scope.code);
  const d = db as AnyDb;
  const [u] = await d.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!u) return fail("not_found");
  const existing = await d.select().from(roleAssignments).where(eq(roleAssignments.userId, userId));
  if (existing.some((r: any) => r.role === role && r.scopeType === scope.type && (r.scopeValue ?? null) === scope.value)) return fail("duplicate");
  await d.transaction(async (tx: AnyDb) => {
    const [r] = await tx.insert(roleAssignments).values({ userId, role, scopeType: scope.type, scopeValue: scope.value, createdBy: me.user.id }).returning({ id: roleAssignments.id });
    await audit(tx, me, userId, "role_added", { assignmentId: r.id, role, scopeType: scope.type, scopeValue: scope.value });
  });
  return { ok: true, code: "role_added" };
}

export async function removeRole(db: Db, me: Principal, assignmentId: string): Promise<UsersResult> {
  if (!canManage(me)) return fail("forbidden");
  const d = db as AnyDb;
  return d.transaction(async (tx: AnyDb) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734220003)`);
    const [r] = await tx.select().from(roleAssignments).where(eq(roleAssignments.id, assignmentId));
    if (!r) return fail("not_found");
    if ((r.role === "system_admin" || r.scopeType === "global") && !isSysAdmin(me)) return fail("forbidden");
    if (r.role === "system_admin" && (await activeAdminCount(tx, undefined, r.id)) === 0) return fail("last_admin");
    await tx.delete(roleAssignments).where(eq(roleAssignments.id, assignmentId));
    await audit(tx, me, r.userId, "role_removed", null, { assignmentId: r.id, role: r.role, scopeType: r.scopeType, scopeValue: r.scopeValue });
    return { ok: true as const, code: "role_removed" };
  });
}

/** A target holding global roles can only be changed by a system admin. */
async function guardTarget(tx: AnyDb, me: Principal, userId: string): Promise<string | null> {
  const [u] = await tx.select().from(users).where(eq(users.id, userId));
  if (!u) return "not_found";
  const ras = await tx.select().from(roleAssignments).where(eq(roleAssignments.userId, userId));
  if (ras.some((r: any) => r.scopeType === "global") && !isSysAdmin(me)) return "forbidden";
  return null;
}

export async function resetPassword(db: Db, me: Principal, userId: string, password: string): Promise<UsersResult> {
  if (!canManage(me)) return fail("forbidden");
  if (!validPassword(password)) return fail("weak_password");
  const hash = await hashPassword(password);
  return (db as AnyDb).transaction(async (tx: AnyDb) => {
    const g = await guardTarget(tx, me, userId);
    if (g) return fail(g);
    await tx.update(users).set({ passwordHash: hash, mustChangePassword: true, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
    await revokeSessions(tx, userId);
    await audit(tx, me, userId, "password_reset", { sessionsRevoked: true });
    return { ok: true as const, code: "password_reset" };
  });
}

export async function setActive(db: Db, me: Principal, userId: string, active: boolean): Promise<UsersResult> {
  if (!canManage(me)) return fail("forbidden");
  return (db as AnyDb).transaction(async (tx: AnyDb) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734220003)`);
    const g = await guardTarget(tx, me, userId);
    if (g) return fail(g);
    if (!active && (await activeAdminCount(tx, userId)) === 0) return fail("last_admin");
    await tx.update(users).set({ active, failedLogins: 0, lockedUntil: null }).where(eq(users.id, userId));
    if (!active) await revokeSessions(tx, userId);
    await audit(tx, me, userId, active ? "reactivated" : "deactivated", { active });
    return { ok: true as const, code: active ? "reactivated" : "deactivated" };
  });
}
