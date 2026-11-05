// "Ask your past weeks", part 1: every past week (and every saved month
// summary) becomes one short text document that search and the AI can read.
// Pure, no React and no database: the data comes from the same loading as the
// week review and Past weeks.
import { dayOf, type FlexibleItem } from "../engine";
import type { WeekItem } from "../db/weekItemsStore";
import type { MonthSummary } from "./aiReview";
import type { ReviewStats } from "./weekReview";
import { clock, isDone, type WeekRow } from "./weekRows";

/** One searchable document: a week ("week:2026-10-12") or a month summary ("month:2026-10"). */
export interface RagDoc {
  id: string;
  kind: "week" | "month";
  /** The week's Monday ("2026-10-12") or the month ("2026-10"). */
  key: string;
  /** Chip label: "Week of 12 Oct" or "October 2026". */
  title: string;
  text: string;
}

export interface WeekDocInput {
  weekStart: string;
  rows: WeekRow[];
  /** Flexible items as planned that week. */
  items: FlexibleItem[];
  stats: ReviewStats;
  /** To-dos and goals of the week. */
  todos: WeekItem[];
  /** "No alcohol: 5 of 7 days", one per habit. */
  habitLines: string[];
  groupName: (id: string | undefined) => string | null;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const hours = (min: number) => `${Math.round(min / 6) / 10}h`;

/** "12 Oct 2026" from "2026-10-12" (string math only, no Date). */
function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** The 7 dates of the week, "YYYY-MM-DD", without Date (UTC-free day counting). */
export function weekDays(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map(Number) as [number, number, number];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const out: string[] = [];
  let [yy, mm, dd] = [y, m, d];
  for (let i = 0; i < 7; i++) {
    out.push(`${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
    dd++;
    if (dd > (lengths[mm - 1] ?? 31)) {
      dd = 1;
      mm++;
      if (mm > 12) {
        mm = 1;
        yy++;
      }
    }
  }
  return out;
}

/** "Week of 12 Oct" (the chip). */
export function weekTitle(weekStart: string): string {
  const [, m, d] = weekStart.split("-").map(Number);
  return `Week of ${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/** A fixed event that starts within this long after a session ends counts as "right after" it. */
const BEFORE_GAP = 3 * 60;

/**
 * "before Work" when a fixed event starts soon after this session or routine
 * ends the same day. Questions like "gym before work?" then match words, not
 * just clock times that search can't compare.
 */
function beforeNote(r: WeekRow, day: WeekRow[]): string | null {
  if (r.kind === "fixed" || r.kind === "skipped") return null;
  const next = day.find((o) => o.kind === "fixed" && o.start >= r.end && o.start - r.end <= BEFORE_GAP);
  return next ? `before ${next.title}` : null;
}

function rowText(r: WeekRow, day: WeekRow[]): string {
  const time = `${clock(r.start)}-${clock(r.end)}`;
  const before = beforeNote(r, day);
  const notes = (status: string | null) => {
    const all = [status, before].filter(Boolean);
    return all.length ? ` (${all.join(", ")})` : "";
  };
  if (r.kind === "skipped") return `${r.title} ${time}${notes("moved to another week")}`;
  if (isDone(r)) return `${r.title} ${time}${notes("done")}`;
  const flexible = r.kind === "suggested" || r.kind === "kept" || r.kind === "locked";
  return `${r.title} ${time}${notes(flexible ? "planned, not marked done" : null)}`;
}

/** The week as a few lines of plain text: totals, each day, sessions, to-dos, habits, groups. */
export function weekDoc(w: WeekDocInput): RagDoc {
  const dates = weekDays(w.weekStart);
  const lines = [
    `Week of ${longDate(w.weekStart)} (Mon ${longDate(dates[0]!)} to Sun ${longDate(dates[6]!)})`,
    `Planned ${hours(w.stats.plannedMin)}, done ${hours(w.stats.doneMin)}, free time ${w.stats.freePercent}%.`,
  ];

  for (let d = 0; d < 7; d++) {
    const day = w.rows.filter((r) => dayOf(r.start) === d).sort((a, b) => a.start - b.start);
    const [, m, dd] = dates[d]!.split("-").map(Number);
    const label = `${DAYS[d]} ${dd} ${MONTHS[(m ?? 1) - 1]}`;
    lines.push(`${label}: ${day.length ? day.map((r) => rowText(r, day)).join("; ") : "nothing planned"}.`);
  }

  const sessions = w.items.map((item) => {
    const mine = w.rows.filter((r) => r.itemId === item.id);
    const done = mine.filter((r) => r.kind === "done").length;
    const moved = mine.filter((r) => r.kind === "skipped").length;
    const group = w.groupName(item.categoryId);
    return `${item.title}${group ? ` (${group})` : ""} ${done} of ${item.timesPerWeek} done${moved ? `, ${moved} moved on` : ""}`;
  });
  if (sessions.length) lines.push(`Flexible sessions: ${sessions.join("; ")}.`);

  const todos = w.todos.filter((t) => t.kind === "todo");
  const done = todos.filter((t) => t.done).map((t) => t.title);
  const open = todos.filter((t) => !t.done).map((t) => t.title);
  if (todos.length) {
    lines.push(
      `To-dos: ${done.length} of ${todos.length} done.` +
        (done.length ? ` Done: ${done.join(", ")}.` : "") +
        (open.length ? ` Not done: ${open.join(", ")}.` : ""),
    );
  }
  const goals = w.todos.filter((t) => t.kind === "goal");
  if (goals.length) lines.push(`Week goals: ${goals.map((g) => `${g.title} ${g.progress} of ${g.target}`).join("; ")}.`);
  if (w.habitLines.length) lines.push(`Habits: ${w.habitLines.join("; ")}.`);

  const groups = w.stats.groups.filter((g) => g.minutes > 0).map((g) => `${g.name} ${hours(g.minutes)}`);
  if (groups.length) lines.push(`Time by group: ${groups.join(", ")}.`);

  return { id: `week:${w.weekStart}`, kind: "week", key: w.weekStart, title: weekTitle(w.weekStart), text: lines.join("\n") };
}

/** A saved month summary ("month_summary:2026-10") as a document. */
export function monthDoc(month: string, s: MonthSummary): RagDoc {
  const [y, m] = month.split("-").map(Number);
  const title = `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
  const lines = [`Month summary for ${title}`, s.headline];
  if (s.wins.length) lines.push(`Wins: ${s.wins.join(" ")}`);
  if (s.patterns.length) lines.push(`Patterns: ${s.patterns.join(" ")}`);
  if (s.slipped.length) lines.push(`Slipped: ${s.slipped.join(" ")}`);
  if (s.next_month_tip) lines.push(`Tip for next month: ${s.next_month_tip}`);
  return { id: `month:${month}`, kind: "month", key: month, title, text: lines.join("\n") };
}

/**
 * A short fingerprint of a text (FNV-1a, 32 bit). Stored next to a week's
 * embedding: when the week's text changes, so does the hash, and only then is
 * the week embedded again.
 */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + text.length.toString(16);
}

/** Docs whose saved embedding is missing, made from an older text, or from another model. */
export function needsEmbedding(
  docs: RagDoc[],
  stored: Map<string, { hash: string; model: string }>,
  model: string,
): RagDoc[] {
  return docs.filter((d) => {
    const s = stored.get(d.id);
    return !s || s.model !== model || s.hash !== textHash(d.text);
  });
}

/** True when a week has nothing stored at all (no blocks, no to-dos, no habit ticks): not worth a document. */
export const emptyWeek = (w: Pick<WeekDocInput, "rows" | "todos" | "habitLines">) =>
  w.rows.length === 0 && w.todos.length === 0 && w.habitLines.length === 0;
