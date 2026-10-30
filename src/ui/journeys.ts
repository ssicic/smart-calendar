// Words and small rules for the Journeys sheet. Pure, no React.
import { cleanSteps, dayOf, journeyWeek, nextMonday, offerEasier, type CheckinDecision, type JourneyStep } from "../engine";
import { partOfDay } from "./aiReview";
import { lengthLabel } from "./itemActions";
import type { TimeOfDay } from "./quickAdd";
import { addWeeks } from "./weekDate";
import { clock } from "./weekRows";
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
  if (state.weekNo === 0) return "Starts on Monday. Nothing to do yet.";
  if (state.weekNo === 1) return "Week one. Small on purpose.";
  return `Week ${state.weekNo}. Keep going.`;
}

/** "1 of 2 done this week", or a ✓ once the step's target is reached. */
export function weekProgress(v: JourneyView): { text: string; done: boolean } {
  const target = v.journey.steps[v.state.step]?.timesPerWeek ?? 1;
  const done = v.doneThisWeek >= target;
  return { text: `${done ? "✓ " : ""}${Math.min(v.doneThisWeek, target)} of ${target} done this week`, done };
}

// ---- Weekly coach check-in ----

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Session = { day: string; time: string; part_of_day: "morning" | "afternoon" | "evening" };

/** What POST /journey-checkin takes (ai-service/app/coach.py). */
export interface CheckinRequest {
  goal: string;
  title: string;
  time_of_day: TimeOfDay;
  steps: { times_per_week: number; minutes: number }[];
  last_week_step: number;
  automatic: CheckinDecision;
  weeks: { week_start: string; step: number; target: number; done: Session[]; skipped: Session[] }[];
}

/** What it returns. */
export interface CheckinResponse {
  decision: CheckinDecision;
  time_of_day: TimeOfDay | "keep";
  message: string;
}

/** The step a week starts on after a decision, from the step of the week before. */
export function stepAfter(lastWeekStep: number, decision: CheckinDecision, stepCount: number): number {
  if (decision === "up") return Math.min(stepCount - 1, lastWeekStep + 1);
  if (decision === "easier") return Math.max(0, lastWeekStep - 1);
  return lastWeekStep;
}

/**
 * The facts for a check-in in `weekStart`: up to 4 weeks before it (newest
 * first), each with its step, target, and the sessions done and skipped.
 */
export function buildCheckinRequest(
  v: JourneyView,
  weekStart: string,
  timeOfDay: TimeOfDay,
  sessions: { weekStart: string; start: number; state: "done" | "skipped" }[],
): CheckinRequest | undefined {
  const j = v.journey;
  const doneByWeek = new Map<string, number>();
  for (const s of sessions) if (s.state === "done") doneByWeek.set(s.weekStart, (doneByWeek.get(s.weekStart) ?? 0) + 1);
  const fact = (start: number): Session => ({ day: DAY_SHORT[dayOf(start)] ?? "?", time: clock(start), part_of_day: partOfDay(start) });

  const weeks: CheckinRequest["weeks"] = [];
  for (let n = 1; n <= 4; n++) {
    const w = addWeeks(weekStart, -n);
    if (w < j.startWeek) break;
    const step = journeyWeek(j, w, doneByWeek).step;
    const here = sessions.filter((s) => s.weekStart === w);
    weeks.push({
      week_start: w,
      step: step + 1,
      target: j.steps[step]?.timesPerWeek ?? 1,
      done: here.filter((s) => s.state === "done").map((s) => fact(s.start)),
      skipped: here.filter((s) => s.state === "skipped").map((s) => fact(s.start)),
    });
  }
  const lastWeek = weeks[0];
  if (!lastWeek || nextMonday(lastWeek.week_start) !== weekStart) return undefined;
  return {
    goal: j.goal,
    title: v.title,
    time_of_day: timeOfDay,
    steps: j.steps.map((s) => ({ times_per_week: s.timesPerWeek, minutes: s.minutes })),
    last_week_step: lastWeek.step,
    automatic: v.state.auto,
    weeks,
  };
}

const PART_NAMES: Record<TimeOfDay, string> = { any: "any time", morning: "mornings", afternoon: "afternoons", evening: "evenings" };

/** "This week: 2 × 30 min, evenings." for the coach's proposal. */
export function proposalLabel(v: JourneyView, c: CheckinResponse, lastWeekStep: number): string {
  const step = v.journey.steps[stepAfter(lastWeekStep, c.decision, v.journey.steps.length)];
  const when = c.time_of_day === "keep" ? "" : `, ${PART_NAMES[c.time_of_day]}`;
  return step ? `This week: ${stepLabel(step)}${when}.` : "";
}
