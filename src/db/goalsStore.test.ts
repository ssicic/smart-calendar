import { beforeEach, describe, expect, it } from "vitest";
import { deleteGoal, insertGoal, loadGoals, updateGoal } from "./goalsStore";
import { nodeDb } from "./nodeDb";
import { insertWeekItem, loadWeekItems } from "./weekItemsStore";
import { insertItem, loadWeek, migrate } from "./weekStore";

const W1 = "2026-10-19";
const fit = { id: "y1", title: "Get fit", horizon: "year" as const, period: "2026", parentId: null, done: false };
const run = { id: "m1", title: "Run 5k", horizon: "month" as const, period: "2026-10", parentId: "y1", done: false };

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
});

describe("goalsStore", () => {
  it("keeps year and month goals per period, with parents", async () => {
    await insertGoal(db, fit);
    await insertGoal(db, run);
    await insertGoal(db, { ...run, id: "m2", title: "Old", period: "2026-09" });
    expect(await loadGoals(db, ["2026", "2026-10"])).toEqual([fit, run]);
    expect(await loadGoals(db, [])).toEqual([]);
  });

  it("renames, ticks off and re-parents a goal", async () => {
    await insertGoal(db, fit);
    await insertGoal(db, run);
    await updateGoal(db, { ...run, title: "Run 10k", done: true, parentId: null });
    expect((await loadGoals(db, ["2026-10"]))[0]).toEqual({ ...run, title: "Run 10k", done: true, parentId: null });
  });

  it("links a week goal to a month goal", async () => {
    const weekGoal = { id: "w1", kind: "goal" as const, title: "Run 3x", done: false, progress: 0, target: 3, day: null, goalId: "m1" };
    await insertWeekItem(db, W1, weekGoal);
    expect((await loadWeekItems(db, W1))[0]?.goalId).toBe("m1");
  });

  it("deleting a goal keeps what was part of it, unlinked", async () => {
    await insertGoal(db, fit);
    await insertGoal(db, run);
    const weekGoal = { id: "w1", kind: "goal" as const, title: "Run 3x", done: false, progress: 0, target: 3, day: null, goalId: "y1" };
    await insertWeekItem(db, W1, weekGoal);
    await insertItem(db, { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 3, goalId: "y1" });
    await deleteGoal(db, "y1");
    expect(await loadGoals(db, ["2026"])).toEqual([]);
    expect((await loadGoals(db, ["2026-10"]))[0]?.parentId).toBeNull();
    expect((await loadWeekItems(db, W1))[0]?.goalId).toBeUndefined();
    expect((await loadWeek(db, W1, W1)).week.items[0]?.goalId).toBeUndefined();
  });
});
