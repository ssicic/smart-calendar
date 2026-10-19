import { describe, expect, it } from "vitest";
import { DAY, type PlanResult, type WeekInput } from "../engine";
import { dayLoads, hoursLabel, intensity, loadsByDate, totalMinutes, weekTotals } from "./dayLoad";

const settings = { dayStart: 0, dayEnd: DAY, bufferMin: 0, minFreeMinutes: 0 };
const capacity = { freeMinutes: 0, requiredMinutes: 0, budgetMinutes: 0, overflowMinutes: 0, fits: true };

describe("dayLoad", () => {
  it("adds up fixed, flexible and done minutes per day", () => {
    const week: WeekInput = {
      fixed: [{ id: "w", title: "Work", start: 9 * 60, end: 17 * 60 }], // Monday 8h
      rest: [{ id: "r", title: "Off", start: DAY + 600, end: DAY + 720 }], // ignored
      items: [],
      placements: [],
      settings,
    };
    const plan: PlanResult = {
      placements: [
        { id: "a", itemId: "gym", start: 18 * 60, end: 19 * 60, state: "suggested" },
        { id: "b", itemId: "gym", start: DAY + 18 * 60, end: DAY + 19 * 60, state: "locked" },
        { id: "c", itemId: "read", start: DAY + 600, end: DAY + 630, state: "done" },
        { id: "d", itemId: "read", start: 2 * DAY + 600, end: 2 * DAY + 630, state: "skipped" },
      ],
      unplaced: [],
      capacity,
    };
    const loads = dayLoads(week, plan);
    expect(loads[0]).toEqual({ fixed: 480, flexible: 60, done: 0 });
    expect(loads[1]).toEqual({ fixed: 0, flexible: 60, done: 30 });
    expect(loads[2]).toEqual({ fixed: 0, flexible: 0, done: 0 });
    expect(totalMinutes(loads[0]!)).toBe(540);
    // Header totals: fixed + flexible + done (rest and queued don't count), and done on its own.
    expect(weekTotals(week, plan)).toEqual({ plannedMin: 480 + 60 + 60 + 30, doneMin: 30 });
  });

  it("splits something that runs past midnight between the two days", () => {
    const week: WeekInput = {
      fixed: [{ id: "n", title: "Night shift", start: 22 * 60, end: DAY + 6 * 60 }],
      rest: [],
      items: [],
      placements: [],
      settings,
    };
    const loads = dayLoads(week, { placements: [], unplaced: [], capacity });
    expect(loads[0]?.fixed).toBe(120);
    expect(loads[1]?.fixed).toBe(360);
  });

  it("keys loads by date", () => {
    const loads = Array.from({ length: 7 }, (_, d) => ({ fixed: d, flexible: 0, done: 0 }));
    const byDate = loadsByDate(new Map([["2026-10-26", loads]]));
    expect(byDate.get("2026-10-26")?.fixed).toBe(0);
    expect(byDate.get("2026-11-01")?.fixed).toBe(6);
  });

  it("shades by hours planned", () => {
    expect([0, 30, 120, 121, 240, 359, 360, 900].map(intensity)).toEqual([0, 1, 1, 2, 2, 3, 4, 4]);
    expect(hoursLabel(0)).toBe("");
    expect(hoursLabel(90)).toBe("1.5h");
  });
});
