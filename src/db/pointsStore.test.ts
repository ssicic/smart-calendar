import { beforeEach, describe, expect, it } from "vitest";
import { surprise } from "../ui/points";
import { insertGoal } from "./goalsStore";
import { nodeDb } from "./nodeDb";
import {
  deleteReward,
  insertReward,
  loadPointFacts,
  loadPointsSummary,
  spendOn,
  syncPoints,
  undoSpend,
} from "./pointsStore";
import { insertWeekItem, updateWeekItem } from "./weekItemsStore";
import { deleteItem, insertEvents, insertItem, migrate, savePlacement, setEventDone } from "./weekStore";

const W1 = "2026-10-26";
const W2 = "2026-11-02";

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
});

const todo = (id: string, done: boolean) => ({ id, kind: "todo" as const, title: id, done, progress: 0, target: 1, day: null });
/** The points without surprises, so the test doesn't depend on which keys are lucky. */
const plain = async () =>
  (await db.getAllAsync<{ key: string; points: number; bonus: number }>("SELECT key, points, bonus FROM points ORDER BY key", [])).map(
    (r) => [r.key, r.points - r.bonus],
  );

describe("points", () => {
  it("works out facts: sessions, weekly targets, done events with this week's length", async () => {
    await insertItem(db, { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 2, priority: 3 }, null, W1);
    await savePlacement(db, W1, { id: "p1", itemId: "gym", start: 1080, end: 1140, state: "done" });
    await savePlacement(db, W1, { id: "p2", itemId: "gym", start: 2520, end: 2580, state: "done" });
    await insertEvents(db, "fixed", [{ id: "work", title: "Work", start: 540, end: 780 }], null, W1);
    await setEventDone(db, "work", W1, true);
    await db.runAsync("INSERT INTO event_exceptions (event_id, week_start, start_min, end_min) VALUES ('work', ?, 540, 600)", [W2]);
    await setEventDone(db, "work", W2, true);

    const f = await loadPointFacts(db, W2);
    expect(f.sessions.map((s) => s.id)).toEqual(["p1", "p2"]);
    expect(f.targets).toEqual([{ itemId: "gym", weekStart: W1, title: "Gym", done: 2, target: 2 }]);
    expect(f.events.map((e) => [e.weekStart, e.minutes])).toEqual([
      [W1, 240],
      [W2, 60],
    ]);
  });

  it("syncs: earns, takes back an untick this week, keeps last week's", async () => {
    await insertWeekItem(db, W1, todo("old", true));
    await insertWeekItem(db, W2, todo("now", true));
    expect((await syncPoints(db, W2)).map((e) => e.key).sort()).toEqual(["todo:now", "todo:old"]);
    expect(await syncPoints(db, W2)).toEqual([]); // nothing new

    await updateWeekItem(db, todo("now", false));
    await db.runAsync("DELETE FROM week_items WHERE id = 'old'", []);
    await syncPoints(db, W2);
    expect(await plain()).toEqual([["todo:old", 5]]);
  });

  it("keeps a past week's points when its item is deleted", async () => {
    await insertItem(db, { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 1, priority: 3 }, null, W1);
    await savePlacement(db, W1, { id: "p1", itemId: "gym", start: 1080, end: 1140, state: "done" });
    await syncPoints(db, W1);
    await deleteItem(db, "gym");
    await syncPoints(db, W2);
    expect(await plain()).toEqual([
      ["session:p1:2026-10-26", 10],
      ["target:gym:2026-10-26", 30],
    ]);
  });

  it("counts a done year goal for the current week", async () => {
    await insertGoal(db, { id: "y", title: "New job", horizon: "year", period: "2026", parentId: null, done: true });
    const [e] = await syncPoints(db, W2);
    expect(e).toMatchObject({ key: "goal:y", weekStart: W2, points: 500 + surprise("goal:y") });
  });

  it("spends on rewards and undoes a spend", async () => {
    await insertWeekItem(db, W2, todo("a", true));
    await syncPoints(db, W2);
    const earned = (await loadPointsSummary(db, W2)).balance;
    await insertReward(db, { id: "r1", title: "Coffee out", price: 40 });
    await insertReward(db, { id: "r2", title: "Concert", price: 1000 });
    await spendOn(db, { id: "r1", title: "Coffee out", price: 40 }, "s1", "2026-11-03");
    let s = await loadPointsSummary(db, W2);
    expect(s.balance).toBe(earned - 40);
    expect(s.week).toBe(earned);
    expect(s.rewards.map((r) => r.title)).toEqual(["Coffee out", "Concert"]);
    expect(s.spends).toEqual([{ id: "s1", title: "Coffee out", price: 40, spentOn: "2026-11-03" }]);
    await undoSpend(db, "s1");
    await deleteReward(db, "r2");
    s = await loadPointsSummary(db, W2);
    expect(s.balance).toBe(earned);
    expect(s.rewards.map((r) => r.id)).toEqual(["r1"]);
  });
});
