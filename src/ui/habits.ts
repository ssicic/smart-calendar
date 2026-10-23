// Habit rules: icons, weekly counts and labels. Pure, no React.
// Kind on purpose: no streaks, no "failed". A missed day is just an empty circle.
import type { Habit } from "../db/habitsStore";
import { dayKey } from "./weekDate";

/** Icons to pick from (Ionicons names), with a word for screen readers. */
export const HABIT_ICONS: { icon: string; label: string }[] = [
  { icon: "footsteps-outline", label: "Steps" },
  { icon: "walk-outline", label: "Moving" },
  { icon: "barbell-outline", label: "Exercise" },
  { icon: "leaf-outline", label: "Food" },
  { icon: "water-outline", label: "Water" },
  { icon: "wine-outline", label: "Alcohol" },
  { icon: "cafe-outline", label: "Coffee" },
  { icon: "bed-outline", label: "Sleep" },
  { icon: "book-outline", label: "Reading" },
  { icon: "heart-outline", label: "Self-care" },
  { icon: "sunny-outline", label: "Outside" },
  { icon: "phone-portrait-outline", label: "Screen time" },
];

export const DEFAULT_HABIT_ICON = "heart-outline";

/** More than this many habits: a gentle note, never a block. */
export const HABIT_SOFT_LIMIT = 5;

export const checkKey = (habitId: string, day: string) => `${habitId}|${day}`;

/** Why a name can't be used, or undefined. */
export function habitNameProblem(title: string, habits: Habit[], ownId?: string): string | undefined {
  const t = title.trim();
  if (!t) return "Give it a name.";
  if (t.length > 40) return "Keep it under 40 characters.";
  if (habits.some((h) => h.id !== ownId && h.title.trim().toLowerCase() === t.toLowerCase()))
    return "You already have a habit with that name.";
  return undefined;
}

/** How many days of `weekStart`'s week the habit was ticked. */
export function weekCount(checks: Set<string>, habitId: string, weekStart: string): number {
  let n = 0;
  for (let d = 0; d < 7; d++) if (checks.has(checkKey(habitId, dayKey(weekStart, d)))) n++;
  return n;
}

/** "Every day" or "5 days a week". */
export const targetLabel = (target: number) => (target >= 7 ? "Every day" : `${target} days a week`);

/** "4 of 5" (the target, not 7, so 5 of 5 reads as done for a 5-day habit). */
export const progressLabel = (count: number, target: number) => `${count} of ${target}`;

export const onTrack = (count: number, target: number) => count >= target;

export function tooManyHabitsNote(count: number): string | undefined {
  return count > HABIT_SOFT_LIMIT ? "That's a lot of habits. Fewer are easier to keep: maybe pause one?" : undefined;
}

/** For the week review: "No alcohol: 5 of 7 days" for each habit. */
export function habitReviewLines(habits: Habit[], checks: Set<string>, weekStart: string): string[] {
  return habits.map((h) => {
    const n = weekCount(checks, h.id, weekStart);
    return `${h.title}: ${n} of ${Math.min(h.targetPerWeek, 7)} days`;
  });
}
