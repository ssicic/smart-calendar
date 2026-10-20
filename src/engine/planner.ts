import { dayOf, earliestFit, freeSlots, freeSlotsForDay, length } from "./intervals";
import {
  DAY,
  type CapacityReport,
  type FlexibleItem,
  type Interval,
  type Placement,
  type PlanResult,
  type Unplaced,
  type WeekInput,
} from "./types";

/** Placements the scheduler must keep exactly where they are. */
export function keptPlacements(placements: Placement[]): Placement[] {
  return placements.filter((p) => p.state === "kept" || p.state === "locked" || p.state === "done");
}

/** Placements that already satisfy an occurrence (skipped means "not this week"). */
function fulfilled(placements: Placement[], itemId: string): number {
  return placements.filter((p) => p.itemId === itemId && p.state !== "suggested").length;
}

export function busyIntervals(input: WeekInput, extra: Interval[] = []): Interval[] {
  // Time that's already over counts as taken, so nothing new lands there.
  const over = input.settings.earliestStart ? [{ start: 0, end: input.settings.earliestStart }] : [];
  return [...over, ...input.fixed, ...input.rest, ...(input.routines ?? []), ...keptPlacements(input.placements), ...extra];
}

export function missingOccurrences(input: WeekInput, item: FlexibleItem): number {
  return Math.max(0, item.timesPerWeek - fulfilled(input.placements, item.id));
}

export function capacity(input: WeekInput): CapacityReport {
  const freeMinutes = freeSlots(busyIntervals(input), input.settings).reduce(
    (sum, s) => sum + length(s),
    0,
  );
  const requiredMinutes = input.items.reduce(
    (sum, item) => sum + missingOccurrences(input, item) * item.durationMin,
    0,
  );
  const budgetMinutes = Math.max(0, freeMinutes - input.settings.minFreeMinutes);
  const overflowMinutes = Math.max(0, requiredMinutes - budgetMinutes);
  return { freeMinutes, requiredMinutes, budgetMinutes, overflowMinutes, fits: overflowMinutes === 0 };
}

/** Priority first, then longer items (harder to fit), then id for stability. */
export function byScheduleOrder(a: FlexibleItem, b: FlexibleItem): number {
  return b.priority - a.priority || b.durationMin - a.durationMin || a.id.localeCompare(b.id);
}

/**
 * Day order for the next occurrence of `item`: days that don't have it yet
 * come first, then the days with the least flexible load, then earliest.
 * This spreads "3x/week" across the week instead of stacking Monday.
 */
function candidateDays(item: FlexibleItem, placed: Placement[]): number[] {
  const loadByDay = new Array<number>(7).fill(0);
  const hasItem = new Array<boolean>(7).fill(false);
  for (const p of placed) {
    const d = dayOf(p.start);
    loadByDay[d] = (loadByDay[d] ?? 0) + length(p);
    if (p.itemId === item.id) hasItem[d] = true;
  }
  return [0, 1, 2, 3, 4, 5, 6].sort(
    (a, b) =>
      Number(hasItem[a]) - Number(hasItem[b]) ||
      (loadByDay[a] ?? 0) - (loadByDay[b] ?? 0) ||
      a - b,
  );
}

/** Earliest start for `item` on day `d`, preferring its preferred windows. */
export function findStartOnDay(
  item: FlexibleItem,
  d: number,
  busy: Interval[],
  input: WeekInput,
): number | undefined {
  const slots = freeSlotsForDay(d, busy, input.settings);
  for (const w of item.preferredWindows ?? []) {
    const start = earliestFit(slots, item.durationMin, { start: d * DAY + w.start, end: d * DAY + w.end });
    if (start !== undefined) return start;
  }
  return earliestFit(slots, item.durationMin);
}

/**
 * Greedy weekly plan. Locked, done and skipped placements are kept as-is;
 * suggested ones are discarded and re-placed. Items are placed in priority
 * order until the capacity budget runs out.
 */
export function planWeek(input: WeekInput): PlanResult {
  const report = capacity(input);
  const kept = input.placements.filter((p) => p.state !== "suggested");
  const placed: Placement[] = [];
  const unplaced: Unplaced[] = [];
  let used = 0;

  for (const item of [...input.items].sort(byScheduleOrder)) {
    const missing = missingOccurrences(input, item);
    for (let k = 0; k < missing; k++) {
      if (used + item.durationMin > report.budgetMinutes) {
        unplaced.push({ itemId: item.id, missing: missing - k, reason: "over-capacity" });
        break;
      }
      const busy = busyIntervals(input, placed);
      const flexible = [...keptPlacements(kept), ...placed];
      let start: number | undefined;
      for (const d of candidateDays(item, flexible)) {
        start = findStartOnDay(item, d, busy, input);
        if (start !== undefined) break;
      }
      if (start === undefined) {
        unplaced.push({ itemId: item.id, missing: missing - k, reason: "no-slot" });
        break;
      }
      placed.push({
        id: `${item.id}@${start}`,
        itemId: item.id,
        start,
        end: start + item.durationMin,
        state: "suggested",
      });
      used += item.durationMin;
    }
  }

  const placements = [...kept, ...placed].sort((a, b) => a.start - b.start);
  return { placements, unplaced, capacity: report };
}
