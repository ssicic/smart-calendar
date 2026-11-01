import { describe, expect, it } from "vitest";
import { earningsFrom, kindLine, priceLabel, reconcile, rewardProblem, surprise, type PointFacts } from "./points";

const W1 = "2026-10-26";
const W2 = "2026-11-02";

const none: PointFacts = { todos: [], weekGoals: [], goals: [], sessions: [], events: [], targets: [], stepUps: [] };
const base = (points: number, bonus: number) => points - bonus;

describe("earningsFrom", () => {
  it("gives the agreed points (before any surprise)", () => {
    const e = earningsFrom(
      {
        todos: [{ id: "t1", weekStart: W1, title: "Buy milk" }],
        weekGoals: [{ id: "g1", weekStart: W1, title: "Send 3 CVs" }],
        goals: [
          { id: "m1", horizon: "month", title: "Finish the course" },
          { id: "y1", horizon: "year", title: "New job" },
        ],
        sessions: [{ id: "s1", weekStart: W1, title: "Gym" }],
        events: [
          { id: "work", weekStart: W1, title: "Work", minutes: 240 },
          { id: "tea", weekStart: W1, title: "Tea", minutes: 10 },
        ],
        targets: [
          { itemId: "gym", weekStart: W1, title: "Gym", done: 3, target: 3 },
          { itemId: "read", weekStart: W1, title: "Reading", done: 1, target: 2 },
        ],
        stepUps: [{ journeyId: "j1", weekStart: W2, title: "Gym" }],
      },
      W2,
    );
    expect(e.map((x) => [x.key, base(x.points, x.bonus)])).toEqual([
      ["todo:t1", 5],
      ["weekgoal:g1", 20],
      ["goal:m1", 100],
      ["goal:y1", 500],
      ["session:s1:2026-10-26", 10],
      ["event:work:2026-10-26", 16],
      ["event:tea:2026-10-26", 1],
      ["target:gym:2026-10-26", 30],
      ["stepup:j1:2026-11-02", 50],
    ]);
    expect(e.find((x) => x.key === "goal:y1")?.weekStart).toBe(W2);
    expect(e.find((x) => x.key.startsWith("target"))?.bonus).toBe(0);
  });

  it("gives about 1 in 8 a stable surprise of 5-25", () => {
    const keys = Array.from({ length: 800 }, (_, i) => `todo:t${i}`);
    const lucky = keys.map(surprise).filter((b) => b > 0);
    expect(lucky.length).toBeGreaterThan(60);
    expect(lucky.length).toBeLessThan(140);
    expect(lucky.every((b) => b >= 5 && b <= 25 && b % 5 === 0)).toBe(true);
    expect(surprise("todo:t1")).toBe(surprise("todo:t1"));
  });

  it("earns nothing from nothing", () => {
    expect(earningsFrom(none, W2)).toEqual([]);
  });
});

describe("reconcile", () => {
  const todo = (id: string, weekStart: string) => earningsFrom({ ...none, todos: [{ id, weekStart, title: id }] }, W2)[0]!;

  it("adds new earnings and drops undone ones only in the current week", () => {
    const stored = [
      { key: "todo:old", weekStart: W1 },
      { key: "todo:now", weekStart: W2 },
      { key: "todo:kept", weekStart: W2 },
    ];
    const r = reconcile(stored, [todo("kept", W2), todo("new", W2)], W2);
    expect(r.add.map((a) => a.key)).toEqual(["todo:new"]);
    expect(r.remove).toEqual(["todo:now"]); // the past week's to-do stays
  });
});

describe("rewards", () => {
  it("shows prices in good days, then good weeks", () => {
    expect(priceLabel(40)).toBe("≈ 1 good day");
    expect(priceLabel(200)).toBe("≈ 4 good days");
    expect(priceLabel(1000)).toBe("≈ 3 good weeks");
    expect(priceLabel(350)).toBe("≈ 7 good days");
  });

  it("checks name and price", () => {
    expect(rewardProblem(" ", 40)).toBe("Give the reward a name.");
    expect(rewardProblem("Coffee", 2)).toMatch(/price/);
    expect(rewardProblem("Coffee", 40)).toBeUndefined();
  });

  it("picks a kind line, a bonus one when there was a surprise", () => {
    const e = { key: "todo:x", weekStart: W2, points: 5, bonus: 0, label: "x" };
    expect(kindLine(e)).toBe(kindLine(e));
    expect(kindLine({ ...e, bonus: 10 })).toMatch(/bonus|extra/i);
  });
});
