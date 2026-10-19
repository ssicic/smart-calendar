import { describe, expect, it } from "vitest";
import { addMonths, addWeeks, dayKey, monthGrid, monthOfWeek, monthTitle, shortDate, weekStartOf, weeksBetween, weeksOfYear } from "./weekDate";

describe("weekDate", () => {
  it("finds the Monday of any day in the week", () => {
    expect(weekStartOf(new Date(2026, 9, 19, 9))).toBe("2026-10-19"); // Monday
    expect(weekStartOf(new Date(2026, 9, 22, 23, 59))).toBe("2026-10-19"); // Thursday night
    expect(weekStartOf(new Date(2026, 9, 25, 12))).toBe("2026-10-19"); // Sunday
    expect(weekStartOf(new Date(2026, 9, 26, 0, 0))).toBe("2026-10-26"); // next Monday
  });

  it("crosses months and years", () => {
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-11-02", -1)).toBe("2026-10-26");
  });

  it("labels days", () => {
    expect(shortDate("2026-10-19", 0)).toBe("19 Oct");
    expect(shortDate("2026-10-26", 6)).toBe("1 Nov");
  });

  it("counts weeks between Mondays, across a clock change", () => {
    expect(weeksBetween("2026-10-19", "2026-11-02")).toBe(2); // clocks go back 25 Oct in Europe
    expect(weeksBetween("2026-10-19", "2026-10-12")).toBe(-1);
  });

  it("gives each day of a week its date", () => {
    expect(dayKey("2026-10-26", 0)).toBe("2026-10-26");
    expect(dayKey("2026-10-26", 6)).toBe("2026-11-01");
  });

  it("steps months across years", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthTitle({ year: 2026, month: 9 })).toBe("October 2026");
  });

  it("puts a week in the month of its Thursday", () => {
    expect(monthOfWeek("2026-10-26")).toEqual({ year: 2026, month: 9 }); // Thu 29 Oct
    expect(monthOfWeek("2026-09-28")).toEqual({ year: 2026, month: 9 }); // Thu 1 Oct
  });

  it("lays out a month as Monday-first weeks", () => {
    const rows = monthGrid({ year: 2026, month: 9 }); // October 2026: Thu 1 to Sat 31
    expect(rows.map((r) => r.weekStart)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect(rows[0]?.days.map((c) => c.inMonth)).toEqual([false, false, false, true, true, true, true]);
    expect(rows[4]?.days[6]).toEqual({ key: "2026-11-01", dayOfMonth: 1, inMonth: false });
  });

  it("covers a month that starts on a Monday without an extra week", () => {
    const rows = monthGrid({ year: 2027, month: 1 }); // February 2027: Mon 1 to Sun 28
    expect(rows).toHaveLength(4);
    expect(rows[0]?.weekStart).toBe("2027-02-01");
  });

  it("lists every week touching the year once", () => {
    const weeks = weeksOfYear(2026);
    expect(weeks[0]).toBe("2025-12-29"); // holds Thu 1 Jan 2026
    expect(weeks[weeks.length - 1]).toBe("2026-12-28");
    expect(new Set(weeks).size).toBe(weeks.length);
    expect(weeks).toHaveLength(53);
  });
});
