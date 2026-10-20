// Reads for the "Past weeks" history.
import type { Db } from "./weekStore";

/** The earliest week (its Monday) with anything stored, or null when the app is still empty. */
export async function loadFirstWeek(db: Db): Promise<string | null> {
  const row = await db.getFirstAsync<{ first: string | null }>(
    `SELECT MIN(w) AS first FROM (
       SELECT MIN(week_start) AS w FROM placements
       UNION ALL SELECT MIN(week_start) FROM week_items
       UNION ALL SELECT MIN(week_start) FROM event_done
       UNION ALL SELECT MIN(week_start) FROM events
       UNION ALL SELECT MIN(from_week) FROM events
     )`,
    [],
  );
  return row?.first ?? null;
}
