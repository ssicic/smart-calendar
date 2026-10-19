// "Is something already there?" for the pickers. Pure, so it's easy to test.
import { dayOf, type Interval } from "../engine";
import { DAY_NAMES, clock, type WeekRow } from "./weekRows";

/** Rows that overlap any of `targets`. Queued (skipped) sessions don't take up time. */
export function overlapping(rows: WeekRow[], targets: Interval[], ignoreId?: string): WeekRow[] {
  return rows.filter(
    (r) =>
      r.id !== ignoreId &&
      r.kind !== "skipped" &&
      targets.some((t) => r.start < t.end && t.start < r.end), // half-open intervals overlap
  );
}

const KIND_WORD: Record<WeekRow["kind"], string> = {
  fixed: "fixed",
  rest: "rest",
  suggested: "suggested",
  kept: "placed",
  locked: "locked",
  done: "done",
  skipped: "queued",
};

/** "Mon Work 09:00–17:00 (fixed)" */
export function describeRow(r: WeekRow): string {
  const day = DAY_NAMES[dayOf(r.start)]?.slice(0, 3);
  return `${day} ${r.title} ${clock(r.start)}–${clock(r.end)} (${KIND_WORD[r.kind]})`;
}

/** At most `max` descriptions, then "and 2 more". Keeps warnings short. */
export function summarize(rows: WeekRow[], max = 3): string {
  const shown = rows.slice(0, max).map(describeRow).join(", ");
  return rows.length > max ? `${shown} and ${rows.length - max} more` : shown;
}
