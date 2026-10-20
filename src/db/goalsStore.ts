// Goals for the year and the month (table goals, DB v16).
import type { Db } from "./weekStore";

export type GoalHorizon = "year" | "month";

export interface Goal {
  id: string;
  title: string;
  horizon: GoalHorizon;
  /** "2026" for a year goal, "2026-10" for a month goal. */
  period: string;
  /** A month goal's year goal, if any. */
  parentId: string | null;
  done: boolean;
}

interface GoalRow {
  id: string;
  title: string;
  horizon: GoalHorizon;
  period: string;
  parent_id: string | null;
  done: number;
}

/** Goals of the given periods (e.g. this year and this month), in the order added. */
export async function loadGoals(db: Db, periods: string[]): Promise<Goal[]> {
  if (periods.length === 0) return [];
  const rows = await db.getAllAsync<GoalRow>(
    `SELECT id, title, horizon, period, parent_id, done FROM goals
     WHERE period IN (${periods.map(() => "?").join(", ")}) ORDER BY position, rowid`,
    periods,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    horizon: r.horizon,
    period: r.period,
    parentId: r.parent_id,
    done: r.done === 1,
  }));
}

export async function insertGoal(db: Db, goal: Goal): Promise<void> {
  await db.runAsync(
    `INSERT INTO goals (id, title, horizon, period, parent_id, done, position)
     VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM goals))`,
    [goal.id, goal.title, goal.horizon, goal.period, goal.parentId, goal.done ? 1 : 0],
  );
}

/** Saves a changed goal (name, done, parent). */
export async function updateGoal(db: Db, goal: Goal): Promise<void> {
  await db.runAsync("UPDATE goals SET title = ?, parent_id = ?, done = ? WHERE id = ?", [
    goal.title,
    goal.parentId,
    goal.done ? 1 : 0,
    goal.id,
  ]);
}

/**
 * Deletes a goal. What was part of it stays, just no longer linked: month
 * goals under it, week goals, and flexible items made for it.
 */
export async function deleteGoal(db: Db, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE goals SET parent_id = NULL WHERE parent_id = ?", [id]);
    await db.runAsync("UPDATE week_items SET goal_id = NULL WHERE goal_id = ?", [id]);
    await db.runAsync("UPDATE flexible_items SET goal_id = NULL WHERE goal_id = ?", [id]);
    await db.runAsync("DELETE FROM goals WHERE id = ?", [id]);
  });
}
