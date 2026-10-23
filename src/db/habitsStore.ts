// Habits and their daily ticks (tables habits and habit_checks, DB v18).
import type { Db } from "./weekStore";

export interface Habit {
  id: string;
  title: string;
  /** An Ionicons name, from HABIT_ICONS. */
  icon: string;
  /** Days a week that count as on track (7 = every day). */
  targetPerWeek: number;
}

interface HabitRow {
  id: string;
  title: string;
  icon: string;
  target_per_week: number;
}

export async function loadHabits(db: Db): Promise<Habit[]> {
  const rows = await db.getAllAsync<HabitRow>(
    "SELECT id, title, icon, target_per_week FROM habits ORDER BY position, rowid",
    [],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, icon: r.icon, targetPerWeek: r.target_per_week }));
}

export async function insertHabit(db: Db, h: Habit): Promise<void> {
  await db.runAsync(
    `INSERT INTO habits (id, title, icon, target_per_week, position)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM habits))`,
    [h.id, h.title, h.icon, h.targetPerWeek],
  );
}

export async function updateHabit(db: Db, h: Habit): Promise<void> {
  await db.runAsync("UPDATE habits SET title = ?, icon = ?, target_per_week = ? WHERE id = ?", [
    h.title,
    h.icon,
    h.targetPerWeek,
    h.id,
  ]);
}

/** Deletes a habit and all its ticks. */
export async function deleteHabit(db: Db, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM habit_checks WHERE habit_id = ?", [id]);
    await db.runAsync("DELETE FROM habits WHERE id = ?", [id]);
  });
}

/** Ticks between two days (inclusive, "YYYY-MM-DD"), as "habitId|day" keys. */
export async function loadHabitChecks(db: Db, fromDay: string, toDay: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ habit_id: string; day: string }>(
    "SELECT habit_id, day FROM habit_checks WHERE day BETWEEN ? AND ?",
    [fromDay, toDay],
  );
  return new Set(rows.map((r) => `${r.habit_id}|${r.day}`));
}

/** Ticks or unticks one habit on one day. */
export async function setHabitCheck(db: Db, habitId: string, day: string, done: boolean): Promise<void> {
  if (done) await db.runAsync("INSERT OR IGNORE INTO habit_checks (habit_id, day) VALUES (?, ?)", [habitId, day]);
  else await db.runAsync("DELETE FROM habit_checks WHERE habit_id = ? AND day = ?", [habitId, day]);
}
