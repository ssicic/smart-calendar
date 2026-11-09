import { beforeEach, describe, expect, it } from "vitest";
import { DAY } from "../engine";
import { nodeDb } from "../db/nodeDb";
import { insertEvents, insertItem, migrate } from "../db/weekStore";
import { weekStartOf } from "../ui/weekDate";
import { loadToday, markDoneToday } from "./todayData";

// Wednesday 2026-11-04, 12:30. Day index 2.
const now = new Date(2026, 10, 4, 12, 30);
const week = weekStartOf(now);
const wed = (h: number, m = 0) => 2 * DAY + h * 60 + m;

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await insertEvents(db, "fixed", [
    { id: "standup", title: "Standup", start: wed(9), end: wed(9, 30) },
    { id: "lunch", title: "Lunch", start: wed(12), end: wed(13) },
    { id: "call", title: "Call", start: wed(15), end: wed(16) },
    { id: "thu", title: "Thursday thing", start: 3 * DAY + 600, end: 3 * DAY + 660 },
  ], week);
});

describe("loadToday", () => {
  it("shows only today, with the first unfinished one that hasn't ended as next", async () => {
    const t = await loadToday(db, now);
    expect(t.rows.map((r) => r.id)).toEqual(["standup", "lunch", "call"]);
    expect(t.next?.id).toBe("lunch"); // still running at 12:30
    expect(t.later.map((r) => r.id)).toEqual(["call"]);
    expect(t.done).toBe(0);
  });

  it("includes flexible sessions the planner puts on today", async () => {
    await insertItem(db, { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 7, priority: 5 }, week);
    const t = await loadToday(db, now);
    expect(t.rows.some((r) => r.itemId === "gym")).toBe(true);
  });
});

describe("markDoneToday", () => {
  it("marks an event done for this week, and next moves on", async () => {
    await markDoneToday(db, now, "lunch");
    const t = await loadToday(db, now);
    expect(t.done).toBe(1);
    expect(t.next?.id).toBe("call");
  });

  it("saves a planned session as done", async () => {
    await insertItem(db, { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 7, priority: 5 }, week);
    const session = (await loadToday(db, now)).rows.find((r) => r.itemId === "gym")!;
    await markDoneToday(db, now, session.id);
    const after = (await loadToday(db, now)).rows.filter((r) => r.itemId === "gym");
    expect(after.some((r) => r.kind === "done")).toBe(true);
  });

  it("ignores an id that isn't today's", async () => {
    await markDoneToday(db, now, "thu");
    expect((await loadToday(db, now)).done).toBe(0);
  });
});
