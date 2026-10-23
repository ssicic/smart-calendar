// Data hook for habits: the habits and this week's ticks. Like useWeek, every
// change writes to the database and then reloads from it.
import { useCallback, useEffect, useState } from "react";
import {
  deleteHabit,
  insertHabit,
  loadHabitChecks,
  loadHabits,
  setHabitCheck,
  updateHabit,
  type Habit,
} from "../db/habitsStore";
import type { Db } from "../db/weekStore";
import { checkKey } from "./habits";
import { dayKey } from "./weekDate";

let counter = 0;
const newId = () => `h${Date.now().toString(36)}${counter++}`;

export function useHabits(db: Db, weekStart: string) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setHabits(await loadHabits(db));
    setChecks(await loadHabitChecks(db, dayKey(weekStart, 0), dayKey(weekStart, 6)));
  }, [db, weekStart]);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  const toggle = async (habitId: string, day: string) => {
    await setHabitCheck(db, habitId, day, !checks.has(checkKey(habitId, day)));
    await refresh();
  };

  const add = async (h: Omit<Habit, "id">) => {
    await insertHabit(db, { ...h, id: newId() });
    await refresh();
  };

  const change = async (h: Habit) => {
    await updateHabit(db, h);
    await refresh();
  };

  const remove = async (id: string) => {
    await deleteHabit(db, id);
    await refresh();
  };

  return { habits, checks, toggle, add, change, remove };
}
