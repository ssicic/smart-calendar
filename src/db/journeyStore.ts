// Journeys (table journeys, DB v19). The step a week is on isn't stored; see engine/journey.ts.
import type { FlexibleItem, Journey } from "../engine";
import { insertItem, type Db } from "./weekStore";

interface JourneyRow {
  id: string;
  item_id: string;
  goal: string;
  steps: string;
  start_week: string;
  step_downs: string;
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
      "INSERT INTO journeys (id, item_id, goal, steps, start_week, step_downs) VALUES (?, ?, ?, ?, ?, ?)",
      [j.id, j.itemId, j.goal, JSON.stringify(j.steps), j.startWeek, JSON.stringify(j.stepDowns)],
    );
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
