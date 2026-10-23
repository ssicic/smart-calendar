import { describe, expect, it } from "vitest";
import { checkKey, habitNameProblem, habitReviewLines, onTrack, progressLabel, targetLabel, tooManyHabitsNote, weekCount } from "./habits";

const W = "2026-10-19"; // Mon 19 – Sun 25 Oct
const steps = { id: "s", title: "10k steps", icon: "footsteps-outline", targetPerWeek: 5 };
const alcohol = { id: "a", title: "No alcohol", icon: "wine-outline", targetPerWeek: 7 };
const checks = new Set([
  checkKey("s", "2026-10-19"),
  checkKey("s", "2026-10-21"),
  checkKey("s", "2026-10-26"), // next week: doesn't count
  checkKey("a", "2026-10-20"),
]);

describe("habits", () => {
  it("counts the ticked days of one week only", () => {
    expect(weekCount(checks, "s", W)).toBe(2);
    expect(weekCount(checks, "a", W)).toBe(1);
  });

  it("checks names, case-insensitively", () => {
    expect(habitNameProblem("  ", [steps])).toBe("Give it a name.");
    expect(habitNameProblem("10K Steps", [steps])).toBe("You already have a habit with that name.");
    expect(habitNameProblem("10k steps", [steps], "s")).toBeUndefined(); // renaming itself
    expect(habitNameProblem("Moved today", [steps])).toBeUndefined();
  });

  it("speaks kindly about targets", () => {
    expect(targetLabel(7)).toBe("Every day");
    expect(targetLabel(5)).toBe("5 days a week");
    expect(progressLabel(4, 5)).toBe("4 of 5");
    expect(onTrack(5, 5)).toBe(true);
    expect(onTrack(4, 5)).toBe(false);
  });

  it("only notes too many habits, never blocks", () => {
    expect(tooManyHabitsNote(5)).toBeUndefined();
    expect(tooManyHabitsNote(6)).toMatch(/Fewer are easier/);
  });

  it("writes review lines", () => {
    expect(habitReviewLines([steps, alcohol], checks, W)).toEqual(["10k steps: 2 of 5 days", "No alcohol: 1 of 7 days"]);
  });
});
