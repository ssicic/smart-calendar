"""Calendar tools: the only way the agent (and the MCP server) touch a week.

Everything here is plain Python over a snapshot of one week, with no LLM.
Times are minutes since Monday 00:00 of that week, like the app's engine
(`[0, 10080)`, half-open intervals). Proposals are checked here, so the model
can't suggest a clash, a slot while asleep or a time in the past: a bad
proposal comes back as an error message the model can read and fix.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

DAY = 1440
MAX_PROPOSALS = 5  # small changes, not a new week
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
PARTS = {"morning": (300, 720), "afternoon": (720, 1020), "evening": (1020, 1440)}

# ---- The snapshot the app sends ----


class Block(BaseModel):
    id: str
    title: str
    kind: Literal["fixed", "routine", "flexible"]
    start: int  # week-minute
    end: int
    # Only flexible sessions that aren't locked or done can be moved or skipped.
    movable: bool = False
    item_id: Optional[str] = None


class Window(BaseModel):
    """Awake time on one day, minutes since that day's midnight."""

    start: int = Field(ge=0, le=DAY)
    end: int = Field(ge=0, le=DAY)


class Item(BaseModel):
    item_id: str
    title: str
    duration_min: int
    times_per_week: int
    importance: Literal["low", "medium", "high"]
    time_of_day: Literal["any", "morning", "afternoon", "evening"]


class WeekSnapshot(BaseModel):
    week_start: str  # Monday, "YYYY-MM-DD"
    now: int = 0  # week-minute; nothing can be planned before it
    blocks: list[Block] = Field(max_length=300)
    windows: list[Window] = Field(min_length=7, max_length=7)
    items: list[Item] = Field(default_factory=list, max_length=60)
    buffer_min: int = 15
    groups: list[str] = Field(default_factory=list, max_length=40)  # activity group names (Work, Health…)


class Proposal(BaseModel):
    type: Literal["move", "skip", "add"]
    session_id: str = ""  # move and skip
    title: str
    from_start: int = 0  # where it was (week-minute), to find it again if ids change
    from_label: str = ""  # "Fri 18:00–19:00"
    to_label: Optional[str] = None  # moves: "Sat 10:00–11:00"; adds: "Mon–Fri 09:00–13:00"
    start: Optional[int] = None  # new week-minutes, moves only
    end: Optional[int] = None
    reason: str
    # Adds only: a fixed event on these days (0 = Mon) at these minutes of the day.
    days: list[int] = Field(default_factory=list)
    day_start: Optional[int] = None
    day_end: Optional[int] = None
    repeat_weekly: bool = False
    group: Optional[str] = None
    warning: Optional[str] = None  # e.g. what it overlaps; shown on the card


# ---- Formatting ----


def clock(minute: int) -> str:
    m = minute % DAY
    return f"{m // 60:02d}:{m % 60:02d}"


def span(start: int, end: int) -> str:
    return f"{DAYS[start // DAY]} {clock(start)}–{clock(end)}"


def parse_day(day: str) -> Optional[int]:
    d = day.strip()[:3].title()
    return DAYS.index(d) if d in DAYS else None


def days_label(days: list[int]) -> str:
    """[0, 1, 2, 3, 4] → "Mon–Fri", [0, 2] → "Mon, Wed"."""
    if len(days) > 2 and days == list(range(days[0], days[-1] + 1)):
        return f"{DAYS[days[0]]}–{DAYS[days[-1]]}"
    return ", ".join(DAYS[d] for d in days)


def parse_time(text: str) -> Optional[int]:
    try:
        h, m = text.strip().split(":")
        minute = int(h) * 60 + int(m)
    except ValueError:
        return None
    return minute if 0 <= minute < DAY else None


# ---- Interval math ----


def free_gaps(busy: list[tuple[int, int]], lo: int, hi: int) -> list[tuple[int, int]]:
    """The parts of [lo, hi) not covered by any busy interval."""
    gaps, cursor = [], lo
    for s, e in sorted(busy):
        if s > cursor:
            gaps.append((cursor, min(s, hi)))
        cursor = max(cursor, e)
        if cursor >= hi:
            break
    if cursor < hi:
        gaps.append((cursor, hi))
    return [(s, e) for s, e in gaps if e > s]


