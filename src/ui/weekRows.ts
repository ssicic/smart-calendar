// Turns engine output into rows the UI can draw. Pure, like the engine:
// no React here, so it is easy to test and reuse.
import { DAY, dayOf, type PlacementState, type PlanResult, type WeekInput } from "../engine";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type RowKind = "fixed" | "routine" | PlacementState;

/** Fixed events and routines: things at a set time that the scheduler never moves. */
export const isEventKind = (kind: RowKind): kind is "fixed" | "routine" => kind === "fixed" || kind === "routine";

export interface WeekRow {
  id: string;
  title: string;
  start: number;
  end: number;
  kind: RowKind;
  /** Set for flexible sessions: which item this is a session of. */
  itemId?: string;
  /** Activity group (Work, Health…), if it has one. */
  categoryId?: string;
  /** Set for routines: which saved checklist it follows. */
  routineId?: string;
  /** Fixed events and routines marked done this week. (Flexible sessions use kind "done".) */
  done?: boolean;
}

/** "17:15" from week-minutes. */
export function clock(minute: number): string {
  const m = minute % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** All rows for the week, grouped by day (index 0 = Monday), each day sorted by time. */
/** Done, whatever kind it is: a done flexible session, or an event marked done. */
export const isDone = (row: WeekRow) => row.kind === "done" || row.done === true;

/** `doneEvents`: ids of fixed events and routines marked done this week. */
export function rowsByDay(input: WeekInput, plan: PlanResult, doneEvents: Set<string> = new Set()): WeekRow[][] {
  const event = <K extends "fixed" | "routine">(e: WeekInput["fixed"][number], kind: K) => ({
    ...e,
    kind,
    ...(doneEvents.has(e.id) ? { done: true } : {}),
  });
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const groups = new Map(input.items.map((i) => [i.id, i.categoryId]));
  const rows: WeekRow[] = [
    ...input.fixed.map((e) => event(e, "fixed")),
    // Rest blocks only come from old sample data now (rest is a group); they show as fixed time.
    ...input.rest.map((e) => event(e, "fixed")),
    ...(input.routines ?? []).map((e) => event(e, "routine")),
    ...plan.placements.map((p) => ({
      id: p.id,
      title: titles.get(p.itemId) ?? p.itemId,
      start: p.start,
      end: p.end,
      kind: p.state,
      itemId: p.itemId,
      ...(groups.get(p.itemId) ? { categoryId: groups.get(p.itemId) } : {}),
    })),
  ];
  const days: WeekRow[][] = [[], [], [], [], [], [], []];
  for (const r of rows) days[dayOf(r.start)]?.push(r);
  for (const d of days) d.sort((a, b) => a.start - b.start);
  return days;
}
