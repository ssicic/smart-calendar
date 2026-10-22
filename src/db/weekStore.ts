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
  // Version 7: changes to a repeating event for one week only ("Just this
  // week"). A row moves the event that week; NULL times = not on that week.
  `
  CREATE TABLE event_exceptions (
    event_id   TEXT NOT NULL,
    week_start TEXT NOT NULL,
    start_min  INTEGER,
    end_min    INTEGER,
    PRIMARY KEY (event_id, week_start),
    CHECK ((start_min IS NULL AND end_min IS NULL) OR end_min > start_min)
  );
  `,
  // Version 8: routines, and Rest becomes a group instead of its own kind.
  // Rest blocks turn into fixed events in the "Rest" group (an existing
  // group called Rest is reused). SQLite can't change a CHECK rule, so the
  // events table is rebuilt and copied, keeping every id.
  // A routine is an event at a set time that follows a saved checklist
  // (routines.steps, JSON [{id, text}]); routine_checks remembers which
  // steps were ticked, per event and week.
  `
  INSERT INTO categories (id, name, color, position)
    SELECT 'rest', 'Rest', '#2F9E5B', (SELECT COALESCE(MAX(position), -1) + 1 FROM categories)
    WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = 'rest');
  CREATE TABLE events_v8 (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('fixed', 'routine')),
    title       TEXT NOT NULL,
    start_min   INTEGER NOT NULL,
    end_min     INTEGER NOT NULL CHECK (end_min > start_min),
    week_start  TEXT,
    category_id TEXT,
    routine_id  TEXT
  );
  INSERT INTO events_v8 (id, kind, title, start_min, end_min, week_start, category_id)
    SELECT id, 'fixed', title, start_min, end_min, week_start,
           CASE WHEN kind = 'rest' AND category_id IS NULL
                THEN (SELECT id FROM categories WHERE lower(name) = 'rest' ORDER BY position LIMIT 1)
                ELSE category_id END
    FROM events;
  DROP TABLE events;
  ALTER TABLE events_v8 RENAME TO events;
  CREATE INDEX events_by_week ON events (week_start);
  CREATE TABLE routines (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    steps    TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  INSERT INTO routines (id, name, steps, position) VALUES
    ('morning', 'Morning routine', '[{"id":"m1","text":"Drink a glass of water"},{"id":"m2","text":"Brush teeth"},{"id":"m3","text":"Shower"},{"id":"m4","text":"Get dressed"},{"id":"m5","text":"Breakfast"}]', 0),
    ('night', 'Night routine', '[{"id":"n1","text":"Tidy up for 5 minutes"},{"id":"n2","text":"Lay out tomorrow''s clothes"},{"id":"n3","text":"Brush teeth"},{"id":"n4","text":"Screens away"},{"id":"n5","text":"Read in bed"}]', 1);
  CREATE TABLE routine_checks (
    event_id   TEXT NOT NULL,
    week_start TEXT NOT NULL,
    step_id    TEXT NOT NULL,
    PRIMARY KEY (event_id, week_start, step_id)
  );
  `,
  // Version 9: no ready-made routines (everyone's mornings differ). The two
  // that v8 added are removed, unless something on the calendar already
  // follows them; then they stay and the user can edit or delete them.
  `
  DELETE FROM routines
    WHERE id IN ('morning', 'night')
      AND NOT EXISTS (SELECT 1 FROM events WHERE events.routine_id = routines.id);
  `,
  // Version 10: a repeating event starts from the week it was added
  // (from_week, a Monday), instead of showing in every past week too.
  // Repeating events from before get this week's Monday: SQLite's
  // 'weekday 0' jumps to the coming Sunday (or stays on a Sunday), and
  // 6 days back from that is Monday.
  `
  ALTER TABLE events ADD COLUMN from_week TEXT;
  UPDATE events SET from_week = date('now', 'localtime', 'weekday 0', '-6 days') WHERE week_start IS NULL;
  `,
  // Version 11: the week's to-do list and goals ("This week" panel). Stored
  // per week, so past weeks keep theirs for the review. A to-do is done or
  // not; a goal counts progress up to a target (e.g. 1 of 3).
  `
  CREATE TABLE week_items (
    id         TEXT PRIMARY KEY,
    week_start TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('todo', 'goal')),
    title      TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    progress   INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
    target     INTEGER NOT NULL DEFAULT 1 CHECK (target >= 1),
    position   INTEGER NOT NULL
  );
  CREATE INDEX week_items_by_week ON week_items (week_start);
  `,
  // Version 12: the "Later" list. A queue entry with target_week NULL waits
  // in Later (no week yet) until the user adds it to a week. SQLite can't
  // drop NOT NULL, so the table is rebuilt and copied in the same order.
  `
  CREATE TABLE queue_v12 (
    id           TEXT PRIMARY KEY,
    item_id      TEXT NOT NULL,
    placement_id TEXT NOT NULL, -- the skipped session it came from, for undo
    target_week  TEXT           -- NULL = Later
  );
  INSERT INTO queue_v12 (id, item_id, placement_id, target_week)
    SELECT id, item_id, placement_id, target_week FROM queue ORDER BY rowid;
  DROP TABLE queue;
  ALTER TABLE queue_v12 RENAME TO queue;
  `,
  // Version 13: softer colours for the starting groups (the app's new calm
  // look). Only a group still on its original colour changes; one the user
  // recoloured keeps theirs.
  `
  UPDATE categories SET color = '#7C9CB8' WHERE id = 'work' AND upper(color) = '#3B82F6';
  UPDATE categories SET color = '#86AE8F' WHERE id = 'health' AND upper(color) = '#22A06B';
  UPDATE categories SET color = '#A393C4' WHERE id = 'creativity' AND upper(color) = '#8B5CF6';
  UPDATE categories SET color = '#D4AE6A' WHERE id = 'learning' AND upper(color) = '#F59E0B';
  UPDATE categories SET color = '#D59AAB' WHERE id = 'social' AND upper(color) = '#EC4899';
  UPDATE categories SET color = '#D9A27A' WHERE id = 'home' AND upper(color) = '#F97316';
  UPDATE categories SET color = '#7DB5AC' WHERE id = 'fun' AND upper(color) = '#14B8A6';
  UPDATE categories SET color = '#C2B59B' WHERE id = 'rest' AND upper(color) = '#2F9E5B';
  `,
  // Version 14: to-dos for one day ("Today" in the Day view). day = 0-6
  // (Monday = 0) within the item's week; NULL = for the whole week.
  `
  ALTER TABLE week_items ADD COLUMN day INTEGER CHECK (day BETWEEN 0 AND 6);
  `,
  // Version 15: fixed events and routines can be marked done, per week
  // (a repeating event is done or not separately each week).
  `
  CREATE TABLE event_done (
    event_id   TEXT NOT NULL,
    week_start TEXT NOT NULL,
    PRIMARY KEY (event_id, week_start)
  );
  `,
  // Version 16: goals for the year ("2026") and the month ("2026-10"). A
  // month goal can sit under a year goal (parent_id); a week goal
  // (week_items, kind 'goal') can sit under either (goal_id).
  `
  CREATE TABLE goals (
    id        TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    horizon   TEXT NOT NULL CHECK (horizon IN ('year', 'month')),
    period    TEXT NOT NULL,
    parent_id TEXT,
    done      INTEGER NOT NULL DEFAULT 0,
    position  INTEGER NOT NULL
  );
  CREATE INDEX goals_by_period ON goals (period);
  ALTER TABLE week_items ADD COLUMN goal_id TEXT;
  `,
  // Version 17: nothing repeats forever by accident. A flexible item can be
  // for one week only (week_start), like events; a repeating item starts at
  // from_week; and repeating items and events can stop (until_week, the last
  // week they show in). Existing rows keep NULLs: they repeat as before.
  `
  ALTER TABLE flexible_items ADD COLUMN week_start TEXT;
  ALTER TABLE flexible_items ADD COLUMN from_week TEXT;
  ALTER TABLE flexible_items ADD COLUMN until_week TEXT;
  ALTER TABLE events ADD COLUMN until_week TEXT;
  `,
];

