import { describe, expect, it } from "vitest";
import { DAY, type FlexibleItem } from "../engine";
import { buildReviewRequest, changeFor, importanceOf, partOfDay, timeOfDayOf, type AiAction, type WeekInputForAi } from "./aiReview";
import type { ReviewStats } from "./weekReview";
import type { WeekRow } from "./weekRows";

const h = (x: number) => x * 60;
const gym: FlexibleItem = {
  id: "gym",
  title: "Gym",
  durationMin: 60,
  timesPerWeek: 3,
  priority: 5,
  preferredWindows: [{ start: h(17), end: h(22) }],
  categoryId: "health",
};
const read: FlexibleItem = { id: "read", title: "Read", durationMin: 30, timesPerWeek: 2, priority: 3 };

const stats = (plannedMin: number, doneMin: number, freePercent: number) =>
  ({ plannedMin, doneMin, freePercent }) as ReviewStats;
const row = (id: string, itemId: string, start: number, kind: WeekRow["kind"]): WeekRow => ({
  id,
  title: itemId,
  itemId,
  start,
  end: start + 60,
  kind,
});

const thisWeek: WeekInputForAi = {
  weekStart: "2026-10-19",
  rows: [
    row("a", "gym", 1 * DAY + h(7.5), "done"), // Tue 07:30
    row("b", "gym", 3 * DAY + h(18), "kept"), // planned, not done
    row("c", "gym", 4 * DAY + h(18), "skipped"), // queued
    row("w", "work", h(9), "fixed"),
  ],
  items: [gym, read],
  stats: stats(h(20.5), h(9), 35),
  todos: { done: 2, total: 4 },
};
const lastWeek: WeekInputForAi = { ...thisWeek, weekStart: "2026-10-12", rows: [], stats: stats(h(10), h(5), 50) };

describe("buildReviewRequest", () => {
  const req = buildReviewRequest([thisWeek, lastWeek], [gym, read], new Map([["gym", "2026-10-12"]]), (id) =>
    id === "health" ? "Health" : null,
  );

  it("summarises each item's sessions in the reviewed week", () => {
    expect(req.weeks[0]?.items.find((i) => i.item_id === "gym")).toEqual({
      item_id: "gym",
      planned: 3,
      done: [{ day: "Tue", time: "07:30", part_of_day: "morning" }],
      queued: 1,
      upcoming: 0,
      not_done: 1,
    });
    expect(req.weeks[0]).toMatchObject({ planned_hours: 20.5, done_hours: 9, free_percent: 35, todos_done: 2, todos_total: 4 });
  });

  it("leaves items out of older weeks before their first stored session", () => {
    expect(req.weeks[1]?.items.map((i) => i.item_id)).toEqual(["gym"]); // read has no stored sessions yet
    expect(req.weeks[0]?.items.map((i) => i.item_id)).toEqual(["gym", "read"]); // the reviewed week has all
  });

  it("describes how items are set up now, in the form's words", () => {
    expect(req.items[0]).toEqual({
      item_id: "gym",
      title: "Gym",
      times_per_week: 3,
      duration_min: 60,
      importance: "high",
      time_of_day: "evening",
      group: "Health",
    });
    expect(req.items[1]).toMatchObject({ importance: "medium", time_of_day: "any", group: null });
  });
});

describe("mid-week review", () => {
  it("counts sessions still ahead as upcoming, not as not done", () => {
    const wed = 2 * DAY + h(12); // Wednesday noon: Thursday's session is still ahead
    const req = buildReviewRequest([thisWeek], [gym], new Map(), () => null, wed);
    expect(req.weeks[0]?.items[0]).toMatchObject({ upcoming: 1, not_done: 0 });
  });
});

describe("helpers", () => {
  it("names parts of the day", () => {
    expect([h(7), h(12), h(16.9), h(17)].map(partOfDay)).toEqual(["morning", "afternoon", "afternoon", "evening"]);
  });
  it("maps windows and priorities back to the form's choices", () => {
    expect(timeOfDayOf(undefined)).toBe("any");
    expect(timeOfDayOf([{ start: h(8), end: h(12) }])).toBe("morning");
    expect(timeOfDayOf([{ start: h(9), end: h(10) }])).toBe("any"); // custom window
    expect([1, 3, 5].map(importanceOf)).toEqual(["low", "medium", "high"]);
  });
});

describe("changeFor", () => {
  const act = (a: Partial<AiAction>): AiAction => ({
    type: "none",
    item_id: null,
    time_of_day: null,
    times_per_week: null,
    duration_min: null,
    importance: null,
    ...a,
  });

  it("turns each action into one item change", () => {
    expect(changeFor(act({ type: "set_time_of_day", item_id: "gym", time_of_day: "morning" }), [gym])).toEqual({
      kind: "plan",
      itemId: "gym",
      patch: { preferredWindows: [{ start: h(8), end: h(12) }] },
    });
    expect(changeFor(act({ type: "set_time_of_day", item_id: "gym", time_of_day: "any" }), [gym])).toMatchObject({
      patch: { preferredWindows: null },
    });
    expect(changeFor(act({ type: "set_times_per_week", item_id: "gym", times_per_week: 2 }), [gym])).toMatchObject({
      patch: { timesPerWeek: 2 },
    });
    expect(changeFor(act({ type: "set_duration", item_id: "gym", duration_min: 30 }), [gym])).toEqual({
      kind: "duration",
      itemId: "gym",
      minutes: 30,
    });
    expect(changeFor(act({ type: "set_importance", item_id: "gym", importance: "low" }), [gym])).toMatchObject({
      patch: { priority: 1 },
    });
    expect(changeFor(act({ type: "none" }), [])).toEqual({ kind: "none" });
  });

  it("refuses anything it can't apply safely", () => {
    expect(changeFor(act({ type: "set_times_per_week", item_id: "gone", times_per_week: 2 }), [gym])).toHaveProperty("error");
    expect(changeFor(act({ type: "set_times_per_week", item_id: "gym", times_per_week: 0 }), [gym])).toHaveProperty("error");
    expect(changeFor(act({ type: "set_duration", item_id: "gym", duration_min: 600 }), [gym])).toHaveProperty("error");
    expect(changeFor(act({ type: "set_time_of_day", item_id: "gym" }), [gym])).toHaveProperty("error");
  });
});
