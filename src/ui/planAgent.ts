// "Plan my week" agent: what the app sends to /plan-week and how it finds a
// proposal's session again. Pure, no React.
import type { WeekInput } from "../engine";
import { importanceOf, timeOfDayOf } from "./aiReview";
import { EMPTY_FORM, type Importance, type QuickAddForm, type TimeOfDay } from "./quickAdd";
import { clock } from "./weekRows";
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
    groups: string[];
  };
  wish: string;
}

export interface Proposal {
  type: "move" | "skip" | "add";
  session_id: string;
  title: string;
  from_start: number;
  from_label: string;
  to_label: string | null;
  start: number | null;
  end: number | null;
  reason: string;
  // Adds only: a fixed event on these days (0 = Monday) at these minutes of the day.
  days?: number[];
  day_start?: number | null;
  day_end?: number | null;
  repeat_weekly?: boolean;
  group?: string | null;
  warning?: string | null;
}

export interface PlanResult {
  summary: string;
  proposals: Proposal[];
  tool_calls: number;
}

/** Sessions the agent may move: flexible ones not locked, done or queued. */
const isMovable = (row: WeekRow) => row.kind === "suggested" || row.kind === "kept";

export function buildPlanRequest(
  week: WeekInput,
  rows: WeekRow[],
  weekStart: string,
  wish: string,
  groups: string[] = [],
): PlanRequest {
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
      groups,
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

/**
 * An "add" proposal as the quick-add form would have it, so accepting it goes
 * through the same parsing and saving as adding by hand. Undefined if it's
 * missing its days or times.
 */
export function formFromAdd(p: Proposal, groups: { id: string; name: string }[]): QuickAddForm | undefined {
  if (p.type !== "add" || !p.days?.length || p.day_start == null || p.day_end == null) return undefined;
  const group = p.group ? groups.find((g) => g.name.toLowerCase() === p.group?.toLowerCase()) : undefined;
  return {
    ...EMPTY_FORM,
    kind: "fixed",
    title: p.title,
    days: p.days,
    startTime: clock(p.day_start),
    // The form can't say 24:00; the time pickers stop at 23:45 too.
    endTime: clock(Math.min(p.day_end, 24 * 60 - 1)),
    repeat: Boolean(p.repeat_weekly),
    categoryId: group?.id ?? null,
  };
}
