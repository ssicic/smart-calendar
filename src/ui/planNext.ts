// Rules for planning the next week. Pure, no React.
import type { WeekItem } from "../db/weekItemsStore";
import { isFinished } from "./weekItems";

const sameItem = (a: WeekItem, b: WeekItem) =>
  a.kind === b.kind && a.title.trim().toLowerCase() === b.title.trim().toLowerCase();

/**
 * This week's unfinished to-dos and goals that next week doesn't have yet,
 * reset for a fresh start (unticked, progress 0, same goal target). The
 * caller gives them new ids.
 */
export function carryOverCandidates(thisWeek: WeekItem[], nextWeek: WeekItem[]): WeekItem[] {
  return thisWeek
    .filter((item) => !isFinished(item))
    .filter((item) => !nextWeek.some((n) => sameItem(n, item)))
    .map((item) => ({ ...item, done: false, progress: 0 }));
}
