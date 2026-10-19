// Saves and loads the week in a local SQLite database on the device.
// The engine never sees SQL: this module translates between table rows and
// engine objects (FixedEvent, RestBlock, FlexibleItem).
import type { FixedEvent, FlexibleItem, Interval, PlannerSettings, RestBlock, WeekInput } from "../engine";

/**
 * The few database methods we use. expo-sqlite's SQLiteDatabase has these, and
 * the tests pass in a small adapter over Node's built-in SQLite instead.
 */
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: (string | number | null)[]): Promise<T | null>;
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
  // Version 1
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
];

export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
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
}

export interface ItemRow {
  id: string;
  title: string;
  duration_min: number;
  times_per_week: number;
  priority: number;
  preferred_windows: string | null;
  goal_id: string | null;
}

// ---- Pure converters between rows and engine objects ----

export function eventFromRow(r: EventRow): FixedEvent | RestBlock {
  return { id: r.id, title: r.title, start: r.start_min, end: r.end_min };
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
  };
}

// ---- Reads and writes ----

export async function loadWeek(db: Db): Promise<WeekInput> {
  const events = await db.getAllAsync<EventRow>("SELECT * FROM events ORDER BY start_min", []);
  const items = await db.getAllAsync<ItemRow>("SELECT * FROM flexible_items ORDER BY rowid", []);
  return {
    fixed: events.filter((e) => e.kind === "fixed").map(eventFromRow),
    rest: events.filter((e) => e.kind === "rest").map(eventFromRow),
    items: items.map(itemFromRow),
    placements: [], // not saved yet: the plan is recomputed from the items
    settings: DEFAULT_SETTINGS,
  };
}

export async function insertEvents(db: Db, kind: "fixed" | "rest", events: (FixedEvent | RestBlock)[]): Promise<void> {
  // `?` placeholders: the driver inserts values safely, so a title like
  // "Bob's class" can't break the SQL (or inject any).
  for (const e of events) {
    await db.runAsync("INSERT INTO events (id, kind, title, start_min, end_min) VALUES (?, ?, ?, ?, ?)", [
      e.id,
      kind,
      e.title,
      e.start,
      e.end,
    ]);
  }
}

export async function insertItem(db: Db, item: FlexibleItem): Promise<void> {
  await db.runAsync(
    `INSERT INTO flexible_items (id, title, duration_min, times_per_week, priority, preferred_windows, goal_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.title,
      item.durationMin,
      item.timesPerWeek,
      item.priority,
      item.preferredWindows ? JSON.stringify(item.preferredWindows) : null,
      item.goalId ?? null,
    ],
  );
}
