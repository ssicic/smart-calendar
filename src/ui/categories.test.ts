import { describe, expect, it } from "vitest";
import { PALETTE, categoryStyle, categoryNameProblem, moveInList, tint, unusedColor } from "./categories";

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
    expect(categoryNameProblem("  ", groups)).toBe("Give the group a name.");
    expect(categoryNameProblem(" work ", groups)).toBe("You already have Work.");
    expect(categoryNameProblem("x".repeat(25), groups)).toMatch(/under 25/);
    expect(categoryNameProblem("Music", groups)).toBeUndefined();
  });

  it("lets a group keep its own name when renaming, but not take another's", () => {
    const groups = [{ id: "work", name: "Work" }, { id: "fun", name: "Fun" }];
    expect(categoryNameProblem("WORK", groups, "work")).toBeUndefined();
    expect(categoryNameProblem("fun", groups, "work")).toBe("You already have Fun.");
    expect(categoryNameProblem("", groups, "work")).toBe("Give the group a name.");
  });

  it("moves a group up or down, and not past either end", () => {
    const list = ["a", "b", "c"];
    expect(moveInList(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveInList(list, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveInList(list, 0, -1)).toEqual(list);
    expect(moveInList(list, 2, 1)).toEqual(list);
    expect(moveInList(list, 5, -1)).toEqual(list);
    expect(list).toEqual(["a", "b", "c"]); // unchanged
  });

  it("suggests a colour nobody uses yet", () => {
    expect(unusedColor([{ color: PALETTE[0]! }, { color: PALETTE[1]!.toLowerCase() }])).toBe(PALETTE[2]);
    expect(unusedColor(PALETTE.map((color) => ({ color })))).toBe(PALETTE[0]);
  });
});
