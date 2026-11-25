/**
 * Randomised sync harness. Several phones create, edit and void records while the
 * network drops requests, drops responses and delivers duplicates. Afterwards the
 * network is healed and every phone syncs. We then check that nothing was lost,
 * nothing was duplicated, every phone agrees with the server, and the audit trail is
 * complete. Each seed is a reproducible scenario; a failure prints its seed.
 */
import { auditLog, syncMutations, type Db } from "@eu/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toWire } from "../src/server";
import { adminA, headA, headB, makeDevice, marks, openStore, people, readings, rng, serverClock, setupDb, sysadmin, type Device, type StoreKind } from "./fixtures";

const SEEDS = (process.env.SYNC_FUZZ_SEEDS ?? "1,2,3,4,5,6").split(",").map(Number);
const STEPS = Number(process.env.SYNC_FUZZ_STEPS ?? 120);

let db: Db;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await setupDb());
  serverClock.now = new Date("2026-12-01T08:00:00Z");
});
afterEach(async () => close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const all = async (table: unknown) => ((await (db as any).select().from(table)) as Record<string, unknown>[]);

const STORES: StoreKind[] = ["memory", "sqlite"];

describe.each(STORES)("sync fuzz harness (%s phone store)", (kind) => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: no loss, no duplicates, all phones converge`, async () => {
      const r = rng(seed);
      const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
      const devices: (Device & { scope: string })[] = [
        { ...makeDevice(db, "phone-a1", headA, r, 1, await openStore(kind)), scope: "A" },
        { ...makeDevice(db, "phone-a2", adminA, r, 2, await openStore(kind)), scope: "A" },
        { ...makeDevice(db, "phone-b1", headB, r, 3, await openStore(kind)), scope: "B" },
        { ...makeDevice(db, "web-admin", sysadmin, r, 4, await openStore(kind)), scope: "A" },
      ];
      devices.forEach((d, i) => (d.clock.now = new Date(Date.parse("2026-12-01T08:00:00Z") + i * 7)));

      const created = { "test.reading": new Set<string>(), "test.person": new Set<string>(), "test.mark": new Set<string>() };
      const markEdits = new Map<string, { t: number; score: number }[]>();
      let enqueued = 0;

      for (let step = 0; step < STEPS; step++) {
        const d = pick(devices);
        d.clock.now = new Date(d.clock.now.getTime() + 1000 + Math.floor(r() * 60_000));
        serverClock.now = new Date(Math.max(serverClock.now.getTime(), d.clock.now.getTime()));
        d.transport.faults = { dropRequest: 0.2, dropResponse: 0.2, duplicate: 0.1 };
        const action = r();
        try {
          if (action < 0.2) {
            created["test.reading"].add(await d.client.create("test.reading", d.scope, { value: Math.floor(r() * 100) }));
            enqueued++;
          } else if (action < 0.32) {
            created["test.person"].add(await d.client.create("test.person", d.scope, { name: `P${step}`, village: "V" }));
            enqueued++;
          } else if (action < 0.42) {
            const score = Math.floor(r() * 100);
            const id = await d.client.create("test.mark", d.scope, { score });
            created["test.mark"].add(id);
            markEdits.set(id, [{ t: d.clock.now.getTime(), score }]);
            enqueued++;
          } else if (action < 0.6) {
            const visible = (await d.client.list("test.person")).filter((p) => !p.voidedAt);
            if (visible.length) {
              const p = pick(visible);
              const field = pick(["name", "phone", "village"]);
              await d.client.update("test.person", String(p.id), { [field]: field === "name" ? `N${step}` : `${field}${Math.floor(r() * 3)}` });
              enqueued++;
            }
          } else if (action < 0.75) {
            const visible = await d.client.list("test.mark");
            if (visible.length) {
              const m = pick(visible);
              const score = Math.floor(r() * 100);
              await d.client.update("test.mark", String(m.id), { score });
              markEdits.get(String(m.id))?.push({ t: d.clock.now.getTime(), score });
              enqueued++;
            }
          } else if (action < 0.8) {
            const visible = (await d.client.list("test.reading")).filter((x) => !x.voidedAt);
            if (visible.length && d.user !== adminA) {
              await d.client.void("test.reading", String(pick(visible).id), "duplicate entry");
              enqueued++;
            }
          } else {
            await d.client.sync();
          }
        } catch (err) {
          throw new Error(`seed ${seed} step ${step}: ${String(err)}`);
        }
      }

      // Heal the network and let everyone catch up.
      for (const d of devices) d.transport.faults = { dropRequest: 0, dropResponse: 0, duplicate: 0 };
      for (let round = 0; round < 3; round++) {
        for (const d of devices) {
          const out = await d.client.sync();
          expect(out.ok, `seed ${seed}: ${d.id} failed to sync: ${out.error}`).toBe(true);
        }
      }

      // 1. Nothing stuck on any phone.
      for (const d of devices) expect(await d.store.outboxSize(), `seed ${seed}: ${d.id} outbox`).toBe(0);

      // 2. No loss and no duplicates: exactly the created records exist on the server.
      const serverRows = {
        "test.reading": await all(readings),
        "test.person": await all(people),
        "test.mark": await all(marks),
      };
      for (const [name, ids] of Object.entries(created)) {
        const onServer = serverRows[name as keyof typeof serverRows].map((x) => String(x.id));
        expect(new Set(onServer), `seed ${seed}: ${name} ids`).toEqual(ids);
        expect(onServer.length, `seed ${seed}: ${name} duplicates`).toBe(ids.size);
      }

      // 3. Every mutation was answered exactly once, and every insert is in the audit trail.
      expect((await all(syncMutations)).length, `seed ${seed}: mutations`).toBe(enqueued);
      const audits = await all(auditLog);
      const appliedPerMutation = new Map<string, number>();
      for (const a of audits) {
        if (!["insert", "update", "void"].includes(String(a.op))) continue;
        appliedPerMutation.set(String(a.mutationId), (appliedPerMutation.get(String(a.mutationId)) ?? 0) + 1);
      }
      for (const [id, count] of appliedPerMutation) expect(count, `seed ${seed}: mutation ${id} applied twice`).toBe(1);
      const inserts = audits.filter((a) => a.op === "insert").length;
      expect(inserts).toBe(created["test.reading"].size + created["test.person"].size + created["test.mark"].size);

      // 4. Every phone holds exactly the server's current copy of everything it may read.
      for (const d of devices) {
        const readable = (row: Record<string, unknown>) => d.user === sysadmin || row.scopeId === d.scope;
        for (const [name, rows] of Object.entries(serverRows)) {
          const expected = rows.filter(readable).map((x) => toWire(x)).sort((a, b) => a.id.localeCompare(b.id));
          const held = (await d.store.listServerRecords(name)).sort((a, b) => a.id.localeCompare(b.id));
          expect(held, `seed ${seed}: ${d.id} ${name}`).toEqual(expected);
        }
      }

      // 5. Last-writer-wins really keeps the latest edit by phone time.
      for (const row of serverRows["test.mark"]) {
        const edits = markEdits.get(String(row.id)) ?? [];
        const latest = edits.reduce((a, b) => (b.t >= a.t ? b : a));
        expect(row.score, `seed ${seed}: mark ${String(row.id)}`).toBe(latest.score);
      }
    }, 120_000);
  }
});
