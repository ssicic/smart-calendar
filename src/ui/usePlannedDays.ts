// Data hook for the Month and Year views: plans every week they show and
// returns how full each date is. Weeks are planned the same way the week
// screen does it (loadWeek + planWeek), because events and flexible items
// repeat weekly while touched sessions and sleep changes are stored per week.
import { useEffect, useState } from "react";
import { planWeek } from "../engine";
import { loadDoneEvents, loadWeek, type Db } from "../db/weekStore";
import { dayLoads, loadsByDate, type DayLoad } from "./dayLoad";
import { addWeeks, plannableFromKey } from "./weekDate";

/** `todayKey` ("YYYY-MM-DD"): past days get no new suggestions, like on the week screen. */
export function usePlannedDays(db: Db, weekStarts: string[], todayKey: string): Map<string, DayLoad> | undefined {
  const [byDate, setByDate] = useState<Map<string, DayLoad>>();
  // An array is a new object on every render, so the effect depends on this
  // string instead; it only changes when the weeks themselves change.
  const key = weekStarts.join(",");

  useEffect(() => {
    let cancelled = false; // set by the cleanup if the month changes mid-load
    (async () => {
      const weeks = new Map<string, DayLoad[]>();
      for (const weekStart of key.split(",")) {
        const { week } = await loadWeek(db, weekStart, addWeeks(weekStart, 1));
        const planned = { ...week, settings: { ...week.settings, earliestStart: plannableFromKey(weekStart, todayKey) } };
        weeks.set(weekStart, dayLoads(planned, planWeek(planned), await loadDoneEvents(db, weekStart)));
      }
      if (!cancelled) setByDate(loadsByDate(weeks));
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [db, key, todayKey]);

  return byDate;
}
