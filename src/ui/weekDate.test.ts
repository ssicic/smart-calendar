import { describe, expect, it } from "vitest";
import { addWeeks, shortDate, weekStartOf } from "./weekDate";

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
});
