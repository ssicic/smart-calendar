// Backup: the whole database as one JSON file, and back again.
// Used to move your calendar from Expo Go into the installed app (they are
// separate apps with separate storage), or to keep a copy somewhere safe.
import type { Db } from "./weekStore";

type Row = Record<string, string | number | null>;

export interface Backup {
  app: "smart-calendar";
  /** The database version (PRAGMA user_version) it was made with. */
  version: number;
  exportedAt: string;
  tables: Record<string, Row[]>;
}

async function dbVersion(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  return row?.user_version ?? 0;
}

/** The app's own tables (not SQLite's internal ones). */
async function tableNames(db: Db): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    [],
  );
  return rows.map((r) => r.name);
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function exportBackup(db: Db, now: Date): Promise<Backup> {
  const tables: Record<string, Row[]> = {};
  for (const t of await tableNames(db)) tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${quote(t)}`, []);
  return { app: "smart-calendar", version: await dbVersion(db), exportedAt: now.toISOString(), tables };
}

/** Checks a file's contents before anything is replaced. */
export async function checkBackup(
  db: Db,
  text: string,
): Promise<{ ok: true; backup: Backup; rows: number } | { ok: false; error: string }> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a Smart Calendar backup." };
  }
  const b = data as Partial<Backup>;
  if (b?.app !== "smart-calendar" || typeof b.version !== "number" || typeof b.tables !== "object" || !b.tables)
    return { ok: false, error: "That file isn't a Smart Calendar backup." };
  const current = await dbVersion(db);
  if (b.version !== current)
    return {
      ok: false,
      error:
        b.version > current
          ? "This backup comes from a newer version of the app. Update this app first."
          : "This backup comes from an older version of the app. Export it again from the updated app.",
    };
  const rows = Object.values(b.tables).reduce((sum, t) => sum + (Array.isArray(t) ? t.length : 0), 0);
  return { ok: true, backup: b as Backup, rows };
}

/**
 * Replaces everything in the database with the backup, in one transaction:
 * if anything fails, nothing changes. Only tables and columns this version
 * of the app has are used.
 */
export async function importBackup(db: Db, backup: Backup): Promise<void> {
  const tables = await tableNames(db);
  await db.withTransactionAsync(async () => {
    for (const t of tables) {
      await db.runAsync(`DELETE FROM ${quote(t)}`, []);
      const rows = backup.tables[t];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const known = new Set(
        (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${quote(t)})`, [])).map((c) => c.name),
      );
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => known.has(c));
        if (cols.length === 0) continue;
        await db.runAsync(
          `INSERT INTO ${quote(t)} (${cols.map(quote).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          cols.map((c) => row[c] ?? null),
        );
      }
    }
  });
}

/** "smart-calendar-backup-2026-10-22.json" */
export const backupFileName = (now: Date) =>
  `smart-calendar-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`;
