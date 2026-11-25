import { ROLES, type Role, type RoleAssignment, type Stream, type UserContext } from "@eu/core";
import { devices, loginAttempts, roleAssignments, sessions, sites, users, type Db } from "@eu/db";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const WEB_SESSION_DAYS = 30;
export const DEVICE_SESSION_DAYS = 180;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const SESSION_COOKIE = "eu_session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validPassword(pw: string): boolean {
  return pw.length >= 10;
}

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "locked" };

/** Checks email and password, with a lockout after repeated failures. */
export async function checkCredentials(db: Db, email: string, password: string, now = new Date()): Promise<LoginResult> {
  const d = db as AnyDb;
  const normalised = email.trim().toLowerCase();
  const [user] = await d.select().from(users).where(eq(sql`lower(${users.email})`, normalised));
  const record = (ok: boolean) => d.insert(loginAttempts).values({ email: normalised, ok, at: now });
  if (!user || !user.active) {
    // Spend comparable time so unknown emails are not distinguishable by timing.
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    await record(false);
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && new Date(user.lockedUntil) > now) {
    await record(false);
    return { ok: false, reason: "locked" };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await d
      .update(users)
      .set({
        failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      })
      .where(eq(users.id, user.id));
    await record(false);
    return { ok: false, reason: failed >= MAX_FAILED_LOGINS ? "locked" : "invalid" };
  }
  await d.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  await record(true);
  return { ok: true, userId: user.id };
}

export async function createSession(
  db: Db,
  userId: string,
  kind: "web" | "device",
  deviceId: string | null,
  now = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const days = kind === "web" ? WEB_SESSION_DAYS : DEVICE_SESSION_DAYS;
  await (db as AnyDb).insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    kind,
    deviceId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + days * 86_400_000),
  });
  return token;
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await (db as AnyDb).update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashToken(token)));
}

export interface Principal {
  user: UserContext;
  name: string;
  email: string;
  locale: string;
  kind: "web" | "device";
  deviceId: string | null;
}

export type ResolveResult = { ok: true; principal: Principal } | { ok: false; reason: "unauthenticated" | "device_revoked" };

/** Turns a session token (cookie or Bearer) into a user with roles. */
export async function resolveToken(db: Db, token: string | null | undefined, now = new Date()): Promise<ResolveResult> {
  if (!token) return { ok: false, reason: "unauthenticated" };
  const d = db as AnyDb;
  const [s] = await d
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)));
  if (!s) return { ok: false, reason: "unauthenticated" };
  if (s.deviceId) {
    const [dev] = await d.select().from(devices).where(eq(devices.id, s.deviceId));
    if (!dev || dev.revokedAt) return { ok: false, reason: "device_revoked" };
  }
  if (s.revokedAt) return { ok: false, reason: s.deviceId ? "device_revoked" : "unauthenticated" };
  const [u] = await d.select().from(users).where(eq(users.id, s.userId));
  if (!u || !u.active) return { ok: false, reason: "unauthenticated" };
  return {
    ok: true,
    principal: {
      user: { id: u.id, assignments: await loadAssignments(db, u.id) },
      name: u.name,
      email: u.email,
      locale: u.locale,
      kind: s.kind,
      deviceId: s.deviceId,
    },
  };
}

export async function loadAssignments(db: Db, userId: string): Promise<RoleAssignment[]> {
  const rows = (await (db as AnyDb).select().from(roleAssignments).where(eq(roleAssignments.userId, userId))) as {
    role: string;
    scopeType: string;
    scopeValue: string | null;
  }[];
  const siteIds = rows.filter((r) => r.scopeType === "site" && r.scopeValue).map((r) => r.scopeValue!);
  const siteStreams = new Map<string, string>();
  if (siteIds.length) {
    const found = (await (db as AnyDb).select({ id: sites.id, stream: sites.stream }).from(sites).where(inArray(sites.id, siteIds))) as { id: string; stream: string }[];
    for (const s of found) siteStreams.set(s.id, s.stream);
  }
  const out: RoleAssignment[] = [];
  for (const r of rows) {
    if (!(ROLES as readonly string[]).includes(r.role)) continue;
    const role = r.role as Role;
    if (r.scopeType === "global") out.push({ role, scope: { type: "global" } });
    else if (r.scopeType === "stream" && r.scopeValue) out.push({ role, scope: { type: "stream", stream: r.scopeValue as Stream } });
    else if (r.scopeType === "site" && r.scopeValue) {
      const stream = siteStreams.get(r.scopeValue);
      out.push({ role, scope: { type: "site", siteId: r.scopeValue, ...(stream ? { stream: stream as Stream } : {}) } });
    }
  }
  return out;
}

/** Registers (or re-registers) a phone and issues its long-lived token. */
export async function registerDevice(
  db: Db,
  userId: string,
  deviceId: string,
  name: string,
  appVersion: string | null,
  now = new Date(),
): Promise<{ ok: true; token: string } | { ok: false; reason: "device_revoked" | "device_owned_by_other_user" }> {
  const d = db as AnyDb;
  const [existing] = await d.select().from(devices).where(eq(devices.id, deviceId));
  if (existing?.revokedAt) return { ok: false, reason: "device_revoked" };
  if (existing && existing.userId !== userId) return { ok: false, reason: "device_owned_by_other_user" };
  if (!existing) {
    await d.insert(devices).values({ id: deviceId, userId, name, appVersion, registeredAt: now, lastSeenAt: now });
  } else {
    await d.update(devices).set({ name, appVersion, lastSeenAt: now }).where(eq(devices.id, deviceId));
    // One live token per phone.
    await d
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.deviceId, deviceId), isNull(sessions.revokedAt)));
  }
  return { ok: true, token: await createSession(db, userId, "device", deviceId, now) };
}

export async function revokeDevice(db: Db, deviceId: string, now = new Date()): Promise<void> {
  const d = db as AnyDb;
  await d.update(devices).set({ revokedAt: now }).where(eq(devices.id, deviceId));
  await d.update(sessions).set({ revokedAt: now }).where(eq(sessions.deviceId, deviceId));
}

/** First-run setup: creates the first system admin, only while no users exist. */
export async function createFirstAdmin(
  db: Db,
  input: { email: string; name: string; password: string },
): Promise<{ ok: true } | { ok: false; reason: "closed" | "weak_password" }> {
  const d = db as AnyDb;
  if (!validPassword(input.password)) return { ok: false, reason: "weak_password" };
  return d.transaction(async (tx: AnyDb) => {
    await tx.execute(sql`select pg_advisory_xact_lock(734220002)`);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(users);
    if (count > 0) return { ok: false as const, reason: "closed" as const };
    const [u] = await tx
      .insert(users)
      .values({ email: input.email.trim(), name: input.name.trim(), passwordHash: await hashPassword(input.password) })
      .returning({ id: users.id });
    await tx.insert(roleAssignments).values({ userId: u.id, role: "system_admin", scopeType: "global", scopeValue: null });
    return { ok: true as const };
  });
}
