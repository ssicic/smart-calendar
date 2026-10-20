// Rules for year and month goals: what's part of what, progress, and a gentle
// note when there are a lot of them. Pure, no React.
import { checkNewItem, type FlexibleItem, type WeekInput } from "../engine";
import type { Goal, GoalHorizon } from "../db/goalsStore";
import type { WeekItem } from "../db/weekItemsStore";
import { isFinished } from "./weekItems";

/** Month goals and week goals that are part of `goal`. */
export function partsOf(goal: Goal, goals: Goal[], weekGoals: WeekItem[]): { goals: Goal[]; weekGoals: WeekItem[] } {
  return {
    goals: goals.filter((g) => g.parentId === goal.id),
    weekGoals: weekGoals.filter((w) => w.kind === "goal" && w.goalId === goal.id),
  };
}

/** How many of a goal's parts are finished, of how many (0/0 when it has none). */
export function goalProgress(goal: Goal, goals: Goal[], weekGoals: WeekItem[]): { done: number; total: number } {
  const parts = partsOf(goal, goals, weekGoals);
  return {
    done: parts.goals.filter((g) => g.done).length + parts.weekGoals.filter(isFinished).length,
    total: parts.goals.length + parts.weekGoals.length,
  };
}

/** More open goals than this, and the app suggests picking the ones that matter most. */
export const GOAL_LIMIT: Record<GoalHorizon, number> = { year: 5, month: 3 };

/** A gentle note when there are many open goals at one level; never a block. */
export function tooManyGoalsNote(goals: Goal[], horizon: GoalHorizon): string | undefined {
  const open = goals.filter((g) => g.horizon === horizon && !g.done).length;
  if (open <= GOAL_LIMIT[horizon]) return undefined;
  return horizon === "month"
    ? `That's ${open} goals this month. Most people keep 1–3. Pick the ones that matter most?`
    : `That's ${open} goals this year. A few big ones are easier to keep in mind.`;
}

/** Whether a goal's weekly time fits this week, and what would fit if not. */
export interface TimeCheck {
  fits: boolean;
  /** How far over the week's budget it would go, in minutes (0 when it fits). */
  overflowMin: number;
  /** The most times a week that still fit (0 if not even once). */
  fitsTimes: number;
  /** Lower-priority things that could make room. */
  swapTitles: string[];
}

/**
 * The capacity guard for "Make time for it": the same check as adding a
 * flexible item, plus the largest number of sessions a week that would fit.
 */
export function timeCheck(week: WeekInput, item: FlexibleItem): TimeCheck {
  const check = checkNewItem(week, item);
  let fitsTimes = 0;
  for (let t = item.timesPerWeek; t >= 1; t--) {
    if (checkNewItem(week, { ...item, timesPerWeek: t }).fits) {
      fitsTimes = t;
      break;
    }
  }
  return {
    fits: check.fits,
    overflowMin: check.overflowMinutes,
    fitsTimes,
    swapTitles: check.swapCandidates.slice(0, 3).map((i) => i.title),
  };
}
