// What you can do when you tap something in the week, and the pure logic
// behind Move and "Suggest new slot". No React and no database here.
import {
  DAY,
  WEEK,
  dayOf,
  dayWindow,
  keptState,
  movePlacement,
  suggestAnotherSlot,
  type Placement,
  type PlanResult,
  type WeekInput,
} from "../engine";
import { overlapping, summarize } from "./overlaps";
import { isEventKind, type RowKind, type WeekRow } from "./weekRows";

export type ActionId =
  | "move"
  | "steps"
  | "rename"
  | "suggest"
  | "lock"
  | "unlock"
  | "done"
  | "undone"
  | "delete"
  | "queue" // to next week
  | "later" // to the Later list (no week yet)
  | "unqueue";

/** For a repeating event: change "Just this week" or "Every week". */
export type EventScope = "week" | "every";

export interface Action {
  id: ActionId;
  label: string;
  destructive?: boolean;
}

/** The actions for one kind of row, in the order they're shown. */
export function actionsFor(kind: RowKind, title: string): Action[] {
  const remove: Action = { id: "delete", label: `Delete ${title}`, destructive: true };
  const rename: Action = { id: "rename", label: "Rename" };
  switch (kind) {
    case "fixed":
      // The scheduler never moves these, so there is nothing to lock.
      return [{ id: "move", label: "Move" }, rename, remove];
    case "routine":
      return [{ id: "move", label: "Move" }, { id: "steps", label: "Edit steps" }, rename, remove];
    case "suggested":
    case "kept":
      return [
        { id: "move", label: "Move" },
        { id: "suggest", label: "Suggest new slot" },
        { id: "lock", label: "Lock here" },
        { id: "done", label: "Done" },
        rename,
        { ...remove, label: `Delete ${title} (every week)` },
        { id: "queue", label: "Move to queue…" },
      ];
    case "locked":
      // Locked means "don't move it": no Move or Suggest (and no dragging) until it's unlocked.
      return [
        { id: "unlock", label: "Unlock (to move it)" },
        { id: "done", label: "Done" },
        rename,
        { ...remove, label: `Delete ${title} (every week)` },
        { id: "queue", label: "Move to queue…" },
      ];
    case "done":
      return [{ id: "undone", label: "Not done yet" }, rename, { ...remove, label: `Delete ${title} (every week)` }];
    case "skipped":
      return [{ id: "unqueue", label: "Bring back to this week" }];
  }
}

/** Why a new name can't be used, or undefined if it's fine. */
export function renameProblem(title: string): string | undefined {
  const clean = title.trim();
  if (!clean) return "Give it a name.";
  if (clean.length > 60) return "Keep the name under 60 characters.";
  return undefined;
}

/** Other events with the same kind and name (e.g. "Work" Tuesday to Friday), offered "rename all". */
export function sameNameEvents(rows: WeekRow[], row: WeekRow): WeekRow[] {
  return rows.filter((r) => r.id !== row.id && r.kind === row.kind && r.title === row.title);
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
    const w = dayWindow(dayOf(newStart), week.settings);
    const hhmm = (m: number) => {
      const t = m % DAY;
      return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    };
    return { ok: false, error: `That time is taken or outside your day (${hhmm(w.start)}–${hhmm(w.end)}).` };
  }
  const moved = r.placements.find((p) => p.id === placementId)!;
  return { ok: true, placement: { ...moved, id: storedId(moved, newId) } };
}

/**
 * "Move anyway": put the session at `newStart` even if it overlaps something.
 * The user decided, so no conflict check; it only has to stay inside the week.
 */
export function forceMoveSession(plan: PlanResult, placementId: string, newStart: number, newId: () => string): SlotResult {
  const p = plan.placements.find((x) => x.id === placementId);
  if (!p) return { ok: false, error: "That session no longer exists." };
  const end = newStart + (p.end - p.start);
  if (end > WEEK) return { ok: false, error: "It would run past Sunday midnight." };
  return { ok: true, placement: { ...p, id: storedId(p, newId), start: newStart, end, state: keptState(p.state) } };
}

/** The next free slot after this session, kept there so it sticks (not locked). */
export function nextSlot(week: WeekInput, plan: PlanResult, placementId: string, newId: () => string): SlotResult {
  const r = suggestAnotherSlot({ ...week, placements: plan.placements }, placementId);
  if (!r.ok) return { ok: false, error: "There's no other free slot this week." };
  const moved = r.placements.find((p) => p.id === placementId)!;
  const before = plan.placements.find((p) => p.id === placementId);
  const state = keptState(before?.state ?? "suggested");
  return { ok: true, placement: { ...moved, id: storedId(moved, newId), state } };
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

/**
 * Why `row` can't move to (day, minuteOfDay), or undefined if it can. Uses
 * the same functions as the real move, so the live warning and the result of
 * tapping "Move here" always agree.
 */
export function moveProblem(
  week: WeekInput,
  plan: PlanResult,
  rows: WeekRow[],
  row: WeekRow,
  day: number,
  minuteOfDay: number,
): string | undefined {
  const start = weekMinute(day, minuteOfDay);
  if (isEventKind(row.kind)) {
    const r = moveEventTo(row, start);
    return r.ok ? undefined : r.error;
  }
  const r = moveSession(week, plan, row.id, start, () => "check");
  if (r.ok) return undefined;
  // Name what's in the way: a real overlap first, otherwise the buffer gap.
  const len = row.end - row.start;
  const kept = (rs: WeekRow[]) => rs.filter((x) => x.kind !== "suggested");
  const direct = kept(overlapping(rows, [{ start, end: start + len }], row.id));
  if (direct.length > 0) return `Overlaps ${summarize(direct)}.`;
  const gap = week.settings.bufferMin;
  const near = kept(overlapping(rows, [{ start: start - gap, end: start + len + gap }], row.id));
  if (near.length > 0) return `Too close to ${summarize(near)}. The planner keeps ${gap} min free around things.`;
  return r.error;
}
