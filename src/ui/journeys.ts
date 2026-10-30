// Words and small rules for the Journeys sheet. Pure, no React.
import { cleanSteps, offerEasier, type JourneyStep } from "../engine";
import { lengthLabel } from "./itemActions";
import type { TimeOfDay } from "./quickAdd";
import type { JourneyDraft, JourneyView } from "./useWeek";

/** What POST /journey-plan returns (ai-service/app/journey.py). */
export interface JourneyPlanResponse {
  title: string;
  time_of_day: TimeOfDay;
  steps: { times_per_week: number; minutes: number; note: string }[];
  why: string;
}

/** The AI's draft as something the user can edit and start. */
export function draftFromPlan(goal: string, plan: JourneyPlanResponse): JourneyDraft {
  return {
    goal: goal.trim(),
    title: plan.title.trim() || goal.trim().slice(0, 40),
    timeOfDay: plan.time_of_day,
    steps: cleanSteps(plan.steps.map((s) => ({ timesPerWeek: s.times_per_week, minutes: s.minutes, note: s.note }))),
  };
}

/** "2 × 30 min". */
export const stepLabel = (s: JourneyStep) => `${s.timesPerWeek} × ${lengthLabel(s.minutes)}`;

/** One step's numbers changed by the − / + buttons, kept in range. */
export function nudgeStep(s: JourneyStep, field: "timesPerWeek" | "minutes", dir: 1 | -1): JourneyStep {
  return field === "timesPerWeek"
    ? { ...s, timesPerWeek: Math.min(7, Math.max(1, s.timesPerWeek + dir)) }
    : { ...s, minutes: Math.min(180, Math.max(5, s.minutes + dir * (s.minutes >= 60 ? 15 : 5))) };
}

/** The friendly line at the top of a journey card. No guilt, ever. */
export function journeyHeadline(v: JourneyView): string {
  const { state, journey } = v;
  if (state.finished) return "You did every step. This is your new normal now.";
  if (state.steppedUp) return `New step unlocked: ${stepLabel(journey.steps[state.step]!)} this week.`;
  if (offerEasier(state)) return "Two tough weeks in a row. That happens. Want to make it a bit easier?";
  if (state.misses > 0) return "Same step again this week, no rush.";
  if (state.weekNo === 1) return "Week one. Small on purpose.";
  return `Week ${state.weekNo}. Keep going.`;
}

/** "1 of 2 done this week", or a ✓ once the step's target is reached. */
export function weekProgress(v: JourneyView): { text: string; done: boolean } {
  const target = v.journey.steps[v.state.step]?.timesPerWeek ?? 1;
  const done = v.doneThisWeek >= target;
  return { text: `${done ? "✓ " : ""}${Math.min(v.doneThisWeek, target)} of ${target} done this week`, done };
}
