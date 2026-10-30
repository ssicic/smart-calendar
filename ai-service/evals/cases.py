"""Eval cases for "Plan my week": a test week, a wish, and checks on the result.

Every case also gets the general checks in run.py (proposals valid, at most 5,
a summary). The checks here look at the week *after* applying the proposals.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from app.calendar_tools import DAY, Block, Item, WeekSnapshot, Window

H = 60
MON, TUE, WED, THU, FRI, SAT, SUN = range(7)


def at(day: int, hh: float) -> int:
    return day * DAY + int(hh * H)


def work_week() -> list[Block]:
    return [Block(id=f"work{d}", title="Work", kind="fixed", start=at(d, 9), end=at(d, 17)) for d in range(5)]


def session(id: str, item: str, title: str, day: int, hh: float, minutes: int, movable: bool = True) -> Block:
    return Block(id=id, title=title, kind="flexible", start=at(day, hh), end=at(day, hh) + minutes, movable=movable, item_id=item)


GYM = Item(item_id="gym", title="Gym", duration_min=60, times_per_week=3, importance="high", time_of_day="any")
SPANISH = Item(item_id="es", title="Spanish", duration_min=45, times_per_week=2, importance="medium", time_of_day="any")
READ = Item(item_id="read", title="Read", duration_min=30, times_per_week=3, importance="low", time_of_day="evening")


def snapshot(blocks: list[Block], items: list[Item], now: int = 0) -> WeekSnapshot:
    return WeekSnapshot(
        week_start="2026-11-02", now=now, blocks=blocks, windows=[Window(start=7 * H, end=23 * H)] * 7, items=items
    )


# ---- Checks on the week after the proposals ----

Week = list[Block]
Check = Callable[[Week, list], tuple[bool, str]]


def flexible_on(week: Week, day: int, after_hh: float = 0, before_hh: float = 24) -> list[Block]:
    return [b for b in week if b.kind == "flexible" and at(day, after_hh) < b.end and b.start < at(day, before_hh)]


def no_flexible(day: int, after_hh: float = 0, before_hh: float = 24, label: str = "") -> Check:
    def check(week: Week, _proposals) -> tuple[bool, str]:
        left = flexible_on(week, day, after_hh, before_hh)
        return not left, f"{label or 'cleared'}: {len(left)} session(s) left"

    return check


def at_most_proposals(n: int) -> Check:
    return lambda _w, ps: (len(ps) <= n, f"{len(ps)} proposal(s), want ≤ {n}")


def at_least_proposals(n: int) -> Check:
    return lambda _w, ps: (len(ps) >= n, f"{len(ps)} proposal(s), want ≥ {n}")


def item_in_part(item: str, lo_hh: float, hi_hh: float, label: str) -> Check:
    def check(week: Week, _proposals) -> tuple[bool, str]:
        sessions = [b for b in week if b.item_id == item]
        outside = [b for b in sessions if not (lo_hh * H <= b.start % DAY and b.end % DAY <= hi_hh * H)]
        return not outside, f"{label}: {len(sessions) - len(outside)}/{len(sessions)}"

    return check


def one_per_day(item: str) -> Check:
    def check(week: Week, _proposals) -> tuple[bool, str]:
        days = [b.start // DAY for b in week if b.item_id == item]
        doubled = len(days) - len(set(days))
        return doubled == 0, f"{doubled} day(s) with two {item} sessions"

    return check


def keeps_sessions(minimum: int) -> Check:
    """Clearing a day should move sessions, not drop them all."""

    def check(week: Week, _proposals) -> tuple[bool, str]:
        n = sum(1 for b in week if b.kind == "flexible")
        return n >= minimum, f"{n} flexible sessions kept, want ≥ {minimum}"

    return check


@dataclass
class Case:
    name: str
    wish: str
    week: WeekSnapshot
    checks: list[Check] = field(default_factory=list)


def cases() -> list[Case]:
    gym3 = [session("g1", "gym", "Gym", MON, 18, 60), session("g2", "gym", "Gym", WED, 18, 60), session("g3", "gym", "Gym", FRI, 18, 60)]
    es2 = [session("s1", "es", "Spanish", TUE, 19, 45), session("s2", "es", "Spanish", FRI, 19.5, 45)]
    calm = snapshot(work_week() + gym3 + es2, [GYM, SPANISH])
    return [
        Case("fine week, no wish", "", calm, [at_most_proposals(1)]),
        Case(
            "keep Friday evening free",
            "Keep Friday evening free, I'm seeing friends",
            calm,
            [no_flexible(FRI, 17, 24, "Fri evening"), keeps_sessions(4), at_least_proposals(1)],
        ),
        Case(
            "gym in the mornings",
            "I'd rather do gym in the mornings before work",
            calm,
            [item_in_part("gym", 5, 9, "gym before 9"), at_least_proposals(2)],
        ),
        Case(
            "sick on Wednesday",
            "I'm sick on Wednesday, nothing that day please",
            calm,
            [no_flexible(WED, label="Wednesday"), keeps_sessions(4)],
        ),
        Case(
            "free Saturday",
            "Keep Saturday completely free",
            snapshot(work_week() + [session("g1", "gym", "Gym", SAT, 10, 60), session("r1", "read", "Read", SAT, 20, 30)] + es2, [GYM, SPANISH, READ]),
            [no_flexible(SAT, label="Saturday"), keeps_sessions(3)],
        ),
        Case(
            "two gyms on one day",
            "",
            snapshot(
                work_week() + [session("g1", "gym", "Gym", TUE, 7, 60), session("g2", "gym", "Gym", TUE, 18, 60), session("g3", "gym", "Gym", THU, 18, 60)],
                [GYM],
            ),
            [one_per_day("gym")],
        ),
        Case(
            "packed Thursday",
            "Thursday evening is too packed, spread it out",
            snapshot(
                work_week()
                + [
                    session("g1", "gym", "Gym", THU, 17.5, 60),
                    session("s1", "es", "Spanish", THU, 18.75, 45),
                    session("r1", "read", "Read", THU, 19.75, 30),
                ],
                [GYM, SPANISH, READ],
            ),
            [lambda w, _p: (len(flexible_on(w, THU, 17)) <= 1, f"{len(flexible_on(w, THU, 17))} left on Thu evening, want ≤ 1"), keeps_sessions(3)],
        ),
        Case(
            "locked sessions stay",
            "Move my gym on Monday to Tuesday",
            snapshot(work_week() + [session("g1", "gym", "Gym", MON, 18, 60, movable=False)], [GYM]),
            [at_most_proposals(0)],
        ),
        Case(
            "half the week is over",
            "Keep Monday evening free",
            snapshot(work_week() + gym3, [GYM], now=at(THU, 12)),
            [at_most_proposals(0)],  # Monday is in the past: nothing to do
        ),
        Case(
            "reading in the evening",
            "",
            snapshot(work_week() + [session("r1", "read", "Read", MON, 7, 30), session("r2", "read", "Read", WED, 20, 30)], [READ]),
            [item_in_part("read", 17, 24, "reading in the evening")],
        ),
    ]
