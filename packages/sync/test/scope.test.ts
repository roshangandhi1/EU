import type { UserContext } from "@eu/core";
import type { Db } from "@eu/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { headA, makeDevice, serverClock, setupDb, sysadmin } from "./fixtures";

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await setupDb());
  serverClock.now = new Date("2026-12-01T08:00:00Z");
});
afterEach(async () => close());

/** As loadAssignments builds it on the server: the site role knows its site's stream. */
const headAInSchools: UserContext = {
  id: "head-a",
  assignments: [{ role: "headteacher", scope: { type: "site", siteId: "A", stream: "schools" } }],
};

describe("record scope", () => {
  it("rejects inserts scoped to another stream's site, an unknown site, a closed site or a wrong kind", async () => {
    const d = makeDevice(db, "dev1", sysadmin);
    for (const scope of ["P1", "nowhere", "OLD", "N1"]) await d.client.create("test.reading", scope, { value: 1 });
    const ok = await d.client.create("test.reading", "A", { value: 2 });
    await d.client.sync();
    expect((await d.store.rejections()).map((r) => r.reason)).toEqual([
      "scope_wrong_stream",
      "unknown_scope",
      "scope_inactive",
      "scope_wrong_kind",
    ]);
    expect(await d.store.getServerRecord("test.reading", ok)).toBeDefined();
  });

  it("lets site roles read stream-wide records but not write them", async () => {
    const admin = makeDevice(db, "devAdmin", sysadmin, undefined, 1);
    const id = await admin.client.create("test.setting", "schools", { value: "2026-09-01" });
    await admin.client.sync();
    expect(await admin.store.rejections()).toEqual([]);

    const head = makeDevice(db, "devHead", headAInSchools, undefined, 2);
    await head.client.create("test.mark", "schools", { score: 7 });
    await head.client.sync();
    expect(await head.store.getServerRecord("test.setting", id)).toBeDefined();
    expect((await head.store.rejections()).map((r) => r.reason)).toEqual(["forbidden"]);

    // A site role whose site stream is unknown gets nothing stream-wide.
    const legacy = makeDevice(db, "devLegacy", headA, undefined, 3);
    await legacy.client.sync();
    expect(await legacy.store.getServerRecord("test.setting", id)).toBeUndefined();
  });
});
