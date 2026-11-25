import * as SQLite from "expo-sqlite";
import { SqlStore, type SqlDriver } from "@eu/sync/sql-store";

/**
 * Adapts expo-sqlite to the SqlDriver the shared SqlStore needs. The database is encrypted with
 * SQLCipher (enabled by the expo-sqlite config plugin in app.json); the key lives in secure storage.
 * Transactions are queued so two never interleave on the single connection.
 */
export const DB_NAME = "gocongo.db";

export async function openEncryptedDb(key: string, name = DB_NAME): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  try {
    // The key must be set before any other statement touches the file.
    await db.execAsync(`PRAGMA key = '${key.replace(/'/g, "''")}';`);
    await db.execAsync("PRAGMA journal_mode = WAL;");
    // Fails here (not later, mid-sync) if the key is wrong.
    await db.getAllAsync("SELECT count(*) FROM sqlite_master;");
  } catch (e) {
    await db.closeAsync().catch(() => undefined);
    throw e;
  }
  return db;
}

export function expoDriver(db: SQLite.SQLiteDatabase): SqlDriver {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, params as SQLite.SQLiteBindParams);
    },
    all: <T,>(sql: string, params: unknown[] = []) => db.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams),
    transaction: (fn) => {
      const next = queue.then(() => db.withTransactionAsync(fn));
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

export async function openStore(key: string): Promise<{ store: SqlStore; driver: SqlDriver; db: SQLite.SQLiteDatabase }> {
  const db = await openEncryptedDb(key);
  const driver = expoDriver(db);
  return { store: await SqlStore.open(driver), driver, db };
}

/** Deletes the database file with its -wal/-shm companions (revoked phone, or a file no key can open). */
export async function deleteDb(db?: SQLite.SQLiteDatabase | null): Promise<void> {
  if (db) await db.closeAsync().catch(() => undefined);
  await SQLite.deleteDatabaseAsync(DB_NAME).catch((e: unknown) => console.warn("delete db failed", e));
}
