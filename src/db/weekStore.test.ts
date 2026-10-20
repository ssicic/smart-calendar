// Runs the real SQL against Node's built-in SQLite, in memory. Same SQLite
// engine as on the phone, so schema mistakes show up here first.
import { createRequire } from "node:module";
import { DEFAULT_SLEEP, planWeek, planningWindows } from "../engine";
import { nextSlot, storedId } from "../ui/itemActions";
import { weekStartOf } from "../ui/weekDate";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  applyExceptions,
  changeEventForWeek,
  deleteEvent,
  deleteCategory,
  deleteItem,
  reorderCategories,
  updateCategory,
  loadSleep,
  saveSleep,
  setOverride,
  forgetPlacement,
  keepPlacement,
  insertCategory,
  insertEvents,
  insertRoutine,
  deleteRoutine,
  loadChecks,
  loadRoutines,
  setCheck,
  updateRoutine,
  renameEvent,
  renameEventsNamed,
  renameItem,
  loadCategories,
  setCategory,
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
        routines: [],
        items: [],
        placements: [],
        settings: { ...DEFAULT_SETTINGS, dayWindows: planningWindows(DEFAULT_SLEEP, []) },
      },
      sleep: DEFAULT_SLEEP,
      overrides: [],
      queuedForNextWeek: [],
      repeatingEventIds: [],
    });
  });

  it("migrating twice is a no-op", async () => {
    await migrate(db);
    expect(db.raw.prepare("PRAGMA user_version").get()).toEqual({ user_version: 10 });
  });

  it("round-trips and moves fixed events and routines", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020 }], null);
    await insertEvents(db, "routine", [{ id: "m1", title: "Morning routine", start: 420, end: 465, routineId: "morning" }], null);
    await moveEvent(db, "w1", 600, 1080);
    const { week } = await loadWeek(db, W1, W2);
    expect(week.fixed).toEqual([{ id: "w1", title: "Work", start: 600, end: 1080 }]);
    expect(week.routines).toEqual([{ id: "m1", title: "Morning routine", start: 420, end: 465, routineId: "morning" }]);
    expect(week.rest).toEqual([]);
  });

  it("starts a repeating event from the week it was added, not before", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020 }], null, W2);
    expect((await loadWeek(db, W1, W2)).week.fixed).toEqual([]);
    expect((await loadWeek(db, W2, W3)).week.fixed.map((e) => e.id)).toEqual(["w1"]);
    expect((await loadWeek(db, W4, W4)).week.fixed.map((e) => e.id)).toEqual(["w1"]);
  });

  it("starts repeating events from before v10 at this week", async () => {
    const old = nodeDb();
    await migrate(old, 9);
    old.raw.exec(`INSERT INTO events (id, kind, title, start_min, end_min) VALUES ('w1', 'fixed', 'Work', 540, 1020)`);
    old.raw.exec(`INSERT INTO events (id, kind, title, start_min, end_min, week_start) VALUES ('d1', 'fixed', 'Dentist', 600, 660, '${W1}')`);
    await migrate(old);
    const rows = old.raw.prepare("SELECT id, from_week FROM events ORDER BY id").all();
    expect(rows).toEqual([
      { id: "d1", from_week: null }, // one-off: unchanged
      { id: "w1", from_week: weekStartOf(new Date()) },
    ]);
  });

  it("shows a one-off event only in its own week, and a repeating one in every week", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020 }], null);
    await insertEvents(db, "fixed", [{ id: "d1", title: "Dentist", start: 600, end: 660 }], W2);
    expect((await loadWeek(db, W1, W2)).week.fixed.map((e) => e.id)).toEqual(["w1"]);
    expect((await loadWeek(db, W2, W3)).week.fixed.map((e) => e.id)).toEqual(["w1", "d1"]);
    expect((await loadWeek(db, W3, W3)).week.fixed.map((e) => e.id)).toEqual(["w1"]);
  });

  it("starts with a few activity groups and adds new ones at the end", async () => {
    const names = (await loadCategories(db)).map((c) => c.name);
    expect(names).toEqual(["Work", "Health", "Creativity", "Learning", "Social", "Home", "Fun", "Rest"]);
    await insertCategory(db, { id: "c1", name: "Music", color: "#EF4444" });
    expect((await loadCategories(db)).at(-1)).toEqual({ id: "c1", name: "Music", color: "#EF4444" });
  });

  it("stores an optional group on events and flexible items, and can change it", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020, categoryId: "work" }], null);
    await insertItem(db, { ...read, categoryId: "learning" });
    await insertItem(db, gym); // no group
    let { week } = await loadWeek(db, W1, W2);
    expect(week.fixed[0]?.categoryId).toBe("work");
    expect(week.items.map((i) => i.categoryId)).toEqual(["learning", undefined]);

    await setCategory(db, { kind: "item", id: "g" }, "health");
    await setCategory(db, { kind: "event", id: "w1" }, null);
    ({ week } = await loadWeek(db, W1, W2));
    expect(week.items.find((i) => i.id === "g")?.categoryId).toBe("health");
    expect(week.fixed[0]).toEqual({ id: "w1", title: "Work", start: 540, end: 1020 });
  });

  it("renames a group and changes its colour", async () => {
    await updateCategory(db, { id: "work", name: "Job", color: "#64748B" });
    expect((await loadCategories(db))[0]).toEqual({ id: "work", name: "Job", color: "#64748B" });
  });

  it("deletes a group; its events and items stay, with no group", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020, categoryId: "work" }], null);
    await insertItem(db, { ...read, categoryId: "work" });
    await insertItem(db, { ...gym, categoryId: "health" });
    await deleteCategory(db, "work");
    expect((await loadCategories(db)).map((c) => c.id)).not.toContain("work");
    const { week } = await loadWeek(db, W1, W2);
    expect(week.fixed[0]).toEqual({ id: "w1", title: "Work", start: 540, end: 1020 });
    expect(week.items.map((i) => i.categoryId)).toEqual([undefined, "health"]);
  });

  it("saves a new group order, also for groups added later", async () => {
    await insertCategory(db, { id: "c1", name: "Music", color: "#EF4444" });
    const ids = (await loadCategories(db)).map((c) => c.id);
    const reversed = [...ids].reverse();
    await reorderCategories(db, reversed);
    expect((await loadCategories(db)).map((c) => c.id)).toEqual(reversed);
    await insertCategory(db, { id: "c2", name: "Family", color: "#6366F1" });
    expect((await loadCategories(db)).at(-1)?.id).toBe("c2");
  });

  it("renames one event, all events with that name, or a flexible item", async () => {
    await insertEvents(db, "fixed", [1, 2, 3].map((d) => ({ id: `w${d}`, title: "Work", start: d * 1440 + 540, end: d * 1440 + 1020 })), null);
    await insertEvents(db, "routine", [{ id: "r1", title: "Work", start: 600, end: 660, routineId: "morning" }], null);
    await insertItem(db, gym);
    await renameEvent(db, "w1", "Office");
    await renameEventsNamed(db, "fixed", "Work", "Deep work");
    await renameItem(db, "g", "Climbing");
    const { week } = await loadWeek(db, W1, W2);
    expect(week.fixed.map((e) => e.title)).toEqual(["Office", "Deep work", "Deep work"]);
    expect(week.routines?.[0]?.title).toBe("Work"); // other kind: untouched
    expect(week.items[0]?.title).toBe("Climbing");
  });

  it("starts with no routines, saves new ones and edits them", async () => {
    expect(await loadRoutines(db)).toEqual([]);
    await insertRoutine(db, { id: "r1", name: "Morning", steps: [{ id: "a", text: "Water" }] });
    await insertRoutine(db, { id: "r2", name: "Gym bag", steps: [{ id: "b", text: "Towel" }] });
    await updateRoutine(db, { id: "r1", name: "Mornings", steps: [{ id: "c", text: "Brush teeth" }] });
    const after = await loadRoutines(db);
    expect(after.map((r) => r.name)).toEqual(["Mornings", "Gym bag"]);
    expect(after[0]?.steps).toEqual([{ id: "c", text: "Brush teeth" }]);
  });

  it("deletes a routine; its blocks stay as fixed events without ticks", async () => {
    await insertRoutine(db, { id: "r1", name: "Morning", steps: [{ id: "a", text: "Water" }] });
    await insertEvents(db, "routine", [{ id: "e1", title: "Morning", start: 420, end: 465, routineId: "r1" }], null);
    await setCheck(db, "e1", W1, "a", true);
    await deleteRoutine(db, "r1");
    expect(await loadRoutines(db)).toEqual([]);
    const { week } = await loadWeek(db, W1, W2);
    expect(week.fixed).toEqual([{ id: "e1", title: "Morning", start: 420, end: 465 }]);
    expect(week.routines).toEqual([]);
    expect(await loadChecks(db, W1)).toEqual([]);
  });

  it("removes the old ready-made routines unless something follows them", async () => {
    const old = nodeDb();
    await migrate(old, 8);
    old.raw.exec(`INSERT INTO events (id, kind, title, start_min, end_min, routine_id)
      VALUES ('e1', 'routine', 'Night routine', 1320, 1365, 'night')`);
    await migrate(old);
    expect((await loadRoutines(old)).map((r) => r.id)).toEqual(["night"]);
  });

  it("remembers ticked routine steps per event and week", async () => {
    await insertEvents(db, "routine", [{ id: "e1", title: "Morning routine", start: 420, end: 465, routineId: "morning" }], null);
    await setCheck(db, "e1", W1, "m1", true);
    await setCheck(db, "e1", W1, "m1", true); // twice is fine
    await setCheck(db, "e1", W1, "m2", true);
    await setCheck(db, "e1", W1, "m2", false);
    expect(await loadChecks(db, W1)).toEqual([{ eventId: "e1", stepId: "m1" }]);
    expect(await loadChecks(db, W2)).toEqual([]); // a new week starts unticked
    await deleteEvent(db, "e1");
    expect(await loadChecks(db, W1)).toEqual([]);
  });

  it("turns old rest blocks into fixed events in the Rest group", async () => {
    const old = nodeDb();
    await migrate(old, 7);
    old.raw.exec(`INSERT INTO events (id, kind, title, start_min, end_min) VALUES
      ('r1', 'rest', 'Nap', 840, 900), ('r2', 'rest', 'Walk', 600, 660), ('w1', 'fixed', 'Work', 540, 1020)`);
    old.raw.exec(`UPDATE events SET category_id = 'fun' WHERE id = 'r2'`);
    await migrate(old);
    const { week } = await loadWeek(old, W1, W2);
    expect(week.fixed.map((e) => [e.id, e.categoryId])).toEqual([
      ["w1", undefined],
      ["r2", "fun"], // already had a group: kept
      ["r1", "rest"],
    ]);
    expect((await loadCategories(old)).at(-1)).toEqual({ id: "rest", name: "Rest", color: "#2F9E5B" });
  });

  it("reuses a group the user already called Rest", async () => {
    const old = nodeDb();
    await migrate(old, 7);
    old.raw.exec(`INSERT INTO categories (id, name, color, position) VALUES ('mine', 'rest', '#000000', 9)`);
    old.raw.exec(`INSERT INTO events (id, kind, title, start_min, end_min) VALUES ('r1', 'rest', 'Nap', 840, 900)`);
    await migrate(old);
    expect((await loadWeek(old, W1, W2)).week.fixed[0]?.categoryId).toBe("mine");
    expect((await loadCategories(old)).filter((c) => c.name.toLowerCase() === "rest")).toHaveLength(1);
  });

  it("round-trips flexible items, with and without preferred windows", async () => {
    await insertItem(db, gym);
    await insertItem(db, read);
    expect((await loadWeek(db, W1, W2)).week.items).toEqual([gym, read]);
  });

  it("rejects an event that ends before it starts", async () => {
    await expect(insertEvents(db, "fixed", [{ id: "x", title: "X", start: 600, end: 500 }], null)).rejects.toThrow(/CHECK/);
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

  it("keeps a session at its time when it is unlocked, undone or brought back", async () => {
    await insertItem(db, gym);
    const p = { id: "p1", itemId: "g", start: 1020, end: 1080, state: "locked" as const };
    await savePlacement(db, W1, p);
    await keepPlacement(db, "p1");
    expect((await loadWeek(db, W1, W2)).week.placements).toEqual([{ ...p, state: "kept" }]);

    await queuePlacement(db, W1, { ...p, state: "kept" }, W2, "q1");
    await keepPlacement(db, "p1"); // "Bring back to this week"
    expect((await loadWeek(db, W1, W2)).week.placements).toEqual([{ ...p, state: "kept" }]);
    expect((await loadWeek(db, W2, W3)).week.items[0]?.timesPerWeek).toBe(3); // nothing left queued
  });

  it("remembers a suggested new slot through lock and unlock (same steps as the app)", async () => {
    await insertItem(db, gym);
    let n = 0;
    const newId = () => `s${n++}`;
    const reload = async () => {
      const { week } = await loadWeek(db, W1, W2);
      return { week, plan: planWeek(week) };
    };

    let { week, plan } = await reload();
    const first = plan.placements.find((p) => p.itemId === "g")!;
    const r = nextSlot(week, plan, first.id, newId); // "Suggest new slot"
    if (!r.ok) throw new Error(r.error);
    await savePlacement(db, W1, r.placement);
    const slot = { start: r.placement.start, end: r.placement.end };
    expect(slot.start).not.toBe(first.start);

    ({ plan } = await reload());
    const moved = plan.placements.find((p) => p.id === r.placement.id)!;
    expect(moved).toMatchObject({ ...slot, state: "kept" });

    await savePlacement(db, W1, { ...moved, id: storedId(moved, newId), state: "locked" }); // "Lock here"
    ({ plan } = await reload());
    expect(plan.placements.find((p) => p.id === moved.id)).toMatchObject({ ...slot, state: "locked" });

    await keepPlacement(db, moved.id); // "Unlock"
    ({ plan } = await reload());
    expect(plan.placements.find((p) => p.id === moved.id)).toMatchObject({ ...slot, state: "kept" });
  });

  it("turns sessions locked by older versions (every move locked) into kept ones", async () => {
    const old = nodeDb();
    await migrate(old, 4);
    old.raw.exec(`INSERT INTO placements VALUES ('a', '${W1}', 'g', 60, 120, 'locked'), ('b', '${W1}', 'g', 200, 260, 'done')`);
    // Raw SQL in the v4 shape (today's insert functions write newer columns).
    old.raw.exec(`INSERT INTO events (id, kind, title, start_min, end_min) VALUES ('w1', 'fixed', 'Work', 540, 1020)`);
    old.raw.exec(`INSERT INTO flexible_items (id, title, duration_min, times_per_week, priority) VALUES ('r', 'Read', 30, 4, 3)`);
    await migrate(old);
    const after = await loadWeek(old, W1, W2); // everything else survives the rebuild
    expect(after.week.fixed.map((e) => e.id)).toEqual(["w1"]);
    expect(after.week.items).toEqual([read]);
    expect(old.raw.prepare("SELECT id, state FROM placements ORDER BY id").all()).toEqual([
      { id: "a", state: "kept" },
      { id: "b", state: "done" },
    ]);
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

  it("moves or removes a repeating event just for one week", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020 }], null);
    await insertEvents(db, "fixed", [{ id: "d1", title: "Dentist", start: 600, end: 660 }], W1);
    expect((await loadWeek(db, W1, W2)).repeatingEventIds).toEqual(["w1"]);

    await changeEventForWeek(db, "w1", W1, { start: 700, end: 1180 });
    await changeEventForWeek(db, "w1", W1, { start: 720, end: 1200 }); // second change overwrites
    expect((await loadWeek(db, W1, W2)).week.fixed).toEqual([
      { id: "d1", title: "Dentist", start: 600, end: 660 },
      { id: "w1", title: "Work", start: 720, end: 1200 }, // sorted by its new time
    ]);
    expect((await loadWeek(db, W2, W3)).week.fixed).toEqual([{ id: "w1", title: "Work", start: 540, end: 1020 }]);

    await changeEventForWeek(db, "w1", W2, null);
    expect((await loadWeek(db, W2, W3)).week.fixed).toEqual([]);
    expect((await loadWeek(db, W3, W4)).week.fixed.map((e) => e.id)).toEqual(["w1"]);
  });

  it("moving every week drops the shown week's one-week change, others stay", async () => {
    await insertEvents(db, "fixed", [{ id: "w1", title: "Work", start: 540, end: 1020 }], null);
    await changeEventForWeek(db, "w1", W1, { start: 720, end: 1200 });
    await changeEventForWeek(db, "w1", W2, null);
    await moveEvent(db, "w1", 480, 960, W1);
    expect((await loadWeek(db, W1, W2)).week.fixed[0]).toMatchObject({ start: 480, end: 960 });
    expect((await loadWeek(db, W2, W3)).week.fixed).toEqual([]);
    expect((await loadWeek(db, W3, W4)).week.fixed[0]).toMatchObject({ start: 480, end: 960 });

    await deleteEvent(db, "w1"); // every week, and its one-week changes with it
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM event_exceptions").get()).toEqual({ n: 0 });
  });

  it("refuses a one-week change that ends before it starts", async () => {
    await expect(changeEventForWeek(db, "w1", W1, { start: 600, end: 600 })).rejects.toThrow();
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

describe("applyExceptions", () => {
  const row = (id: string, start: number) => ({
    id, kind: "fixed" as const, title: id, start_min: start, end_min: start + 60, week_start: null, category_id: null,
    routine_id: null,
  });

  it("moves, removes, and leaves other events alone", () => {
    const out = applyExceptions(
      [row("a", 0), row("b", 100), row("c", 200)],
      [
        { event_id: "a", start_min: 500, end_min: 560 },
        { event_id: "b", start_min: null, end_min: null },
      ],
    );
    expect(out.map((e) => [e.id, e.start_min, e.end_min])).toEqual([
      ["a", 500, 560],
      ["c", 200, 260],
    ]);
  });
});
