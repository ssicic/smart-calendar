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

/**
 * The week's dates the short European way: "2. – 8.11." within a month,
 * "26.10. – 1.11." across two months.
 */
export function weekRange(weekStart: string): string {
  const first = fromKey(weekStart);
  const last = fromKey(weekStart);
  last.setDate(last.getDate() + 6);
  const end = `${last.getDate()}.${last.getMonth() + 1}.`;
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()}. – ${end}`
    : `${first.getDate()}.${first.getMonth() + 1}. – ${end}`;
}

/** "20 Oct" for day `dayIndex` (0 = Monday) of the week. */
export function shortDate(weekStart: string, dayIndex: number): string {
  const d = fromKey(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ---- Months and years (for the Month and Year views) ----

/** A calendar month. `month` is 0-11, like JavaScript's Date. */
export interface Month {
  year: number;
  month: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "October 2026". */
export const monthTitle = (m: Month) => `${MONTH_NAMES[m.month]} ${m.year}`;
/** "Oct". */
export const monthShort = (month: number) => MONTHS[month] ?? "";

/** The date of day `dayIndex` (0 = Monday) of the week, as "YYYY-MM-DD". */
export function dayKey(weekStart: string, dayIndex: number): string {
  const d = fromKey(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return toKey(d);
}

/** Today (or any moment) as "YYYY-MM-DD". */
export const dateKey = (now: Date) => toKey(now);

/** The month `n` months after `m` (negative goes back). */
export function addMonths(m: Month, n: number): Month {
  const total = m.year * 12 + m.month + n;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** The month a week belongs to: the month of its Thursday (most of its days). */
export function monthOfWeek(weekStart: string): Month {
  const d = fromKey(weekStart);
  d.setDate(d.getDate() + 3);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** One cell of the month grid. */
export interface MonthCell {
  key: string; // "YYYY-MM-DD"
  dayOfMonth: number;
  /** False for the grey days of the previous/next month that fill the first and last row. */
  inMonth: boolean;
}

/** The weeks (rows, Monday first) that cover the month, with 7 cells each. */
export function monthGrid(m: Month): { weekStart: string; days: MonthCell[] }[] {
  const rows: { weekStart: string; days: MonthCell[] }[] = [];
  let weekStart = weekStartOf(new Date(m.year, m.month, 1));
  for (;;) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = fromKey(weekStart);
      d.setDate(d.getDate() + i);
      return { key: toKey(d), dayOfMonth: d.getDate(), inMonth: d.getMonth() === m.month };
    });
    if (!days.some((c) => c.inMonth)) break;
    rows.push({ weekStart, days });
    weekStart = addWeeks(weekStart, 1);
  }
  return rows;
}

/** Every week (its Monday) that has at least one day in `year`. */
export function weeksOfYear(year: number): string[] {
  const weeks = new Set<string>();
  for (let month = 0; month < 12; month++) {
    for (const row of monthGrid({ year, month })) weeks.add(row.weekStart);
  }
  return [...weeks];
}

/** How many weeks `to` is after `from` (both Mondays; negative if before). */
export function weeksBetween(from: string, to: string): number {
  return Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / (7 * 86_400_000));
}

/**
 * Where suggestions may start in `weekStart`, as a week-minute (the planner's
 * earliestStart): the whole week if it's in the future, from today's midnight
 * if it's this week (so today stays usable and nothing jumps as the clock
 * moves), and none of it if the week is over.
 */
export function plannableFrom(weekStart: string, now: Date): number {
  const thisWeek = weekStartOf(now);
  if (weekStart > thisWeek) return 0; // "YYYY-MM-DD" strings sort like dates
  if (weekStart < thisWeek) return 7 * 24 * 60;
  return ((now.getDay() + 6) % 7) * 24 * 60;
}

/** plannableFrom() with today given as "YYYY-MM-DD" (for code that keeps today as a key). */
export const plannableFromKey = (weekStart: string, todayKey: string) => plannableFrom(weekStart, fromKey(todayKey));

/** "21.10." for day `dayIndex` (0 = Monday) of the week. */
export function dayDate(weekStart: string, dayIndex: number): string {
  const d = fromKey(weekStart);
  d.setDate(d.getDate() + dayIndex);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/** The day `n` days after (week, day), moving into the next or previous week when needed. */
export function stepDay(weekStart: string, day: number, n: number): { weekStart: string; day: number } {
  const total = day + n;
  const weeks = Math.floor(total / 7);
  return { weekStart: addWeeks(weekStart, weeks), day: total - weeks * 7 };
}
