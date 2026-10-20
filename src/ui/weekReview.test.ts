import { describe, expect, it } from "vitest";
import { DAY } from "../engine";
import { reviewHeadline, reviewStats } from "./weekReview";
import type { WeekRow } from "./weekRows";

const h = (x: number) => x * 60;
// Awake 07:00-23:00 every day: 16h x 7 = 112h.
const sleep = Array.from({ length: 7 }, () => ({
  wake: h(7),
  bed: h(23),
  wakeChanged: false,
  bedChanged: false,
}));
const groups = new Map([
  ["work", { id: "work", name: "Work", color: "#3B82F6" }],
  ["fun", { id: "fun", name: "Fun", color: "#14B8A6" }],
]);
const row = (id: string, kind: WeekRow["kind"], start: number, hours: number, categoryId?: string): WeekRow => ({
  id,
  title: id,
  kind,
  start,
  end: start + h(hours),
  ...(categoryId ? { categoryId } : {}),
});

describe("weekReview", () => {
  const rows = [
    row("work", "fixed", h(9), 8, "work"), // 8h Work
    row("game", "done", DAY + h(19), 2, "fun"), // 2h Fun, done
    row("gym", "suggested", 2 * DAY + h(18), 1), // 1h, no group
    row("read", "skipped", 3 * DAY + h(20), 1), // queued: doesn't count
  ];

  it("adds up planned, free and flexible sessions", () => {
    const s = reviewStats(rows, sleep, groups);
    expect(s.awakeMin).toBe(h(112));
    expect(s.plannedMin).toBe(h(11));
    expect(s.freeMin).toBe(h(101));
    expect(s.freePercent).toBe(90);
    expect(s.sessions).toEqual({ done: 1, total: 2, doneMin: h(2), totalMin: h(3) });
  });

  it("shares awake time by group, biggest first and no group last", () => {
    const s = reviewStats(rows, sleep, groups);
    expect(s.groups.map((g) => [g.name, g.minutes / 60, g.percent])).toEqual([
      ["Work", 8, 7],
      ["Fun", 2, 2],
      ["No group", 1, 1],
    ]);
  });

  it("puts things in a deleted group under No group", () => {
    const s = reviewStats([row("x", "fixed", 0, 1, "gone")], sleep, groups);
    expect(s.groups.map((g) => g.name)).toEqual(["No group"]);
  });

  it("is kind about a quiet week", () => {
    const quiet = reviewStats([row("gym", "suggested", h(18), 1)], sleep, groups);
    expect(reviewHeadline(quiet, 0)).toMatch(/quiet week/);
    expect(reviewHeadline(reviewStats(rows, sleep, groups), 0)).toMatch(/got done/);
    const all = reviewStats([row("gym", "done", h(18), 1)], sleep, groups);
    expect(reviewHeadline(all, 0)).toMatch(/Everything/);
  });
});
