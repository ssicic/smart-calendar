// Saves and loads the week in a local SQLite database on the device.
// The engine never sees SQL: this module translates between table rows and
// engine objects (FixedEvent, RestBlock, FlexibleItem, Placement).
import {
  DEFAULT_SLEEP,
  planningWindows,
  type DayOverride,
  type SleepSettings,
} from "../engine";
import type {
  FixedEvent,
  FlexibleItem,
  Interval,
  Placement,
  PlannerSettings,
  RestBlock,
  WeekInput,
} from "../engine";

type Param = string | number | null;

/**
 * The few database methods we use. expo-sqlite's SQLiteDatabase has these, and
 * the tests pass in a small adapter over Node's built-in SQLite instead.
 */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: Param[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: Param[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: Param[]): Promise<T | null>;
  /** Runs `task` as one transaction: all of its writes happen, or none do. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

const h = (hours: number) => hours * 60;

/** Settings aren't editable in the app yet, so they live in code for now. */
export const DEFAULT_SETTINGS: PlannerSettings = {
  dayStart: h(8),
  dayEnd: h(22),
  bufferMin: 15,
  minFreeMinutes: h(10),
};

/**
 * Each entry upgrades the database by one version. SQLite stores the current
 * version in `PRAGMA user_version`, so on startup we run only the steps this
 * device hasn't seen yet. Never edit a step once shipped; add a new one.
 */
const MIGRATIONS: string[] = [
  // Version 1: what you plan. Fixed events and rest blocks repeat every week.
  `
  CREATE TABLE events (
    id        TEXT PRIMARY KEY,
    kind      TEXT NOT NULL CHECK (kind IN ('fixed', 'rest')),
    title     TEXT NOT NULL,
    start_min INTEGER NOT NULL,
    end_min   INTEGER NOT NULL CHECK (end_min > start_min)
  );
  CREATE TABLE flexible_items (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    duration_min      INTEGER NOT NULL CHECK (duration_min > 0),
    times_per_week    INTEGER NOT NULL CHECK (times_per_week > 0),
    priority          INTEGER NOT NULL,
    preferred_windows TEXT, -- JSON array of {start, end}, or NULL for any time
    goal_id           TEXT
  );
  `,
  // Version 2: what happened in a specific week. Only sessions you touched
  // are stored (locked, done, skipped); suggestions are recomputed on load.
  `
  CREATE TABLE placements (
    id         TEXT PRIMARY KEY,
    week_start TEXT NOT NULL, -- Monday of the week, "YYYY-MM-DD"
    item_id    TEXT NOT NULL,
    start_min  INTEGER NOT NULL,
    end_min    INTEGER NOT NULL CHECK (end_min > start_min),
    state      TEXT NOT NULL CHECK (state IN ('locked', 'done', 'skipped'))
  );
  CREATE INDEX placements_by_week ON placements (week_start);
  -- "Move to queue": one extra session of the item in target_week.
  CREATE TABLE queue (
    id           TEXT PRIMARY KEY,
    item_id      TEXT NOT NULL,
    placement_id TEXT NOT NULL, -- the skipped session it came from, for undo
    target_week  TEXT NOT NULL
  );
  `,
  // Version 3: sleep. Usual times live in a small key/value settings table;
  // one-off changes are per week and day. NULL = follow the usual time.
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL -- JSON
  );
  CREATE TABLE day_overrides (
    week_start TEXT NOT NULL,
    day        INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
    wake_min   INTEGER,
    bed_min    INTEGER,
    PRIMARY KEY (week_start, day)
  );
  `,
  // Version 4: one-off events. week_start = the Monday of the only week the
  // event is in; NULL = it repeats every week (all events before v4 do).
  `
  ALTER TABLE events ADD COLUMN week_start TEXT;
  CREATE INDEX events_by_week ON events (week_start);
  `,
  // Version 5: a "kept" state (the user put it here, but didn't lock it).
  // SQLite can't change a CHECK rule, so the table is rebuilt and copied.
  // Until now every move locked a session automatically, so existing
  // locked sessions become kept (same time, no lock).
  `
  CREATE TABLE placements_v5 (
    id         TEXT PRIMARY KEY,
    week_start TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    start_min  INTEGER NOT NULL,
    end_min    INTEGER NOT NULL CHECK (end_min > start_min),
    state      TEXT NOT NULL CHECK (state IN ('kept', 'locked', 'done', 'skipped'))
  );
  INSERT INTO placements_v5
    SELECT id, week_start, item_id, start_min, end_min,
           CASE state WHEN 'locked' THEN 'kept' ELSE state END
    FROM placements;
  DROP TABLE placements;
  ALTER TABLE placements_v5 RENAME TO placements;
  CREATE INDEX placements_by_week ON placements (week_start);
  `,
  // Version 6: optional activity groups with a colour. Starts with a few;
  // the user can add more. NULL category = no group (the default colours).
  `
  CREATE TABLE categories (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    color    TEXT NOT NULL, -- "#RRGGBB"
    position INTEGER NOT NULL
  );
  INSERT INTO categories (id, name, color, position) VALUES
    ('work', 'Work', '#3B82F6', 0),
    ('health', 'Health', '#22A06B', 1),
    ('creativity', 'Creativity', '#8B5CF6', 2),
    ('learning', 'Learning', '#F59E0B', 3),
    ('social', 'Social', '#EC4899', 4),
    ('home', 'Home', '#F97316', 5),
    ('fun', 'Fun', '#14B8A6', 6);
  ALTER TABLE events ADD COLUMN category_id TEXT;
  ALTER TABLE flexible_items ADD COLUMN category_id TEXT;
  `,
];

/** `upTo` (tests only): stop at that version, to test the next step on old data. */
export async function migrate(db: Db, upTo = MIGRATIONS.length): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;
  for (let v = current; v < upTo; v++) {
    // One transaction per step: either the whole step applies or none of it.
    await db.execAsync(`BEGIN; ${MIGRATIONS[v]}; PRAGMA user_version = ${v + 1}; COMMIT;`);
  }
}

// ---- Row types: what a SELECT returns (snake_case, like the columns) ----

export interface EventRow {
  id: string;
  kind: "fixed" | "rest";
  title: string;
  start_min: number;
  end_min: number;
  week_start: string | null;
  category_id: string | null;
}

export interface ItemRow {
  id: string;
  title: string;
  duration_min: number;
  times_per_week: number;
  priority: number;
  preferred_windows: string | null;
  goal_id: string | null;
  category_id: string | null;
}

/** An activity group (Work, Health…) and its colour. */
export interface Category {
  id: string;
  name: string;
  color: string; // "#RRGGBB"
}

export interface PlacementRow {
  id: string;
  item_id: string;
  start_min: number;
  end_min: number;
  state: "kept" | "locked" | "done" | "skipped";
}

// ---- Pure converters between rows and engine objects ----

export function eventFromRow(r: EventRow): FixedEvent | RestBlock {
  return {
    id: r.id,
    title: r.title,
    start: r.start_min,
    end: r.end_min,
    ...(r.category_id ? { categoryId: r.category_id } : {}),
  };
}

export function itemFromRow(r: ItemRow): FlexibleItem {
  return {
    id: r.id,
    title: r.title,
    durationMin: r.duration_min,
    timesPerWeek: r.times_per_week,
    priority: r.priority,
    // Spread an empty object when absent, so the key isn't there at all.
    ...(r.preferred_windows ? { preferredWindows: JSON.parse(r.preferred_windows) as Interval[] } : {}),
    ...(r.goal_id ? { goalId: r.goal_id } : {}),
    ...(r.category_id ? { categoryId: r.category_id } : {}),
  };
}

export function placementFromRow(r: PlacementRow): Placement {
  return { id: r.id, itemId: r.item_id, start: r.start_min, end: r.end_min, state: r.state };
}

// ---- Reads ----

export interface LoadedWeek {
  week: WeekInput;
  sleep: SleepSettings;
  /** One-off sleep changes for this week. */
  overrides: DayOverride[];
  /** Titles of sessions already queued for the week after this one. */
  queuedForNextWeek: { itemId: string; title: string }[];
}

/**
 * Everything needed to plan `weekStart`. Sessions queued *for* this week are
 * added to their item's times-per-week, so the planner fits them in.
 */
export async function loadWeek(db: Db, weekStart: string, nextWeekStart: string): Promise<LoadedWeek> {
  // Events that repeat every week, plus the one-off events of this week.
  const events = await db.getAllAsync<EventRow>(
    "SELECT * FROM events WHERE week_start IS NULL OR week_start = ? ORDER BY start_min",
    [weekStart],
  );
  const items = await db.getAllAsync<ItemRow>("SELECT * FROM flexible_items ORDER BY rowid", []);
  const placements = await db.getAllAsync<PlacementRow>(
    "SELECT id, item_id, start_min, end_min, state FROM placements WHERE week_start = ?",
    [weekStart],
  );
  // GROUP BY: one row per item with how many sessions were queued for it.
  const queuedHere = await db.getAllAsync<{ item_id: string; n: number }>(
    "SELECT item_id, COUNT(*) AS n FROM queue WHERE target_week = ? GROUP BY item_id",
    [weekStart],
  );
  // JOIN: pull each queued session's title from flexible_items.
  const queuedNext = await db.getAllAsync<{ item_id: string; title: string }>(
    `SELECT q.item_id, i.title FROM queue q JOIN flexible_items i ON i.id = q.item_id
     WHERE q.target_week = ? ORDER BY q.rowid`,
    [nextWeekStart],
  );

  const sleep = await loadSleep(db);
  const overrides = await loadOverrides(db, weekStart);

  const extra = new Map(queuedHere.map((q) => [q.item_id, q.n]));
  return {
    sleep,
    overrides,
    week: {
      fixed: events.filter((e) => e.kind === "fixed").map(eventFromRow),
      rest: events.filter((e) => e.kind === "rest").map(eventFromRow),
      items: items.map(itemFromRow).map((i) => ({ ...i, timesPerWeek: i.timesPerWeek + (extra.get(i.id) ?? 0) })),
      placements: placements.map(placementFromRow),
      settings: { ...DEFAULT_SETTINGS, dayWindows: planningWindows(sleep, overrides) },
    },
    queuedForNextWeek: queuedNext.map((q) => ({ itemId: q.item_id, title: q.title })),
  };
}

// ---- Writes: what you plan ----

/** `weekStart`: the only week these events are in, or null to repeat them every week. */
export async function insertEvents(
  db: Db,
  kind: "fixed" | "rest",
  events: (FixedEvent | RestBlock)[],
  weekStart: string | null,
): Promise<void> {
  // `?` placeholders: the driver inserts values safely, so a title like
  // "Bob's class" can't break the SQL (or inject any).
  for (const e of events) {
    await db.runAsync(
      "INSERT INTO events (id, kind, title, start_min, end_min, week_start, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [e.id, kind, e.title, e.start, e.end, weekStart, e.categoryId ?? null],
    );
  }
}

export async function moveEvent(db: Db, id: string, start: number, end: number): Promise<void> {
  await db.runAsync("UPDATE events SET start_min = ?, end_min = ? WHERE id = ?", [start, end, id]);
}

export async function deleteEvent(db: Db, id: string): Promise<void> {
  await db.runAsync("DELETE FROM events WHERE id = ?", [id]);
}

export async function insertItem(db: Db, item: FlexibleItem): Promise<void> {
  await db.runAsync(
    `INSERT INTO flexible_items
       (id, title, duration_min, times_per_week, priority, preferred_windows, goal_id, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.title,
      item.durationMin,
      item.timesPerWeek,
      item.priority,
      item.preferredWindows ? JSON.stringify(item.preferredWindows) : null,
      item.goalId ?? null,
      item.categoryId ?? null,
    ],
  );
}

