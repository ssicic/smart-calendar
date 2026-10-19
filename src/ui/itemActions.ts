// What you can do when you tap something in the week, and the pure logic
// behind Move and "Suggest new slot". No React and no database here.
import {
  DAY,
  WEEK,
  movePlacement,
  suggestAnotherSlot,
  type Placement,
  type PlanResult,
  type WeekInput,
} from "../engine";
import type { RowKind } from "./weekRows";

export type ActionId =
  | "move"
  | "suggest"
  | "lock"
  | "unlock"
  | "done"
  | "undone"
  | "delete"
  | "queue"
  | "unqueue";

export interface Action {
  id: ActionId;
  label: string;
  destructive?: boolean;
}

/** The actions for one kind of row, in the order they're shown. */
export function actionsFor(kind: RowKind, title: string): Action[] {
  const remove: Action = { id: "delete", label: `Delete ${title}`, destructive: true };
  switch (kind) {
    case "fixed":
    case "rest":
      // The scheduler never moves these, so there is nothing to lock.
      return [{ id: "move", label: "Move" }, remove];
    case "suggested":
    case "locked":
      return [
        { id: "move", label: "Move" },
        { id: "suggest", label: "Suggest new slot" },
        kind === "suggested" ? { id: "lock", label: "Lock here" } : { id: "unlock", label: "Unlock" },
        { id: "done", label: "Done" },
        { ...remove, label: `Delete ${title} (every week)` },
        { id: "queue", label: "Move to queue (next week)" },
      ];
    case "done":
      return [{ id: "undone", label: "Not done yet" }, { ...remove, label: `Delete ${title} (every week)` }];
    case "skipped":
      return [{ id: "unqueue", label: "Bring back to this week" }];
  }
}

/**
 * The scheduler names suggestions "<itemId>@<start>". Once a session is stored
 * it gets its own id, so a later suggestion at the same time can't collide.
 */
export function storedId(p: Placement, newId: () => string): string {
  return p.id.includes("@") ? newId() : p.id;
}

export type SlotResult = { ok: true; placement: Placement } | { ok: false; error: string };

/** Week-minute from a day (0 = Monday) and minutes since midnight. */
export const weekMinute = (day: number, minuteOfDay: number) => day * DAY + minuteOfDay;

/**
 * Move a flexible session to `newStart`. Only stored sessions and fixed/rest
 * time count as taken: other suggestions get re-planned around it.
 */
export function moveSession(
  week: WeekInput,
  plan: PlanResult,
  placementId: string,
  newStart: number,
  newId: () => string,
): SlotResult {
  const placements = plan.placements.filter((p) => p.state !== "suggested" || p.id === placementId);
  const r = movePlacement({ ...week, placements }, placementId, newStart);
  if (!r.ok) {
    const { dayStart, dayEnd } = week.settings;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return { ok: false, error: `That time is taken or outside ${hhmm(dayStart)}–${hhmm(dayEnd)}.` };
  }
  const moved = r.placements.find((p) => p.id === placementId)!;
  return { ok: true, placement: { ...moved, id: storedId(moved, newId) } };
}

/** The next free slot after this session, kept there (locked) so it sticks. */
export function nextSlot(week: WeekInput, plan: PlanResult, placementId: string, newId: () => string): SlotResult {
  const r = suggestAnotherSlot({ ...week, placements: plan.placements }, placementId);
  if (!r.ok) return { ok: false, error: "There's no other free slot this week." };
  const moved = r.placements.find((p) => p.id === placementId)!;
  return { ok: true, placement: { ...moved, id: storedId(moved, newId), state: "locked" } };
}

/** New start/end for a fixed event or rest block, keeping its length. */
export function moveEventTo(
  event: { start: number; end: number },
  newStart: number,
): { ok: true; start: number; end: number } | { ok: false; error: string } {
  const end = newStart + (event.end - event.start);
  if (end > WEEK) return { ok: false, error: "It would run past Sunday midnight." };
  return { ok: true, start: newStart, end };
}
