import { describe, expect, it } from "vitest";
import { PALETTE, categoryStyle, newCategoryProblem, tint, unusedColor } from "./categories";

describe("categories", () => {
  it("tints a colour", () => {
    expect(tint("#3B82F6", 0.5)).toBe("rgba(59,130,246,0.5)");
  });

  it("colours blocks by group, stronger for fixed time, grey when done", () => {
    expect(categoryStyle("fixed", "#3B82F6")).toEqual({ bar: "#3B82F6", bg: "rgba(59,130,246,0.24)" });
    expect(categoryStyle("suggested", "#3B82F6")).toEqual({ bar: "#3B82F6", bg: "rgba(59,130,246,0.12)" });
    expect(categoryStyle("done", "#3B82F6")).toBeUndefined();
    expect(categoryStyle("fixed", undefined)).toBeUndefined();
  });

  it("checks a new group's name", () => {
    const groups = [{ name: "Work" }, { name: "Health" }];
    expect(newCategoryProblem("  ", groups)).toBe("Give the group a name.");
    expect(newCategoryProblem(" work ", groups)).toBe("You already have Work.");
    expect(newCategoryProblem("x".repeat(25), groups)).toMatch(/under 25/);
    expect(newCategoryProblem("Music", groups)).toBeUndefined();
  });

  it("suggests a colour nobody uses yet", () => {
    expect(unusedColor([{ color: PALETTE[0]! }, { color: PALETTE[1]!.toLowerCase() }])).toBe(PALETTE[2]);
    expect(unusedColor(PALETTE.map((color) => ({ color })))).toBe(PALETTE[0]);
  });
});
