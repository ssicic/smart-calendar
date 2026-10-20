import { describe, expect, it } from "vitest";
import { DAY } from "../engine";
import { EMPTY_FORM, formForSlot, parseQuickAdd, parseTime, type QuickAddForm } from "./quickAdd";

let n = 0;
const newId = () => `id${n++}`;
const form = (over: Partial<QuickAddForm>): QuickAddForm => ({ ...EMPTY_FORM, ...over });

describe("parseTime", () => {
  it("reads hours and minutes", () => {
    expect(parseTime("9:30")).toBe(570);
    expect(parseTime(" 17:00 ")).toBe(1020);
    expect(parseTime("24:00")).toBe(1440);
  });
  it("rejects nonsense", () => {
    for (const t of ["", "9", "9:7", "25:00", "24:30", "12:60", "ab:cd"]) expect(parseTime(t)).toBeUndefined();
  });
});

describe("parseQuickAdd", () => {
  it("needs a name", () => {
    expect(parseQuickAdd(form({ title: "  " }), newId)).toEqual({ ok: false, error: "Give it a name." });
  });

  it("builds a flexible item with a preferred window and priority", () => {
    const r = parseQuickAdd(
      form({ title: "Gym", durationMin: "60", timesPerWeek: "3", timeOfDay: "evening", importance: "high" }),
      newId,
    );
    expect(r.ok && r.kind === "flexible" && r.item).toMatchObject({
      title: "Gym",
      durationMin: 60,
      timesPerWeek: 3,
      priority: 5,
      preferredWindows: [{ start: 17 * 60, end: 22 * 60 }],
    });
  });

  it("leaves out preferred windows for 'any time'", () => {
    const r = parseQuickAdd(form({ title: "Read" }), newId);
    expect(r.ok && r.kind === "flexible" && r.item.preferredWindows).toBeUndefined();
  });

  it("rejects bad numbers", () => {
    expect(parseQuickAdd(form({ title: "X", durationMin: "abc" }), newId).ok).toBe(false);
    expect(parseQuickAdd(form({ title: "X", durationMin: "2" }), newId).ok).toBe(false);
    expect(parseQuickAdd(form({ title: "X", timesPerWeek: "0" }), newId).ok).toBe(false);
  });

  it("makes one fixed event per selected day", () => {
    const r = parseQuickAdd(
      form({ kind: "fixed", title: "Class", days: [3, 1], startTime: "10:00", endTime: "11:30" }),
      newId,
    );
    expect(r.ok && r.kind === "fixed" && r.events.map((e) => [e.start, e.end])).toEqual([
      [1 * DAY + 600, 1 * DAY + 690],
      [3 * DAY + 600, 3 * DAY + 690],
    ]);
  });

  it("makes routines the same way, each event following the picked routine", () => {
    const base = { kind: "routine" as const, title: "Morning routine", days: [0, 1], startTime: "07:00", endTime: "07:45" };
    expect(parseQuickAdd(form(base), newId)).toEqual({ ok: false, error: "Pick a routine, or make a new one." });
    const r = parseQuickAdd(form({ ...base, routineId: "morning" }), newId);
    expect(r.ok && r.kind).toBe("routine");
    expect(r.ok && r.kind === "routine" && r.events.map((e) => [e.start, e.routineId])).toEqual([
      [7 * 60, "morning"],
      [DAY + 7 * 60, "morning"],
    ]);
  });

  it("validates days and times for fixed events", () => {
    expect(parseQuickAdd(form({ kind: "fixed", title: "X", days: [] }), newId)).toMatchObject({ ok: false });
    expect(
      parseQuickAdd(form({ kind: "fixed", title: "X", days: [0], startTime: "11:00", endTime: "10:00" }), newId),
    ).toEqual({ ok: false, error: "End time must be after start time." });
  });

  it("adds events to just this week unless Repeat every week is on", () => {
    const base = { kind: "fixed" as const, title: "Dentist", days: [2], startTime: "10:00", endTime: "11:00" };
    expect(parseQuickAdd(form(base), newId)).toMatchObject({ ok: true, repeat: false });
    expect(parseQuickAdd(form({ ...base, repeat: true }), newId)).toMatchObject({ ok: true, repeat: true });
  });

  it("puts the new item or events in the picked group, if any", () => {
    const flex = parseQuickAdd(form({ title: "Gym", categoryId: "health" }), newId);
    expect(flex.ok && flex.kind === "flexible" && flex.item.categoryId).toBe("health");
    const fixed = parseQuickAdd(form({ kind: "fixed", title: "Work", days: [0, 1], categoryId: "work" }), newId);
    expect(fixed.ok && fixed.kind === "fixed" && fixed.events.map((e) => e.categoryId)).toEqual(["work", "work"]);
    const none = parseQuickAdd(form({ title: "Gym" }), newId);
    expect(none.ok && none.kind === "flexible" && "categoryId" in none.item).toBe(false);
  });

  it("prefills a Fixed event from a held calendar slot", () => {
    const f = formForSlot(2, 14 * 60 + 30);
    expect(f).toMatchObject({ kind: "fixed", days: [2], startTime: "14:30", endTime: "15:30", repeat: false });
    expect(formForSlot(0, 23 * 60 + 30)).toMatchObject({ startTime: "23:00", endTime: "23:45" });
  });
});
