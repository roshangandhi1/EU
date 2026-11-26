import { ROLES, type Role, type RoleAssignment, type Stream, type UserContext } from "@eu/core";
import { auditLog, devices, loginAttempts, roleAssignments, sessions, sites, users, type Db } from "@eu/db";
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

/** Failed sign-ins from one network address allowed per window, across all accounts (SEC-3). */
export const MAX_FAILED_PER_IP = 20;
const WINDOW_MS = LOCK_MINUTES * 60_000;
/** login_attempts has no address column: per-address failures are stored as rows with this email prefix. */
const IP_KEY = "ip:";

/**
 * Checks email and password.
 * - Each guess first reserves a slot with one atomic UPDATE, so parallel guesses cannot exceed
 *   MAX_FAILED_LOGINS per window; the account then locks for LOCK_MINUTES (never indefinitely).
 * - At most MAX_FAILED_PER_IP failures per address per window, whichever accounts they target.
 * - An unknown email always answers "invalid" (401), so the answer never reveals which emails exist.
 */
export async function checkCredentials(
  db: Db,
  email: string,
  password: string,
  now = new Date(),
  ip: string | null = null,
): Promise<LoginResult> {
  const d = db as AnyDb;
  const normalised = email.trim().toLowerCase();
  const since = new Date(now.getTime() - WINDOW_MS);
  const fail = async () => {
    const rows = [{ email: normalised, ok: false, at: now }];
    if (ip) rows.push({ email: IP_KEY + ip, ok: false, at: now });
    await d.insert(loginAttempts).values(rows);
  };

  if (ip) {
    const [{ n }] = await d
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.email, IP_KEY + ip), eq(loginAttempts.ok, false), gt(loginAttempts.at, since)));
    if (n >= MAX_FAILED_PER_IP) return { ok: false, reason: "locked" };
  }

  const [user] = await d.select().from(users).where(eq(sql`lower(${users.email})`, normalised));
  if (!user || !user.active) {
    // Spend comparable time so unknown emails are not distinguishable by timing.
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==");
    await fail();
    return { ok: false, reason: "invalid" };
  }

  // Reserve this attempt atomically; no row back means the account is locked right now.
  const [slot] = (await d
    .update(users)
    .set({ failedLogins: sql`${users.failedLogins} + 1` })
    .where(and(eq(users.id, user.id), sql`(${users.lockedUntil} is null or ${users.lockedUntil} <= ${now})`))
    .returning({ attempts: users.failedLogins })) as { attempts: number }[];
  if (!slot) {
    await fail();
    return { ok: false, reason: "locked" };
  }
  const lock = async () => {
    await d.update(users).set({ failedLogins: 0, lockedUntil: new Date(now.getTime() + WINDOW_MS) }).where(eq(users.id, user.id));
  };
  if (slot.attempts > MAX_FAILED_LOGINS) {
    // Parallel guesses beyond the limit are refused without checking the password.
    await lock();
    await fail();
    return { ok: false, reason: "locked" };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await fail();
    if (slot.attempts >= MAX_FAILED_LOGINS) {
      await lock();
      return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "invalid" };
  }
  await d.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  await d.insert(loginAttempts).values({ email: normalised, ok: true, at: now });
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
  /** An admin set this password (new account or reset): the person must choose their own. */
  mustChangePassword: boolean;
  /** SHA-256 of the token this request came with, so a password change can keep this session. */
  tokenHash: string;
}

/**
 * Why a token was refused (the 401 body's "error"):
 * - "device_revoked": the phone itself was removed by an admin. Only then may a phone wipe itself.
 * - "session_ended": a phone token whose session ended while the phone is still enrolled (password
 *   reset, deactivation, a newer sign-in on the same phone, or the token expired). The phone must
 *   ask for an online sign-in and keep all its data.
 * - "unauthenticated": no token, an unknown token, or a web session that ended.
 */
export type ResolveResult =
  | { ok: true; principal: Principal }
  | { ok: false; reason: "unauthenticated" | "device_revoked" | "session_ended" };

