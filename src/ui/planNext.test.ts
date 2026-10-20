import { describe, expect, it } from "vitest";
import { carryOverCandidates } from "./planNext";

const todo = (id: string, title: string, done = false) => ({ id, kind: "todo" as const, title, done, progress: 0, target: 1, day: null });
const goal = (id: string, title: string, progress: number, target: number) => ({
  id,
  kind: "goal" as const,
  title,
  done: false,
  progress,
  target,
  day: null,
});

describe("carryOverCandidates", () => {
  it("offers only what's unfinished, reset for next week", () => {
    const thisWeek = [todo("a", "Call dentist", true), todo("b", "Buy gift"), goal("c", "Run", 1, 3), goal("d", "Read", 2, 2)];
    expect(carryOverCandidates(thisWeek, [])).toEqual([todo("b", "Buy gift"), goal("c", "Run", 0, 3)]);
  });

  it("skips what next week already has (same kind and name, any case)", () => {
    const thisWeek = [todo("b", "Buy gift"), goal("c", "Run", 1, 3)];
    const nextWeek = [todo("x", " buy GIFT "), todo("y", "Run")]; // "Run" here is a to-do, not the goal
    expect(carryOverCandidates(thisWeek, nextWeek).map((i) => i.id)).toEqual(["c"]);
  });

  it("turns a leftover to-do from one day into a to-do for next week", () => {
    const fromWednesday = { ...todo("e", "Post letter"), day: 2 };
    expect(carryOverCandidates([fromWednesday], [])[0]?.day).toBeNull();
  });
});
