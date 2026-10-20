/**
 * Time model: every timestamp is minutes since Monday 00:00 of the week being
 * planned. A week spans [0, WEEK). Day d covers [d * DAY, (d + 1) * DAY).
 */
export const DAY = 24 * 60;
export const WEEK = 7 * DAY;

/** Half-open interval [start, end) in week-minutes. */
export interface Interval {
  start: number;
  end: number;
}

/** Non-negotiable: work, classes, appointments. Never moved. */
export interface FixedEvent extends Interval {
  id: string;
  title: string;
  /** Optional activity group (Work, Health…), only used for colour. The scheduler ignores it. */
  categoryId?: string;
  /** Set for a routine (Morning routine…): which saved checklist it follows. */
  routineId?: string;
}

/** Protected time off. Treated like a fixed event by the scheduler. */
export interface RestBlock extends Interval {
  id: string;
  title: string;
  categoryId?: string;
}

/** Something with a duration and frequency that the app places for you. */
export interface FlexibleItem {
  id: string;
  title: string;
  durationMin: number;
  timesPerWeek: number;
  /** Higher is scheduled first. */
  priority: number;
  /** Optional daily windows in minutes-of-day, e.g. { start: 18*60, end: 21*60 }. */
  preferredWindows?: Interval[];
  goalId?: string;
  categoryId?: string;
}

export type GoalHorizon = "year" | "quarter" | "month" | "week";

export interface Goal {
  id: string;
  title: string;
  horizon: GoalHorizon;
  parentId?: string;
}

/**
 * suggested: placed by the scheduler, may be moved on replan.
 * kept:      the user put it here (moved it, or undid done/lock/queue); it stays at this time.
 * locked:    the user tapped "Lock here"; the scheduler never moves it. Only ever set on purpose.
 * done / skipped: logged outcome; occupies (done) or frees (skipped) time.
 */
export type PlacementState = "suggested" | "kept" | "locked" | "done" | "skipped";

export interface Placement extends Interval {
  id: string;
  itemId: string;
  state: PlacementState;
}

export interface PlannerSettings {
  /** Earliest minute-of-day the scheduler may place things. */
  dayStart: number;
  /** Latest minute-of-day a placement may end. */
  dayEnd: number;
  /**
   * Optional per-day override of [dayStart, dayEnd), index 0 = Monday, in
   * minutes-of-day. Set from the user's sleep (wake-up to bedtime minus a
   * wind-down), so the planner never suggests anything while they sleep.
   */
  dayWindows?: Interval[];
  /** Gap kept between a placement and anything adjacent. */
  bufferMin: number;
  /**
   * Week-minute before which nothing new is suggested (time that's already
   * over). 0 or unset = the whole week; WEEK = none of it (a past week).
   */
  earliestStart?: number;
  /** Free minutes per week the scheduler must leave unfilled. */
  minFreeMinutes: number;
}

export interface WeekInput {
  fixed: FixedEvent[];
  rest: RestBlock[];
  /** Routines at a set time (with a checklist). Busy time, like fixed events. */
  routines?: FixedEvent[];
  items: FlexibleItem[];
  placements: Placement[];
  settings: PlannerSettings;
}

export interface CapacityReport {
  /** Placeable minutes after fixed, rest and kept placements. */
  freeMinutes: number;
  /** Minutes still needed by items that are not yet placed. */
  requiredMinutes: number;
  /** freeMinutes minus the protected minimum. */
  budgetMinutes: number;
  /** How far required exceeds budget (0 when it fits). */
  overflowMinutes: number;
  fits: boolean;
}

export interface Unplaced {
  itemId: string;
  missing: number;
  reason: "no-slot" | "over-capacity";
}

export interface PlanResult {
  placements: Placement[];
  unplaced: Unplaced[];
  capacity: CapacityReport;
}
