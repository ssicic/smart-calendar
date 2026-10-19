// Data hook for the Month and Year views: plans every week they show and
// returns how full each date is. Weeks are planned the same way the week
// screen does it (loadWeek + planWeek), because events and flexible items
// repeat weekly while touched sessions and sleep changes are stored per week.
import { useEffect, useState } from "react";
import { planWeek } from "../engine";
import { loadWeek, type Db } from "../db/weekStore";
import { dayLoads, loadsByDate, type DayLoad } from "./dayLoad";
import { addWeeks } from "./weekDate";

export function usePlannedDays(db: Db, weekStarts: string[]): Map<string, DayLoad> | undefined {
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
        weeks.set(weekStart, dayLoads(week, planWeek(week)));
      }
      if (!cancelled) setByDate(loadsByDate(weeks));
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [db, key]);

  return byDate;
}
