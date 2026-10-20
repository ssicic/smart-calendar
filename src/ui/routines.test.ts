import { describe, expect, it } from "vitest";
import { checkKey, cleanSteps, progress, progressLabel, routineProblem } from "./routines";

describe("routines", () => {
  it("cleans the typed steps and keeps existing ids", () => {
    let n = 0;
    const steps = cleanSteps([{ id: "a", text: " Brush teeth " }, { text: "" }, { text: "Shower" }], () => `s${n++}`);
    expect(steps).toEqual([
      { id: "a", text: "Brush teeth" },
      { id: "s1", text: "Shower" },
    ]);
  });

  it("needs a name, at least one step, and a name not used yet", () => {
    const saved = [{ id: "morning", name: "Morning routine" }];
    const step = [{ id: "a", text: "Stretch" }];
    expect(routineProblem(" ", step, saved)).toBe("Give the routine a name.");
    expect(routineProblem("Gym prep", [], saved)).toBe("Add at least one step.");
    expect(routineProblem("morning ROUTINE", step, saved)).toBe("You already have Morning routine.");
    expect(routineProblem("Morning routine", step, saved, "morning")).toBeUndefined(); // editing itself
  });

  it("counts ticked steps per event", () => {
    const steps = [
      { id: "a", text: "Water" },
      { id: "b", text: "Teeth" },
    ];
    const checks = new Set([checkKey("e1", "a"), checkKey("e2", "a"), checkKey("e2", "b")]);
    expect(progress(steps, checks, "e1")).toEqual({ done: 1, total: 2 });
    expect(progressLabel(progress(steps, checks, "e1"))).toBe("1/2");
    expect(progressLabel(progress(steps, checks, "e2"))).toBe("✓");
  });
});
