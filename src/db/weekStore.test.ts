// Runs the real SQL against Node's built-in SQLite, in memory. Same SQLite
// engine as on the phone, so schema mistakes show up here first.
import { createRequire } from "node:module";
import { DEFAULT_SLEEP, planningWindows } from "../engine";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  deleteItem,
  loadSleep,
  saveSleep,
  setOverride,
  forgetPlacement,
  insertEvents,
  insertItem,
  loadWeek,
  migrate,
  moveEvent,
  queuePlacement,
  savePlacement,
  type Db,
} from "./weekStore";

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

const W1 = "2026-10-19";
const W2 = "2026-10-26";
const W3 = "2026-11-02";
const W4 = "2026-11-09";
const gym = { id: "g", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 5, preferredWindows: [{ start: 1020, end: 1320 }] };
const read = { id: "r", title: "Read", durationMin: 30, timesPerWeek: 4, priority: 3 };

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
});

describe("weekStore", () => {
  it("starts with an empty week and default settings", async () => {
    expect(await loadWeek(db, W1, W2)).toEqual({
      week: {
        fixed: [],
        rest: [],
        items: [],
        placements: [],
        settings: { ...DEFAULT_SETTINGS, dayWindows: planningWindows(DEFAULT_SLEEP, []) },
      },
      sleep: DEFAULT_SLEEP,
      overrides: [],
      queuedForNextWeek: [],
    });
  });

  it("migrating twice is a no-op", async () => {
    await migrate(db);
    expect(db.raw.prepare("PRAGMA user_version").get()).toEqual({ user_version: 3 });
  });

  it("round-trips and moves fixed events and rest blocks", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020 }]);
    await insertEvents(db, "rest", [{ id: "r1", title: "Bob's nap", start: 840, end: 900 }]);
    await moveEvent(db, "w1", 600, 1080);
    const { week } = await loadWeek(db, W1, W2);
    expect(week.fixed).toEqual([{ id: "w1", title: "Work", start: 600, end: 1080 }]);
    expect(week.rest).toEqual([{ id: "r1", title: "Bob's nap", start: 840, end: 900 }]);
  });

  it("round-trips flexible items, with and without preferred windows", async () => {
    await insertItem(db, gym);
    await insertItem(db, read);
    expect((await loadWeek(db, W1, W2)).week.items).toEqual([gym, read]);
  });

  it("rejects an event that ends before it starts", async () => {
    await expect(insertEvents(db, "fixed", [{ id: "x", title: "X", start: 600, end: 500 }])).rejects.toThrow(/CHECK/);
  });

  it("keeps placements per week", async () => {
    await insertItem(db, gym);
    const p = { id: "p1", itemId: "g", start: 1020, end: 1080, state: "locked" as const };
    await savePlacement(db, W1, p);
    expect((await loadWeek(db, W1, W2)).week.placements).toEqual([p]);
    expect((await loadWeek(db, W2, W3)).week.placements).toEqual([]);

    await savePlacement(db, W1, { ...p, state: "done" }); // overwrite
    expect((await loadWeek(db, W1, W2)).week.placements).toEqual([{ ...p, state: "done" }]);

    await forgetPlacement(db, "p1");
    expect((await loadWeek(db, W1, W2)).week.placements).toEqual([]);
  });

  it("queues a session into next week only, and undo removes it", async () => {
    await insertItem(db, gym);
    const p = { id: "p1", itemId: "g", start: 1020, end: 1080, state: "suggested" as const };
    await queuePlacement(db, W1, p, W2, "q1");

    const thisWeek = await loadWeek(db, W1, W2);
    expect(thisWeek.week.placements).toEqual([{ ...p, state: "skipped" }]);
    expect(thisWeek.queuedForNextWeek).toEqual([{ itemId: "g", title: "Gym" }]);
    expect((await loadWeek(db, W2, W3)).week.items[0]?.timesPerWeek).toBe(4); // 3 + 1 queued
    expect((await loadWeek(db, W3, W4)).week.items[0]?.timesPerWeek).toBe(3); // no pile-up after

    await forgetPlacement(db, "p1");
    expect((await loadWeek(db, W1, W2)).queuedForNextWeek).toEqual([]);
    expect((await loadWeek(db, W2, W3)).week.items[0]?.timesPerWeek).toBe(3);
  });

  it("deleting an item removes its placements and queue entries", async () => {
    await insertItem(db, gym);
    await insertItem(db, read);
    await queuePlacement(db, W1, { id: "p1", itemId: "g", start: 1020, end: 1080, state: "suggested" }, W2, "q1");
    await deleteItem(db, "g");
    const loaded = await loadWeek(db, W1, W2);
    expect(loaded.week.items).toEqual([read]);
    expect(loaded.week.placements).toEqual([]);
    expect(loaded.queuedForNextWeek).toEqual([]);
  });

  it("saves sleep settings", async () => {
    const mine = { ...DEFAULT_SLEEP, weekend: { wake: 600, bed: 1470 } };
    await saveSleep(db, mine);
    await saveSleep(db, mine); // second save updates, doesn't duplicate
    expect(await loadSleep(db)).toEqual(mine);
  });

  it("keeps one-off sleep changes per week and day, and feeds them to the planner", async () => {
    await setOverride(db, W1, 2, "wake", 360);
    await setOverride(db, W1, 2, "bed", 1380);
    const w1 = await loadWeek(db, W1, W2);
    expect(w1.overrides).toEqual([{ day: 2, wake: 360, bed: 1380 }]);
    expect(w1.week.settings.dayWindows?.[2]).toEqual({ start: 360, end: 1350 });
    expect((await loadWeek(db, W2, W3)).overrides).toEqual([]);

    await setOverride(db, W1, 2, "wake", null);
    expect((await loadWeek(db, W1, W2)).overrides).toEqual([{ day: 2, bed: 1380 }]);
    await setOverride(db, W1, 2, "bed", null);
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM day_overrides").get()).toEqual({ n: 0 });
  });

  it("rolls back a transaction that fails halfway", async () => {
    await insertItem(db, gym);
    const p = { id: "p1", itemId: "g", start: 1020, end: 1080, state: "suggested" as const };
    await queuePlacement(db, W1, p, W2, "q1");
    // Same queue id again: the INSERT fails, so the skipped placement must not be saved either.
    await expect(queuePlacement(db, W1, { ...p, id: "p2" }, W2, "q1")).rejects.toThrow();
    expect((await loadWeek(db, W1, W2)).week.placements.map((x) => x.id)).toEqual(["p1"]);
  });
});
