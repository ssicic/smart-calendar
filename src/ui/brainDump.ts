// Brain dump: many wishes at once → now / next / later. The AI turns wishes
// into habits and suggests the order; the rules about what fits live here,
// so a persuasive answer can't talk its way past them. Pure, no React.
import { cleanSteps, type JourneyStep } from "../engine";
import type { TimeOfDay } from "./quickAdd";

/** At most this many journeys run at once. Starting everything at once is how it all gets dropped. */
export const MAX_RUNNING = 2;

export type Group = "now" | "next" | "later";

export interface BrainDumpHabit {
  /** The user's own words it covers ("read some books", "learn art history"). */
  wishes: string[];
  title: string;
  timeOfDay: TimeOfDay;
  steps: JourneyStep[];
  group: Group;
  why: string;
}

/** What POST /brain-dump returns (ai-service/app/brain_dump.py). */
export interface BrainDumpResponse {
  habits: {
    wishes: string[];
    title: string;
    time_of_day: TimeOfDay;
    steps: { times_per_week: number; minutes: number; note: string }[];
    group: Group;
    why: string;
  }[];
  note: string;
}

/** How many new journeys may start now, next to the ones running. */
export const roomNow = (running: number) => Math.max(0, MAX_RUNNING - running);

/** The AI's answer as habits, with the "now" limit applied again (the app's rule, not the model's). */
export function habitsFromResponse(res: BrainDumpResponse, room: number): BrainDumpHabit[] {
  let now = 0;
  return res.habits.map((h) => {
    const group: Group = h.group === "now" && now++ >= room ? "next" : h.group;
    return {
      wishes: h.wishes,
      title: h.title,
      timeOfDay: h.time_of_day,
      steps: cleanSteps(h.steps.map((s) => ({ timesPerWeek: s.times_per_week, minutes: s.minutes, note: s.note }))),
      group,
      why: h.why,
    };
  });
}

/** Moves a habit to another group; "now" only while there's room. Returns an error message instead when not. */
export function moveHabit(habits: BrainDumpHabit[], index: number, group: Group, room: number): BrainDumpHabit[] | string {
  const h = habits[index];
  if (!h || h.group === group) return habits;
  if (group === "now" && habits.filter((x) => x.group === "now").length >= room)
    return room === 0
      ? `Two journeys are already running. Start this one once one of them feels steady.`
      : `Only ${room} can start now. Move one out of "Now" first.`;
  return habits.map((x, i) => (i === index ? { ...x, group } : x));
}

const weekly = (s: JourneyStep | undefined) => (s ? s.timesPerWeek * s.minutes : 0);
const hoursLabel = (min: number) => `${Math.round(min / 6) / 10} h`;

export type FitLevel = "fine" | "a lot" | "too much";

export interface FitReport {
  /** "Starting with 1 h a week (2% of your free time)." */
  start: string;
  /** "At full size, everything is 9.5 h a week (24% of your free time)." */
  full: string;
  level: FitLevel;
  /** The first habit (now → next → later) that takes the total past half of the free time, if any. */
  tipsOver?: string;
}

/**
 * Does it fit? `freeMin`: awake minutes a week left after everything already
 * planned. Up to a third of it at full size is fine, up to half is a lot,
 * more is too much: the rest of life needs room too.
 */
export function fitReport(habits: BrainDumpHabit[], freeMin: number): FitReport {
  const pct = (min: number) => (freeMin > 0 ? Math.round((min / freeMin) * 100) : 100);
  const ordered = (["now", "next", "later"] as Group[]).flatMap((g) => habits.filter((h) => h.group === g));
  const startMin = ordered.filter((h) => h.group === "now").reduce((sum, h) => sum + weekly(h.steps[0]), 0);
  const fullMin = ordered.reduce((sum, h) => sum + weekly(h.steps[h.steps.length - 1]), 0);

  let total = 0;
  let tipsOver: string | undefined;
  for (const h of ordered) {
    total += weekly(h.steps[h.steps.length - 1]);
    if (!tipsOver && total > freeMin / 2) tipsOver = h.title;
  }
  const share = pct(fullMin);
  return {
    start: `Starting with ${hoursLabel(startMin)} a week (${pct(startMin)}% of your free time).`,
    full: `At full size, all of it is ${hoursLabel(fullMin)} a week (${share}% of your free time).`,
    level: share <= 33 ? "fine" : share <= 50 ? "a lot" : "too much",
    ...(tipsOver ? { tipsOver } : {}),
  };
}

/** "2×15 → 4×45" for a habit card. */
export const ladderLabel = (steps: JourneyStep[]) => {
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (!first || !last) return "";
  const f = `${first.timesPerWeek}×${first.minutes} min`;
  return steps.length === 1 ? f : `${f} → ${last.timesPerWeek}×${last.minutes} min a week`;
};
