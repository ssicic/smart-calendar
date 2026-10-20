import { beforeEach, describe, expect, it } from "vitest";
import { addLaterToWeek, deleteLater, loadLater } from "./laterStore";
import { nodeDb } from "./nodeDb";
import { deleteItem, insertItem, keepPlacement, loadWeek, migrate, queuePlacement } from "./weekStore";

const W1 = "2026-10-19";
const W2 = "2026-10-26";
const W3 = "2026-11-02";
const gym = { id: "g", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 5 };
const read = { id: "r", title: "Read", durationMin: 30, timesPerWeek: 2, priority: 3 };
const session = (id: string, itemId = "g") => ({ id, itemId, start: 1020, end: 1080, state: "suggested" as const });
const times = async (week: string, next: string) =>
  (await loadWeek(db, week, next)).week.items.map((i) => i.timesPerWeek);

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await insertItem(db, gym);
  await insertItem(db, read);
});

describe("laterStore", () => {
  it("moves a session to Later: skipped this week, in no week at all", async () => {
    await queuePlacement(db, W1, session("p1"), null, "q1");
    const w1 = await loadWeek(db, W1, W2);
    expect(w1.week.placements.map((p) => p.state)).toEqual(["skipped"]);
    expect(w1.queuedForNextWeek).toEqual([]); // not "next week"
    expect(await times(W2, W3)).toEqual([3, 2]);
    expect(await loadLater(db)).toEqual([{ id: "q1", itemId: "g", title: "Gym" }]);
  });

  it("lists Later oldest first, next-week entries not included", async () => {
    await queuePlacement(db, W1, session("p1"), null, "q1");
    await queuePlacement(db, W1, session("p2", "r"), null, "q2");
    await queuePlacement(db, W1, session("p3"), W2, "q3");
    expect((await loadLater(db)).map((e) => e.title)).toEqual(["Gym", "Read"]);
  });

  it("adds one session from Later to the chosen week only", async () => {
    await queuePlacement(db, W1, session("p1"), null, "q1");
    await addLaterToWeek(db, "q1", W2);
    expect(await loadLater(db)).toEqual([]);
    expect(await times(W2, W3)).toEqual([4, 2]); // 3 + 1
    expect(await times(W3, "2026-11-09")).toEqual([3, 2]); // no pile-up
    expect((await loadWeek(db, W1, W2)).queuedForNextWeek).toEqual([{ itemId: "g", title: "Gym" }]);
  });

  it("deletes from Later; the old session stays skipped", async () => {
    await queuePlacement(db, W1, session("p1"), null, "q1");
    await deleteLater(db, "q1");
    expect(await loadLater(db)).toEqual([]);
    expect((await loadWeek(db, W1, W2)).week.placements.map((p) => p.state)).toEqual(["skipped"]);
  });

  it("Later entries never change a week's queue", async () => {
    await queuePlacement(db, W1, session("p1"), W2, "q1");
    await addLaterToWeek(db, "q1", W3); // not a Later entry
    await deleteLater(db, "q1");
    expect(await times(W2, W3)).toEqual([4, 2]);
  });

  it("bringing the session back, or deleting the item, empties Later", async () => {
    await queuePlacement(db, W1, session("p1"), null, "q1");
    await queuePlacement(db, W1, session("p2", "r"), null, "q2");
    await keepPlacement(db, "p1");
    expect((await loadLater(db)).map((e) => e.id)).toEqual(["q2"]);
    await deleteItem(db, "r");
    expect(await loadLater(db)).toEqual([]);
  });

  it("v12 keeps queue entries made before it, in order", async () => {
    const old = nodeDb();
    await migrate(old, 11);
    await insertItem(old, gym);
    await queuePlacement(old, W1, session("p1"), W2, "q1");
    await queuePlacement(old, W1, session("p2"), W2, "q2");
    await migrate(old);
    expect((await loadWeek(old, W1, W2)).queuedForNextWeek).toHaveLength(2);
    expect((await loadWeek(old, W2, W3)).week.items[0]?.timesPerWeek).toBe(5);
    expect(await loadLater(old)).toEqual([]);
  });
});
