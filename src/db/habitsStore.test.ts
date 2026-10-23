import { beforeEach, describe, expect, it } from "vitest";
import { deleteHabit, insertHabit, loadHabitChecks, loadHabits, setHabitCheck, updateHabit } from "./habitsStore";
import { nodeDb } from "./nodeDb";
import { migrate } from "./weekStore";

const steps = { id: "h1", title: "10k steps", icon: "footsteps-outline", targetPerWeek: 5 };
const alcohol = { id: "h2", title: "No alcohol", icon: "wine-outline", targetPerWeek: 7 };

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
});

describe("habitsStore", () => {
  it("keeps habits in the order added and saves changes", async () => {
    await insertHabit(db, steps);
    await insertHabit(db, alcohol);
    await updateHabit(db, { ...steps, title: "8k steps", targetPerWeek: 4 });
    expect(await loadHabits(db)).toEqual([{ ...steps, title: "8k steps", targetPerWeek: 4 }, alcohol]);
  });

  it("ticks and unticks days, and loads a date range", async () => {
    await insertHabit(db, steps);
    await setHabitCheck(db, "h1", "2026-10-19", true);
    await setHabitCheck(db, "h1", "2026-10-19", true); // twice is fine
    await setHabitCheck(db, "h1", "2026-10-27", true);
    expect([...(await loadHabitChecks(db, "2026-10-19", "2026-10-25"))]).toEqual(["h1|2026-10-19"]);
    await setHabitCheck(db, "h1", "2026-10-19", false);
    expect((await loadHabitChecks(db, "2026-10-19", "2026-10-25")).size).toBe(0);
  });

  it("deleting a habit removes its ticks", async () => {
    await insertHabit(db, steps);
    await setHabitCheck(db, "h1", "2026-10-19", true);
    await deleteHabit(db, "h1");
    expect(await loadHabits(db)).toEqual([]);
    expect((await loadHabitChecks(db, "2026-01-01", "2026-12-31")).size).toBe(0);
  });
});
