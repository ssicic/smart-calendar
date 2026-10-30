import { describe, expect, it } from "vitest";
import type { Journey, JourneyWeek } from "../engine";
import { draftFromPlan, journeyHeadline, nudgeStep, weekProgress } from "./journeys";
import type { JourneyView } from "./useWeek";

const journey: Journey = {
  id: "j1",
  itemId: "gym",
  goal: "Get back to the gym",
  steps: [
    { timesPerWeek: 1, minutes: 30, note: "Just show up" },
    { timesPerWeek: 2, minutes: 30, note: "" },
  ],
  startWeek: "2026-10-26",
  stepDowns: [],
};
const view = (state: Partial<JourneyWeek>, doneThisWeek = 0): JourneyView => ({
  journey,
  title: "Gym",
  state: { step: 0, weekNo: 1, misses: 0, finished: false, steppedUp: false, ...state },
  doneThisWeek,
});

describe("journeys", () => {
  it("turns the AI's plan into a draft, keeping numbers in range", () => {
    const d = draftFromPlan(" Get fit ", {
      title: "",
      time_of_day: "evening",
      steps: [{ times_per_week: 9, minutes: 22, note: "Go" }],
      why: "",
    });
    expect(d).toEqual({ goal: "Get fit", title: "Get fit", timeOfDay: "evening", steps: [{ timesPerWeek: 7, minutes: 20, note: "Go" }] });
  });

  it("nudges steps in sensible amounts", () => {
    const s = { timesPerWeek: 1, minutes: 60, note: "" };
    expect(nudgeStep(s, "timesPerWeek", -1).timesPerWeek).toBe(1);
    expect(nudgeStep(s, "minutes", 1).minutes).toBe(75);
    expect(nudgeStep({ ...s, minutes: 5 }, "minutes", -1).minutes).toBe(5);
  });

  it("says something kind for every situation", () => {
    expect(journeyHeadline(view({}))).toBe("Week one. Small on purpose.");
    expect(journeyHeadline(view({ step: 1, weekNo: 2, steppedUp: true }))).toContain("New step unlocked: 2 × 30");
    expect(journeyHeadline(view({ step: 1, weekNo: 4, misses: 2 }))).toContain("make it a bit easier");
    expect(journeyHeadline(view({ step: 1, finished: true }))).toContain("new normal");
  });

  it("shows this week's progress against the step", () => {
    expect(weekProgress(view({}, 0))).toEqual({ text: "0 of 1 done this week", done: false });
    expect(weekProgress(view({}, 3))).toEqual({ text: "✓ 1 of 1 done this week", done: true });
  });
});
