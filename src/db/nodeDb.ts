// Test helper: Node's built-in SQLite in memory, in the async shape expo-sqlite
// has, so store tests run the real SQL. Used only by tests.
import { createRequire } from "node:module";
import type { Db } from "./weekStore";

// Loaded at runtime because vitest 2 doesn't know the newer `node:sqlite` built-in.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;
type Param = string | number | null;

export function nodeDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  return {
    raw,
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params) => raw.prepare(sql).run(...(params as Param[])),
    getAllAsync: async <T>(sql: string, params: Param[]) => raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, params: Param[]) => (raw.prepare(sql).get(...params) as T) ?? null,
    withTransactionAsync: async (task) => {
      raw.exec("BEGIN");
      try {
        await task();
        raw.exec("COMMIT");
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
