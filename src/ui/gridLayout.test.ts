import { describe, expect, it } from "vitest";
import { DAY } from "../engine";
import { adjustDraft, canDrag, dropTarget, layoutDay, visibleHours } from "./gridLayout";
import type { WeekRow } from "./weekRows";

const h = (x: number) => x * 60;
const row = (id: string, start: number, end: number, kind: WeekRow["kind"] = "suggested"): WeekRow => ({
  id,
  title: id,
  start,
  end,
  kind,
});
const lanes = (rows: WeekRow[]) =>
  Object.fromEntries(layoutDay(rows).map((b) => [b.row.id, `${b.lane}/${b.lanes}`]));

describe("layoutDay", () => {
  it("gives non-overlapping blocks the full width", () => {
    expect(lanes([row("a", h(9), h(10)), row("b", h(10), h(11))])).toEqual({ a: "0/1", b: "0/1" });
  });

  it("puts two overlapping blocks side by side", () => {
    expect(lanes([row("a", h(9), h(10)), row("b", h(9.5), h(11))])).toEqual({ a: "0/2", b: "1/2" });
  });

  it("reuses a lane once it is free, within one cluster", () => {
    // a 9-12 spans the cluster; b 9-10 and c 10-11 can share lane 1
    expect(lanes([row("a", h(9), h(12)), row("b", h(9), h(10)), row("c", h(10), h(11))])).toEqual({
      a: "0/2",
      b: "1/2",
      c: "1/2",
    });
  });

  it("uses minutes of the day, whatever the weekday", () => {
    const [b] = layoutDay([row("a", 3 * DAY + h(18), 3 * DAY + h(19))]);
    expect([b?.startMin, b?.endMin]).toEqual([h(18), h(19)]);
  });

  it("leaves queued sessions off the grid", () => {
    expect(layoutDay([row("q", h(9), h(10), "skipped")])).toEqual([]);
  });
});

describe("visibleHours", () => {
  it("defaults to the planner's day", () => {
    expect(visibleHours([[]], h(8), h(22))).toEqual({ from: 8, to: 22 });
  });
  it("stretches for early and late events", () => {
    expect(visibleHours([[row("shift", h(6), h(7.5), "fixed")], [row("late", DAY + h(22), DAY + h(23.25), "fixed")]], h(8), h(22))).toEqual({
      from: 6,
      to: 24,
    });
  });

  it("drops a dragged block on the nearest day and quarter hour", () => {
    const block = { day: 1, startMin: 9 * 60, endMin: 10 * 60 }; // Tue 09:00-10:00
    // 50px columns, 0.8px per minute: one column right, 40px (50 min) down.
    expect(dropTarget(block, 52, 40, 50, 0.8)).toEqual({ day: 2, minute: 9 * 60 + 45 });
    expect(dropTarget(block, -20, -5, 50, 0.8)).toEqual({ day: 1, minute: 9 * 60 });
  });

  it("keeps a dropped block inside the week and the day", () => {
    const block = { day: 5, startMin: 22 * 60, endMin: 23 * 60 };
    expect(dropTarget(block, 500, 5000, 50, 0.8)).toEqual({ day: 6, minute: 23 * 60 });
    expect(dropTarget({ day: 0, startMin: 60, endMin: 120 }, -500, -500, 50, 0.8)).toEqual({ day: 0, minute: 0 });
  });

  it("lets everything but done, queued and locked sessions be dragged", () => {
    const row = { id: "x", title: "X", start: 0, end: 60 };
    const kinds = ["fixed", "rest", "suggested", "kept", "locked", "done", "skipped"] as const;
    expect(kinds.map((kind) => canDrag({ ...row, kind }))).toEqual([true, true, true, true, false, false, false]);
  });

  it("resizes and moves the new-event draft in quarter hours", () => {
    const d = { day: 2, start: 14 * 60, end: 15 * 60 }; // Wed 14:00-15:00
    // 50px columns, 0.8px per minute: 24px = 30 minutes.
    expect(adjustDraft(d, "end", 0, 24, 50, 0.8)).toEqual({ day: 2, start: 840, end: 930 });
    expect(adjustDraft(d, "start", 0, -24, 50, 0.8)).toEqual({ day: 2, start: 810, end: 900 });
    expect(adjustDraft(d, "move", -60, 24, 50, 0.8)).toEqual({ day: 1, start: 870, end: 930 });
  });

  it("keeps the draft at least 15 minutes long and inside the day", () => {
    const d = { day: 6, start: 22 * 60, end: 23 * 60 };
    expect(adjustDraft(d, "start", 0, 500, 50, 0.8)).toEqual({ day: 6, start: 22 * 60 + 45, end: 23 * 60 });
    expect(adjustDraft(d, "end", 0, 500, 50, 0.8)).toEqual({ day: 6, start: 22 * 60, end: 23 * 60 + 45 });
    expect(adjustDraft(d, "move", 500, 500, 50, 0.8)).toEqual({ day: 6, start: 22 * 60 + 45, end: 23 * 60 + 45 });
  });
});
