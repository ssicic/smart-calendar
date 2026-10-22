// Turns what the user typed in the quick-add form into engine objects.
// Pure (no React), so the parsing and validation rules are easy to test.
import { DAY, type FixedEvent, type FlexibleItem, type Interval } from "../engine";
import { clock } from "./weekRows";

export type AddKind = "flexible" | "fixed" | "routine";
export type TimeOfDay = "any" | "morning" | "afternoon" | "evening";
export type Importance = "low" | "medium" | "high";

/** Raw form values. Everything the user types arrives as a string. */
export interface QuickAddForm {
  kind: AddKind;
  title: string;
  // Flexible item
  durationMin: string;
  timesPerWeek: string;
  timeOfDay: TimeOfDay;
  importance: Importance;
  // Fixed event / rest block
  days: number[]; // 0 = Monday
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  /** Off: only the week on screen. On: every week. */
  repeat: boolean;
  /** Optional activity group (Work, Health…); null = none. */
  categoryId: string | null;
  /** Routine: which saved checklist it follows. */
  routineId: string | null;
}

export const EMPTY_FORM: QuickAddForm = {
  kind: "flexible",
  title: "",
  durationMin: "60",
  timesPerWeek: "3",
  timeOfDay: "any",
  importance: "medium",
  days: [],
  startTime: "09:00",
  endTime: "10:00",
  repeat: false,
  categoryId: null,
  routineId: null,
};

/** Daily windows (minutes-of-day) behind each time-of-day choice. */
export const TIME_OF_DAY_WINDOWS: Record<TimeOfDay, Interval | undefined> = {
  any: undefined,
  morning: { start: 8 * 60, end: 12 * 60 },
  afternoon: { start: 12 * 60, end: 17 * 60 },
  evening: { start: 17 * 60, end: 22 * 60 },
};

export const IMPORTANCE_PRIORITY: Record<Importance, number> = { low: 1, medium: 3, high: 5 };

/** Discriminated union: check `ok` first, then TypeScript knows which fields exist. */
export type ParseResult =
  | { ok: true; kind: "flexible"; item: FlexibleItem; repeat: boolean }
  | { ok: true; kind: "fixed"; events: FixedEvent[]; repeat: boolean }
  | { ok: true; kind: "routine"; events: FixedEvent[]; repeat: boolean }
  | { ok: false; error: string };

/** "9:30" or "09:30" -> 570 minutes. "24:00" is allowed as an end time. */
export function parseTime(text: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return undefined;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return undefined;
  return hours * 60 + minutes;
}

function parseWholeNumber(text: string): number | undefined {
  return /^\d+$/.test(text.trim()) ? Number(text) : undefined;
}

export function parseQuickAdd(form: QuickAddForm, newId: () => string): ParseResult {
  const title = form.title.trim();
  if (!title) return { ok: false, error: "Give it a name." };
  const group = form.categoryId ? { categoryId: form.categoryId } : {};

  if (form.kind === "flexible") {
    const durationMin = parseWholeNumber(form.durationMin);
    if (!durationMin || durationMin < 5 || durationMin > 12 * 60)
      return { ok: false, error: "Duration must be between 5 and 720 minutes." };
    const timesPerWeek = parseWholeNumber(form.timesPerWeek);
    if (!timesPerWeek || timesPerWeek > 14) return { ok: false, error: "Times per week must be between 1 and 14." };
    const window = TIME_OF_DAY_WINDOWS[form.timeOfDay];
    const item: FlexibleItem = {
      id: newId(),
      title,
      durationMin,
      timesPerWeek,
      priority: IMPORTANCE_PRIORITY[form.importance],
      ...(window ? { preferredWindows: [window] } : {}),
      ...group,
    };
    return { ok: true, kind: "flexible", item, repeat: form.repeat };
  }

  if (form.kind === "routine" && !form.routineId) return { ok: false, error: "Pick a routine, or make a new one." };
  if (form.days.length === 0) return { ok: false, error: "Pick at least one day." };
  const start = parseTime(form.startTime);
  const end = parseTime(form.endTime);
  if (start === undefined || end === undefined) return { ok: false, error: "Use times like 09:00." };
  if (end <= start) return { ok: false, error: "End time must be after start time." };

  // One event per selected day, e.g. "Work, Mon-Fri, 09:00-17:00" -> 5 events.
  const events = [...form.days]
    .sort((a, b) => a - b)
    .map((d) => ({ id: newId(), title, start: d * DAY + start, end: d * DAY + end, ...group }));
  const repeat = form.repeat;
  if (form.kind === "routine" && form.routineId) {
    const routineId = form.routineId;
    return { ok: true, kind: "routine", events: events.map((e) => ({ ...e, routineId })), repeat };
  }
  return { ok: true, kind: "fixed", events, repeat };
}

/**
 * The form after holding an empty spot on the calendar: a Fixed event on that
 * day, starting at the held time and lasting an hour. Like the time pickers,
 * it stays inside the day (ends by 23:45).
 */
export function formForSlot(day: number, minuteOfDay: number): QuickAddForm {
  const start = Math.min(minuteOfDay, DAY - 60);
  const end = Math.min(start + 60, DAY - 15);
  return { ...EMPTY_FORM, kind: "fixed", days: [day], startTime: clock(start), endTime: clock(end) };
}
