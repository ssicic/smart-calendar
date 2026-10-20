// Routines (Morning routine, Night routine…): checklist rules and progress.
// Pure, no React.
import type { RoutineStep } from "../db/weekStore";

/** The steps typed in the editor: trimmed, empty lines dropped, each with an id (kept when it had one). */
export function cleanSteps(steps: { id?: string; text: string }[], newId: () => string): RoutineStep[] {
  return steps
    .map((s) => ({ id: s.id ?? newId(), text: s.text.trim() }))
    .filter((s) => s.text.length > 0);
}

/** Why this routine can't be saved, or undefined if it's fine. `selfId`: the routine being edited. */
export function routineProblem(
  name: string,
  steps: RoutineStep[],
  existing: { id: string; name: string }[],
  selfId?: string,
): string | undefined {
  const clean = name.trim();
  if (!clean) return "Give the routine a name.";
  if (steps.length === 0) return "Add at least one step.";
  const same = existing.find((r) => r.id !== selfId && r.name.trim().toLowerCase() === clean.toLowerCase());
  return same ? `You already have ${same.name}.` : undefined;
}

/** Key for one ticked step of one routine event (in the week on screen). */
export const checkKey = (eventId: string, stepId: string) => `${eventId}:${stepId}`;

/** How many of the routine's steps are ticked for this event. */
export function progress(steps: RoutineStep[], checks: Set<string>, eventId: string): { done: number; total: number } {
  return { done: steps.filter((s) => checks.has(checkKey(eventId, s.id))).length, total: steps.length };
}

/** "2/5" while going, "✓" when every step is ticked. */
export function progressLabel(p: { done: number; total: number }): string {
  return p.total > 0 && p.done === p.total ? "✓" : `${p.done}/${p.total}`;
}
