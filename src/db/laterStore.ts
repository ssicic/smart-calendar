// The "Later" list: sessions moved to the queue without a week. They are rows
// in `queue` with target_week NULL (DB v12). Adding one to a week just sets
// its target_week, so it becomes an ordinary queue entry for that week.
import type { Db } from "./weekStore";

export interface LaterEntry {
  /** The queue row's id. */
  id: string;
  itemId: string;
  title: string;
}

/** Everything waiting in Later, oldest first, with its item's title. */
export async function loadLater(db: Db): Promise<LaterEntry[]> {
  const rows = await db.getAllAsync<{ id: string; item_id: string; title: string }>(
    `SELECT q.id, q.item_id, i.title FROM queue q JOIN flexible_items i ON i.id = q.item_id
     WHERE q.target_week IS NULL ORDER BY q.rowid`,
    [],
  );
  return rows.map((r) => ({ id: r.id, itemId: r.item_id, title: r.title }));
}

/** Adds one extra session of the entry's item to `weekStart`, and takes it off Later. */
export async function addLaterToWeek(db: Db, id: string, weekStart: string): Promise<void> {
  await db.runAsync("UPDATE queue SET target_week = ? WHERE id = ? AND target_week IS NULL", [weekStart, id]);
}

/** Drops an entry from Later. The session it came from stays skipped ("handled"). */
export async function deleteLater(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM queue WHERE id = ? AND target_week IS NULL", [id]);
}
