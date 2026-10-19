// The only place that knows about real calendar dates. The engine works in
// minutes since Monday 00:00; this file maps that to an actual week.
// A week is identified by its Monday as "YYYY-MM-DD" (local time).

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1); // local midnight
}

/** Monday of the week containing `now`, e.g. "2026-10-19". */
export function weekStartOf(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (d.getDay() + 6) % 7; // getDay(): Sunday = 0
  d.setDate(d.getDate() - sinceMonday);
  return toKey(d);
}

/** The week `n` weeks after `weekStart` (negative goes back). */
export function addWeeks(weekStart: string, n: number): string {
  const d = fromKey(weekStart);
  d.setDate(d.getDate() + 7 * n);
  return toKey(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 Oct" for day `dayIndex` (0 = Monday) of the week. */
export function shortDate(weekStart: string, dayIndex: number): string {
  const d = fromKey(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
