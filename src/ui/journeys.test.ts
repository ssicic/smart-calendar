import { describe, expect, it } from "vitest";
import type { Journey, JourneyWeek } from "../engine";
import { buildCheckinRequest, draftFromPlan, journeyHeadline, nudgeStep, proposalLabel, stepAfter, weekProgress } from "./journeys";
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
  checkins: {},
};
const view = (state: Partial<JourneyWeek>, doneThisWeek = 0): JourneyView => ({
  journey,
  title: "Gym",
  state: { step: 0, weekNo: 1, misses: 0, finished: false, steppedUp: false, auto: "stay", ...state },
  doneThisWeek,
  timeOfDay: "any",
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

describe("coach check-in", () => {
  it("moves between steps but never past the ends", () => {
    expect(stepAfter(0, "up", 2)).toBe(1);
    expect(stepAfter(1, "up", 2)).toBe(1);
    expect(stepAfter(0, "easier", 2)).toBe(0);
    expect(stepAfter(1, "stay", 2)).toBe(1);
  });

  it("sends the weeks before this one, newest first, with when things happened", () => {
    const sessions = [
      { weekStart: "2026-10-26", start: 6 * 1440 + 1080, state: "done" as const }, // Sun 18:00
      { weekStart: "2026-11-02", start: 1440 + 480, state: "skipped" as const }, // Tue 08:00
      { weekStart: "2026-11-02", start: 3 * 1440 + 1140, state: "done" as const }, // Thu 19:00
    ];
    const req = buildCheckinRequest(view({ step: 1, weekNo: 3, auto: "stay" }), "2026-11-09", "morning", sessions)!;
    expect(req.weeks.map((w) => [w.week_start, w.step, w.target])).toEqual([
      ["2026-11-02", 2, 2],
      ["2026-10-26", 1, 1],
    ]);
    expect(req.weeks[0]?.done).toEqual([{ day: "Thu", time: "19:00", part_of_day: "evening" }]);
    expect(req.weeks[0]?.skipped).toEqual([{ day: "Tue", time: "08:00", part_of_day: "morning" }]);
    expect(req).toMatchObject({ last_week_step: 2, automatic: "stay", time_of_day: "morning" });
  });

  it("has nothing to look at in the first week", () => {
    expect(buildCheckinRequest(view({}), "2026-10-26", "any", [])).toBeUndefined();
  });

  it("describes the proposal", () => {
    expect(proposalLabel(view({}), { decision: "up", time_of_day: "evening", message: "" }, 0)).toBe("This week: 2 × 30 min, evenings.");
    expect(proposalLabel(view({}), { decision: "stay", time_of_day: "keep", message: "" }, 0)).toBe("This week: 1 × 30 min.");
  });
});
