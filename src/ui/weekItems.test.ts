import { describe, expect, it } from "vitest";
import { isFinished, stepProgress, weekItemProblem, weekSummary } from "./weekItems";

const todo = { id: "t", kind: "todo" as const, title: "Call dentist", done: false, progress: 0, target: 1, day: null };
const goal = { id: "g", kind: "goal" as const, title: "Run", done: false, progress: 1, target: 3, day: null };

describe("weekItems", () => {
  it("needs some text, not too long", () => {
    expect(weekItemProblem("  ")).toBe("Type something first.");
    expect(weekItemProblem("x".repeat(81))).toMatch(/under 80/);
    expect(weekItemProblem(" Buy a gift ")).toBeUndefined();
  });

  it("counts a to-do when ticked and a goal when it reaches its target", () => {
    expect(isFinished(todo)).toBe(false);
    expect(isFinished({ ...todo, done: true })).toBe(true);
    expect(isFinished(goal)).toBe(false);
    expect(isFinished({ ...goal, progress: 3 })).toBe(true);
    expect(weekSummary([{ ...todo, done: true }, goal, { ...goal, id: "g2", progress: 3 }])).toEqual({ done: 2, total: 3 });
  });

  it("steps a goal's progress within 0 and the target", () => {
    expect(stepProgress(goal, 1)).toBe(2);
    expect(stepProgress({ ...goal, progress: 3 }, 1)).toBe(3);
    expect(stepProgress({ ...goal, progress: 0 }, -1)).toBe(0);
  });
});
