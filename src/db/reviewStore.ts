// Reads for the week review that don't belong to one feature's store.
import type { Db } from "./weekStore";

/** A session moved out of a week with "Move to queue": where it went (a week, or null = Later). */
export interface MovedOn {
  title: string;
  targetWeek: string | null;
}

/** Sessions of `weekStart` that were moved to the queue, oldest first. */
export async function loadMovedOn(db: Db, weekStart: string): Promise<MovedOn[]> {
  const rows = await db.getAllAsync<{ title: string; target_week: string | null }>(
    `SELECT i.title, q.target_week FROM queue q
     JOIN placements p ON p.id = q.placement_id
     JOIN flexible_items i ON i.id = q.item_id
     WHERE p.week_start = ? ORDER BY q.rowid`,
    [weekStart],
  );
  return rows.map((r) => ({ title: r.title, targetWeek: r.target_week }));
}
