import { describe, expect, it } from "vitest";
import { fitReport, habitsFromResponse, ladderLabel, moveHabit, roomNow, type BrainDumpHabit } from "./brainDump";

const steps = (...pairs: [number, number][]) => pairs.map(([t, m]) => ({ timesPerWeek: t, minutes: m, note: "" }));
const habit = (title: string, group: BrainDumpHabit["group"], s = steps([1, 20], [3, 40])): BrainDumpHabit => ({
  wishes: [title],
  title,
  timeOfDay: "any",
  steps: s,
  group,
  why: "",
});

describe("brain dump", () => {
  it("leaves room for at most two running journeys", () => {
    expect([roomNow(0), roomNow(1), roomNow(2), roomNow(5)]).toEqual([2, 1, 0, 0]);
  });

  it("applies the now-limit to the AI's answer too", () => {
    const h = { wishes: ["x"], title: "X", time_of_day: "any" as const, steps: [{ times_per_week: 1, minutes: 20, note: "" }], why: "" };
    const res = { habits: [{ ...h, group: "now" as const }, { ...h, group: "now" as const }, { ...h, group: "later" as const }], note: "" };
    expect(habitsFromResponse(res, 1).map((x) => x.group)).toEqual(["now", "next", "later"]);
  });

  it("moves habits, but not into a full Now", () => {
    const hs = [habit("Study", "now"), habit("Sewing", "later")];
    expect(moveHabit(hs, 1, "next", 1)).toMatchObject([{ group: "now" }, { group: "next" }]);
    expect(moveHabit(hs, 1, "now", 1)).toContain("Only 1 can start now");
    expect(moveHabit(hs, 1, "now", 0)).toContain("Two journeys are already running");
    expect(moveHabit(hs, 0, "later", 1)).toMatchObject([{ group: "later" }, { group: "later" }]);
  });

  it("says how much it is, and what tips it over", () => {
    // 40 h free = 2400 min. Each habit ends at 3 × 40 = 120 min.
    const fine = fitReport([habit("Study", "now"), habit("Gym", "now"), habit("Sewing", "later")], 2400);
    expect(fine).toEqual({
      start: "Starting with 0.7 h a week (2% of your free time).",
      full: "At full size, all of it is 6 h a week (15% of your free time).",
      level: "fine",
    });
    const big = steps([1, 30], [5, 130]); // 650 min at full size
    const much = fitReport([habit("Sewing", "later", big), habit("Study", "now", big), habit("Gym", "next", big)], 2400);
    expect(much.level).toBe("too much");
    expect(much.tipsOver).toBe("Gym"); // now (Study) → next (Gym) passes 1200
  });

  it("labels the ladder", () => {
    expect(ladderLabel(steps([2, 15], [4, 45]))).toBe("2×15 min → 4×45 min a week");
    expect(ladderLabel(steps([1, 20]))).toBe("1×20 min");
  });
});
