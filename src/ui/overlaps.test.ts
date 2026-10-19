import { describe, expect, it } from "vitest";
import { describeRow, overlapping, summarize } from "./overlaps";
import type { WeekRow } from "./weekRows";

const rows: WeekRow[] = [
  { id: "work", title: "Work", start: 540, end: 1020, kind: "fixed" },
  { id: "gym", title: "Gym", start: 1080, end: 1140, kind: "suggested", itemId: "g" },
  { id: "old", title: "Read", start: 1200, end: 1260, kind: "skipped", itemId: "r" },
];

describe("overlapping", () => {
  it("finds rows that overlap", () => {
    expect(overlapping(rows, [{ start: 1000, end: 1100 }]).map((r) => r.id)).toEqual(["work", "gym"]);
  });
  it("treats touching edges as free", () => {
    expect(overlapping(rows, [{ start: 1020, end: 1080 }])).toEqual([]);
  });
  it("ignores the row being moved and queued sessions", () => {
    expect(overlapping(rows, [{ start: 1080, end: 1140 }], "gym")).toEqual([]);
    expect(overlapping(rows, [{ start: 1200, end: 1260 }])).toEqual([]);
  });
  it("checks several targets, e.g. one per selected day", () => {
    expect(overlapping(rows, [{ start: 0, end: 60 }, { start: 600, end: 660 }]).map((r) => r.id)).toEqual(["work"]);
  });
});

describe("describeRow", () => {
  it("reads naturally", () => {
    expect(describeRow(rows[0]!)).toBe("Mon Work 09:00–17:00 (fixed)");
  });
  it("summarizes long lists", () => {
    expect(summarize(rows, 1)).toBe("Mon Work 09:00–17:00 (fixed) and 2 more");
  });
});
