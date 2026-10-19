import { describe, expect, it } from "vitest";
import { DAY, planWeek, type WeekInput } from "../engine";
import {
  actionsFor,
  forceMoveSession,
  moveEventTo,
  moveProblem,
  moveSession,
  nextSlot,
  storedId,
  weekMinute,
} from "./itemActions";
import { rowsByDay } from "./weekRows";

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
  it("offers Lock here for kept sessions too", () => {
    expect(actionsFor("kept", "Gym").map((a) => a.id)).toEqual(actionsFor("suggested", "Gym").map((a) => a.id));
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

  it("moves and keeps it there (not locked), with a fresh id", () => {
    const r = moveSession(week, plan, gym.id, weekMinute(2, h(18)), newId);
    expect(r).toMatchObject({ ok: true, placement: { itemId: "gym", start: 2 * DAY + h(18), end: 2 * DAY + h(19), state: "kept" } });
    expect(r.ok && r.placement.id.includes("@")).toBe(false);
  });

  it("may take a time another *suggestion* holds", () => {
    expect(moveSession(week, plan, gym.id, read.start, newId).ok).toBe(true);
  });

  it("refuses fixed time and times outside the day", () => {
    expect(moveSession(week, plan, gym.id, weekMinute(0, h(10)), newId)).toMatchObject({ ok: false });
    expect(moveSession(week, plan, gym.id, weekMinute(1, h(21.5)), newId)).toMatchObject({
      ok: false,
      error: "That time is taken or outside your day (08:00–22:00).",
    });
  });
});

describe("nextSlot", () => {
  it("moves to a later free slot and keeps it there (not locked)", () => {
    const plan = planWeek(week);
    const gym = plan.placements.find((p) => p.itemId === "gym")!;
    const r = nextSlot(week, plan, gym.id, newId);
    expect(r.ok && r.placement.start).toBeGreaterThan(gym.start);
    expect(r.ok && r.placement.state).toBe("kept");
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

describe("moveProblem", () => {
  const padded = { ...week, settings: { ...week.settings, bufferMin: 15 } };
  const plan = planWeek(padded);
  const rows = rowsByDay(padded, plan).flat();
  const gymRow = rows.find((r) => r.itemId === "gym")!;

  it("is fine for a free slot", () => {
    expect(moveProblem(padded, plan, rows, gymRow, 2, h(18))).toBeUndefined();
  });
  it("names the blocker, including the buffer gap right after it", () => {
    expect(moveProblem(padded, plan, rows, gymRow, 0, h(17))).toBe(
      "Too close to Mon Work 09:00–17:00 (fixed). The planner keeps 15 min free around things.",
    );
  });
  it("says overlaps when it really overlaps", () => {
    expect(moveProblem(padded, plan, rows, gymRow, 0, h(12))).toBe("Overlaps Mon Work 09:00–17:00 (fixed).");
  });
  it("falls back to the general error outside the day", () => {
    expect(moveProblem(padded, plan, rows, gymRow, 3, h(21.5))).toBe("That time is taken or outside your day (08:00–22:00).");
  });
  it("lets fixed events go anywhere inside the week", () => {
    const work = rows.find((r) => r.id === "work")!;
    expect(moveProblem(padded, plan, rows, work, 2, h(9))).toBeUndefined();
  });
});

describe("forceMoveSession", () => {
  const plan = planWeek(week);
  const gym = plan.placements.find((p) => p.itemId === "gym")!;

  it("puts the session on top of fixed time when the user insists", () => {
    const r = forceMoveSession(plan, gym.id, weekMinute(0, h(10)), newId);
    expect(r).toMatchObject({ ok: true, placement: { start: h(10), end: h(11), state: "kept" } });
  });
  it("and the planner keeps it there", () => {
    const r = forceMoveSession(plan, gym.id, weekMinute(0, h(10)), newId);
    if (!r.ok) throw new Error(r.error);
    const replanned = planWeek({ ...week, placements: [r.placement] });
    expect(replanned.placements.filter((p) => p.itemId === "gym")).toEqual([r.placement]);
  });
  it("still stays inside the week", () => {
    expect(forceMoveSession(plan, gym.id, weekMinute(6, h(23.5)), newId).ok).toBe(false);
  });
});
