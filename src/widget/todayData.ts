// What the home screen widget shows: today's plan, worked out the same way the
// week screen does it (load the week, run the planner, split into days). No
// React here, so it runs in the widget's background task and in tests.
import { DAY, planWeek } from "../engine";
import { loadDoneEvents, loadWeek, savePlacement, setEventDone, type Db } from "../db/weekStore";
import { storedId } from "../ui/itemActions";
import { addWeeks, plannableFrom, weekStartOf } from "../ui/weekDate";
import { isDone, isEventKind, rowsByDay, type WeekRow } from "../ui/weekRows";

export interface TodayView {
  /** Today's rows that count (skipped ones left out), sorted by time. */
  rows: WeekRow[];
  done: number;
  /** The first not-done row that hasn't ended yet. */
  next?: WeekRow;
  /** Up to two not-done rows after `next`. */
  later: WeekRow[];
}

const dayIndexOf = (now: Date) => (now.getDay() + 6) % 7; // 0 = Monday

async function planToday(db: Db, now: Date) {
  const weekStart = weekStartOf(now);
  const loaded = await loadWeek(db, weekStart, addWeeks(weekStart, 1));
  const week = { ...loaded.week, settings: { ...loaded.week.settings, earliestStart: plannableFrom(weekStart, now) } };
  const plan = planWeek(week);
  const rows = rowsByDay(week, plan, await loadDoneEvents(db, weekStart))[dayIndexOf(now)] ?? [];
  return { weekStart, plan, rows: rows.filter((r) => r.kind !== "skipped") };
}

export async function loadToday(db: Db, now: Date): Promise<TodayView> {
  const { rows } = await planToday(db, now);
  const minute = dayIndexOf(now) * DAY + now.getHours() * 60 + now.getMinutes();
  const open = rows.filter((r) => !isDone(r) && r.end > minute);
  return { rows, done: rows.filter(isDone).length, next: open[0], later: open.slice(1, 3) };
}

let counter = 0;
const newId = () => `w${Date.now().toString(36)}${counter++}`;

/** The widget's Done button: same effect as Done in the app, for today's row `rowId`. */
export async function markDoneToday(db: Db, now: Date, rowId: string): Promise<void> {
  const { weekStart, plan, rows } = await planToday(db, now);
  const row = rows.find((r) => r.id === rowId);
  if (!row || isDone(row)) return;
  if (isEventKind(row.kind)) {
    await setEventDone(db, row.id, weekStart, true);
    return;
  }
  const p = plan.placements.find((x) => x.id === row.id);
  if (p) await savePlacement(db, weekStart, { ...p, id: storedId(p, newId), state: "done" });
}
