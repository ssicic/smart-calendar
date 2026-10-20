// Numbers for the week review: hours, sessions done, time per group and how
// much awake time stayed free. Pure, no React.
import type { DaySleep } from "../engine";
import type { Category } from "../db/weekStore";
import type { WeekRow } from "./weekRows";

/** One bar in "Time by group": a group (or no group, or Free) and its share of awake time. */
export interface GroupShare {
  /** The group's id; null = things without a group. */
  id: string | null;
  name: string;
  color: string;
  minutes: number;
  /** Share of awake time, 0-100, rounded. */
  percent: number;
}

export interface ReviewStats {
  /** Time between wake-up and bedtime over the week. */
  awakeMin: number;
  /** Everything on the calendar (fixed, routines, flexible incl. done; not queued). */
  plannedMin: number;
  /** Awake time with nothing planned. */
  freeMin: number;
  freePercent: number;
  /** Flexible sessions: how many and how long, and how many of them are done. */
  sessions: { done: number; total: number; doneMin: number; totalMin: number };
  /** Biggest group first; "No group" last. */
  groups: GroupShare[];
}

const NO_GROUP_COLOR = "#9CA3AF";
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function reviewStats(rows: WeekRow[], sleep: DaySleep[], groups: Map<string, Category>): ReviewStats {
  const onCalendar = rows.filter((r) => r.kind !== "skipped");
  const length = (r: WeekRow) => r.end - r.start;
  const awakeMin = sleep.reduce((sum, s) => sum + Math.max(0, s.bed - s.wake), 0);
  const plannedMin = onCalendar.reduce((sum, r) => sum + length(r), 0);
  const freeMin = Math.max(0, awakeMin - plannedMin);

  const flexible = onCalendar.filter((r) => r.kind !== "fixed" && r.kind !== "routine");
  const done = flexible.filter((r) => r.kind === "done");

  const byGroup = new Map<string | null, number>();
  for (const r of onCalendar) {
    const id = r.categoryId && groups.has(r.categoryId) ? r.categoryId : null;
    byGroup.set(id, (byGroup.get(id) ?? 0) + length(r));
  }
  const shares: GroupShare[] = [...byGroup].map(([id, minutes]) => {
    const g = id ? groups.get(id) : undefined;
    return { id, name: g?.name ?? "No group", color: g?.color ?? NO_GROUP_COLOR, minutes, percent: pct(minutes, awakeMin) };
  });
  shares.sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.minutes - a.minutes));

  return {
    awakeMin,
    plannedMin,
    freeMin,
    freePercent: pct(freeMin, awakeMin),
    sessions: {
      done: done.length,
      total: flexible.length,
      doneMin: done.reduce((sum, r) => sum + length(r), 0),
      totalMin: flexible.reduce((sum, r) => sum + length(r), 0),
    },
    groups: shares,
  };
}

/** A gentle line for the top of the review: no guilt for a quiet week. */
export function reviewHeadline(stats: ReviewStats, finishedItems: number): string {
  if (stats.sessions.done === 0 && finishedItems === 0) return "A quiet week counts too. Next week is a fresh start.";
  if (stats.sessions.total > 0 && stats.sessions.done === stats.sessions.total) return "Everything you planned got done. 🎉";
  return "Here's what you got done this week.";
}
