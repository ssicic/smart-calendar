import { describe, expect, it } from "vitest";
import { goalProgress, partsOf, tooManyGoalsNote } from "./goals";

const goal = (id: string, horizon: "year" | "month", parentId: string | null = null, done = false) => ({
  id,
  title: id,
  horizon,
  period: horizon === "year" ? "2026" : "2026-10",
  parentId,
  done,
});
const weekGoal = (id: string, goalId: string, progress: number, target: number) => ({
  id,
  kind: "goal" as const,
  title: id,
  done: false,
  progress,
  target,
  day: null,
  goalId,
});

describe("goals", () => {
  const goals = [goal("fit", "year"), goal("run", "month", "fit", true), goal("swim", "month", "fit"), goal("read", "month")];
  const weekGoals = [weekGoal("run3", "fit", 3, 3), weekGoal("swim2", "swim", 1, 2)];

  it("finds what's part of a goal", () => {
    const parts = partsOf(goals[0]!, goals, weekGoals);
    expect(parts.goals.map((g) => g.id)).toEqual(["run", "swim"]);
    expect(parts.weekGoals.map((w) => w.id)).toEqual(["run3"]);
  });

  it("counts finished parts", () => {
    expect(goalProgress(goals[0]!, goals, weekGoals)).toEqual({ done: 2, total: 3 }); // run done, swim not, run3 done
    expect(goalProgress(goals[2]!, goals, weekGoals)).toEqual({ done: 0, total: 1 });
    expect(goalProgress(goals[3]!, goals, weekGoals)).toEqual({ done: 0, total: 0 });
  });

  it("gently notes too many open goals, not counting finished ones", () => {
    const months = ["a", "b", "c"].map((id) => goal(id, "month"));
    expect(tooManyGoalsNote(months, "month")).toBeUndefined();
    expect(tooManyGoalsNote([...months, goal("d", "month")], "month")).toMatch(/4 goals this month/);
    expect(tooManyGoalsNote([...months, goal("d", "month", null, true)], "month")).toBeUndefined();
  });
});
