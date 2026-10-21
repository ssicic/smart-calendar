// Weekly review assistant, app side. Pure, no React and no network:
// - buildReviewRequest: a few weeks of the calendar -> the compact facts the AI service reads
// - changeFor: an accepted suggestion -> the exact change to make to an item
// The AI only suggests. Every change is checked again here before it touches the database.
import { DAY, dayOf, type FlexibleItem, type Interval } from "../engine";
import type { ItemPlanPatch } from "../db/weekStore";
import { TIME_OF_DAY_WINDOWS, type Importance, type TimeOfDay } from "./quickAdd";
import type { ReviewStats } from "./weekReview";
import { clock, type WeekRow } from "./weekRows";

// ---- The service's request and response (same shape as ai-service/app/review.py) ----

export type PartOfDay = "morning" | "afternoon" | "evening";

export interface ItemWeekFacts {
  item_id: string;
  planned: number;
  done: { day: string; time: string; part_of_day: PartOfDay }[];
  queued: number;
  /** Still ahead in the reviewed week: not missed (yet). */
  upcoming: number;
  not_done: number;
}

export interface WeekFacts {
  week_start: string;
  planned_hours: number;
  done_hours: number;
  free_percent: number;
  items: ItemWeekFacts[];
  todos_done: number;
  todos_total: number;
}

export interface ItemNowFacts {
  item_id: string;
  title: string;
  times_per_week: number;
  duration_min: number;
  importance: Importance;
  time_of_day: TimeOfDay;
  group: string | null;
}

export interface ReviewRequest {
  weeks: WeekFacts[];
  items: ItemNowFacts[];
}

export interface AiAction {
  type: "set_time_of_day" | "set_times_per_week" | "set_duration" | "set_importance" | "none";
  item_id: string | null;
  time_of_day: TimeOfDay | null;
  times_per_week: number | null;
  duration_min: number | null;
  importance: Importance | null;
}

export interface AiSuggestion {
  title: string;
  reason: string;
  action: AiAction;
}

export interface AiReview {
  summary: string;
  suggestions: AiSuggestion[];
}

// ---- Building the facts ----

/** One week, as the app already has it on screen or in history. */
export interface WeekInputForAi {
  weekStart: string;
  rows: WeekRow[];
  /** Items as planned that week (times per week includes sessions queued into it). */
  items: FlexibleItem[];
  stats: ReviewStats;
  todos: { done: number; total: number };
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = (min: number) => Math.round(min / 6) / 10;

export function partOfDay(weekMinute: number): PartOfDay {
  const m = weekMinute % DAY;
  return m < 12 * 60 ? "morning" : m < 17 * 60 ? "afternoon" : "evening";
}

/** The quick-add "When" choice that matches an item's preferred windows ("any" for none or custom). */
export function timeOfDayOf(windows: Interval[] | undefined): TimeOfDay {
  const w = windows?.[0];
  if (!w || windows.length !== 1) return "any";
  const match = (Object.entries(TIME_OF_DAY_WINDOWS) as [TimeOfDay, Interval | undefined][]).find(
    ([, v]) => v && v.start === w.start && v.end === w.end,
  );
  return match?.[0] ?? "any";
}

export const importanceOf = (priority: number): Importance => (priority <= 2 ? "low" : priority <= 4 ? "medium" : "high");
const PRIORITY: Record<Importance, number> = { low: 1, medium: 3, high: 5 };

/** `now`: week-minute of this moment in the reviewed week (sessions from then on are upcoming), or null for a week that's over. */
function itemWeek(item: FlexibleItem, rows: WeekRow[], now: number | null): ItemWeekFacts {
  const mine = rows.filter((r) => r.itemId === item.id);
  const done = mine
    .filter((r) => r.kind === "done")
    .sort((a, b) => a.start - b.start)
    .map((r) => ({ day: DAY_SHORT[dayOf(r.start)] ?? "?", time: clock(r.start), part_of_day: partOfDay(r.start) }));
  const queued = mine.filter((r) => r.kind === "skipped").length;
  const open = (r: WeekRow) => r.kind === "suggested" || r.kind === "kept" || r.kind === "locked";
  const upcoming = now === null ? 0 : mine.filter((r) => open(r) && r.start >= now).length;
  return {
    item_id: item.id,
    planned: item.timesPerWeek,
    done,
    queued,
    upcoming,
    not_done: Math.max(0, item.timesPerWeek - done.length - queued - upcoming),
  };
}

/**
 * `weeks` newest first; weeks[0] is the one being reviewed (`now` = this moment's
 * week-minute in it, or null when it's over). An item only counts
 * in weeks from its first stored session on (it may not have existed before),
 * and always in the reviewed week.
 */
export function buildReviewRequest(
  weeks: WeekInputForAi[],
  itemsNow: FlexibleItem[],
  firstWeek: Map<string, string>,
  groupName: (id: string | undefined) => string | null,
  now: number | null = null,
): ReviewRequest {
  return {
    weeks: weeks.map((w, i) => ({
      week_start: w.weekStart,
      planned_hours: hours(w.stats.plannedMin),
      done_hours: hours(w.stats.doneMin),
      free_percent: w.stats.freePercent,
      items: w.items
        .filter((item) => i === 0 || (firstWeek.get(item.id) ?? "9999") <= w.weekStart)
        .map((item) => itemWeek(item, w.rows, i === 0 ? now : null)),
      todos_done: w.todos.done,
      todos_total: w.todos.total,
    })),
    items: itemsNow.map((item) => ({
      item_id: item.id,
      title: item.title,
      times_per_week: item.timesPerWeek,
      duration_min: item.durationMin,
      importance: importanceOf(item.priority),
      time_of_day: timeOfDayOf(item.preferredWindows),
      group: groupName(item.categoryId),
    })),
  };
}

// ---- Applying an accepted suggestion ----

export type ItemChange =
  | { kind: "plan"; itemId: string; patch: ItemPlanPatch }
  | { kind: "duration"; itemId: string; minutes: number }
  | { kind: "none" };

/** The change to make, or an error when the suggestion doesn't fit the item (anymore). */
export function changeFor(action: AiAction, items: FlexibleItem[]): ItemChange | { error: string } {
  if (action.type === "none") return { kind: "none" };
  const item = items.find((i) => i.id === action.item_id);
  if (!item) return { error: "That item doesn't exist anymore." };
  switch (action.type) {
    case "set_time_of_day": {
      const t = action.time_of_day;
      if (!t) return { error: "The suggestion is missing a time of day." };
      const w = TIME_OF_DAY_WINDOWS[t];
      return { kind: "plan", itemId: item.id, patch: { preferredWindows: w ? [w] : null } };
    }
    case "set_times_per_week": {
      const n = action.times_per_week;
      if (!n || n < 1 || n > 14) return { error: "That number of times a week doesn't work." };
      return { kind: "plan", itemId: item.id, patch: { timesPerWeek: n } };
    }
    case "set_duration": {
      const m = action.duration_min;
      if (!m || m < 15 || m > 240) return { error: "That length doesn't work." };
      return { kind: "duration", itemId: item.id, minutes: m };
    }
    case "set_importance": {
      const imp = action.importance;
      if (!imp) return { error: "The suggestion is missing an importance." };
      return { kind: "plan", itemId: item.id, patch: { priority: PRIORITY[imp] } };
    }
  }
}
