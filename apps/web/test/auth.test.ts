import { createTestDb } from "@eu/db/testing";
import type { Db } from "@eu/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkCredentials,
  createFirstAdmin,
  registerDevice,
  resolveToken,
  revokeDevice,
  MAX_FAILED_LOGINS,
  MAX_FAILED_PER_IP,
} from "../lib/auth";
import { sessions, users } from "@eu/db";
import { eq } from "drizzle-orm";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => ({ db, close } = await createTestDb()));
afterEach(async () => close());

describe("auth", () => {
  it("first-run setup creates one admin and then closes", async () => {
    expect(await createFirstAdmin(db, { email: "r@example.org", name: "Roshan", password: "short" })).toEqual({ ok: false, reason: "weak_password" });
    expect(await createFirstAdmin(db, { email: "r@example.org", name: "Roshan", password: "a-long-password" })).toEqual({ ok: true });
    expect(await createFirstAdmin(db, { email: "x@example.org", name: "X", password: "a-long-password" })).toEqual({ ok: false, reason: "closed" });
  });

  it("checks passwords case-insensitively on email and locks after repeated failures", async () => {
    await createFirstAdmin(db, { email: "R@Example.org", name: "Roshan", password: "a-long-password" });
    expect((await checkCredentials(db, "r@example.org", "a-long-password")).ok).toBe(true);
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) expect(await checkCredentials(db, "r@example.org", "wrong")).toEqual({ ok: false, reason: "invalid" });
    expect(await checkCredentials(db, "r@example.org", "wrong")).toEqual({ ok: false, reason: "locked" });
    expect(await checkCredentials(db, "r@example.org", "a-long-password")).toEqual({ ok: false, reason: "locked" });
    const later = new Date(Date.now() + 16 * 60_000);
    expect((await checkCredentials(db, "r@example.org", "a-long-password", later)).ok).toBe(true);
    expect(await checkCredentials(db, "nobody@example.org", "x")).toEqual({ ok: false, reason: "invalid" });
  });

  it("issues device tokens with roles, and revoking the phone kills its token", async () => {
    await createFirstAdmin(db, { email: "r@example.org", name: "Roshan", password: "a-long-password" });
    const cred = await checkCredentials(db, "r@example.org", "a-long-password");
    if (!cred.ok) throw new Error("login failed");
    const reg = await registerDevice(db, cred.userId, "phone-123456", "Tecno test", "0.1.0");
    if (!reg.ok) throw new Error("register failed");
    const who = await resolveToken(db, reg.token);
    expect(who.ok && who.principal.user.assignments).toEqual([{ role: "system_admin", scope: { type: "global" } }]);
    await revokeDevice(db, "phone-123456");
    expect(await resolveToken(db, reg.token)).toEqual({ ok: false, reason: "device_revoked" });
    expect(await registerDevice(db, cred.userId, "phone-123456", "Tecno test", "0.1.0")).toEqual({ ok: false, reason: "device_revoked" });
    expect(await resolveToken(db, "made-up-token")).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("parallel wrong guesses cannot exceed the limit, and unknown emails never answer locked (SEC-3/SEC-4)", async () => {
    await createFirstAdmin(db, { email: "r@example.org", name: "Roshan", password: "a-long-password" });
    const now = new Date();
    const answers = await Promise.all(Array.from({ length: 12 }, (_, i) => checkCredentials(db, "r@example.org", `wrong${i}`, now)));
    expect(answers.filter((a) => !a.ok && a.reason === "invalid").length).toBeLessThanOrEqual(MAX_FAILED_LOGINS - 1);
    expect(await checkCredentials(db, "r@example.org", "a-long-password", now)).toEqual({ ok: false, reason: "locked" });
    // The lock lasts 15 minutes, not for ever.
    const [u] = await (db as any).select().from(users).where(eq(users.email, "r@example.org"));
    expect(new Date(u.lockedUntil).getTime() - now.getTime()).toBe(15 * 60_000);
    for (let i = 0; i < 8; i++) expect(await checkCredentials(db, "ghost@example.org", "x", now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("limits failures per network address across accounts", async () => {
    const now = new Date();
    for (let i = 0; i < MAX_FAILED_PER_IP; i++) await checkCredentials(db, `user${i}@example.org`, "x", now, "203.0.113.9");
    await createFirstAdmin(db, { email: "r@example.org", name: "Roshan", password: "a-long-password" });
    expect(await checkCredentials(db, "r@example.org", "a-long-password", now, "203.0.113.9")).toEqual({ ok: false, reason: "locked" });
    expect((await checkCredentials(db, "r@example.org", "a-long-password", now, "198.51.100.1")).ok).toBe(true);
    const later = new Date(now.getTime() + 16 * 60_000);
    expect((await checkCredentials(db, "r@example.org", "a-long-password", later, "203.0.113.9")).ok).toBe(true);
  });

  it("a password reset, deactivation or expiry ends a phone session without revoking the phone (DATA-1/SEC-2)", async () => {
    await createFirstAdmin(db, { email: "r@example.org", name: "Roshan", password: "a-long-password" });
    const cred = await checkCredentials(db, "r@example.org", "a-long-password");
    if (!cred.ok) throw new Error("login failed");
    const reg = await registerDevice(db, cred.userId, "phone-123456", "Tecno", null);
    if (!reg.ok) throw new Error("register failed");
    // Session revoked (what a password reset does).
    await (db as any).update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, cred.userId));
    expect(await resolveToken(db, reg.token)).toEqual({ ok: false, reason: "session_ended" });
    // Signing in again on the same phone works and gives a live token.
    const again = await registerDevice(db, cred.userId, "phone-123456", "Tecno", null);
    if (!again.ok) throw new Error("re-register failed");
    expect((await resolveToken(db, again.token)).ok).toBe(true);
    // Expired token.
    const later = new Date(Date.now() + 181 * 86_400_000);
    expect(await resolveToken(db, again.token, later)).toEqual({ ok: false, reason: "session_ended" });
    // Deactivated user.
    await (db as any).update(users).set({ active: false }).where(eq(users.id, cred.userId));
    expect(await resolveToken(db, again.token)).toEqual({ ok: false, reason: "session_ended" });
  });

  it("a removed phone stays blocked, a wiped phone registers under a new id, and a phone can change hands (SEC-20/DATA-14)", async () => {
    await createFirstAdmin(db, { email: "r@example.org", name: "Roshan", password: "a-long-password" });
    const cred = await checkCredentials(db, "r@example.org", "a-long-password");
    if (!cred.ok) throw new Error("login failed");
    const [other] = await (db as any).insert(users).values({ email: "o@example.org", name: "O", passwordHash: "x" }).returning();
    const first = await registerDevice(db, cred.userId, "phone-aaaaaa", "Tecno", null);
    if (!first.ok) throw new Error("register failed");
    const handed = await registerDevice(db, other.id, "phone-aaaaaa", "Tecno", null);
    expect(handed.ok).toBe(true);
    expect(await resolveToken(db, first.token)).toEqual({ ok: false, reason: "session_ended" });
    await revokeDevice(db, "phone-aaaaaa");
    expect(await registerDevice(db, cred.userId, "phone-aaaaaa", "Tecno", null)).toEqual({ ok: false, reason: "device_revoked" });
    expect((await registerDevice(db, cred.userId, "phone-bbbbbb", "Tecno", null)).ok).toBe(true);
    expect(await registerDevice(db, cred.userId, "web:someone-else", "x", null)).toEqual({ ok: false, reason: "invalid_device_id" });
    expect(await registerDevice(db, cred.userId, "=1+1+cmd|x", "x", null)).toEqual({ ok: false, reason: "invalid_device_id" });
  });
});
