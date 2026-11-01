// Points and rewards. What earns points is worked out from what's already
// stored (done to-dos, sessions, goals...), so it can never drift from the
// calendar; the database keeps a ledger so a week's points stay once the week
// is over, even if something from it is deleted later. Points never go down
// for something missed. Pure, no React.

/** One good day is about this many points; prices are shown in good days. */
export const GOOD_DAY = 50;
export const GOOD_WEEK = 350;

export const POINTS = {
  todo: 5,
  weekGoal: 20,
  monthGoal: 100,
  yearGoal: 500,
  session: 10,
  /** Done fixed events and routines: 1 point per this many minutes. */
  minutesPerPoint: 15,
  weeklyTarget: 30,
  stepUp: 50,
};

/** What's stored that can earn points. */
export interface PointFacts {
  todos: { id: string; weekStart: string; title: string }[];
  /** Week goals that reached their target. */
  weekGoals: { id: string; weekStart: string; title: string }[];
  /** Year and month goals marked done. */
  goals: { id: string; horizon: "year" | "month"; title: string }[];
  /** Done flexible sessions. */
  sessions: { id: string; weekStart: string; title: string }[];
  /** Done fixed events and routines, with their length that week. */
  events: { id: string; weekStart: string; title: string; minutes: number }[];
  /** Done sessions of one item in one week against what it asked for. */
  targets: { itemId: string; weekStart: string; title: string; done: number; target: number }[];
  /** Weeks a journey went up a step. */
  stepUps: { journeyId: string; weekStart: string; title: string }[];
}

export interface Earning {
  /** Stable id of what earned it, e.g. "todo:w123" or "target:gym:2026-11-02". */
  key: string;
  /** The week it counts for (goals: the week they were finished in). */
  weekStart: string;
  points: number;
  /** Surprise extra on top (already included in `points`). */
  bonus: number;
  label: string;
}

/** FNV-1a: a small, stable hash, so the same thing always gets the same surprise. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** About 1 in 8 earnings get a surprise of 5 to 25 extra points. */
export function surprise(key: string): number {
  const h = hash(key);
  return h % 8 === 0 ? 5 * (1 + (Math.floor(h / 8) % 5)) : 0;
}

/** Everything the facts earn. Goals have no week of their own: they count for `currentWeek`. */
export function earningsFrom(f: PointFacts, currentWeek: string): Earning[] {
  const out: Earning[] = [];
  const earn = (key: string, weekStart: string, base: number, label: string, lucky = true) => {
    const bonus = lucky ? surprise(key) : 0;
    out.push({ key, weekStart, points: base + bonus, bonus, label });
  };
  for (const t of f.todos) earn(`todo:${t.id}`, t.weekStart, POINTS.todo, t.title);
  for (const g of f.weekGoals) earn(`weekgoal:${g.id}`, g.weekStart, POINTS.weekGoal, `Week goal: ${g.title}`);
  for (const g of f.goals)
    earn(
      `goal:${g.id}`,
      currentWeek,
      g.horizon === "year" ? POINTS.yearGoal : POINTS.monthGoal,
      `${g.horizon === "year" ? "Year" : "Month"} goal: ${g.title}`,
    );
  for (const s of f.sessions) earn(`session:${s.id}:${s.weekStart}`, s.weekStart, POINTS.session, s.title);
  for (const e of f.events) {
    const base = Math.max(1, Math.floor(e.minutes / POINTS.minutesPerPoint));
    earn(`event:${e.id}:${e.weekStart}`, e.weekStart, base, e.title);
  }
  for (const t of f.targets)
    if (t.done >= t.target)
      earn(`target:${t.itemId}:${t.weekStart}`, t.weekStart, POINTS.weeklyTarget, `${t.title}: ${t.target} of ${t.target} this week`, false);
  for (const s of f.stepUps) earn(`stepup:${s.journeyId}:${s.weekStart}`, s.weekStart, POINTS.stepUp, `${s.title}: a step up`, false);
  return out;
}

/**
 * What to change in the stored ledger. New earnings are added; an earning
 * that's gone (a to-do unticked) is removed only while its week is still on,
 * so a past week's points stay.
 */
export function reconcile(
  stored: { key: string; weekStart: string }[],
  derived: Earning[],
  currentWeek: string,
): { add: Earning[]; remove: string[] } {
  const have = new Set(stored.map((s) => s.key));
  const want = new Set(derived.map((d) => d.key));
  return {
    add: derived.filter((d) => !have.has(d.key)),
    remove: stored.filter((s) => !want.has(s.key) && s.weekStart >= currentWeek).map((s) => s.key),
  };
}

const KIND_LINES = [
  "That's the hard part done.",
  "One less thing on your mind.",
  "You showed up. That's most of it.",
  "Future you says thanks.",
  "Small steps count. That was one.",
  "Done is better than perfect.",
  "Nice follow-through.",
  "Good call doing it now.",
  "That counts. Every bit of it.",
  "Quietly impressive.",
  "Look at you, getting it done.",
  "Another one off the list.",
];

const BONUS_LINES = [
  "Surprise bonus. You earned it.",
  "Lucky one: extra points.",
  "Bonus points, just because.",
  "A little extra for that one.",
];

/** A kind line for an earning, the same one each time for the same thing. */
export function kindLine(e: Earning): string {
  const lines = e.bonus > 0 ? BONUS_LINES : KIND_LINES;
  return lines[hash(`line:${e.key}`) % lines.length] ?? lines[0]!;
}

export type RewardSize = "small" | "medium" | "big" | "huge";

export const SIZE_PRICES: Record<RewardSize, number> = { small: 40, medium: 200, big: 1000, huge: 3000 };
export const SIZE_LABELS: Record<RewardSize, string> = { small: "Small", medium: "Medium", big: "Big", huge: "Huge" };

/** "≈ 4 good days" or "≈ 3 good weeks". */
export function priceLabel(price: number): string {
  if (price <= GOOD_WEEK) {
    const days = Math.max(1, Math.round(price / GOOD_DAY));
    return `≈ ${days} good ${days === 1 ? "day" : "days"}`;
  }
  const weeks = Math.round(price / GOOD_WEEK);
  return `≈ ${weeks} good ${weeks === 1 ? "week" : "weeks"}`;
}

/** Why a reward can't be saved, or undefined. */
export function rewardProblem(title: string, price: number): string | undefined {
  if (!title.trim()) return "Give the reward a name.";
  if (!Number.isInteger(price) || price < 5 || price > 100000) return "Pick a price from 5 to 100000 points.";
  return undefined;
}
