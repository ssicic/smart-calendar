// Journeys: a few weekly steps that build up to a habit ("Gym: 1 × 30 min,
// then 2 × 30, then 2 × 45 ..."). Nothing about progress is stored: the step
// for any week is replayed from the sessions done in the weeks before it, so
// it can never drift from the calendar. Pure, no React, no database.

export interface JourneyStep {
  timesPerWeek: number;
  minutes: number;
  /** A short line for the step, e.g. "Just show up". */
  note: string;
}

export interface Journey {
  id: string;
  /** The flexible item the journey sets the weekly amount for. */
  itemId: string;
  /** What the user typed, e.g. "Get back to the gym". */
  goal: string;
  steps: JourneyStep[];
  /** The Monday it started, "YYYY-MM-DD". */
  startWeek: string;
  /** Weeks where the user chose "make it easier": one step down from that week on. */
  stepDowns: string[];
}

export interface JourneyWeek {
  /** Index into `steps` for this week. */
  step: number;
  /** 1 for the first week of the journey. */
  weekNo: number;
  /** Weeks in a row before this one that missed their step's target. */
  misses: number;
  /** Every step done: the journey keeps the last step as the new normal. */
  finished: boolean;
  /** The step went up at the start of this week. */
  steppedUp: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The Monday after `weekStart` (UTC math on the date only, so no time zone surprises). */
export function nextMonday(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 7));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Where the journey is in `weekStart`. A week that hits its step's target
 * moves to the next step; a week that doesn't repeats the step (no going
 * back on its own; the user can choose "easier", see `stepDowns`).
 * `doneByWeek`: done sessions of the journey's item per week.
 */
export function journeyWeek(j: Journey, weekStart: string, doneByWeek: Map<string, number>): JourneyWeek {
  const last = j.steps.length - 1;
  let step = 0;
  let misses = 0;
  let finished = false;
  let steppedUp = false;
  let weekNo = 1;
  // Week numbers stay small (a journey is weeks, not years), but cap the loop anyway.
  for (let w = j.startWeek; w <= weekStart && weekNo < 520; w = nextMonday(w)) {
    if (j.stepDowns.includes(w) && step > 0) {
      step--;
      misses = 0;
      finished = false;
    }
    if (w === weekStart) break;
    weekNo++;
    steppedUp = false;
    if ((doneByWeek.get(w) ?? 0) >= (j.steps[step]?.timesPerWeek ?? 1)) {
      misses = 0;
      if (step < last) {
        step++;
        steppedUp = true;
      } else finished = true;
    } else misses++;
  }
  if (weekStart < j.startWeek) weekNo = 0;
  return { step, weekNo, misses, finished, steppedUp };
}

/** After two missed weeks in a row, offer one step easier (never below the first). */
export function offerEasier(state: JourneyWeek): boolean {
  return state.misses >= 2 && state.step > 0;
}

/** Keeps a journey sane whatever the AI (or a user edit) sends. */
export function cleanSteps(steps: JourneyStep[]): JourneyStep[] {
  return steps.slice(0, 8).map((s) => ({
    timesPerWeek: Math.min(7, Math.max(1, Math.round(s.timesPerWeek))),
    minutes: Math.min(180, Math.max(5, Math.round(s.minutes / 5) * 5)),
    note: s.note.trim().slice(0, 80),
  }));
}