/** Turns a session token (cookie or Bearer) into a user with roles. */
export async function resolveToken(db: Db, token: string | null | undefined, now = new Date()): Promise<ResolveResult> {
  if (!token) return { ok: false, reason: "unauthenticated" };
  const d = db as AnyDb;
  const [s] = await d.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  if (!s) return { ok: false, reason: "unauthenticated" };
  const ended = s.kind === "device" || s.deviceId ? "session_ended" : "unauthenticated";
  if (s.deviceId) {
    const [dev] = await d.select().from(devices).where(eq(devices.id, s.deviceId));
    if (!dev || dev.revokedAt) return { ok: false, reason: "device_revoked" };
    // The phone was handed to another user since this token was issued.
    if (dev.userId !== s.userId) return { ok: false, reason: "session_ended" };
  }
  if (s.revokedAt || new Date(s.expiresAt) <= now) return { ok: false, reason: ended };
  const [u] = await d.select().from(users).where(eq(users.id, s.userId));
  if (!u || !u.active) return { ok: false, reason: ended };
  return {
    ok: true,
    principal: {
      user: { id: u.id, assignments: await loadAssignments(db, u.id) },
      name: u.name,
      email: u.email,
      locale: u.locale,
      kind: s.kind,
      deviceId: s.deviceId,
      mustChangePassword: u.mustChangePassword === true,
      tokenHash: s.tokenHash,
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

/** Device ids phones may register: letters, digits and dashes (a UUID in practice). Never "web:...". */
export const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,100}$/;

/**
 * Registers (or re-registers) a phone and issues its long-lived token.
 * - A removed (revoked) device id stays blocked for good; a wiped phone registers again under a
 *   NEW device id, which is allowed like any new phone.
 * - A phone may change hands: signing in as another user re-binds it to that user and ends the
 *   previous user's token. The phone itself refuses this while the previous user's work is unsynced.
 */
export async function registerDevice(
  db: Db,
  userId: string,
  deviceId: string,
  name: string,
  appVersion: string | null,
  now = new Date(),
): Promise<{ ok: true; token: string } | { ok: false; reason: "device_revoked" | "invalid_device_id" }> {
  if (!DEVICE_ID_PATTERN.test(deviceId)) return { ok: false, reason: "invalid_device_id" };
  const d = db as AnyDb;
  const [existing] = await d.select().from(devices).where(eq(devices.id, deviceId));
  if (existing?.revokedAt) return { ok: false, reason: "device_revoked" };
  if (!existing) {
    await d.insert(devices).values({ id: deviceId, userId, name, appVersion, registeredAt: now, lastSeenAt: now });
  } else {
    const handover = existing.userId !== userId;
    await d
      .update(devices)
      .set({ userId, name, appVersion, lastSeenAt: now, ...(handover ? { pendingChanges: null, pendingPhotos: null, statusAt: null } : {}) })
      .where(eq(devices.id, deviceId));
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

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: "wrong_password" | "locked" | "weak_password" | "same_password" };

/**
 * The signed-in person changes their own password (also the forced change after an admin set it).
 * - The current password is checked like a sign-in, so wrong guesses count towards the lockout.
 * - The session making the change stays signed in; every other session ends. Other phones then get
 *   "session_ended", ask for an online sign-in and keep all their unsent work (never a wipe).
 */
export async function changeOwnPassword(
  db: Db,
  me: Principal,
  current: string,
  next: string,
  ip: string | null = null,
  now = new Date(),
): Promise<ChangePasswordResult> {
  if (!validPassword(next)) return { ok: false, reason: "weak_password" };
  if (next === current) return { ok: false, reason: "same_password" };
  const cred = await checkCredentials(db, me.email, current, now, ip);
  if (!cred.ok) return { ok: false, reason: cred.reason === "locked" ? "locked" : "wrong_password" };
  if (cred.userId !== me.user.id) return { ok: false, reason: "wrong_password" };
  const hash = await hashPassword(next);
  await (db as AnyDb).transaction(async (tx: AnyDb) => {
    await tx
      .update(users)
      .set({ passwordHash: hash, mustChangePassword: false, passwordChangedAt: now, failedLogins: 0, lockedUntil: null })
      .where(eq(users.id, me.user.id));
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, me.user.id), isNull(sessions.revokedAt), sql`${sessions.tokenHash} <> ${me.tokenHash}`));
    await tx.insert(auditLog).values({
      entity: "platform.user", recordId: me.user.id, scopeId: "platform", op: "password_changed", userId: me.user.id,
      oldValues: null, newValues: { forced: me.mustChangePassword, otherSessionsRevoked: true, via: me.kind },
    });
  });
  return { ok: true };
}
