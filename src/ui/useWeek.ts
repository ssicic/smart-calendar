// A custom hook: a function that bundles state + effects so a screen can use
// them in one line. The rule for every change here is the same: write to the
// database, then reload from it. The database is the single source of truth,
// so the screen can never drift out of sync with what's saved.
import { useCallback, useEffect, useMemo, useState } from "react";
import { isWeekend, planWeek, sleepForDay, type FixedEvent } from "../engine";
import {
  changeEventForWeek,
  deleteEvent,
  deleteItem,
  keepPlacement,
  deleteCategory,
  insertCategory,
  insertEvents,
  insertItem,
  renameEvent,
  renameEventsNamed,
  renameItem,
  loadCategories,
  loadWeek,
  moveEvent,
  queuePlacement,
  savePlacement,
  saveSleep,
  reorderCategories,
  setCategory,
  updateCategory,
  setOverride,
  type Category,
  type Db,
  type LoadedWeek,
} from "../db/weekStore";
import {
  forceMoveSession,
  moveEventTo,
  moveSession,
  nextSlot,
  storedId,
  weekMinute,
  type ActionId,
  type EventScope,
} from "./itemActions";
import type { GroupActions } from "./ManageGroupsSheet";
import type { QuickAddResult } from "./QuickAddSheet";
import type { SleepScope } from "./SleepSheet";
import { addWeeks } from "./weekDate";
import type { WeekRow } from "./weekRows";

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${counter++}`;

/** Runs a database change; returns an error message instead of throwing. */
async function attempt(work: () => Promise<string | void>): Promise<string | undefined> {
  try {
    return (await work()) || undefined;
  } catch (e) {
    console.error(e);
    return "Couldn't save that. Please try again.";
  }
}

export function useWeek(db: Db, weekStart: string) {
  const nextWeek = addWeeks(weekStart, 1);
  const [loaded, setLoaded] = useState<LoadedWeek>();
  const [categories, setCategories] = useState<Category[]>([]);

  // useCallback keeps the same function between renders (unless db or the
  // week changes), so the useEffect below doesn't re-run on every render.
  const refresh = useCallback(async () => {
    setLoaded(await loadWeek(db, weekStart, nextWeek));
    setCategories(await loadCategories(db));
  }, [db, weekStart, nextWeek]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const week = loaded?.week;
  const plan = useMemo(() => (week ? planWeek(week) : undefined), [week]);
  const repeatingEventIds = useMemo(() => new Set(loaded?.repeatingEventIds), [loaded]);

  /** Only repeating events have a choice; one-off events always change "every week" (their only week). */
  const scopeFor = (row: WeekRow, scope: EventScope): EventScope =>
    repeatingEventIds.has(row.id) ? scope : "every";

  const add = (r: QuickAddResult) =>
    attempt(async () => {
      if (r.kind === "flexible") await insertItem(db, r.item);
      else await insertEvents(db, r.kind, r.events, r.repeat ? null : weekStart);
      await refresh();
    });

  /** `scope`: for a repeating event's Delete, just this week or every week. */
  const act = (row: WeekRow, action: ActionId, scope: EventScope = "every") =>
    attempt(async () => {
      if (!week || !plan) return;
      const p = plan.placements.find((x) => x.id === row.id);

      if (action === "delete") {
        if (row.kind === "fixed" || row.kind === "rest") {
          if (scopeFor(row, scope) === "week") await changeEventForWeek(db, row.id, weekStart, null);
          else await deleteEvent(db, row.id);
        } else if (row.itemId) await deleteItem(db, row.itemId);
      } else if (action === "unlock" || action === "undone" || action === "unqueue") {
        await keepPlacement(db, row.id); // stays at this time, just not locked/done/queued
      } else if (p && (action === "lock" || action === "done")) {
        await savePlacement(db, weekStart, { ...p, id: storedId(p, newId), state: action === "lock" ? "locked" : "done" });
      } else if (p && action === "suggest") {
        const r = nextSlot(week, plan, p.id, newId);
        if (!r.ok) return r.error;
        await savePlacement(db, weekStart, r.placement);
      } else if (p && action === "queue") {
        await queuePlacement(db, weekStart, { ...p, id: storedId(p, newId) }, nextWeek, newId());
      }
      await refresh();
    });

  /**
   * `force`: the user saw the warning and chose "Move anyway". `scope`: for a
   * repeating event, move it just this week (the default, also for dragging) or every week.
   */
  const move = (row: WeekRow, day: number, minuteOfDay: number, force = false, scope: EventScope = "week") =>
    attempt(async () => {
      if (!week || !plan) return;
      const newStart = weekMinute(day, minuteOfDay);
      if (row.kind === "fixed" || row.kind === "rest") {
        const events: FixedEvent[] = row.kind === "fixed" ? week.fixed : week.rest;
        const event = events.find((e) => e.id === row.id);
        if (!event) return;
        const r = moveEventTo(event, newStart);
        if (!r.ok) return r.error;
        if (scopeFor(row, scope) === "week") await changeEventForWeek(db, event.id, weekStart, r);
        else await moveEvent(db, event.id, r.start, r.end, weekStart);
      } else {
        const r = force
          ? forceMoveSession(plan, row.id, newStart, newId)
          : moveSession(week, plan, row.id, newStart, newId);
        if (!r.ok) return r.error;
        await savePlacement(db, weekStart, r.placement);
      }
      await refresh();
    });

  /** Sleep for each day of this week, with one-off changes applied. */
  const sleep = useMemo(
    () => (loaded ? Array.from({ length: 7 }, (_, d) => sleepForDay(loaded.sleep, loaded.overrides, d)) : []),
    [loaded],
  );

  /**
   * "day": change just this day this week. "usual": change the weekday or
   * weekend default (and drop this day's one-off change). "reset": back to usual.
   */
  const changeSleep = (day: number, field: "wake" | "bed", minutes: number, scope: SleepScope) =>
    attempt(async () => {
      if (!loaded) return;
      if (scope === "day") {
        await setOverride(db, weekStart, day, field, minutes);
      } else {
        if (scope === "usual") {
          const group = isWeekend(day) ? "weekend" : "weekday";
          const s = loaded.sleep;
          await saveSleep(db, { ...s, [group]: { ...s[group], [field]: minutes } });
        }
        await setOverride(db, weekStart, day, field, null);
      }
      await refresh();
    });

  /** Adds an activity group; returns its id, or an error to show. */
  const addCategory = async (name: string, color: string): Promise<{ id: string } | { error: string }> => {
    const id = `c${newId()}`;
    const err = await attempt(async () => {
      await insertCategory(db, { id, name, color });
      await refresh();
    });
    return err ? { error: err } : { id };
  };

  /** Everything the group picker and Manage groups can change. */
  const groupActions: GroupActions = {
    add: addCategory,
    edit: (c) =>
      attempt(async () => {
        await updateCategory(db, c);
        await refresh();
      }),
    remove: (id) =>
      attempt(async () => {
        await deleteCategory(db, id);
        await refresh();
      }),
    reorder: (ids) =>
      attempt(async () => {
        await reorderCategories(db, ids);
        await refresh();
      }),
  };

  /** Puts a row in a group (null = none). For a flexible session that's its item, so every week. */
  const setRowCategory = (row: WeekRow, categoryId: string | null) =>
    attempt(async () => {
      if (row.kind === "fixed" || row.kind === "rest") await setCategory(db, { kind: "event", id: row.id }, categoryId);
      else if (row.itemId) await setCategory(db, { kind: "item", id: row.itemId }, categoryId);
      await refresh();
    });

  /** New name for a row: an event (or, with `all`, every event with its name) or a flexible item. */
  const rename = (row: WeekRow, title: string, all = false) =>
    attempt(async () => {
      if (row.kind === "fixed" || row.kind === "rest") {
        if (all) await renameEventsNamed(db, row.kind, row.title, title);
        else await renameEvent(db, row.id, title);
      } else if (row.itemId) await renameItem(db, row.itemId, title);
      await refresh();
    });

  return {
    rename,
    week,
    categories,
    groupActions,
    setRowCategory,
    plan,
    repeatingEventIds,
    queuedForNextWeek: loaded?.queuedForNextWeek ?? [],
    sleep,
    windDownMin: loaded?.sleep.windDownMin ?? 0,
    add,
    act,
    move,
    changeSleep,
  };
}