class WeekPlan:
    """One week plus the proposals made so far. Each accepted proposal changes
    the week here too, so later tool calls see the freed and taken time."""

    def __init__(self, snapshot: WeekSnapshot):
        self.snap = snapshot
        self.blocks = {b.id: b.model_copy() for b in snapshot.blocks}
        self.skipped: set[str] = set()
        self.proposals: list[Proposal] = []

    # -- helpers --

    def _active(self) -> list[Block]:
        return [b for b in self.blocks.values() if b.id not in self.skipped]

    def _window(self, day: int) -> tuple[int, int]:
        w = self.snap.windows[day]
        return day * DAY + w.start, day * DAY + w.end

    def _busy(self, ignore: Optional[str] = None) -> list[tuple[int, int]]:
        pad = self.snap.buffer_min
        return [(b.start - pad, b.end + pad) for b in self._active() if b.id != ignore]

    def _session(self, session_id: str) -> Block | str:
        b = self.blocks.get(session_id)
        if b is None or b.id in self.skipped:
            return f"No session with id {session_id}. Call get_week to see the ids."
        if not b.movable:
            return f"{b.title} ({span(b.start, b.end)}) can't be changed: only flexible sessions that aren't locked or done can."
        if b.start < self.snap.now:
            return f"{b.title} ({span(b.start, b.end)}) is in the past and can't be changed."
        return b

    # -- tools --

    def get_week(self) -> str:
        """The week, day by day: awake hours and every block with its id."""
        lines = [f"Week of {self.snap.week_start}. Now: {span(self.snap.now, self.snap.now)[:-6]}."]
        for d in range(7):
            ws, we = self._window(d)
            lines.append(f"\n{DAYS[d]} (awake {clock(ws)}–{clock(we) if we % DAY else '24:00'})")
            for b in sorted((b for b in self._active() if b.start // DAY == d), key=lambda b: b.start):
                tag = "past" if b.start < self.snap.now else "movable" if b.movable else b.kind
                lines.append(f"  {clock(b.start)}–{clock(b.end)} {b.title} [{tag}, id={b.id}]")
            # Point out what's easy to miss in a list: the same item twice in a day.
            titles = [b.title for b in self._active() if b.start // DAY == d and b.item_id]
            for t in sorted({t for t in titles if titles.count(t) > 1}):
                lines.append(f"  note: {titles.count(t)} {t} sessions on {DAYS[d]}")
        if self.snap.items:
            lines.append("\nFlexible items (what the sessions are for):")
            for i in self.snap.items:
                lines.append(
                    f"  {i.title}: {i.duration_min} min, {i.times_per_week}x a week, "
                    f"{i.importance} importance, prefers {i.time_of_day}"
                )
        if self.snap.groups:
            lines.append(f"\nGroups: {', '.join(self.snap.groups)}")
        return "\n".join(lines)

    def find_free_slots(self, day: str, min_minutes: int = 30, part_of_day: str = "any") -> str:
        """Free gaps on one day, at least `min_minutes` long (buffers included)."""
        d = parse_day(day)
        if d is None:
            return f"Unknown day {day!r}. Use one of {', '.join(DAYS)}."
        lo, hi = self._window(d)
        if part_of_day in PARTS:
            p0, p1 = PARTS[part_of_day]
            lo, hi = max(lo, d * DAY + p0), min(hi, d * DAY + p1)
        lo = max(lo, self.snap.now)
        gaps = [(s, e) for s, e in free_gaps(self._busy(), lo, hi) if e - s >= min_minutes]
        if not gaps:
            return f"No free gap of {min_minutes} min on {DAYS[d]}" + (f" ({part_of_day})." if part_of_day != "any" else ".")
        return "\n".join(f"{span(s, e)} ({e - s} min)" for s, e in gaps)

    def slot_problem(self, start: int, end: int, ignore: Optional[str] = None) -> Optional[str]:
        """Why [start, end) can't hold a block: asleep, in the past, or a clash."""
        d = start // DAY
        lo, hi = self._window(d)
        if start < lo or end > hi:
            return f"{span(start, end)} is outside awake hours ({clock(lo)}–{clock(hi) if hi % DAY else '24:00'})."
        if start < self.snap.now:
            return f"{span(start, end)} is in the past."
        pad = self.snap.buffer_min
        for o in self._active():
            if o.id != ignore and start < o.end + pad and o.start - pad < end:
                what = "Overlaps" if start < o.end and o.start < end else f"Too close to (needs {pad} min between)"
                return f"{what} {o.title} {span(o.start, o.end)}. Try find_free_slots."
        return None

    def check_move(self, session_id: str, day: str, start_time: str) -> tuple[Block, int, int] | str:
        """Why a move can't happen (a string), or the session and its new times."""
        b = self._session(session_id)
        if isinstance(b, str):
            return b
        d, t = parse_day(day), parse_time(start_time)
        if d is None or t is None:
            return "Use a day like 'Tue' and a time like '18:30'."
        start = d * DAY + t
        end = start + (b.end - b.start)
        if (start, end) == (b.start, b.end):
            return "That's where it already is."
        if problem := self.slot_problem(start, end, ignore=b.id):
            return problem
        return b, start, end

    def _full(self) -> Optional[str]:
        if len(self.proposals) >= MAX_PROPOSALS:
            return f"Not proposed: that's {MAX_PROPOSALS} changes already. Stop and write the summary."
        return None

    def propose_move(self, session_id: str, day: str, start_time: str, reason: str) -> str:
        if full := self._full():
            return full
        checked = self.check_move(session_id, day, start_time)
        if isinstance(checked, str):
            return "Not proposed: " + checked
        b, start, end = checked
        self.proposals.append(
            Proposal(
                type="move",
                session_id=b.id,
                title=b.title,
                from_start=b.start,
                from_label=span(b.start, b.end),
                to_label=span(start, end),
                start=start,
                end=end,
                reason=reason.strip()[:200],
            )
        )
        b.start, b.end = start, end
        return f"Proposed: {b.title} to {span(start, end)}."

    def propose_skip(self, session_id: str, reason: str) -> str:
        if full := self._full():
            return full
        b = self._session(session_id)
        if isinstance(b, str):
            return "Not proposed: " + b
        self.proposals.append(
            Proposal(
                type="skip",
                session_id=b.id,
                title=b.title,
                from_start=b.start,
                from_label=span(b.start, b.end),
                reason=reason.strip()[:200],
            )
        )
        self.skipped.add(b.id)
        return f"Proposed: skip {b.title} this week (it goes to next week)."

    def propose_add_event(
        self,
        title: str,
        days: list[str],
        start_time: str,
        end_time: str,
        repeat_weekly: bool,
        reason: str,
        group: str = "",
    ) -> str:
        if full := self._full():
            return full
        title = title.strip()[:60]
        if not title:
            return "Not proposed: the event needs a title."
        parsed = [parse_day(d) for d in days]
        if not parsed or None in parsed:
            return f"Not proposed: use days like {', '.join(DAYS)}."
        day_list = sorted(set(d for d in parsed if d is not None))
        start = parse_time(start_time)
        end = DAY if end_time.strip() == "24:00" else parse_time(end_time)
        if start is None or end is None:
            return "Not proposed: use times like '09:00'."
        if end <= start:
            return "Not proposed: the end time must be after the start time."
        if not repeat_weekly and all(d * DAY + end <= self.snap.now for d in day_list):
            return "Not proposed: those days are already over this week. Set repeat_weekly, or the person can add it next week."
        names = {g.lower(): g for g in self.snap.groups}
        group_name = names.get(group.strip().lower()) if group.strip() else None

        # Fixed events don't have to fit around anything, but say what they overlap.
        clashes = []
        for d in day_list:
            s0, e0 = d * DAY + start, d * DAY + end
            for o in self._active():
                if o.kind != "flexible" and s0 < o.end and o.start < e0:
                    clashes.append(f"{o.title} {span(o.start, o.end)}")
        label = f"{days_label(day_list)} {clock(start)}–{clock(end) if end < DAY else '24:00'}"
        self.proposals.append(
            Proposal(
                type="add",
                title=title,
                to_label=label + (", every week" if repeat_weekly else ", this week"),
                reason=reason.strip()[:200],
                days=day_list,
                day_start=start,
                day_end=end,
                repeat_weekly=repeat_weekly,
                group=group_name,
                warning=f"Overlaps {', '.join(clashes[:3])}" + (" and more" if len(clashes) > 3 else "") if clashes else None,
            )
        )
        # Later tool calls see the new time as taken.
        n = len(self.proposals)
        for d in day_list:
            bid = f"new{n}-{d}"
            self.blocks[bid] = Block(id=bid, title=title, kind="fixed", start=d * DAY + start, end=d * DAY + end)
        note = f" Note: it overlaps {', '.join(clashes[:3])}." if clashes else ""
        return f"Proposed: add {title}, {label}{' every week' if repeat_weekly else ''}.{note}"
