import { beforeEach, describe, expect, it } from "vitest";
import { nodeDb } from "./nodeDb";
import { deleteWeekItem, insertWeekItem, loadWeekItems, updateWeekItem } from "./weekItemsStore";
import { migrate } from "./weekStore";

const W1 = "2026-10-19";
const W2 = "2026-10-26";
const todo = { id: "t1", kind: "todo" as const, title: "Call dentist", done: false, progress: 0, target: 1, day: null };
const goal = { id: "g1", kind: "goal" as const, title: "Run", done: false, progress: 0, target: 3, day: null };

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
});

describe("weekItemsStore", () => {
  it("keeps to-dos and goals per week, in the order added", async () => {
    await insertWeekItem(db, W1, todo);
    await insertWeekItem(db, W1, goal);
    await insertWeekItem(db, W2, { ...todo, id: "t2", title: "Buy gift" });
    expect((await loadWeekItems(db, W1)).map((i) => i.id)).toEqual(["t1", "g1"]);
    expect((await loadWeekItems(db, W2)).map((i) => i.title)).toEqual(["Buy gift"]);
  });

  it("ticks, counts progress, renames and deletes", async () => {
    await insertWeekItem(db, W1, todo);
    await insertWeekItem(db, W1, goal);
    await updateWeekItem(db, { ...todo, done: true });
    await updateWeekItem(db, { ...goal, title: "Run 5k", progress: 2 });
    expect(await loadWeekItems(db, W1)).toEqual([
      { ...todo, done: true },
      { ...goal, title: "Run 5k", progress: 2 },
    ]);
    await deleteWeekItem(db, "t1");
    expect((await loadWeekItems(db, W1)).map((i) => i.id)).toEqual(["g1"]);
  });

  it("refuses a goal target below 1", async () => {
    await expect(insertWeekItem(db, W1, { ...goal, target: 0, day: null })).rejects.toThrow(/CHECK/);
  });

  it("keeps to-dos for one day apart from the week's", async () => {
    await insertWeekItem(db, W1, todo);
    await insertWeekItem(db, W1, { ...todo, id: "d1", title: "Post letter", day: 2 });
    expect((await loadWeekItems(db, W1)).map((i) => [i.id, i.day])).toEqual([
      ["t1", null],
      ["d1", 2],
    ]);
    await expect(insertWeekItem(db, W1, { ...todo, id: "bad", day: 7 })).rejects.toThrow(/CHECK/);
  });
});
