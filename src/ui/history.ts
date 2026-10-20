// The "Past weeks" history: which weeks to show and what each card says. Pure.
import type { WeekItem } from "../db/weekItemsStore";
import { addWeeks } from "./weekDate";
import { isFinished } from "./weekItems";
import type { ReviewStats } from "./weekReview";

/** What one week's card shows. */
export interface HistoryCard {
  doneMin: number;
  plannedMin: number;
  /** To-dos and goals finished, of how many. */
  finished: number;
  total: number;
  /** The group with the most time, if any. */
  topGroup?: string;
  /** Nothing planned and nothing to-do: shown as "Quiet week". */
  quiet: boolean;
}

export function historyCard(stats: ReviewStats, items: WeekItem[]): HistoryCard {
  const top = stats.groups.find((g) => g.id !== null);
  return {
    doneMin: stats.doneMin,
    plannedMin: stats.plannedMin,
    finished: items.filter(isFinished).length,
    total: items.length,
    ...(top ? { topGroup: top.name } : {}),
    quiet: stats.plannedMin === 0 && items.length === 0,
  };
}

/**
 * Up to `count` weeks, newest first, going back from `newest` but not before
 * `first` (the earliest week with data). Empty when `first` is null or later.
 */
export function historyWeeks(first: string | null, newest: string, count: number): string[] {
  const weeks: string[] = [];
  if (!first) return weeks;
  for (let w = newest; w >= first && weeks.length < count; w = addWeeks(w, -1)) weeks.push(w);
  return weeks;
}

/** Average hours done over the most recent `n` weeks (newest first), as minutes. 0 with no weeks. */
export function recentAverage(doneMins: number[], n = 4): number {
  const recent = doneMins.slice(0, n);
  return recent.length === 0 ? 0 : Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}
