// Sleep: a usual bedtime and wake-up (one pair for weekdays, one for the
// weekend), plus one-off changes for single days of a specific week.
// Turned into the planner's per-day windows, so nothing gets suggested while
// you sleep or in the wind-down before bed.
import { DAY, type Interval } from "./types";

export interface SleepTimes {
  /** Minutes since midnight, e.g. 420 = 07:00. */
  wake: number;
  /** Minutes since midnight; may pass 1440 for after midnight (1470 = 00:30). */
  bed: number;
}

export interface SleepSettings {
  weekday: SleepTimes;
  weekend: SleepTimes;
  /** Kept free right before bed. */
  windDownMin: number;
}

/** A one-off change for one day of one week. Missing fields follow the usual. */
export interface DayOverride {
  day: number;
  wake?: number;
  bed?: number;
}

export const DEFAULT_SLEEP: SleepSettings = {
  weekday: { wake: 7 * 60, bed: 23 * 60 },
  weekend: { wake: 7 * 60, bed: 23 * 60 },
  windDownMin: 30,
};

export const isWeekend = (day: number) => day >= 5;

export interface DaySleep extends SleepTimes {
  wakeChanged: boolean;
  bedChanged: boolean;
}

/** The sleep times that apply to `day` (0 = Monday) this week. */
export function sleepForDay(settings: SleepSettings, overrides: DayOverride[], day: number): DaySleep {
  const usual = isWeekend(day) ? settings.weekend : settings.weekday;
  const o = overrides.find((x) => x.day === day);
  return {
    wake: o?.wake ?? usual.wake,
    bed: o?.bed ?? usual.bed,
    wakeChanged: o?.wake !== undefined,
    bedChanged: o?.bed !== undefined,
  };
}

/** Planner windows: wake-up until bedtime minus the wind-down, capped at midnight. */
export function planningWindows(settings: SleepSettings, overrides: DayOverride[]): Interval[] {
  return Array.from({ length: 7 }, (_, d) => {
    const s = sleepForDay(settings, overrides, d);
    return { start: s.wake, end: Math.min(s.bed - settings.windDownMin, DAY) };
  });
}

/**
 * A bedtime picked on a 00–23 clock: early-morning times mean after
 * midnight, so 00:30 becomes 1470 rather than half past midnight that morning.
 */
export function bedtimeFromClock(minuteOfDay: number): number {
  return minuteOfDay < 12 * 60 ? minuteOfDay + DAY : minuteOfDay;
}
