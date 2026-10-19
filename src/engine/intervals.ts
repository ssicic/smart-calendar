import { DAY, type Interval, type PlannerSettings } from "./types";

export function length(i: Interval): number {
  return i.end - i.start;
}

export function dayOf(minute: number): number {
  return Math.floor(minute / DAY);
}

/** Sorts and merges overlapping or touching intervals. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ start: i.start, end: i.end });
  }
  return out;
}

/** Removes every busy interval from `from`. */
export function subtract(from: Interval, busy: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = from.start;
  for (const b of merge(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= from.end) break;
    if (b.start > cursor) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < from.end) out.push({ start: cursor, end: from.end });
  return out;
}

/** The scheduler's working window for day `d`. */
export function dayWindow(d: number, settings: PlannerSettings): Interval {
  return { start: d * DAY + settings.dayStart, end: d * DAY + settings.dayEnd };
}

/**
 * Free gaps on day `d` where something can be placed. Busy intervals are
 * padded by the buffer, so any placement inside a gap keeps its distance.
 */
export function freeSlotsForDay(
  d: number,
  busy: Interval[],
  settings: PlannerSettings,
): Interval[] {
  const padded = busy.map((b) => ({
    start: b.start - settings.bufferMin,
    end: b.end + settings.bufferMin,
  }));
  return subtract(dayWindow(d, settings), padded);
}

export function freeSlots(busy: Interval[], settings: PlannerSettings): Interval[] {
  const out: Interval[] = [];
  for (let d = 0; d < 7; d++) out.push(...freeSlotsForDay(d, busy, settings));
  return out;
}

/** Earliest start inside `slots` where `duration` fits within `within`, if any. */
export function earliestFit(
  slots: Interval[],
  duration: number,
  within?: Interval,
): number | undefined {
  for (const s of slots) {
    const start = within ? Math.max(s.start, within.start) : s.start;
    const end = within ? Math.min(s.end, within.end) : s.end;
    if (end - start >= duration) return start;
  }
  return undefined;
}
