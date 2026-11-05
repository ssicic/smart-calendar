import { describe, expect, it } from "vitest";
import { DAY, type FlexibleItem } from "../engine";
import type { WeekItem } from "../db/weekItemsStore";
import { monthDoc, needsEmbedding, textHash, weekDays, weekDoc, weekTitle } from "./weekDocs";
import type { ReviewStats } from "./weekReview";
import type { WeekRow } from "./weekRows";

const h = (x: number) => x * 60;
const gym: FlexibleItem = { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 5, categoryId: "health" };
const rows: WeekRow[] = [
  { id: "w0", title: "Work", start: h(9), end: h(17), kind: "fixed", categoryId: "work" },
  { id: "g1", title: "Gym", itemId: "gym", start: h(7), end: h(8), kind: "done" },
  { id: "g2", title: "Gym", itemId: "gym", start: 2 * DAY + h(18), end: 2 * DAY + h(19), kind: "kept" },
  { id: "g3", title: "Gym", itemId: "gym", start: 4 * DAY + h(18), end: 4 * DAY + h(19), kind: "skipped" },
  { id: "r1", title: "Morning", start: DAY + h(7), end: DAY + h(7.5), kind: "routine", done: true },
];
const stats = {
  plannedMin: h(11.5),
  doneMin: h(1.5),
  freePercent: 80,
  groups: [
    { id: "work", name: "Work", color: "", minutes: h(8), percent: 7 },
    { id: null, name: "No group", color: "", minutes: 0, percent: 0 },
  ],
} as unknown as ReviewStats;
const todo = (title: string, done: boolean, day: number | null = null): WeekItem => ({
  id: title,
  kind: "todo",
  title,
  done,
  progress: 0,
  target: 1,
  day,
});

describe("weekDoc", () => {
  const doc = weekDoc({
    weekStart: "2026-10-12",
    rows,
    items: [gym],
    stats,
    todos: [todo("Call mum", true), todo("Dentist", false, 1), { ...todo("Read", false), kind: "goal", progress: 2, target: 3 }],
    habitLines: ["No alcohol: 5 of 7 days"],
    groupName: (id) => (id === "health" ? "Health" : null),
  });

  it("has an id, a chip title and the week's dates", () => {
    expect(doc.id).toBe("week:2026-10-12");
    expect(doc.title).toBe("Week of 12 Oct");
    expect(doc.text.split("\n")[0]).toBe("Week of 12 Oct 2026 (Mon 12 Oct 2026 to Sun 18 Oct 2026)");
  });

  it("lists each day with times and what got done", () => {
    expect(doc.text).toContain("Mon 12 Oct: Gym 07:00-08:00 (done, before Work); Work 09:00-17:00.");
    expect(doc.text).toContain("Tue 13 Oct: Morning 07:00-07:30 (done).");
    expect(doc.text).toContain("Wed 14 Oct: Gym 18:00-19:00 (planned, not marked done).");
    expect(doc.text).toContain("Fri 16 Oct: Gym 18:00-19:00 (moved to another week).");
    expect(doc.text).toContain("Sun 18 Oct: nothing planned.");
  });

  it("sums up sessions, to-dos, goals, habits and groups", () => {
    expect(doc.text).toContain("Planned 11.5h, done 1.5h, free time 80%.");
    expect(doc.text).toContain("Flexible sessions: Gym (Health) 1 of 3 done, 1 moved on.");
    expect(doc.text).toContain("To-dos: 1 of 2 done. Done: Call mum. Not done: Dentist.");
    expect(doc.text).toContain("Week goals: Read 2 of 3.");
    expect(doc.text).toContain("Habits: No alcohol: 5 of 7 days.");
    expect(doc.text).toContain("Time by group: Work 8h.");
  });
});

describe("weekDays and titles", () => {
  it("crosses months and years", () => {
    expect(weekDays("2026-12-28")).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(weekDays("2028-02-28")[2]).toBe("2028-03-01");
    expect(weekTitle("2026-03-02")).toBe("Week of 2 Mar");
  });
});

describe("monthDoc", () => {
  it("turns a saved summary into a doc", () => {
    const d = monthDoc("2026-10", {
      headline: "A steady month.",
      wins: ["Gym 9 of 12."],
      patterns: [],
      slipped: ["Spanish 2 of 8."],
      next_month_tip: "Try Spanish in the morning.",
    });
    expect(d).toMatchObject({ id: "month:2026-10", kind: "month", title: "October 2026" });
    expect(d.text).toBe(
      "Month summary for October 2026\nA steady month.\nWins: Gym 9 of 12.\nSlipped: Spanish 2 of 8.\nTip for next month: Try Spanish in the morning.",
    );
  });
});

describe("textHash", () => {
  it("is stable and changes with the text", () => {
    expect(textHash("Gym")).toBe(textHash("Gym"));
    expect(textHash("Gym")).not.toBe(textHash("Gym."));
  });
});

describe("needsEmbedding", () => {
  const doc = (id: string, text: string) => ({ id, kind: "week" as const, key: id, title: id, text });
  it("re-embeds only new, changed or other-model docs", () => {
    const a = doc("a", "Gym");
    const b = doc("b", "Work");
    const c = doc("c", "Read");
    const stored = new Map([
      ["a", { hash: textHash("Gym"), model: "v1" }],
      ["b", { hash: textHash("Work (old)"), model: "v1" }],
    ]);
    expect(needsEmbedding([a, b, c], stored, "v1").map((d) => d.id)).toEqual(["b", "c"]);
    expect(needsEmbedding([a], stored, "v2").map((d) => d.id)).toEqual(["a"]);
  });
});