/** `upTo` (tests only): stop at that version, to test the next step on old data. */
export async function migrate(db: Db, upTo = MIGRATIONS.length): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;
  for (let v = current; v < upTo; v++) {
    // One transaction per step: either the whole step applies or none of it.
    try {
      await db.execAsync(`BEGIN; ${MIGRATIONS[v]}; PRAGMA user_version = ${v + 1}; COMMIT;`);
    } catch (e) {
      // A failing statement stops the batch before COMMIT, leaving the transaction
      // open: the app would see the half-done step and nothing saved later would
      // stick. Undo it (no-op error if nothing is open) and report the failure.
      await db.execAsync("ROLLBACK").catch(() => {});
      throw e;
    }
  }
}

// ---- Row types: what a SELECT returns (snake_case, like the columns) ----

export interface EventRow {
  id: string;
  kind: "fixed" | "routine";
  title: string;
  start_min: number;
  end_min: number;
  week_start: string | null;
  category_id: string | null;
  routine_id: string | null;
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
  /** One week only ("YYYY-MM-DD"), or null for an item that repeats. */
  week_start: string | null;
}

/** One step of a routine's checklist. */
export interface RoutineStep {
  id: string;
  text: string;
}

/** A saved routine (Morning routine…): a name and its checklist, reused by every event that follows it. */
export interface Routine {
  id: string;
  name: string;
  steps: RoutineStep[];
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

/** One week's change to a repeating event: moved there, or (null times) removed. */
export interface ExceptionRow {
  event_id: string;
  start_min: number | null;
  end_min: number | null;
}

// ---- Pure converters between rows and engine objects ----

/** Applies this week's "just this week" changes: moves events, drops removed ones. */
export function applyExceptions(events: EventRow[], exceptions: ExceptionRow[]): EventRow[] {
  const byId = new Map(exceptions.map((x) => [x.event_id, x]));
  return events.flatMap((e) => {
    const x = byId.get(e.id);
    if (!x) return [e];
    if (x.start_min === null || x.end_min === null) return [];
    return [{ ...e, start_min: x.start_min, end_min: x.end_min }];
  });
}

export function eventFromRow(r: EventRow): FixedEvent | RestBlock {
  return {
    id: r.id,
    title: r.title,
    start: r.start_min,
    end: r.end_min,
    ...(r.category_id ? { categoryId: r.category_id } : {}),
    ...(r.routine_id ? { routineId: r.routine_id } : {}),
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
  /** Ids of the events that repeat every week (the others are one-offs). */
  repeatingEventIds: string[];
  /** Ids of the flexible items that repeat every week. */
  repeatingItemIds: string[];
}

/**
 * Everything needed to plan `weekStart`. Sessions queued *for* this week are
 * added to their item's times-per-week, so the planner fits them in.
 */
export async function loadWeek(db: Db, weekStart: string, nextWeekStart: string): Promise<LoadedWeek> {
  // Events that repeat every week, plus the one-off events of this week.
  const allEvents = await db.getAllAsync<EventRow>(
    `SELECT * FROM events
     WHERE (week_start IS NULL AND (from_week IS NULL OR from_week <= ?) AND (until_week IS NULL OR until_week >= ?))
        OR week_start = ?
     ORDER BY start_min`,
    [weekStart, weekStart, weekStart],
  );
  const exceptions = await db.getAllAsync<ExceptionRow>(
    "SELECT event_id, start_min, end_min FROM event_exceptions WHERE week_start = ?",
    [weekStart],
  );
  // Re-sort: a moved event may now come earlier or later.
  const events = applyExceptions(allEvents, exceptions).sort((a, b) => a.start_min - b.start_min);
  // Same rule for flexible items: repeating ones in their weeks, one-off ones in theirs.
  const items = await db.getAllAsync<ItemRow>(
    `SELECT * FROM flexible_items
     WHERE (week_start IS NULL AND (from_week IS NULL OR from_week <= ?) AND (until_week IS NULL OR until_week >= ?))
        OR week_start = ?
     ORDER BY rowid`,
    [weekStart, weekStart, weekStart],
  );
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
      rest: [], // rest is a group now (DB v8), not its own kind
      routines: events.filter((e) => e.kind === "routine").map(eventFromRow),
      items: items.map(itemFromRow).map((i) => ({ ...i, timesPerWeek: i.timesPerWeek + (extra.get(i.id) ?? 0) })),
      placements: placements.map(placementFromRow),
      settings: { ...DEFAULT_SETTINGS, dayWindows: planningWindows(sleep, overrides) },
    },
    queuedForNextWeek: queuedNext.map((q) => ({ itemId: q.item_id, title: q.title })),
    repeatingEventIds: events.filter((e) => e.week_start === null).map((e) => e.id),
    repeatingItemIds: items.filter((i) => i.week_start === null).map((i) => i.id),
  };
}

