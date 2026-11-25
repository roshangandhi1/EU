import * as SQLite from "expo-sqlite";
import { SqlStore, type SqlDriver } from "@eu/sync/sql-store";

/**
 * Adapts expo-sqlite to the SqlDriver the shared SqlStore needs. The database is encrypted with
 * SQLCipher (enabled by the expo-sqlite config plugin in app.json); the key lives in secure storage.
 * Transactions are queued so two never interleave on the single connection.
 */
export async function openEncryptedDb(key: string, name = "gocongo.db"): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  // The key must be set before any other statement touches the file.
  await db.execAsync(`PRAGMA key = '${key.replace(/'/g, "''")}';`);
  await db.execAsync("PRAGMA journal_mode = WAL;");
  // Fails here (not later, mid-sync) if the key is wrong.
  await db.getAllAsync("SELECT count(*) FROM sqlite_master;");
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

export async function openStore(key: string): Promise<{ store: SqlStore; driver: SqlDriver }> {
  const driver = expoDriver(await openEncryptedDb(key));
  return { store: await SqlStore.open(driver), driver };
}
