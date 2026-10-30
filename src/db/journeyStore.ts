// Journeys (table journeys, DB v19). The step a week is on isn't stored; see engine/journey.ts.
import type { Checkin, FlexibleItem, Interval, Journey, JourneyStep } from "../engine";
import { insertItem, type Db } from "./weekStore";

interface JourneyRow {
  id: string;
  item_id: string;
  goal: string;
  steps: string;
  start_week: string;
  step_downs: string;
  checkins: string;
}

/** Journeys running in `weekStart`: started by then and not stopped before it. */
export async function loadJourneys(db: Db, weekStart: string): Promise<Journey[]> {
  const rows = await db.getAllAsync<JourneyRow>(
    `SELECT * FROM journeys WHERE start_week <= ? AND (stopped_week IS NULL OR stopped_week >= ?) ORDER BY rowid`,
    [weekStart, weekStart],
  );
  return rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    goal: r.goal,
    steps: JSON.parse(r.steps),
    startWeek: r.start_week,
    stepDowns: JSON.parse(r.step_downs),
    checkins: JSON.parse(r.checkins),
  }));
}

/** Done sessions of one item per week. */
export async function doneByWeek(db: Db, itemId: string): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ week_start: string; n: number }>(
    "SELECT week_start, COUNT(*) AS n FROM placements WHERE item_id = ? AND state = 'done' GROUP BY week_start",
    [itemId],
  );
  return new Map(rows.map((r) => [r.week_start, r.n]));
}

/**
 * Starts a journey: a new repeating flexible item (from `j.startWeek` on, at
 * the first step's amount) and the journey that sets its amount each week.
 */
export async function startJourney(db: Db, j: Journey, item: FlexibleItem): Promise<void> {
  await db.withTransactionAsync(async () => {
    await insertItem(db, item, null, j.startWeek);
    await db.runAsync(
      "INSERT INTO journeys (id, item_id, goal, steps, start_week, step_downs, checkins) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [j.id, j.itemId, j.goal, JSON.stringify(j.steps), j.startWeek, JSON.stringify(j.stepDowns), JSON.stringify(j.checkins)],
    );
  });
}

/**
 * Saves an accepted weekly check-in for `weekStart`. `preferredWindows`:
 * when the coach also moved the sessions to another time of day (null = any
 * time; undefined = no change).
 */
export async function saveCheckin(
  db: Db,
  j: Journey,
  weekStart: string,
  checkin: Checkin,
  preferredWindows?: Interval[] | null,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE journeys SET checkins = ? WHERE id = ?", [
      JSON.stringify({ ...j.checkins, [weekStart]: checkin }),
      j.id,
    ]);
    if (preferredWindows !== undefined)
      await db.runAsync("UPDATE flexible_items SET preferred_windows = ? WHERE id = ?", [
        preferredWindows ? JSON.stringify(preferredWindows) : null,
        j.itemId,
      ]);
  });
}

/** "Make it easier": one step down from `weekStart` on. */
export async function stepDown(db: Db, j: Journey, weekStart: string): Promise<void> {
  if (j.stepDowns.includes(weekStart)) return;
  await db.runAsync("UPDATE journeys SET step_downs = ? WHERE id = ?", [
    JSON.stringify([...j.stepDowns, weekStart]),
    j.id,
  ]);
}

/**
 * Stops a journey after `lastWeek`. The item stays (it's a habit now) at the
 * amount of the step it was on, so nothing jumps back to the first step.
 */
export async function stopJourney(db: Db, j: Journey, lastWeek: string, step: { timesPerWeek: number; minutes: number }): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE journeys SET stopped_week = ? WHERE id = ?", [lastWeek, j.id]);
    await db.runAsync("UPDATE flexible_items SET times_per_week = ?, duration_min = ? WHERE id = ?", [
      step.timesPerWeek,
      step.minutes,
      j.itemId,
    ]);
  });
}

/** An item's done and skipped sessions in every week: what a check-in looks at. */
export async function loadItemSessions(
  db: Db,
  itemId: string,
): Promise<{ weekStart: string; start: number; state: "done" | "skipped" }[]> {
  const rows = await db.getAllAsync<{ week_start: string; start_min: number; state: "done" | "skipped" }>(
    "SELECT week_start, start_min, state FROM placements WHERE item_id = ? AND state IN ('done', 'skipped') ORDER BY start_min",
    [itemId],
  );
  return rows.map((r) => ({ weekStart: r.week_start, start: r.start_min, state: r.state }));
}

// ---- Waiting journeys (from a brain dump) ----

export interface QueuedJourney {
  id: string;
  goal: string;
  title: string;
  timeOfDay: "any" | "morning" | "afternoon" | "evening";
  steps: JourneyStep[];
  slot: "next" | "later";
}

/** Waiting journeys: all "next" ones first, each slot in the order added. */
export async function loadQueue(db: Db): Promise<QueuedJourney[]> {
  const rows = await db.getAllAsync<{ id: string; goal: string; title: string; time_of_day: QueuedJourney["timeOfDay"]; steps: string; slot: QueuedJourney["slot"] }>(
    "SELECT * FROM journey_queue ORDER BY slot = 'later', position",
    [],
  );
  return rows.map((r) => ({ id: r.id, goal: r.goal, title: r.title, timeOfDay: r.time_of_day, steps: JSON.parse(r.steps), slot: r.slot }));
}

export async function queueJourney(db: Db, q: QueuedJourney): Promise<void> {
  await db.runAsync(
    `INSERT INTO journey_queue (id, goal, title, time_of_day, steps, slot, position)
     VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM journey_queue))`,
    [q.id, q.goal, q.title, q.timeOfDay, JSON.stringify(q.steps), q.slot],
  );
}

export async function deleteQueued(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM journey_queue WHERE id = ?", [id]);
}
