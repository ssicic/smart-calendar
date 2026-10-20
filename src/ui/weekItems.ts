// Rules for the week's to-do list and goals. Pure, no React.
import type { WeekItem } from "../db/weekItemsStore";

/** Why this text can't be a to-do or goal, or undefined if it's fine. */
export function weekItemProblem(title: string): string | undefined {
  const clean = title.trim();
  if (!clean) return "Type something first.";
  if (clean.length > 80) return "Keep it under 80 characters.";
  return undefined;
}

/** A to-do is finished when ticked; a goal when its progress reaches the target. */
export const isFinished = (item: WeekItem) => (item.kind === "todo" ? item.done : item.progress >= item.target);

/** How many of the week's to-dos and goals are finished, for the header button. */
export function weekSummary(items: WeekItem[]): { done: number; total: number } {
  return { done: items.filter(isFinished).length, total: items.length };
}

/** A goal's progress one step up or down, kept between 0 and its target. */
export function stepProgress(item: WeekItem, by: number): number {
  return Math.min(item.target, Math.max(0, item.progress + by));
}
