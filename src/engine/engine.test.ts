import { describe, expect, it } from "vitest";
import {
  DAY,
  capacity,
  checkNewItem,
  dayOf,
  lockPlacement,
  merge,
  movePlacement,
  planWeek,
  skipPlacement,
  subtract,
  suggestAnotherSlot,
  type FixedEvent,
  type FlexibleItem,
  type PlannerSettings,
  type WeekInput,
} from "./index";

const h = (hours: number) => hours * 60;
const at = (day: number, hour: number) => day * DAY + h(hour);

const settings: PlannerSettings = { dayStart: h(8), dayEnd: h(22), bufferMin: 0, minFreeMinutes: 0 };

function week(partial: Partial<WeekInput> = {}): WeekInput {
  return { fixed: [], rest: [], items: [], placements: [], settings, ...partial };
}

function item(id: string, durationMin: number, timesPerWeek: number, priority = 1, extra: Partial<FlexibleItem> = {}): FlexibleItem {
  return { id, title: id, durationMin, timesPerWeek, priority, ...extra };
}

/** Work 9 to 17 Monday to Friday. */
const workWeek: FixedEvent[] = [0, 1, 2, 3, 4].map((d) => ({ id: `work${d}`, title: "Work", start: at(d, 9), end: at(d, 17) }));

describe("intervals", () => {
  it("merges overlapping and touching intervals", () => {
    expect(merge([{ start: 5, end: 10 }, { start: 0, end: 5 }, { start: 20, end: 30 }, { start: 25, end: 28 }])).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ]);
  });

  it("subtracts busy time from a window", () => {
    expect(subtract({ start: 0, end: 100 }, [{ start: 10, end: 20 }, { start: 90, end: 120 }])).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 90 },
    ]);
  });

  it("handles back-to-back busy blocks", () => {
    expect(subtract({ start: 0, end: 100 }, [{ start: 10, end: 20 }, { start: 20, end: 30 }])).toEqual([
      { start: 0, end: 10 },
      { start: 30, end: 100 },
    ]);
  });
});

describe("planWeek", () => {
  it("never overlaps fixed events or rest blocks", () => {
    const input = week({
      fixed: workWeek,
      rest: [{ id: "chill", title: "Chill", start: at(5, 8), end: at(5, 22) }],
      items: [item("gym", 60, 4), item("spanish", 30, 5)],
    });
    const { placements } = planWeek(input);
    const blocked = [...input.fixed, ...input.rest];
    for (const p of placements) {
      for (const b of blocked) expect(p.end <= b.start || p.start >= b.end).toBe(true);
    }
    expect(placements).toHaveLength(9);
  });

  it("keeps placements inside the day window", () => {
    const { placements } = planWeek(week({ items: [item("read", 45, 7)] }));
    for (const p of placements) {
      const d = dayOf(p.start);
      expect(p.start).toBeGreaterThanOrEqual(at(d, 8));
      expect(p.end).toBeLessThanOrEqual(at(d, 22));
    }
  });

  it("spreads repeated items across different days", () => {
    const { placements } = planWeek(week({ fixed: workWeek, items: [item("guitar", 60, 3)] }));
    const days = new Set(placements.map((p) => dayOf(p.start)));
    expect(days.size).toBe(3);
  });

  it("balances load across the week instead of clustering early", () => {
    const items = [item("gym", 60, 3), item("guitar", 45, 3), item("spanish", 30, 3), item("walk", 30, 3)];
    const { placements } = planWeek(week({ fixed: workWeek, items }));
    const loadByDay = new Array(7).fill(0);
    for (const p of placements) loadByDay[dayOf(p.start)] += p.end - p.start;
    const max = Math.max(...loadByDay);
    const min = Math.min(...loadByDay);
    // 495 minutes over 7 days: no day should carry more than ~2 items' worth over the lightest.
    expect(max - min).toBeLessThanOrEqual(90);
    expect(loadByDay.every((m) => m > 0)).toBe(true);
  });

  it("places higher priority items first when capacity is short", () => {
    const tight: PlannerSettings = { ...settings, dayStart: h(20), dayEnd: h(21) };
    const { placements, unplaced } = planWeek(
      week({ settings: tight, items: [item("low", 60, 7, 1), item("high", 60, 7, 5)] }),
    );
    expect(placements.every((p) => p.itemId === "high")).toBe(true);
    expect(unplaced).toEqual([{ itemId: "low", missing: 7, reason: "over-capacity" }]);
  });

  it("follows per-day windows (e.g. sleep in on Saturday)", () => {
    const windows = Array.from({ length: 7 }, (_, d) => (d === 5 ? { start: h(11), end: h(12) } : { start: h(8), end: h(8) }));
    const { placements, unplaced } = planWeek(
      week({ settings: { ...settings, dayWindows: windows }, items: [item("read", 60, 2, 1)] }),
    );
    expect(placements.map((p) => p.start)).toEqual([5 * DAY + h(11)]);
    expect(unplaced).toEqual([{ itemId: "read", missing: 1, reason: "over-capacity" }]);
  });

  it("uses preferred windows when they have room", () => {
    const evening = item("gym", 60, 2, 1, { preferredWindows: [{ start: h(18), end: h(21) }] });
    const { placements } = planWeek(week({ items: [evening] }));
    for (const p of placements) expect(p.start % DAY).toBeGreaterThanOrEqual(h(18));
  });

  it("falls back outside preferred windows when they are full", () => {
    const evening = item("gym", 60, 1, 1, { preferredWindows: [{ start: h(18), end: h(19) }] });
    const fixed = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: `e${d}`, title: "Dinner", start: at(d, 18), end: at(d, 19) }));
    const { placements } = planWeek(week({ fixed, items: [evening] }));
    expect(placements).toHaveLength(1);
  });

  it("reports items longer than any gap as no-slot", () => {
    const { unplaced } = planWeek(week({ items: [item("marathon", h(15), 1)] }));
    expect(unplaced).toEqual([{ itemId: "marathon", missing: 1, reason: "no-slot" }]);
  });

  it("keeps locked placements and does not double-place them", () => {
    const locked = { id: "gym-mine", itemId: "gym", start: at(2, 19), end: at(2, 20), state: "locked" as const };
    const { placements } = planWeek(week({ items: [item("gym", 60, 3)], placements: [locked] }));
    expect(placements).toContainEqual(locked);
    expect(placements.filter((p) => p.itemId === "gym")).toHaveLength(3);
    expect(placements.filter((p) => dayOf(p.start) === 2 && p.itemId === "gym")).toHaveLength(1);
  });

  it("treats skipped occurrences as handled for this week", () => {
    const skipped = { id: "s", itemId: "gym", start: at(0, 8), end: at(0, 9), state: "skipped" as const };
    const { placements } = planWeek(week({ items: [item("gym", 60, 3)], placements: [skipped] }));
    expect(placements.filter((p) => p.state === "suggested")).toHaveLength(2);
  });

  it("respects the buffer between placements and events", () => {
    const buffered = { ...settings, bufferMin: 15 };
    const fixed = [{ id: "a", title: "Appt", start: at(0, 8), end: at(0, 10) }];
    const { placements } = planWeek(week({ settings: buffered, fixed, items: [item("x", 30, 1)] }));
    expect(placements[0]!.start).toBeGreaterThanOrEqual(at(0, 10) + 15);
  });
});