// ---- Writes: what you plan ----

/** `weekStart`: the only week these events are in, or null to repeat them every week (from `fromWeek` on). */
export async function insertEvents(
  db: Db,
  kind: "fixed" | "routine",
  events: FixedEvent[],
  weekStart: string | null,
  /** For repeating events: the first week they show in (null = every week, tests only). */
  fromWeek: string | null = weekStart,
): Promise<void> {
  // `?` placeholders: the driver inserts values safely, so a title like
  // "Bob's class" can't break the SQL (or inject any).
  for (const e of events) {
    await db.runAsync(
      `INSERT INTO events (id, kind, title, start_min, end_min, week_start, category_id, routine_id, from_week)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, kind, e.title, e.start, e.end, weekStart, e.categoryId ?? null, e.routineId ?? null, fromWeek],
    );
  }
}

/**
 * Moves the event in every week it's in. `weekStart`: the week it was moved
 * from, whose "just this week" change is dropped so it shows the new time too.
 */
export async function moveEvent(db: Db, id: string, start: number, end: number, weekStart?: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE events SET start_min = ?, end_min = ? WHERE id = ?", [start, end, id]);
    if (weekStart) await db.runAsync("DELETE FROM event_exceptions WHERE event_id = ? AND week_start = ?", [id, weekStart]);
  });
}

/** Renames one event (in every week it's in). */
export async function renameEvent(db: Db, id: string, title: string): Promise<void> {
  await db.runAsync("UPDATE events SET title = ? WHERE id = ?", [title, id]);
}

/** Renames every event of this kind that has this name, e.g. all "Work" blocks. */
export async function renameEventsNamed(db: Db, kind: "fixed" | "routine", oldTitle: string, title: string): Promise<void> {
  await db.runAsync("UPDATE events SET title = ? WHERE kind = ? AND title = ?", [title, kind, oldTitle]);
}

/** Renames a flexible item (all its sessions, every week). */
export async function renameItem(db: Db, itemId: string, title: string): Promise<void> {
  await db.runAsync("UPDATE flexible_items SET title = ? WHERE id = ?", [title, itemId]);
}

/** Deletes the event from every week, with its one-week changes. */
export async function deleteEvent(db: Db, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM event_exceptions WHERE event_id = ?", [id]);
    await db.runAsync("DELETE FROM routine_checks WHERE event_id = ?", [id]);
    await db.runAsync("DELETE FROM event_done WHERE event_id = ?", [id]);
    await db.runAsync("DELETE FROM events WHERE id = ?", [id]);
  });
}

/** Events (fixed or routine) marked done in `weekStart`. */
export async function loadDoneEvents(db: Db, weekStart: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ event_id: string }>("SELECT event_id FROM event_done WHERE week_start = ?", [
    weekStart,
  ]);
  return new Set(rows.map((r) => r.event_id));
}

/** Marks an event done (or not) in `weekStart` only. */
export async function setEventDone(db: Db, id: string, weekStart: string, done: boolean): Promise<void> {
  if (done) {
    await db.runAsync("INSERT OR IGNORE INTO event_done (event_id, week_start) VALUES (?, ?)", [id, weekStart]);
  } else {
    await db.runAsync("DELETE FROM event_done WHERE event_id = ? AND week_start = ?", [id, weekStart]);
  }
}

/**
 * A flexible item's new length, for all its sessions. Sessions the user
 * placed (kept or locked) from `fromWeek` on get the new length too; done
 * ones keep theirs, since they already happened.
 */
export async function setItemDuration(db: Db, itemId: string, minutes: number, fromWeek: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE flexible_items SET duration_min = ? WHERE id = ?", [minutes, itemId]);
    await db.runAsync(
      `UPDATE placements SET end_min = MIN(start_min + ?, 10080)
       WHERE item_id = ? AND state IN ('kept', 'locked') AND week_start >= ?`,
      [minutes, itemId, fromWeek],
    );
  });
}

/** "Just this week" for a repeating event: move it (times) or remove it (null) in `weekStart` only. */
export async function changeEventForWeek(
  db: Db,
  id: string,
  weekStart: string,
  times: { start: number; end: number } | null,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO event_exceptions (event_id, week_start, start_min, end_min) VALUES (?, ?, ?, ?)
     ON CONFLICT(event_id, week_start) DO UPDATE SET start_min = excluded.start_min, end_min = excluded.end_min`,
    [id, weekStart, times?.start ?? null, times?.end ?? null],
  );
}

/**
 * `weekStart`: the only week the item is in, or null for one that repeats
 * every week from `fromWeek` on (null = every week, tests and old data).
 */
export async function insertItem(
  db: Db,
  item: FlexibleItem,
  weekStart: string | null = null,
  fromWeek: string | null = null,
): Promise<void> {
  const cols: [string, string | number | null][] = [
    ["id", item.id],
    ["title", item.title],
    ["duration_min", item.durationMin],
    ["times_per_week", item.timesPerWeek],
    ["priority", item.priority],
    ["preferred_windows", item.preferredWindows ? JSON.stringify(item.preferredWindows) : null],
    ["goal_id", item.goalId ?? null],
    ["category_id", item.categoryId ?? null],
  ];
  // Only name the v17 columns when they're used, so older databases (in tests) still work.
  if (weekStart) cols.push(["week_start", weekStart]);
  else if (fromWeek) cols.push(["from_week", fromWeek]);
  await db.runAsync(
    `INSERT INTO flexible_items (${cols.map(([c]) => c).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map(([, v]) => v),
  );
}

/** "Stop after this week": a repeating item or event shows up to `lastWeek` and no longer. */
export async function stopAfterWeek(db: Db, what: "item" | "event", id: string, lastWeek: string): Promise<void> {
  const table = what === "item" ? "flexible_items" : "events";
  await db.runAsync(`UPDATE ${table} SET until_week = ? WHERE id = ? AND week_start IS NULL`, [lastWeek, id]);
}

/** A JSON value from the settings table (key/value), or null when it isn't there. */
export async function loadSetting<T>(db: Db, key: string): Promise<T | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function saveSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

/** All flexible items as they are set up (without any week's queued extras). */
export async function loadItems(db: Db): Promise<FlexibleItem[]> {
  const rows = await db.getAllAsync<ItemRow>("SELECT * FROM flexible_items ORDER BY rowid", []);
  return rows.map(itemFromRow);
}

/** What an accepted AI suggestion (or a later edit screen) may change on an item. */
export interface ItemPlanPatch {
  timesPerWeek?: number;
  priority?: number;
  /** null = any time of day. */
  preferredWindows?: Interval[] | null;
}

export async function updateItemPlan(db: Db, itemId: string, patch: ItemPlanPatch): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (patch.timesPerWeek !== undefined)
      await db.runAsync("UPDATE flexible_items SET times_per_week = ? WHERE id = ?", [patch.timesPerWeek, itemId]);
    if (patch.priority !== undefined)
      await db.runAsync("UPDATE flexible_items SET priority = ? WHERE id = ?", [patch.priority, itemId]);
    if (patch.preferredWindows !== undefined)
      await db.runAsync("UPDATE flexible_items SET preferred_windows = ? WHERE id = ?", [
        patch.preferredWindows ? JSON.stringify(patch.preferredWindows) : null,
        itemId,
      ]);
  });
}

/** The first week each item has any stored session in, so older weeks don't count it as missed. */
export async function firstWeekPerItem(db: Db): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ item_id: string; first: string }>(
    "SELECT item_id, MIN(week_start) AS first FROM placements GROUP BY item_id",
    [],
  );
  return new Map(rows.map((r) => [r.item_id, r.first]));
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

/** Skip this session and add one extra session of the same item to `targetWeek` (null = the Later list). */
export async function queuePlacement(
  db: Db,
  weekStart: string,
  p: Placement,
  targetWeek: string | null,
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

// ---- Routines (saved checklists) and ticked steps ----

export async function loadRoutines(db: Db): Promise<Routine[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; steps: string }>(
    "SELECT id, name, steps FROM routines ORDER BY position, rowid",
    [],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, steps: JSON.parse(r.steps) as RoutineStep[] }));
}

/** Saves a new routine at the end of the list. */
export async function insertRoutine(db: Db, r: Routine): Promise<void> {
  await db.runAsync(
    "INSERT INTO routines (id, name, steps, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM routines))",
    [r.id, r.name, JSON.stringify(r.steps)],
  );
}

/** Changes a routine's name and steps; every event that follows it shows the new checklist. */
export async function updateRoutine(db: Db, r: Routine): Promise<void> {
  await db.runAsync("UPDATE routines SET name = ?, steps = ? WHERE id = ?", [r.name, JSON.stringify(r.steps), r.id]);
}

/**
 * Deletes a saved routine. Anything on the calendar that followed it stays,
 * as a plain fixed event (same time, no checklist), and its ticks go.
 */
export async function deleteRoutine(db: Db, id: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM routine_checks WHERE event_id IN (SELECT id FROM events WHERE routine_id = ?)", [id]);
    await db.runAsync("UPDATE events SET kind = 'fixed', routine_id = NULL WHERE routine_id = ?", [id]);
    await db.runAsync("DELETE FROM routines WHERE id = ?", [id]);
  });
}

/** Ticked steps for every routine in `weekStart`. */
export async function loadChecks(db: Db, weekStart: string): Promise<{ eventId: string; stepId: string }[]> {
  const rows = await db.getAllAsync<{ event_id: string; step_id: string }>(
    "SELECT event_id, step_id FROM routine_checks WHERE week_start = ?",
    [weekStart],
  );
  return rows.map((r) => ({ eventId: r.event_id, stepId: r.step_id }));
}

/** Ticks (or unticks) one step of one routine event in `weekStart`. */
export async function setCheck(db: Db, eventId: string, weekStart: string, stepId: string, done: boolean): Promise<void> {
  if (done) {
    await db.runAsync("INSERT OR IGNORE INTO routine_checks (event_id, week_start, step_id) VALUES (?, ?, ?)", [
      eventId,
      weekStart,
      stepId,
    ]);
  } else {
    await db.runAsync("DELETE FROM routine_checks WHERE event_id = ? AND week_start = ? AND step_id = ?", [
      eventId,
      weekStart,
      stepId,
    ]);
  }
}
