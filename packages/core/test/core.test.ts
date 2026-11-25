import { describe, expect, it } from "vitest";
import { PermissionRegistry, platformActions, type UserContext } from "../src";
import { diffKeys, en, fr, t } from "../src/i18n";

const reg = new PermissionRegistry().register(platformActions).register({
  "payment.void": { stream: "schools", roles: ["system_admin", "programme_manager", "headteacher"] },
  "payment.write": { stream: "schools", roles: ["system_admin", "programme_manager", "stream_lead", "headteacher", "school_admin"] },
});

const head: UserContext = { id: "u1", assignments: [{ role: "headteacher", scope: { type: "site", siteId: "school-A" } }] };
const lead: UserContext = { id: "u2", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "schools" } }] };
const bambooLead: UserContext = { id: "u3", assignments: [{ role: "stream_lead", scope: { type: "stream", stream: "bamboo" } }] };
const admin: UserContext = { id: "u4", assignments: [{ role: "system_admin", scope: { type: "global" } }] };

describe("permissions", () => {
  it("site roles apply only at their site", () => {
    expect(reg.can(head, "payment.void", { stream: "schools", siteId: "school-A" })).toBe(true);
    expect(reg.can(head, "payment.void", { stream: "schools", siteId: "school-B" })).toBe(false);
  });
  it("stream leads cover their stream only, and only actions granted to them", () => {
    expect(reg.can(lead, "payment.write", { stream: "schools", siteId: "school-B" })).toBe(true);
    expect(reg.can(lead, "payment.void", { stream: "schools", siteId: "school-B" })).toBe(false);
    expect(reg.can(bambooLead, "payment.write", { stream: "schools", siteId: "school-B" })).toBe(false);
  });
  it("global admins hold everything granted to them; unknown actions are denied", () => {
    expect(reg.can(admin, "payment.void", { stream: "schools", siteId: "x" })).toBe(true);
    expect(reg.can(admin, "no.such.action", { stream: "schools" })).toBe(false);
  });
  it("computes readable scope for pulls", () => {
    const s = reg.readableScope(head, "payment.write", "schools");
    expect(s.all).toBe(false);
    if (!s.all) expect([...s.siteIds]).toEqual(["school-A"]);
    expect(reg.readableScope(lead, "payment.write", "schools").all).toBe(true);
  });
  it("refuses duplicate action names", () => {
    expect(() => new PermissionRegistry().register(platformActions).register(platformActions)).toThrow();
  });
});

describe("i18n", () => {
  it("English and French have identical keys", () => {
    expect(diffKeys(en as never, fr as never)).toEqual([]);
  });
  it("interpolates and falls back", () => {
    expect(t("fr", "sync.waiting", { count: 3 })).toBe("En attente de synchronisation (3)");
    expect(t("fr", "missing.key")).toBe("missing.key");
  });
});
