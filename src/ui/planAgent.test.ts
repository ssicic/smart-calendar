import { describe, expect, it } from "vitest";
import { DAY, type WeekInput } from "../engine";
import { buildPlanRequest, findSession, formFromAdd, type Proposal } from "./planAgent";
import { parseQuickAdd } from "./quickAdd";
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

describe("formFromAdd", () => {
  const add: Proposal = {
    type: "add",
    session_id: "",
    title: "Prijave/učenje",
    from_start: 0,
    from_label: "",
    to_label: "Mon–Fri 09:00–13:00, every week",
    start: null,
    end: null,
    reason: "You asked for it.",
    days: [0, 1, 2, 3, 4],
    day_start: 540,
    day_end: 780,
    repeat_weekly: true,
    group: "work",
  };
  const groups = [
    { id: "g-work", name: "Work" },
    { id: "g-fun", name: "Fun" },
  ];

  it("becomes the quick-add form, so it saves like adding by hand", () => {
    const form = formFromAdd(add, groups);
    expect(form).toMatchObject({ kind: "fixed", title: "Prijave/učenje", days: [0, 1, 2, 3, 4], startTime: "09:00", endTime: "13:00", repeat: true, categoryId: "g-work" });
    let n = 0;
    const parsed = parseQuickAdd(form!, () => `id${n++}`);
    expect(parsed.ok && parsed.kind === "fixed" && parsed.events.map((e) => [e.start, e.end])).toEqual(
      [0, 1, 2, 3, 4].map((d) => [d * DAY + 540, d * DAY + 780]),
    );
  });

  it("keeps an unknown group empty, caps midnight, and refuses a proposal without days", () => {
    expect(formFromAdd({ ...add, group: "Nope", day_end: 1440 }, groups)).toMatchObject({ categoryId: null, endTime: "23:59" });
    expect(formFromAdd({ ...add, days: [] }, groups)).toBeUndefined();
    expect(formFromAdd({ ...add, type: "move" }, groups)).toBeUndefined();
  });

  it("sends the group names with the week", () => {
    expect(buildPlanRequest(week, [], "2026-11-02", "", ["Work"]).week.groups).toEqual(["Work"]);
  });
});
