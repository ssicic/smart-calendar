import { describe, expect, it } from "vitest";
import { DAY, planWeek, type WeekInput } from "../engine";
import { actionsFor, moveEventTo, moveSession, nextSlot, storedId, weekMinute } from "./itemActions";

const h = (x: number) => x * 60;
let n = 0;
const newId = () => `new${n++}`;

const week: WeekInput = {
  fixed: [{ id: "work", title: "Work", start: h(9), end: h(17) }], // Monday only
  rest: [],
  items: [
    { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 1, priority: 5 },
    { id: "read", title: "Read", durationMin: 60, timesPerWeek: 1, priority: 3 },
  ],
  placements: [],
  settings: { dayStart: h(8), dayEnd: h(22), bufferMin: 0, minFreeMinutes: 0 },
};

describe("actionsFor", () => {
  it("follows the agreed order for a suggested session", () => {
    expect(actionsFor("suggested", "Gym").map((a) => a.id)).toEqual(["move", "suggest", "lock", "done", "delete", "queue"]);
  });
  it("offers unlock instead of lock once locked", () => {
    expect(actionsFor("locked", "Gym").map((a) => a.id)).toContain("unlock");
  });
  it("never offers lock for fixed events and rest blocks", () => {
    expect(actionsFor("fixed", "Work").map((a) => a.id)).toEqual(["move", "delete"]);
    expect(actionsFor("rest", "Nap").map((a) => a.id)).toEqual(["move", "delete"]);
  });
});

describe("storedId", () => {
  it("replaces scheduler ids and keeps stored ones", () => {
    expect(storedId({ id: "gym@100", itemId: "gym", start: 100, end: 160, state: "suggested" }, () => "x")).toBe("x");
    expect(storedId({ id: "p1", itemId: "gym", start: 100, end: 160, state: "locked" }, () => "x")).toBe("p1");
  });
});

describe("moveSession", () => {
  const plan = planWeek(week);
  const gym = plan.placements.find((p) => p.itemId === "gym")!;
  const read = plan.placements.find((p) => p.itemId === "read")!;

  it("moves and locks, with a fresh id", () => {
    const r = moveSession(week, plan, gym.id, weekMinute(2, h(18)), newId);
    expect(r).toMatchObject({ ok: true, placement: { itemId: "gym", start: 2 * DAY + h(18), end: 2 * DAY + h(19), state: "locked" } });
    expect(r.ok && r.placement.id.includes("@")).toBe(false);
  });

  it("may take a time another *suggestion* holds", () => {
    expect(moveSession(week, plan, gym.id, read.start, newId).ok).toBe(true);
  });

  it("refuses fixed time and times outside the day", () => {
    expect(moveSession(week, plan, gym.id, weekMinute(0, h(10)), newId)).toMatchObject({ ok: false });
    expect(moveSession(week, plan, gym.id, weekMinute(1, h(21.5)), newId)).toMatchObject({
      ok: false,
      error: "That time is taken or outside 08:00–22:00.",
    });
  });
});

describe("nextSlot", () => {
  it("moves to a later free slot and locks it", () => {
    const plan = planWeek(week);
    const gym = plan.placements.find((p) => p.itemId === "gym")!;
    const r = nextSlot(week, plan, gym.id, newId);
    expect(r.ok && r.placement.start).toBeGreaterThan(gym.start);
    expect(r.ok && r.placement.state).toBe("locked");
  });
});

describe("moveEventTo", () => {
  it("keeps the length", () => {
    expect(moveEventTo({ start: h(9), end: h(17) }, weekMinute(1, h(10)))).toEqual({
      ok: true,
      start: DAY + h(10),
      end: DAY + h(18),
    });
  });
  it("refuses to run past Sunday", () => {
    expect(moveEventTo({ start: 0, end: h(3) }, weekMinute(6, h(23))).ok).toBe(false);
  });
});
