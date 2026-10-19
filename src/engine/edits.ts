import { earliestFit, freeSlots } from "./intervals";
import { busyIntervals, byScheduleOrder, capacity, missingOccurrences } from "./planner";
import { WEEK, type FlexibleItem, type Placement, type PlacementState, type WeekInput } from "./types";

function withState(placements: Placement[], id: string, state: PlacementState): Placement[] {
  return placements.map((p) => (p.id === id ? { ...p, state } : p));
}

/** "Lock here": the scheduler will never move it again. */
export function lockPlacement(placements: Placement[], id: string): Placement[] {
  return withState(placements, id, "locked");
}

/** "Not this week": frees the time and counts the occurrence as handled. */
export function skipPlacement(placements: Placement[], id: string): Placement[] {
  return withState(placements, id, "skipped");
}

export function markDone(placements: Placement[], id: string): Placement[] {
  return withState(placements, id, "done");
}

/** Everything that blocks `id` from moving: all busy time except itself. */
function busyExcept(input: WeekInput, id: string) {
  const others = input.placements.filter((p) => p.id !== id && p.state !== "skipped");
  return busyIntervals({ ...input, placements: [] }, others);
}

export type MoveResult = { ok: true; placements: Placement[] } | { ok: false; reason: "not-found" | "conflict" };

/** Drag to a new start. A moved placement becomes locked. */
export function movePlacement(input: WeekInput, id: string, newStart: number): MoveResult {
  const p = input.placements.find((x) => x.id === id);
  if (!p) return { ok: false, reason: "not-found" };
  const duration = p.end - p.start;
  const slots = freeSlots(busyExcept(input, id), input.settings);
  const fits = slots.some((s) => s.start <= newStart && newStart + duration <= s.end);
  if (!fits) return { ok: false, reason: "conflict" };
  const placements = input.placements.map((x) =>
    x.id === id ? { ...x, start: newStart, end: newStart + duration, state: "locked" as const } : x,
  );
  return { ok: true, placements };
}

/**
 * "Suggest another slot": the next free slot after the current one, wrapping
 * around the week. Stays suggested so the user can keep cycling.
 */
export function suggestAnotherSlot(input: WeekInput, id: string): MoveResult {
  const p = input.placements.find((x) => x.id === id);
  if (!p) return { ok: false, reason: "not-found" };
  const duration = p.end - p.start;
  const slots = freeSlots(busyExcept(input, id), input.settings);
  const after = earliestFit(slots, duration, { start: p.end, end: WEEK });
  const start = after ?? earliestFit(slots, duration, { start: 0, end: p.start });
  if (start === undefined) return { ok: false, reason: "conflict" };
  const placements = input.placements.map((x) =>
    x.id === id ? { ...x, start, end: start + duration, state: "suggested" as const } : x,
  );
  return { ok: true, placements };
}

export interface NewItemCheck {
  fits: boolean;
  overflowMinutes: number;
  /** Lowest priority first: what the user could drop or push to next week. */
  swapCandidates: FlexibleItem[];
}

/** Capacity guard: run before adding an item, so the week never silently overbooks. */
export function checkNewItem(input: WeekInput, item: FlexibleItem): NewItemCheck {
  const report = capacity({ ...input, items: [...input.items, item] });
  if (report.fits) return { fits: true, overflowMinutes: 0, swapCandidates: [] };
  const swapCandidates = input.items
    .filter((i) => i.priority <= item.priority && missingOccurrences(input, i) > 0)
    .sort((a, b) => -byScheduleOrder(a, b));
  return { fits: false, overflowMinutes: report.overflowMinutes, swapCandidates };
}
