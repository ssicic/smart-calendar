import { describe, expect, it } from "vitest";
import { DAY, type WeekInput } from "../engine";
import { buildPlanRequest, findSession, type Proposal } from "./planAgent";
import type { WeekRow } from "./weekRows";

const week = {
  fixed: [],
  items: [{ id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 2, priority: 5, preferredWindows: [{ start: 1020, end: 1320 }] }],
  placements: [],
  settings: { dayStart: 420, dayEnd: 1380, bufferMin: 15, minFreeMinutes: 0, earliestStart: DAY + 600 },
} as unknown as WeekInput;

const rows: WeekRow[] = [
  { id: "w", title: "Work", start: 540, end: 1020, kind: "fixed" },
  { id: "gym@1080", title: "Gym", start: 1080, end: 1140, kind: "suggested", itemId: "gym" },
  { id: "p1", title: "Gym", start: DAY + 1080, end: DAY + 1140, kind: "locked", itemId: "gym" },
  { id: "q1", title: "Gym", start: 2 * DAY + 1080, end: 2 * DAY + 1140, kind: "skipped", itemId: "gym" },
];

const proposal = (session_id: string, from_start: number): Proposal => ({
  type: "move",
  session_id,
  title: "Gym",
  from_start,
  from_label: "",
  to_label: "",
  start: 0,
  end: 60,
  reason: "",
});

describe("planAgent", () => {
  it("sends the week: movable flags, awake windows, items, no queued sessions", () => {
    const req = buildPlanRequest(week, rows, "2026-11-02", "  Keep Friday free ");
    expect(req.wish).toBe("Keep Friday free");
    expect(req.week.now).toBe(DAY + 600);
    expect(req.week.blocks.map((b) => [b.id, b.kind, b.movable])).toEqual([
      ["w", "fixed", false],
      ["gym@1080", "flexible", true],
      ["p1", "flexible", false],
    ]);
    expect(req.week.windows).toHaveLength(7);
    expect(req.week.windows[0]).toEqual({ start: 420, end: 1380 });
    expect(req.week.items[0]).toMatchObject({ item_id: "gym", importance: "high", time_of_day: "evening" });
  });

  it("finds a session again after its id changed", () => {
    expect(findSession(rows, proposal("gym@1080", 1080))?.id).toBe("gym@1080");
    const replanned = rows.map((r) => (r.id === "gym@1080" ? { ...r, id: "gym@1080b" } : r));
    expect(findSession(replanned, proposal("gym@1080", 1080))?.id).toBe("gym@1080b");
    expect(findSession(rows, proposal("p1", DAY + 1080))).toBeUndefined(); // locked: not movable
  });
});
