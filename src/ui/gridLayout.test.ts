import { describe, expect, it } from "vitest";
import { DAY } from "../engine";
import { layoutDay, visibleHours } from "./gridLayout";
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
});
