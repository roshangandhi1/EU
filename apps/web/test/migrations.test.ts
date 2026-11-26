import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Drizzle's migrator applies a migration only if its journal time ("when") is later than the last
 * one applied. A migration dated earlier than its predecessor is skipped silently in production
 * (0009 was dated 27 Nov 2026 03:00 UTC, so anything generated before then would never run).
 */
describe("migration journal", () => {
  it("dates every migration after the one before it", () => {
    const j = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/db/migrations/meta/_journal.json", import.meta.url)), "utf8")) as { entries: { idx: number; when: number; tag: string }[] };
    const late = j.entries.filter((e, i) => i > 0 && e.when <= j.entries[i - 1]!.when).map((e) => e.tag);
    expect(late).toEqual([]);
  });
});
