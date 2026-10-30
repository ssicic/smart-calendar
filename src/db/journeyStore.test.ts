import { beforeEach, describe, expect, it } from "vitest";
import type { Journey } from "../engine";
import { loadJourneys, startJourney, stepDown, stopJourney } from "./journeyStore";
import { nodeDb } from "./nodeDb";
import { deleteItem, loadItems, loadWeek, migrate, savePlacement } from "./weekStore";

const W1 = "2026-10-26";
const W2 = "2026-11-02";
const W3 = "2026-11-09";

const journey: Journey = {
  id: "j1",
  itemId: "gym",
  goal: "Get back to the gym",
  steps: [
    { timesPerWeek: 1, minutes: 30, note: "Just show up" },
    { timesPerWeek: 2, minutes: 45, note: "" },
  ],
  startWeek: W2,
  stepDowns: [],
};
const gym = { id: "gym", title: "Gym", durationMin: 30, timesPerWeek: 1, priority: 3 };

let db: ReturnType<typeof nodeDb>;
beforeEach(async () => {
  db = nodeDb();
  await migrate(db);
  await startJourney(db, journey, gym);
});

const gymIn = async (week: string) => (await loadWeek(db, week, "2099-01-01")).week.items.find((i) => i.id === "gym");

describe("journeyStore", () => {
  it("runs from its start week", async () => {
    expect(await loadJourneys(db, W1)).toEqual([]);
    expect(await loadJourneys(db, W2)).toEqual([journey]);
    expect(await gymIn(W1)).toBeUndefined();
  });

  it("gives the item the step's amount, going up after a done week", async () => {
    expect(await gymIn(W2)).toMatchObject({ timesPerWeek: 1, durationMin: 30 });
    await savePlacement(db, W2, { id: "p1", itemId: "gym", start: 1080, end: 1110, state: "done" });
    expect(await gymIn(W3)).toMatchObject({ timesPerWeek: 2, durationMin: 45 });
  });

  it("steps down from a week on", async () => {
    await savePlacement(db, W2, { id: "p1", itemId: "gym", start: 1080, end: 1110, state: "done" });
    await stepDown(db, journey, W3);
    expect(await gymIn(W3)).toMatchObject({ timesPerWeek: 1, durationMin: 30 });
  });

  it("stopping keeps the item at the step it was on", async () => {
    await stopJourney(db, journey, W2, { timesPerWeek: 2, minutes: 45 });
    expect(await loadJourneys(db, W3)).toEqual([]);
    expect(await gymIn(W3)).toMatchObject({ timesPerWeek: 2, durationMin: 45 });
  });

  it("deleting the item deletes its journey", async () => {
    await deleteItem(db, "gym");
    expect(await loadItems(db)).toEqual([]);
    expect(await loadJourneys(db, W2)).toEqual([]);
  });
});