// ---- Activity groups (categories) ----

export async function loadCategories(db: Db): Promise<Category[]> {
  return db.getAllAsync<Category>("SELECT id, name, color FROM categories ORDER BY position, rowid", []);
}

/** Adds a group at the end of the list. */
export async function insertCategory(db: Db, c: Category): Promise<void> {
  await db.runAsync(
    "INSERT INTO categories (id, name, color, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM categories))",
    [c.id, c.name, c.color],
  );
}

/** Renames a group and/or changes its colour. */
export async function updateCategory(db: Db, c: Category): Promise<void> {
  await db.runAsync("UPDATE categories SET name = ?, color = ? WHERE id = ?", [c.name, c.color, c.id]);
}

/** Deletes a group. Its events and items stay, with no group. One transaction. */
export async function deleteCategory(db: Db, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE events SET category_id = NULL WHERE category_id = ?", [id]);
    await db.runAsync("UPDATE flexible_items SET category_id = NULL WHERE category_id = ?", [id]);
    await db.runAsync("DELETE FROM categories WHERE id = ?", [id]);
  });
}

/** Saves the group order: `ids` lists every group, first one first. */
export async function reorderCategories(db: Db, ids: string[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const [i, id] of ids.entries()) {
      await db.runAsync("UPDATE categories SET position = ? WHERE id = ?", [i, id]);
    }
  });
}

