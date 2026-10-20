// Reads and writes for the week's to-do list and goals (table week_items,
// DB v11). Same small Db interface as weekStore, so tests use node:sqlite.
import type { Db } from "./weekStore";

export type WeekItemKind = "todo" | "goal";

/** One line in the "This week" panel. */
export interface WeekItem {
  id: string;
  kind: WeekItemKind;
  title: string;
  /** To-dos: ticked off. (Goals use progress/target instead.) */
  done: boolean;
  progress: number;
  target: number;
}

interface WeekItemRow {
  id: string;
  kind: WeekItemKind;
  title: string;
  done: number; // SQLite has no booleans: 0 or 1
  progress: number;
  target: number;
}

/** The week's to-dos and goals, in the order they were added. */
export async function loadWeekItems(db: Db, weekStart: string): Promise<WeekItem[]> {
  const rows = await db.getAllAsync<WeekItemRow>(
    "SELECT id, kind, title, done, progress, target FROM week_items WHERE week_start = ? ORDER BY position, rowid",
    [weekStart],
  );
  return rows.map((r) => ({ ...r, done: r.done === 1 }));
}

/** Adds a to-do or goal at the end of the week's list. */
export async function insertWeekItem(db: Db, weekStart: string, item: WeekItem): Promise<void> {
  await db.runAsync(
    `INSERT INTO week_items (id, week_start, kind, title, done, progress, target, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM week_items WHERE week_start = ?))`,
    [item.id, weekStart, item.kind, item.title, item.done ? 1 : 0, item.progress, item.target, weekStart],
  );
}

/** Changes a to-do or goal (name, ticked, progress, target). */
export async function updateWeekItem(db: Db, item: WeekItem): Promise<void> {
  await db.runAsync("UPDATE week_items SET title = ?, done = ?, progress = ?, target = ? WHERE id = ?", [
    item.title,
    item.done ? 1 : 0,
    item.progress,
    item.target,
    item.id,
  ]);
}

export async function deleteWeekItem(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM week_items WHERE id = ?", [id]);
}
