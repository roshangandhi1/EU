import { devices, roleAssignments, sessions, users, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeOwnPassword, checkCredentials, createSession, registerDevice, resolveToken, type Principal } from "../lib/auth";
import { createUser, resetPassword } from "../lib/users";

/* eslint-disable @typescript-eslint/no-explicit-any */
let db: Db;
let close: () => Promise<void>;
let admin: Principal;
const temp = "temporary-pass-1";
const mine = "my-own-secret-22";

async function principalFor(token: string): Promise<Principal> {
  const r = await resolveToken(db, token);
  if (!r.ok) throw new Error(r.reason);
  return r.principal;
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await (db as any).insert(users).values({ email: "admin@example.org", name: "Admin", passwordHash: "x" }).returning();
  await (db as any).insert(roleAssignments).values({ userId: u.id, role: "system_admin", scopeType: "global" });
  admin = await principalFor(await createSession(db, u.id, "web", null));
  await createUser(db, admin, { name: "Aidan", email: "aidan@example.org", password: temp, role: "programme_manager", scope: "global", locale: "en" });
});
afterEach(async () => close());

const aidan = async () => (await (db as any).select().from(users).where(eq(users.email, "aidan@example.org")))[0];

describe("own password change", () => {
  it("a new account must change the admin-set password; changing it clears the flag", async () => {
    const u = await aidan();
    expect(u.mustChangePassword).toBe(true);
    const me = await principalFor(await createSession(db, u.id, "web", null));
    expect(me.mustChangePassword).toBe(true);
    expect(await changeOwnPassword(db, me, temp, mine)).toEqual({ ok: true });
    const after = await aidan();
    expect(after.mustChangePassword).toBe(false);
    expect(after.passwordChangedAt).not.toBeNull();
    expect((await checkCredentials(db, "aidan@example.org", mine)).ok).toBe(true);
    expect((await checkCredentials(db, "aidan@example.org", temp)).ok).toBe(false);
  });

  it("refuses a wrong current password, a short one and the same one", async () => {
    const me = await principalFor(await createSession(db, (await aidan()).id, "web", null));
    expect(await changeOwnPassword(db, me, "not-the-password", mine)).toEqual({ ok: false, reason: "wrong_password" });
    expect(await changeOwnPassword(db, me, temp, "short")).toEqual({ ok: false, reason: "weak_password" });
    expect(await changeOwnPassword(db, me, temp, temp)).toEqual({ ok: false, reason: "same_password" });
    expect((await aidan()).mustChangePassword).toBe(true);
  });

  it("wrong current passwords count towards the lockout", async () => {
    const me = await principalFor(await createSession(db, (await aidan()).id, "web", null));
    for (let i = 0; i < 5; i++) await changeOwnPassword(db, me, "wrong-guess-" + i, mine);
    expect(await changeOwnPassword(db, me, temp, mine)).toEqual({ ok: false, reason: "locked" });
  });

  it("keeps this session, ends the others; another phone keeps its data (session_ended, not revoked)", async () => {
    const u = await aidan();
    const webToken = await createSession(db, u.id, "web", null);
    const otherWeb = await createSession(db, u.id, "web", null);
    const phone = await registerDevice(db, u.id, "phone-0001-abcd", "Android", "0.4.0");
    if (!phone.ok) throw new Error("register");
    const me = await principalFor(webToken);
    expect(await changeOwnPassword(db, me, temp, mine)).toEqual({ ok: true });
    expect((await resolveToken(db, webToken)).ok).toBe(true);
    expect(await resolveToken(db, otherWeb)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(await resolveToken(db, phone.token)).toEqual({ ok: false, reason: "session_ended" });
    const [dev] = await (db as any).select().from(devices).where(eq(devices.id, "phone-0001-abcd"));
    expect(dev.revokedAt).toBeNull();
  });

  it("changing from a phone keeps that phone signed in", async () => {
    const u = await aidan();
    const phone = await registerDevice(db, u.id, "phone-0002-abcd", "Android", "0.5.0");
    if (!phone.ok) throw new Error("register");
    const me = await principalFor(phone.token);
    expect(me.kind).toBe("device");
    expect(await changeOwnPassword(db, me, temp, mine)).toEqual({ ok: true });
    expect((await resolveToken(db, phone.token)).ok).toBe(true);
  });

  it("an admin reset sets the flag again", async () => {
    const u = await aidan();
    const me = await principalFor(await createSession(db, u.id, "web", null));
    await changeOwnPassword(db, me, temp, mine);
    expect(await resetPassword(db, admin, u.id, "reset-by-admin-9")).toEqual({ ok: true, code: "password_reset" });
    expect((await aidan()).mustChangePassword).toBe(true);
    const live = await (db as any).select().from(sessions).where(eq(sessions.userId, u.id));
    expect(live.every((s: any) => s.revokedAt)).toBe(true);
  });
});
