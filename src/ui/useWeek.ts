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
  loadChecks,
  loadRoutines,
  loadWeek,
  loadDoneEvents,
  setEventDone,
  setItemDuration,
  insertRoutine,
  deleteRoutine,
  setCheck,
  updateRoutine,
  type Routine,
  type RoutineStep,
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
  lengthProblem,
} from "./itemActions";
import {
  deleteWeekItem,
  insertWeekItem,
  loadWeekItems,
  updateWeekItem,
  type WeekItem,
  type WeekItemKind,
} from "../db/weekItemsStore";
import { addLaterToWeek, deleteLater, loadLater, type LaterEntry } from "../db/laterStore";
import { loadMovedOn, type MovedOn } from "../db/reviewStore";
import {
  countGoalSessions,
  deleteGoal,
  insertGoal,
  loadGoals,
  updateGoal,
  type Goal,
  type GoalHorizon,
} from "../db/goalsStore";
import { timeCheck } from "./goals";
import type { GroupActions } from "./ManageGroupsSheet";
import { checkKey } from "./routines";
import type { QuickAddResult } from "./QuickAddSheet";
import type { SleepScope } from "./SleepSheet";
import { addWeeks, monthGrid, monthOfWeek, periodsOfWeek, weeksOfYear } from "./weekDate";
import { isEventKind, type WeekRow } from "./weekRows";

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