/** Puts an event, or a flexible item (every session of it), in a group; null = no group. */
export async function setCategory(
  db: Db,
  target: { kind: "event" | "item"; id: string },
  categoryId: string | null,
): Promise<void> {
  const table = target.kind === "event" ? "events" : "flexible_items";
  await db.runAsync(`UPDATE ${table} SET category_id = ? WHERE id = ?`, [categoryId, target.id]);
}

/** Removes the item and everything that points at it, in one transaction. */
export async function deleteItem(db: Db, itemId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM placements WHERE item_id = ?", [itemId]);
    await db.runAsync("DELETE FROM queue WHERE item_id = ?", [itemId]);
    await db.runAsync("DELETE FROM flexible_items WHERE id = ?", [itemId]);
  });
}

// ---- Writes: what happened this week ----

/** Insert or overwrite one session of `weekStart` (lock, move, done). */
export async function savePlacement(db: Db, weekStart: string, p: Placement): Promise<void> {
  if (p.state === "suggested") throw new Error("Suggested placements are not stored");
  await db.runAsync(
    `INSERT OR REPLACE INTO placements (id, week_start, item_id, start_min, end_min, state)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [p.id, weekStart, p.itemId, p.start, p.end, p.state],
  );
}

/**
 * Back to an ordinary session at the same time (unlock, "not done yet",
 * "bring back"): it stays where it is instead of jumping to a new suggestion.
 */
export async function keepPlacement(db: Db, placementId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM queue WHERE placement_id = ?", [placementId]);
    await db.runAsync("UPDATE placements SET state = 'kept' WHERE id = ?", [placementId]);
  });
}

/** Forget a stored session (unlock, "not done", undo queue): it becomes a suggestion again. */
export async function forgetPlacement(db: Db, placementId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM queue WHERE placement_id = ?", [placementId]);
    await db.runAsync("DELETE FROM placements WHERE id = ?", [placementId]);
  });
}

/** Skip this session and add one extra session of the same item to `targetWeek`. */
export async function queuePlacement(
  db: Db,
  weekStart: string,
  p: Placement,
  targetWeek: string,
  queueId: string,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await savePlacement(db, weekStart, { ...p, state: "skipped" });
    await db.runAsync("INSERT INTO queue (id, item_id, placement_id, target_week) VALUES (?, ?, ?, ?)", [
      queueId,
      p.itemId,
      p.id,
      targetWeek,
    ]);
  });
}

// ---- Sleep ----

export async function loadSleep(db: Db): Promise<SleepSettings> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'sleep'", []);
  // Merge over the defaults, so settings saved by an older version still work.
  return row ? { ...DEFAULT_SLEEP, ...(JSON.parse(row.value) as Partial<SleepSettings>) } : DEFAULT_SLEEP;
}

export async function saveSleep(db: Db, sleep: SleepSettings): Promise<void> {
  // UPSERT: insert the row, or update it if the key already exists.
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('sleep', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [JSON.stringify(sleep)],
  );
}

export async function loadOverrides(db: Db, weekStart: string): Promise<DayOverride[]> {
  const rows = await db.getAllAsync<{ day: number; wake_min: number | null; bed_min: number | null }>(
    "SELECT day, wake_min, bed_min FROM day_overrides WHERE week_start = ?",
    [weekStart],
  );
  return rows.map((r) => ({
    day: r.day,
    ...(r.wake_min !== null ? { wake: r.wake_min } : {}),
    ...(r.bed_min !== null ? { bed: r.bed_min } : {}),
  }));
}

/** Change (or with `null`, reset) one day's wake-up or bedtime for one week. */
export async function setOverride(
  db: Db,
  weekStart: string,
  day: number,
  field: "wake" | "bed",
  minutes: number | null,
): Promise<void> {
  // Column names can't be `?` parameters, so pick from a fixed list instead.
  const column = field === "wake" ? "wake_min" : "bed_min";
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO day_overrides (week_start, day, ${column}) VALUES (?, ?, ?)
       ON CONFLICT(week_start, day) DO UPDATE SET ${column} = excluded.${column}`,
      [weekStart, day, minutes],
    );
    // Tidy up rows where both times follow the usual again.
    await db.runAsync("DELETE FROM day_overrides WHERE wake_min IS NULL AND bed_min IS NULL", []);
  });
}
