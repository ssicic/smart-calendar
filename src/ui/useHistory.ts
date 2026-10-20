// Data hook for "Past weeks": loads a page of past weeks at a time and works
// out each one's review numbers, the same way the week screen does
// (loadWeek + planWeek, no new suggestions in the past, done events, review stats).
import { useCallback, useEffect, useState } from "react";
import { planWeek, sleepForDay } from "../engine";
import { loadFirstWeek } from "../db/historyStore";
import { loadMovedOn, type MovedOn } from "../db/reviewStore";
import { loadWeekItems, type WeekItem } from "../db/weekItemsStore";
import { loadDoneEvents, loadWeek, type Db } from "../db/weekStore";
import { historyWeeks } from "./history";
import { addWeeks, plannableFromKey } from "./weekDate";
import { reviewStats, type ReviewStats } from "./weekReview";
import { isDone, rowsByDay } from "./weekRows";
import type { Groups } from "./WeekView";

const PAGE = 8;

/** Everything one past week's card and review need. */
export interface WeekLog {
  weekStart: string;
  stats: ReviewStats;
  items: WeekItem[];
  movedOn: MovedOn[];
  routines: { done: number; total: number };
}

async function loadWeekLog(db: Db, weekStart: string, todayKey: string, groups: Groups): Promise<WeekLog> {
  const loaded = await loadWeek(db, weekStart, addWeeks(weekStart, 1));
  const week = { ...loaded.week, settings: { ...loaded.week.settings, earliestStart: plannableFromKey(weekStart, todayKey) } };
  const rows = rowsByDay(week, planWeek(week), await loadDoneEvents(db, weekStart)).flat();
  const sleep = Array.from({ length: 7 }, (_, d) => sleepForDay(loaded.sleep, loaded.overrides, d));
  const routines = rows.filter((r) => r.kind === "routine");
  return {
    weekStart,
    stats: reviewStats(rows, sleep, groups),
    items: await loadWeekItems(db, weekStart),
    movedOn: await loadMovedOn(db, weekStart),
    routines: { done: routines.filter(isDone).length, total: routines.length },
  };
}

/**
 * Past weeks before `thisWeek`, newest first, while `open`. `loadMore` adds
 * the next older page; `hasMore` says whether there is one.
 */
export function useHistory(db: Db, open: boolean, thisWeek: string, todayKey: string, groups: Groups) {
  const [weeks, setWeeks] = useState<WeekLog[]>([]);
  const [first, setFirst] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(
    async (from: string, firstWeek: string | null, keep: WeekLog[]) => {
      setLoading(true);
      const page = [];
      for (const w of historyWeeks(firstWeek, from, PAGE)) page.push(await loadWeekLog(db, w, todayKey, groups));
      setWeeks([...keep, ...page]);
      setLoading(false);
    },
    [db, todayKey, groups],
  );

  useEffect(() => {
    if (!open) return;
    (async () => {
      const firstWeek = await loadFirstWeek(db);
      setFirst(firstWeek);
      await loadPage(addWeeks(thisWeek, -1), firstWeek, []);
    })().catch((e) => {
      console.error(e);
      setLoading(false);
    });
  }, [open, db, thisWeek, loadPage]);

  const oldest = weeks.at(-1)?.weekStart;
  const hasMore = !!oldest && !!first && oldest > first;
  const loadMore = () => {
    if (oldest && hasMore) loadPage(addWeeks(oldest, -1), first, weeks).catch(console.error);
  };

  return { weeks, loading, hasMore, loadMore };
}
