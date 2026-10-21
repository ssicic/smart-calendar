// Data hook for the monthly summary: shows the saved summary of a month, or
// writes a new one by sending the month's weeks and goals to the AI service.
// Summaries are saved (settings key "month_summary:YYYY-MM"), so opening the
// sheet again costs nothing; "Write again" replaces it.
import { useEffect, useState } from "react";
import { postJson } from "../ai/aiClient";
import { loadGoals } from "../db/goalsStore";
import { firstWeekPerItem, loadItems, loadSetting, saveSetting, type Db } from "../db/weekStore";
import { buildReviewRequest, weeksOfMonth, type MonthRequest, type MonthSummary } from "./aiReview";
import { weekForAi } from "./useAiReview";
import { monthTitle, plannableFromKey, type Month } from "./weekDate";
import type { Groups } from "./WeekView";

export interface SavedSummary {
  summary: MonthSummary;
  /** "YYYY-MM-DD" it was written on. */
  writtenOn: string;
  /** Whether the month was over when it was written (if not, it may be out of date). */
  monthWasOver: boolean;
}

const monthKey = (m: Month) => `${m.year}-${String(m.month + 1).padStart(2, "0")}`;

export function useMonthSummary(db: Db, month: Month, thisWeek: string, todayKey: string, groups: Groups, open: boolean) {
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string>();
  const key = `month_summary:${monthKey(month)}`;

  const weeks = weeksOfMonth(month, thisWeek);
  const monthOver = (weeksOfMonth(month, "9999-12-31")[0] ?? "") < thisWeek;

  useEffect(() => {
    if (!open) return;
    setStatus("idle");
    setError(undefined);
    loadSetting<SavedSummary>(db, key).then(setSaved).catch(console.error);
  }, [db, key, open]);

  const write = async () => {
    setStatus("loading");
    setError(undefined);
    try {
      const forAi = [];
      for (const w of weeks) forAi.push(await weekForAi(db, w, todayKey, groups));
      const newest = weeks[0];
      const now = newest === thisWeek ? plannableFromKey(thisWeek, todayKey) : null;
      const base = buildReviewRequest(
        forAi,
        await loadItems(db),
        await firstWeekPerItem(db),
        (id) => (id ? (groups.get(id)?.name ?? null) : null),
        now,
      );
      const goals = await loadGoals(db, [String(month.year), monthKey(month)]);
      const request: MonthRequest = {
        ...base,
        month: monthTitle(month),
        month_over: monthOver,
        goals: goals.map((g) => ({ title: g.title, horizon: g.horizon, done: g.done })),
      };
      const summary = await postJson<MonthSummary>("/monthly-summary", request);
      const next = { summary, writtenOn: todayKey, monthWasOver: monthOver };
      await saveSetting(db, key, next);
      setSaved(next);
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  };

  return { saved, status, error, write, canWrite: weeks.length > 0 };
}
