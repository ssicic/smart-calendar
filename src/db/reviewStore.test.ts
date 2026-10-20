import { beforeEach, describe, expect, it } from "vitest";
import { addLaterToWeek } from "./laterStore";
import { nodeDb } from "./nodeDb";
import { loadMovedOn } from "./reviewStore";
import { insertItem, migrate, queuePlacement } from "./weekStore";

const W1 = "2026-10-19";
const W2 = "2026-10-26";
const W3 = "2026-11-02";
const gym = { id: "g", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 3 };
const read = { id: "r", title: "Read", durationMin: 30, timesPerWeek: 2, priority: 1 };
const session = (id: string, itemId: string) => ({ id, itemId, start: 600, end: 660, state: "suggested" as const });

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await insertItem(db, gym);
  await insertItem(db, read);
});

describe("reviewStore", () => {
  it("lists where this week's queued sessions went: next week, Later, or another week", async () => {
    await queuePlacement(db, W1, session("p1", "g"), W2, "q1"); // next week
    await queuePlacement(db, W1, session("p2", "r"), null, "q2"); // Later
    await queuePlacement(db, W1, session("p3", "g"), null, "q3"); // Later, then put into W3
    await addLaterToWeek(db, "q3", W3);
    await queuePlacement(db, W2, session("p4", "r"), null, "q4"); // a different week: not listed

    expect(await loadMovedOn(db, W1)).toEqual([
      { title: "Gym", targetWeek: W2 },
      { title: "Read", targetWeek: null },
      { title: "Gym", targetWeek: W3 },
    ]);
  });
});
