// Runs the real SQL against Node's built-in SQLite, in memory. Same SQLite
// engine as on the phone, so schema mistakes show up here first.
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, insertEvents, insertItem, loadWeek, migrate, type Db } from "./weekStore";

// Loaded at runtime because vitest 2 doesn't know the newer `node:sqlite` built-in.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;
type Param = string | number | null;

/** Wraps Node's synchronous API in the async shape expo-sqlite has. */
function nodeDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  return {
    raw,
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params) => raw.prepare(sql).run(...params),
    getAllAsync: async <T>(sql: string, params: Param[]) => raw.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, params: Param[]) => (raw.prepare(sql).get(...params) as T) ?? null,
  };
}

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
});

describe("weekStore", () => {
  it("starts with an empty week and default settings", async () => {
    expect(await loadWeek(db)).toEqual({ fixed: [], rest: [], items: [], placements: [], settings: DEFAULT_SETTINGS });
  });

  it("migrating twice is a no-op", async () => {
    await migrate(db);
    expect(db.raw.prepare("PRAGMA user_version").get()).toEqual({ user_version: 1 });
  });

  it("round-trips fixed events and rest blocks", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020 }]);
    await insertEvents(db, "rest", [{ id: "r1", title: "Bob's nap", start: 840, end: 900 }]);
    const week = await loadWeek(db);
    expect(week.fixed).toEqual([{ id: "w1", title: "Work", start: 540, end: 1020 }]);
    expect(week.rest).toEqual([{ id: "r1", title: "Bob's nap", start: 840, end: 900 }]);
  });

  it("round-trips flexible items, with and without preferred windows", async () => {
    const gym = { id: "g", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 5, preferredWindows: [{ start: 1020, end: 1320 }] };
    const read = { id: "r", title: "Read", durationMin: 30, timesPerWeek: 4, priority: 3 };
    await insertItem(db, gym);
    await insertItem(db, read);
    expect((await loadWeek(db)).items).toEqual([gym, read]);
  });

  it("rejects an event that ends before it starts", async () => {
    await expect(insertEvents(db, "fixed", [{ id: "x", title: "X", start: 600, end: 500 }])).rejects.toThrow(/CHECK/);
  });
});
