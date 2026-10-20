import { beforeEach, describe, expect, it } from "vitest";
import { loadFirstWeek } from "./historyStore";
import { nodeDb } from "./nodeDb";
import { insertWeekItem } from "./weekItemsStore";
import { insertEvents, migrate } from "./weekStore";

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
});

describe("historyStore", () => {
  it("finds the earliest week with anything in it", async () => {
    expect(await loadFirstWeek(db)).toBeNull();
    await insertEvents(db, "fixed", [{ id: "w", title: "Work", start: 540, end: 1020 }], null, "2026-10-12");
    expect(await loadFirstWeek(db)).toBe("2026-10-12");
    const todo = { id: "t", kind: "todo" as const, title: "Call", done: false, progress: 0, target: 1, day: null };
    await insertWeekItem(db, "2026-09-28", todo);
    expect(await loadFirstWeek(db)).toBe("2026-09-28");
  });
});
