// "Plan my week" agent: what the app sends to /plan-week and how it finds a
// proposal's session again. Pure, no React.
import type { WeekInput } from "../engine";
import { importanceOf, timeOfDayOf } from "./aiReview";
import type { Importance, TimeOfDay } from "./quickAdd";
import type { WeekRow } from "./weekRows";

export interface PlanBlock {
  id: string;
  title: string;
  kind: "fixed" | "routine" | "flexible";
  start: number;
  end: number;
  movable: boolean;
  item_id: string | null;
}

export interface PlanRequest {
  week: {
    week_start: string;
    now: number;
    blocks: PlanBlock[];
    windows: { start: number; end: number }[];
    items: {
      item_id: string;
      title: string;
      duration_min: number;
      times_per_week: number;
      importance: Importance;
      time_of_day: TimeOfDay;
    }[];
    buffer_min: number;
  };
  wish: string;
}

export interface Proposal {
  type: "move" | "skip";
  session_id: string;
  title: string;
  from_start: number;
  from_label: string;
  to_label: string | null;
  start: number | null;
  end: number | null;
  reason: string;
}

export interface PlanResult {
  summary: string;
  proposals: Proposal[];
  tool_calls: number;
}

/** Sessions the agent may move: flexible ones not locked, done or queued. */
const isMovable = (row: WeekRow) => row.kind === "suggested" || row.kind === "kept";

export function buildPlanRequest(week: WeekInput, rows: WeekRow[], weekStart: string, wish: string): PlanRequest {
  const s = week.settings;
  return {
    week: {
      week_start: weekStart,
      now: s.earliestStart ?? 0,
      blocks: rows
        .filter((r) => r.kind !== "skipped") // queued: not in this week any more
        .map((r) => ({
          id: r.id,
          title: r.title,
          kind: r.kind === "fixed" || r.kind === "routine" ? r.kind : "flexible",
          start: r.start,
          end: r.end,
          movable: isMovable(r),
          item_id: r.itemId ?? null,
        })),
      windows: s.dayWindows ?? Array.from({ length: 7 }, () => ({ start: s.dayStart, end: s.dayEnd })),
      items: week.items.map((i) => ({
        item_id: i.id,
        title: i.title,
        duration_min: i.durationMin,
        times_per_week: i.timesPerWeek,
        importance: importanceOf(i.priority),
        time_of_day: timeOfDayOf(i.preferredWindows),
      })),
      buffer_min: s.bufferMin,
    },
    wish: wish.trim().slice(0, 300),
  };
}

/**
 * The session a proposal is about, in today's rows. Suggested sessions get
 * ids from their start time ("gym@1080"), so after accepting one proposal the
 * week re-plans and an id may change: then match by item and old start.
 */
export function findSession(rows: WeekRow[], p: Proposal): WeekRow | undefined {
  const movable = rows.filter(isMovable);
  return movable.find((r) => r.id === p.session_id) ?? movable.find((r) => r.title === p.title && r.start === p.from_start);
}
