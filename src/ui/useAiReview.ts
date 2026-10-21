// Data hook for the weekly review assistant: gathers up to 4 weeks, asks the
// AI service for suggestions, and applies the ones the user accepts.
import { useState } from "react";
import { planWeek, sleepForDay } from "../engine";
import { postJson } from "../ai/aiClient";
import { loadFirstWeek } from "../db/historyStore";
import { loadWeekItems } from "../db/weekItemsStore";
import {
  firstWeekPerItem,
  loadDoneEvents,
  loadItems,
  loadWeek,
  setItemDuration,
  updateItemPlan,
  type Db,
} from "../db/weekStore";
import { buildReviewRequest, changeFor, type AiReview, type AiSuggestion, type WeekInputForAi } from "./aiReview";
import { addWeeks, plannableFromKey } from "./weekDate";
import { isFinished } from "./weekItems";
import { reviewStats } from "./weekReview";
import { rowsByDay } from "./weekRows";
import type { Groups } from "./WeekView";

const WEEKS = 4;

export async function weekForAi(db: Db, weekStart: string, todayKey: string, groups: Groups): Promise<WeekInputForAi> {
  const loaded = await loadWeek(db, weekStart, addWeeks(weekStart, 1));
  // Same as Past weeks: nothing new is suggested in days that are over.
  const week = { ...loaded.week, settings: { ...loaded.week.settings, earliestStart: plannableFromKey(weekStart, todayKey) } };
  const rows = rowsByDay(week, planWeek(week), await loadDoneEvents(db, weekStart)).flat();
  const sleep = Array.from({ length: 7 }, (_, d) => sleepForDay(loaded.sleep, loaded.overrides, d));
  const items = await loadWeekItems(db, weekStart);
  return {
    weekStart,
    rows,
    items: week.items,
    stats: reviewStats(rows, sleep, groups),
    todos: { done: items.filter(isFinished).length, total: items.length },
  };
}

export type AiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; review: AiReview };

export function useAiReview(db: Db, weekStart: string, todayKey: string, groups: Groups, onChanged: () => void) {
  const [state, setState] = useState<AiState>({ status: "idle" });

  const ask = async () => {
    setState({ status: "loading" });
    try {
      const first = (await loadFirstWeek(db)) ?? weekStart;
      const weeks: WeekInputForAi[] = [];
      for (let i = 0; i < WEEKS; i++) {
        const w = addWeeks(weekStart, -i);
        if (i > 0 && w < first) break; // nothing stored that far back
        weeks.push(await weekForAi(db, w, todayKey, groups));
      }
      const now = plannableFromKey(weekStart, todayKey); // from today on, sessions are still ahead
      const request = buildReviewRequest(
        weeks,
        await loadItems(db),
        await firstWeekPerItem(db),
        (id) => (id ? (groups.get(id)?.name ?? null) : null),
        now < 7 * 24 * 60 ? now : null, // a week that is over has nothing upcoming
      );
      setState({ status: "ready", review: await postJson<AiReview>("/weekly-review", request) });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  };

  /** Applies one suggestion. Returns an error message, or undefined when it worked. */
  const accept = async (s: AiSuggestion): Promise<string | undefined> => {
    const change = changeFor(s.action, await loadItems(db));
    if ("error" in change) return change.error;
    if (change.kind === "plan") await updateItemPlan(db, change.itemId, change.patch);
    if (change.kind === "duration") await setItemDuration(db, change.itemId, change.minutes, weekStart);
    onChanged(); // the week screen reloads and re-plans with the new settings
    return undefined;
  };

  const reset = () => setState({ status: "idle" });

  return { state, ask, accept, reset };
}
