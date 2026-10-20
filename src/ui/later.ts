// Rules for the "Later" list (pure, no React, no database).
import { WEEK } from "../engine";
import type { ActionId } from "./itemActions";

/** "Move to queue" asks where to: the two choices, in the order shown. */
export const QUEUE_CHOICES: { id: Extract<ActionId, "queue" | "later">; label: string }[] = [
  { id: "queue", label: "Next week" },
  { id: "later", label: "Later" },
];

/** "Later (3)", or just "Later" when it's empty. */
export function laterHeading(count: number): string {
  return count > 0 ? `Later (${count})` : "Later";
}

/**
 * Only a week that still has time to plan can take a session from Later.
 * `earliestStart` is plannableFrom(): WEEK for a past week (nothing left).
 */
export function canAddFromLater(earliestStart: number): boolean {
  return earliestStart < WEEK;
}
