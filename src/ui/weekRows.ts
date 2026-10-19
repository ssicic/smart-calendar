// Turns engine output into rows the UI can draw. Pure, like the engine:
// no React here, so it is easy to test and reuse.
import { DAY, dayOf, type PlacementState, type PlanResult, type WeekInput } from "../engine";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type RowKind = "fixed" | "rest" | PlacementState;

export interface WeekRow {
  id: string;
  title: string;
  start: number;
  end: number;
  kind: RowKind;
}

/** "17:15" from week-minutes. */
export function clock(minute: number): string {
  const m = minute % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** All rows for the week, grouped by day (index 0 = Monday), each day sorted by time. */
export function rowsByDay(input: WeekInput, plan: PlanResult): WeekRow[][] {
  const titles = new Map(input.items.map((i) => [i.id, i.title]));
  const rows: WeekRow[] = [
    ...input.fixed.map((e) => ({ ...e, kind: "fixed" as const })),
    ...input.rest.map((e) => ({ ...e, kind: "rest" as const })),
    ...plan.placements.map((p) => ({
      id: p.id,
      title: titles.get(p.itemId) ?? p.itemId,
      start: p.start,
      end: p.end,
      kind: p.state,
    })),
  ];
  const days: WeekRow[][] = [[], [], [], [], [], [], []];
  for (const r of rows) days[dayOf(r.start)]?.push(r);
  for (const d of days) d.sort((a, b) => a.start - b.start);
  return days;
}
