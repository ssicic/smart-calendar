import { describe, expect, it } from "vitest";
import { DEFAULT_SLEEP, bedtimeFromClock, planningWindows, sleepForDay, type SleepSettings } from "./sleep";

const h = (x: number) => x * 60;
const settings: SleepSettings = {
  weekday: { wake: h(7), bed: h(23) },
  weekend: { wake: h(9), bed: h(24.5) },
  windDownMin: 30,
};

describe("sleepForDay", () => {
  it("uses weekday times Monday to Friday and weekend times after", () => {
    expect(sleepForDay(settings, [], 4)).toMatchObject({ wake: h(7), bed: h(23) });
    expect(sleepForDay(settings, [], 5)).toMatchObject({ wake: h(9), bed: h(24.5) });
  });

  it("applies a one-off change to just that day and that field", () => {
    const overrides = [{ day: 2, wake: h(6) }];
    expect(sleepForDay(settings, overrides, 2)).toEqual({ wake: h(6), bed: h(23), wakeChanged: true, bedChanged: false });
    expect(sleepForDay(settings, overrides, 3).wake).toBe(h(7));
  });
});

describe("planningWindows", () => {
  it("runs from wake-up to bedtime minus the wind-down", () => {
    expect(planningWindows(settings, [])[0]).toEqual({ start: h(7), end: h(22.5) });
  });
  it("stops at midnight when bedtime is after midnight", () => {
    expect(planningWindows(settings, [])[5]).toEqual({ start: h(9), end: h(24) });
  });
  it("has 7 days and works with the defaults", () => {
    expect(planningWindows(DEFAULT_SLEEP, [])).toHaveLength(7);
  });
});

describe("bedtimeFromClock", () => {
  it("treats early-morning picks as after midnight", () => {
    expect(bedtimeFromClock(h(0.5))).toBe(h(24.5));
    expect(bedtimeFromClock(h(23))).toBe(h(23));
  });
});
