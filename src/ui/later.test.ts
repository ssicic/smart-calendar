import { describe, expect, it } from "vitest";
import { WEEK } from "../engine";
import { canAddFromLater, laterHeading, QUEUE_CHOICES } from "./later";

describe("later", () => {
  it("asks Next week first, then Later", () => {
    expect(QUEUE_CHOICES.map((c) => c.label)).toEqual(["Next week", "Later"]);
  });

  it("counts the list in its heading", () => {
    expect(laterHeading(0)).toBe("Later");
    expect(laterHeading(3)).toBe("Later (3)");
  });

  it("adds from Later only to a week with time left", () => {
    expect(canAddFromLater(0)).toBe(true); // a future week
    expect(canAddFromLater(3 * 1440)).toBe(true); // this week, from Thursday
    expect(canAddFromLater(WEEK)).toBe(false); // a past week
  });
});
