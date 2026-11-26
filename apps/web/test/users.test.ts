import { roleAssignments, sessions, sites, users, type Db } from "@eu/db";
import { createTestDb } from "@eu/db/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "../lib/auth";
import { addRole, createUser, removeRole, resetPassword, setActive } from "../lib/users";

let db: Db;
let close: () => Promise<void>;
let admin: Principal;
const principal = (id: string, role: "system_admin" | "programme_manager"): Principal => ({
  user: { id, assignments: [{ role, scope: { type: "global" } }] }, name: "x", email: "x@example.org", locale: "en", kind: "web", deviceId: null, mustChangePassword: false, tokenHash: "t",
});

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await (db as any).insert(users).values({ email: "admin@example.org", name: "Admin", passwordHash: "x" }).returning();
  await (db as any).insert(roleAssignments).values({ userId: u.id, role: "system_admin", scopeType: "global" });
  await (db as any).insert(sites).values([{ id: "s1", kind: "school", stream: "schools", name: "School 1" }, { id: "b1", kind: "borehole", stream: "boreholes", name: "BH1" }]);
  admin = principal(u.id, "system_admin");
});
afterEach(async () => close());

const pw = "longenough-123";

describe("user management", () => {
  it("adds a headteacher at a school, and refuses a site role at the wrong kind of site", async () => {
    expect(await createUser(db, admin, { name: "Head", email: "head@example.org", password: pw, role: "headteacher", scope: "site:s1", locale: "fr" })).toEqual({ ok: true, code: "created" });
    expect(await createUser(db, admin, { name: "Head2", email: "h2@example.org", password: pw, role: "headteacher", scope: "site:b1", locale: "fr" })).toEqual({ ok: false, code: "bad_scope" });
    expect(await createUser(db, admin, { name: "Dup", email: "HEAD@example.org", password: pw, role: "viewer", scope: "stream:bamboo", locale: "fr" })).toEqual({ ok: false, code: "exists" });
    expect(await createUser(db, admin, { name: "Weak", email: "w@example.org", password: "short", role: "viewer", scope: "stream:bamboo", locale: "fr" })).toEqual({ ok: false, code: "weak_password" });
  });

  it("stops a programme manager granting system admin or global roles", async () => {
    const pm = principal(admin.user.id, "programme_manager");
    expect(await createUser(db, pm, { name: "Evil", email: "e@example.org", password: pw, role: "system_admin", scope: "global", locale: "fr" })).toEqual({ ok: false, code: "forbidden" });
    expect(await createUser(db, pm, { name: "Lead", email: "l@example.org", password: pw, role: "stream_lead", scope: "stream:boreholes", locale: "fr" })).toEqual({ ok: true, code: "created" });
  });

  it("protects the last system admin and revokes sessions on reset and deactivation", async () => {
    expect(await setActive(db, admin, admin.user.id, false)).toEqual({ ok: false, code: "last_admin" });
    const [ra] = await (db as any).select().from(roleAssignments).where(eq(roleAssignments.userId, admin.user.id));
    expect(await removeRole(db, admin, ra.id)).toEqual({ ok: false, code: "last_admin" });

    await createUser(db, admin, { name: "Tech", email: "t@example.org", password: pw, role: "field_officer", scope: "stream:boreholes", locale: "fr" });
    const [tech] = await (db as any).select().from(users).where(eq(users.email, "t@example.org"));
    await (db as any).insert(sessions).values({ tokenHash: "h1", userId: tech.id, kind: "web", expiresAt: new Date(Date.now() + 86_400_000) });
    expect(await resetPassword(db, admin, tech.id, "another-long-one")).toEqual({ ok: true, code: "password_reset" });
    const [s1] = await (db as any).select().from(sessions).where(eq(sessions.tokenHash, "h1"));
    expect(s1.revokedAt).not.toBeNull();
    expect(await setActive(db, admin, tech.id, false)).toEqual({ ok: true, code: "deactivated" });
    expect(await addRole(db, admin, tech.id, "viewer", "stream:bamboo")).toEqual({ ok: true, code: "role_added" });
    expect(await addRole(db, admin, tech.id, "viewer", "stream:bamboo")).toEqual({ ok: false, code: "duplicate" });
  });
});
