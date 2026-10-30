import { describe, expect, it } from "vitest";
import { cleanSteps, journeyWeek, nextMonday, offerEasier, type Journey } from "./journey";

const W1 = "2026-10-26";
const W2 = "2026-11-02";
const W3 = "2026-11-09";
const W4 = "2026-11-16";
const W5 = "2026-11-23";

const gym: Journey = {
  id: "j1",
  itemId: "gym",
  goal: "Get back to the gym",
  steps: [
    { timesPerWeek: 1, minutes: 30, note: "Just show up" },
    { timesPerWeek: 2, minutes: 30, note: "" },
    { timesPerWeek: 2, minutes: 45, note: "" },
  ],
  startWeek: W1,
  stepDowns: [],
};
const done = (entries: [string, number][]) => new Map(entries);

describe("journeyWeek", () => {
  it("counts weeks across a month end", () => {
    expect(nextMonday("2026-10-26")).toBe("2026-11-02");
    expect(nextMonday("2026-12-28")).toBe("2027-01-04");
  });

  it("starts on the first step", () => {
    expect(journeyWeek(gym, W1, done([]))).toEqual({ step: 0, weekNo: 1, misses: 0, finished: false, steppedUp: false });
  });

  it("moves up a step after a week that hit the target", () => {
    expect(journeyWeek(gym, W2, done([[W1, 1]]))).toMatchObject({ step: 1, weekNo: 2, steppedUp: true });
    expect(journeyWeek(gym, W3, done([[W1, 1], [W2, 2]]))).toMatchObject({ step: 2, weekNo: 3 });
  });

  it("repeats the step after a missed week, and counts misses in a row", () => {
    const state = journeyWeek(gym, W4, done([[W1, 1], [W2, 1], [W3, 0]]));
    expect(state).toMatchObject({ step: 1, misses: 2, steppedUp: false });
    expect(offerEasier(state)).toBe(true);
  });

  it("never offers easier on the first step", () => {
    expect(offerEasier(journeyWeek(gym, W3, done([])))).toBe(false);
  });

  it("goes one step down from a week the user chose easier", () => {
    const easier = { ...gym, stepDowns: [W4] };
    const history = done([[W1, 1], [W2, 1], [W3, 0]]);
    expect(journeyWeek(easier, W4, history)).toMatchObject({ step: 0, misses: 0 });
    expect(journeyWeek(easier, W5, done([...history, [W4, 1]]))).toMatchObject({ step: 1, steppedUp: true });
  });

  it("finishes after the last step's target and stays there", () => {
    const state = journeyWeek(gym, W5, done([[W1, 1], [W2, 2], [W3, 2], [W4, 2]]));
    expect(state).toMatchObject({ step: 2, finished: true });
  });

  it("is week 0 before it starts", () => {
    expect(journeyWeek(gym, "2026-10-19", done([])).weekNo).toBe(0);
  });
});

describe("cleanSteps", () => {
  it("keeps numbers in range", () => {
    expect(cleanSteps([{ timesPerWeek: 12, minutes: 2, note: "  hi  " }])).toEqual([{ timesPerWeek: 7, minutes: 5, note: "hi" }]);
    expect(cleanSteps([{ timesPerWeek: 0, minutes: 47, note: "" }])[0]).toMatchObject({ timesPerWeek: 1, minutes: 45 });
  });
});