describe("capacity guard", () => {
  it("reports overflow when items exceed free time", () => {
    const tight: PlannerSettings = { ...settings, dayStart: h(20), dayEnd: h(21) };
    const report = capacity(week({ settings: tight, items: [item("a", 60, 10)] }));
    expect(report).toMatchObject({ freeMinutes: 420, requiredMinutes: 600, overflowMinutes: 180, fits: false });
  });

  it("keeps the protected minimum of free time unfilled", () => {
    const tight: PlannerSettings = { ...settings, dayStart: h(20), dayEnd: h(21), minFreeMinutes: 120 };
    const { placements } = planWeek(week({ settings: tight, items: [item("a", 60, 7)] }));
    expect(placements).toHaveLength(5);
  });

  it("accepts a new item that fits", () => {
    expect(checkNewItem(week(), item("new", 60, 3)).fits).toBe(true);
  });

  it("offers lower-priority swap candidates when a new item does not fit", () => {
    const tight: PlannerSettings = { ...settings, dayStart: h(20), dayEnd: h(21) };
    const input = week({ settings: tight, items: [item("tv", 60, 4, 1), item("read", 60, 3, 2), item("job", 60, 3, 9)] });
    const check = checkNewItem(input, item("spanish", 60, 2, 3));
    expect(check.fits).toBe(false);
    expect(check.overflowMinutes).toBe(300); // 12h requested, 7h free
    expect(check.swapCandidates.map((i) => i.id)).toEqual(["tv", "read"]);
  });
});

describe("edits", () => {
  const base = () => {
    const input = week({ fixed: workWeek, items: [item("gym", 60, 2)] });
    return { ...input, placements: planWeek(input).placements };
  };

  it("locks a placement", () => {
    const input = base();
    const id = input.placements[0]!.id;
    expect(lockPlacement(input.placements, id).find((p) => p.id === id)?.state).toBe("locked");
  });

  it("moves a placement into free time and keeps it there, without locking it", () => {
    const input = base();
    const id = input.placements[0]!.id;
    const result = movePlacement(input, id, at(3, 19));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.placements.find((p) => p.id === id)).toMatchObject({ start: at(3, 19), state: "kept" });
  });

  it("keeps a locked placement locked when it is moved", () => {
    const input = base();
    const id = input.placements[0]!.id;
    const result = movePlacement({ ...input, placements: lockPlacement(input.placements, id) }, id, at(3, 19));
    if (result.ok) expect(result.placements.find((p) => p.id === id)?.state).toBe("locked");
    expect(result.ok).toBe(true);
  });

  it("plans around kept placements and does not double-place them", () => {
    const kept = { id: "gym-mine", itemId: "gym", start: at(2, 19), end: at(2, 20), state: "kept" as const };
    const { placements } = planWeek(week({ items: [item("gym", 60, 3)], placements: [kept] }));
    expect(placements).toContainEqual(kept);
    expect(placements.filter((p) => p.itemId === "gym")).toHaveLength(3);
  });

  it("rejects a move onto a fixed event", () => {
    const input = base();
    expect(movePlacement(input, input.placements[0]!.id, at(0, 10))).toEqual({ ok: false, reason: "conflict" });
  });

  it("suggests the next free slot after the current one", () => {
    const input = base();
    const p = input.placements[0]!;
    const result = suggestAnotherSlot(input, p.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const moved = result.placements.find((x) => x.id === p.id)!;
      expect(moved.start).toBeGreaterThanOrEqual(p.end);
      expect(moved.state).toBe("suggested");
    }
  });

  it("skip frees the slot so replanning does not refill that occurrence", () => {
    const input = base();
    const placements = skipPlacement(input.placements, input.placements[0]!.id);
    const replanned = planWeek({ ...input, placements }).placements;
    expect(replanned.filter((p) => p.state === "suggested")).toHaveLength(1);
  });
});
