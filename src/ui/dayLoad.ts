// How full each day is, for the Month and Year views. Pure, no React.
import { DAY, type PlanResult, type WeekInput } from "../engine";
import { dayKey } from "./weekDate";

/** Minutes planned on one day, split the way the Month view shows it. */
export interface DayLoad {
  /** Fixed events (work, classes). Rest blocks are time off, so they don't count. */
  fixed: number;
  /** Flexible sessions still to do (suggested, kept or locked). */
  flexible: number;
  /** Flexible sessions marked done. */
  done: number;
}

export const EMPTY_LOAD: DayLoad = { fixed: 0, flexible: 0, done: 0 };

export const totalMinutes = (l: DayLoad) => l.fixed + l.flexible + l.done;

/** Adds `[start, end)` to the days it covers (something may run past midnight). */
function addSpan(loads: DayLoad[], field: keyof DayLoad, start: number, end: number) {
  for (let d = Math.floor(start / DAY); d < 7 && d * DAY < end; d++) {
    const minutes = Math.min(end, (d + 1) * DAY) - Math.max(start, d * DAY);
    const load = loads[d];
    if (load && minutes > 0) load[field] += minutes;
  }
}

/** Planned minutes per day of the week (index 0 = Monday). Queued (skipped) sessions don't count. */
export function dayLoads(week: WeekInput, plan: PlanResult): DayLoad[] {
  const loads = Array.from({ length: 7 }, () => ({ ...EMPTY_LOAD }));
  for (const e of [...week.fixed, ...(week.routines ?? [])]) addSpan(loads, "fixed", e.start, e.end);
  for (const p of plan.placements) {
    if (p.state === "done") addSpan(loads, "done", p.start, p.end);
    else if (p.state !== "skipped") addSpan(loads, "flexible", p.start, p.end);
  }
  return loads;
}

/** Turns per-week loads (keyed by Monday) into per-date loads (keyed "YYYY-MM-DD"). */
export function loadsByDate(weeks: Map<string, DayLoad[]>): Map<string, DayLoad> {
  const byDate = new Map<string, DayLoad>();
  for (const [weekStart, loads] of weeks) {
    loads.forEach((load, d) => byDate.set(dayKey(weekStart, d), load));
  }
  return byDate;
}

/** 0 (nothing) to 4 (6h or more), for the heatmap shade. */
export function intensity(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes <= 120) return 1;
  if (minutes <= 240) return 2;
  if (minutes < 360) return 3;
  return 4;
}

/** "3.5h", or "" for an empty day. */
export function hoursLabel(minutes: number): string {
  if (minutes <= 0) return "";
  return `${Math.round(minutes / 6) / 10}h`;
}

/** The week's totals for the header: everything planned (fixed + flexible, done included) and what's done. */
export function weekTotals(week: WeekInput, plan: PlanResult): { plannedMin: number; doneMin: number } {
  const loads = dayLoads(week, plan);
  return {
    plannedMin: loads.reduce((sum, l) => sum + totalMinutes(l), 0),
    doneMin: loads.reduce((sum, l) => sum + l.done, 0),
  };
}