/** `earliestStart`: where suggestions may start this week (plannableFrom), so nothing lands in the past. */
export function useWeek(db: Db, weekStart: string, earliestStart = 0) {
  const nextWeek = addWeeks(weekStart, 1);
  const [loaded, setLoaded] = useState<LoadedWeek>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  // This week's to-do list and goals.
  const [weekItems, setWeekItems] = useState<WeekItem[]>([]);
  // Goals for the year and month this week belongs to.
  const [goals, setGoals] = useState<Goal[]>([]);
  const periods = periodsOfWeek(weekStart);
  // Done sessions per goal ("Make time for it" items) this month and this year.
  const [goalSessions, setGoalSessions] = useState<{ month: Map<string, number>; year: Map<string, number> }>({
    month: new Map(),
    year: new Map(),
  });
  // The Later list (sessions moved to the queue with no week yet).
  const [later, setLater] = useState<LaterEntry[]>([]);
  // For the week review: this week's sessions that were moved to the queue, and where to.
  const [movedOn, setMovedOn] = useState<MovedOn[]>([]);
  // Ticked routine steps this week, as checkKey(eventId, stepId).
  const [checks, setChecks] = useState<Set<string>>(new Set());
  // Fixed events and routines marked done this week.
  const [doneEvents, setDoneEvents] = useState<Set<string>>(new Set());

  // useCallback keeps the same function between renders (unless db or the
  // week changes), so the useEffect below doesn't re-run on every render.
  const refresh = useCallback(async () => {
    setLoaded(await loadWeek(db, weekStart, nextWeek));
    setCategories(await loadCategories(db));
    setRoutines(await loadRoutines(db));
    setWeekItems(await loadWeekItems(db, weekStart));
    const p = periodsOfWeek(weekStart);
    setGoals(await loadGoals(db, [p.year, p.month]));
    const month = monthOfWeek(weekStart);
    setGoalSessions({
      month: await countGoalSessions(db, monthGrid(month).map((r) => r.weekStart)),
      year: await countGoalSessions(db, weeksOfYear(month.year)),
    });
    setLater(await loadLater(db));
    setMovedOn(await loadMovedOn(db, weekStart));
    setChecks(new Set((await loadChecks(db, weekStart)).map((c) => checkKey(c.eventId, c.stepId))));
    setDoneEvents(await loadDoneEvents(db, weekStart));
  }, [db, weekStart, nextWeek]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const week = useMemo(
    () => loaded && { ...loaded.week, settings: { ...loaded.week.settings, earliestStart } },
    [loaded, earliestStart],
  );
  const plan = useMemo(() => (week ? planWeek(week) : undefined), [week]);
  const repeatingEventIds = useMemo(() => new Set(loaded?.repeatingEventIds), [loaded]);

  /** Only repeating events have a choice; one-off events always change "every week" (their only week). */
  const scopeFor = (row: WeekRow, scope: EventScope): EventScope =>
    repeatingEventIds.has(row.id) ? scope : "every";

  const add = (r: QuickAddResult) =>
    attempt(async () => {
      if (r.kind === "flexible") await insertItem(db, r.item);
      // A repeating event starts from the week it's added in; it doesn't fill past weeks.
      else await insertEvents(db, r.kind, r.events, r.repeat ? null : weekStart, weekStart);
      await refresh();
    });

  /** `scope`: for a repeating event's Delete, just this week or every week. */
  const act = (row: WeekRow, action: ActionId, scope: EventScope = "every") =>
    attempt(async () => {
      if (!week || !plan) return;
      const p = plan.placements.find((x) => x.id === row.id);

      if (isEventKind(row.kind) && (action === "done" || action === "undone")) {
        await setEventDone(db, row.id, weekStart, action === "done"); // this week only
      } else if (action === "delete") {
        if (isEventKind(row.kind)) {
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
      } else if (p && (action === "queue" || action === "later")) {
        const target = action === "queue" ? nextWeek : null; // null = Later, no week yet
        await queuePlacement(db, weekStart, { ...p, id: storedId(p, newId) }, target, newId());
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
      if (isEventKind(row.kind)) {
        const events: FixedEvent[] = row.kind === "fixed" ? week.fixed : (week.routines ?? []);
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
      if (isEventKind(row.kind)) await setCategory(db, { kind: "event", id: row.id }, categoryId);
      else if (row.itemId) await setCategory(db, { kind: "item", id: row.itemId }, categoryId);
      await refresh();
    });

  /** New name for a row: an event (or, with `all`, every event with its name) or a flexible item. */
  const rename = (row: WeekRow, title: string, all = false) =>
    attempt(async () => {
      if (isEventKind(row.kind)) {
        if (all) await renameEventsNamed(db, row.kind, row.title, title);
        else await renameEvent(db, row.id, title);
      } else if (row.itemId) await renameItem(db, row.itemId, title);
      await refresh();
    });

  /** Saves a new routine; returns its id, or an error to show. */
  const addRoutine = async (name: string, steps: RoutineStep[]): Promise<{ id: string } | { error: string }> => {
    const id = `r${newId()}`;
    const err = await attempt(async () => {
      await insertRoutine(db, { id, name, steps });
      await refresh();
    });
    return err ? { error: err } : { id };
  };

  /** Changes a saved routine (name and steps) everywhere it's used. */
  const editRoutine = (routine: Routine) =>
    attempt(async () => {
      await updateRoutine(db, routine);
      await refresh();
    });

  /** Adds a to-do, or a goal with a target ("Run" × 3), to this week. */
  /** `day` (0 = Monday): a to-do for that day only; null = for the whole week. */
  const addWeekItem = (kind: WeekItemKind, title: string, target = 1, day: number | null = null) =>
    attempt(async () => {
      await insertWeekItem(db, weekStart, { id: `w${newId()}`, kind, title, done: false, progress: 0, target, day });
      await refresh();
    });

  /** Saves a changed to-do or goal (ticked, progress, name). */
  const changeWeekItem = (item: WeekItem) =>
    attempt(async () => {
      await updateWeekItem(db, item);
      await refresh();
    });

  const removeWeekItem = (id: string) =>
    attempt(async () => {
      await deleteWeekItem(db, id);
      await refresh();
    });

  /** Adds one session from Later to the week on screen. */
  const addFromLater = (id: string) =>
    attempt(async () => {
      await addLaterToWeek(db, id, weekStart);
      await refresh();
    });

  const removeLater = (id: string) =>
    attempt(async () => {
      await deleteLater(db, id);
      await refresh();
    });

  /** Adds a goal for this week's year or month, optionally part of a year goal. */
  const addGoal = (horizon: GoalHorizon, title: string, parentId: string | null = null) =>
    attempt(async () => {
      const period = horizon === "year" ? periods.year : periods.month;
      await insertGoal(db, { id: `g${newId()}`, title, horizon, period, parentId, done: false });
      await refresh();
    });

  const changeGoal = (goal: Goal) =>
    attempt(async () => {
      await updateGoal(db, goal);
      await refresh();
    });

  const removeGoal = (id: string) =>
    attempt(async () => {
      await deleteGoal(db, id);
      await refresh();
    });

  /** The flexible item "Make time for it" would add for a goal. */
  const goalItem = (goal: Goal, minutes: number, times: number) => ({
    id: `i${newId()}`,
    title: goal.title,
    durationMin: minutes,
    timesPerWeek: times,
    priority: 3, // "medium", like the quick-add default
    goalId: goal.id,
  });

  /** Would `times` × `minutes` a week for this goal fit this week? (Nothing is saved.) */
  const checkGoalTime = (goal: Goal, minutes: number, times: number) =>
    week ? timeCheck(week, goalItem(goal, minutes, times)) : undefined;

  /** "Make time for it": a flexible item linked to the goal; the planner places it. */
  const makeTimeFor = (goal: Goal, minutes: number, times: number) =>
    attempt(async () => {
      await insertItem(db, goalItem(goal, minutes, times));
      await refresh();
    });

  /** Stops making time for a goal: deletes its flexible item (every week). The goal stays. */
  const stopGoalTime = (itemId: string) =>
    attempt(async () => {
      await deleteItem(db, itemId);
      await refresh();
    });

  /** A week goal that's part of a month or year goal ("Add to this week"). */
  const addWeekGoalFor = (goal: Goal, target = 1) =>
    attempt(async () => {
      await insertWeekItem(db, weekStart, {
        id: `w${newId()}`,
        kind: "goal",
        title: goal.title,
        done: false,
        progress: 0,
        target,
        day: null,
        goalId: goal.id,
      });
      await refresh();
    });

  /** Deletes a saved routine; its blocks stay on the calendar as fixed events. */
  const removeRoutine = (id: string) =>
    attempt(async () => {
      await deleteRoutine(db, id);
      await refresh();
    });

  /** Ticks or unticks one step of a routine on the calendar (this week only). */
  const toggleStep = (eventId: string, stepId: string) =>
    attempt(async () => {
      const ticking = !checks.has(checkKey(eventId, stepId));
      await setCheck(db, eventId, weekStart, stepId, ticking);
      // Ticking the last step marks the routine done; unticking one takes that back.
      const routineId = week?.routines?.find((e) => e.id === eventId)?.routineId;
      const steps = routines.find((r) => r.id === routineId)?.steps ?? [];
      const after = new Set(checks);
      if (ticking) after.add(checkKey(eventId, stepId));
      else after.delete(checkKey(eventId, stepId));
      const complete = steps.length > 0 && steps.every((s) => after.has(checkKey(eventId, s.id)));
      if (complete !== doneEvents.has(eventId)) await setEventDone(db, eventId, weekStart, complete);
      await refresh();
    });

  /**
   * New length in minutes. Events: this week only or every week (`scope`, for a
   * repeating one). Flexible items: the item and its placed sessions from this week on.
   */
  const resize = (row: WeekRow, minutes: number, scope: EventScope = "week") =>
    attempt(async () => {
      const bad = lengthProblem(row.start, minutes);
      if (bad) return bad;
      if (isEventKind(row.kind)) {
        const times = { start: row.start, end: row.start + minutes };
        if (scopeFor(row, scope) === "week") await changeEventForWeek(db, row.id, weekStart, times);
        else await moveEvent(db, row.id, times.start, times.end, weekStart);
      } else if (row.itemId) {
        await setItemDuration(db, row.itemId, minutes, weekStart);
      }
      await refresh();
    });

  return {
    doneEvents,
    resize,
    goals,
    periods,
    addGoal,
    changeGoal,
    removeGoal,
    addWeekGoalFor,
    goalSessions,
    checkGoalTime,
    makeTimeFor,
    stopGoalTime,
    /** Reloads everything from the database (after changes made elsewhere, e.g. Plan next week). */
    refresh,
    routines,
    checks,
    addRoutine,
    editRoutine,
    removeRoutine,
    toggleStep,
    weekItems,
    addWeekItem,
    changeWeekItem,
    removeWeekItem,
    later,
    movedOn,
    addFromLater,
    removeLater,
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
