import type { SqlDriver } from "@eu/sync/sql-store";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { Session } from "./session";

/** A photo taken for a form whose screen was gone when the camera came back (Android killed the app). */
export interface RecoveredPhoto {
  slot: string;
  fileId: string;
}

/**
 * Half-filled forms, kept in the encrypted database so nothing typed is lost when Android kills
 * the app behind the camera, the phone locks, or the battery dies. One draft per form and site.
 */
export class Drafts {
  private constructor(private db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<Drafts> {
    await db.exec("CREATE TABLE IF NOT EXISTS app_drafts (key TEXT PRIMARY KEY, body TEXT NOT NULL, saved_at TEXT NOT NULL);");
    return new Drafts(db);
  }

  async get<T>(key: string): Promise<{ value: T; savedAt: string } | null> {
    const [row] = await this.db.all<{ body: string; saved_at: string }>("SELECT body, saved_at FROM app_drafts WHERE key = ?", [key]);
    if (!row) return null;
    try {
      return { value: JSON.parse(row.body) as T, savedAt: row.saved_at };
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.run(
      "INSERT INTO app_drafts (key, body, saved_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET body = excluded.body, saved_at = excluded.saved_at",
      [key, JSON.stringify(value), new Date().toISOString()],
    );
  }

  async clear(key: string): Promise<void> {
    await this.db.run("DELETE FROM app_drafts WHERE key = ?", [key]);
  }

  /** Photos recovered for this form after the app was killed during capture; removed once read. */
  async takeRecovered(draftKey: string): Promise<RecoveredPhoto[]> {
    const k = `recovered:${draftKey}`;
    const got = await this.get<RecoveredPhoto[]>(k);
    if (got) await this.clear(k);
    return got?.value ?? [];
  }

  async addRecovered(draftKey: string, p: RecoveredPhoto): Promise<void> {
    const k = `recovered:${draftKey}`;
    const cur = (await this.get<RecoveredPhoto[]>(k))?.value ?? [];
    await this.set(k, [...cur, p]);
  }

  async wipe(): Promise<void> {
    await this.db.run("DELETE FROM app_drafts");
  }
}

/**
 * Keeps a form's state in a draft while it has input, and gives it back when the form reopens.
 * `snapshot` is the form state to keep (JSON); `dirty` says whether there is anything worth keeping.
 * `onRestore` runs once, with the saved state (or null) and any photo recovered from a killed camera.
 */
export function useDraft<T>(
  session: Session,
  key: string,
  snapshot: T,
  dirty: boolean,
  onRestore: (value: T | null, recovered: RecoveredPhoto[]) => void,
): { ready: boolean; restoredAt: string | null; clear: () => Promise<void> } {
  const [ready, setReady] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleared = useRef(false);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [got, recovered] = await Promise.all([session.drafts.get<T>(key), session.drafts.takeRecovered(key)]);
        if (!live) return;
        if (got || recovered.length) restoreRef.current(got?.value ?? null, recovered);
        if (got) setRestoredAt(got.savedAt);
      } catch {
        // a broken draft is not worth blocking the form for
      }
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [session, key]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p && !cleared.current) void session.drafts.set(key, p.value).catch(() => undefined);
  };

  const json = JSON.stringify(snapshot);
  useEffect(() => {
    if (!ready || cleared.current) return;
    if (!dirty) {
      pending.current = null;
      void session.drafts.clear(key).catch(() => undefined);
      return;
    }
    pending.current = { value: snapshot };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, dirty, ready]);

  // Write at once when the app goes to the background (Android may kill it there) or the form closes.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s !== "active" && flush());
    return () => {
      sub.remove();
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ready,
    restoredAt,
    clear: async () => {
      cleared.current = true;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      await session.drafts.clear(key).catch(() => undefined);
    },
  };
}
