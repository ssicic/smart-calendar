import { describe, expect, it } from "vitest";
import { historyCard, historyWeeks, recentAverage } from "./history";
import type { ReviewStats } from "./weekReview";

const stats = (over: Partial<ReviewStats>): ReviewStats => ({
  awakeMin: 6720,
  plannedMin: 0,
  doneMin: 0,
  freeMin: 6720,
  freePercent: 100,
  sessions: { done: 0, total: 0, doneMin: 0, totalMin: 0 },
  groups: [],
  ...over,
});
const todo = (done: boolean) => ({ id: "t", kind: "todo" as const, title: "x", done, progress: 0, target: 1, day: null });

describe("history", () => {
  it("lists weeks newest first, back to the first week with data", () => {
    expect(historyWeeks("2026-09-28", "2026-10-19", 8)).toEqual(["2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28"]);
    expect(historyWeeks("2026-01-05", "2026-10-19", 2)).toEqual(["2026-10-19", "2026-10-12"]);
    expect(historyWeeks(null, "2026-10-19", 8)).toEqual([]);
    expect(historyWeeks("2026-10-26", "2026-10-19", 8)).toEqual([]); // data only starts later
  });

  it("sums up a week for its card, naming the biggest group", () => {
    const s = stats({
      plannedMin: 600,
      doneMin: 240,
      groups: [
        { id: null, name: "No group", color: "#999999", minutes: 400, percent: 6 },
        { id: "work", name: "Work", color: "#7C9CB8", minutes: 200, percent: 3 },
      ],
    });
    expect(historyCard(s, [todo(true), todo(false)])).toEqual({
      doneMin: 240,
      plannedMin: 600,
      finished: 1,
      total: 2,
      topGroup: "Work",
      quiet: false,
    });
  });

  it("calls an empty week quiet", () => {
    expect(historyCard(stats({}), []).quiet).toBe(true);
  });

  it("averages the most recent weeks", () => {
    expect(recentAverage([120, 60, 0, 60, 600])).toBe(60);
    expect(recentAverage([])).toBe(0);
  });
});
