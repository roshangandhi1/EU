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
} from "../lib/auth";

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
});
