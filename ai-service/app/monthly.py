"""Monthly summary: a short readout of wins, patterns and what slipped.

Read-only: unlike the weekly review it suggests no changes, so there is
nothing for the app to apply.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from .review import ItemNow, WeekFacts


class GoalFact(BaseModel):
    title: str
    horizon: Literal["year", "month"]
    done: bool


class MonthRequest(BaseModel):
    month: str  # "October 2026"
    month_over: bool  # False while the month is still running
    weeks: list[WeekFacts] = Field(min_length=1, max_length=6)  # newest first
    items: list[ItemNow]
    goals: list[GoalFact] = []


class MonthlySummary(BaseModel):
    headline: str  # one sentence
    wins: list[str]  # what went well, with numbers
    patterns: list[str]  # when and how things tend to happen
    slipped: list[str]  # what didn't happen, said kindly
    next_month_tip: str  # one small idea, or "" if none


SYSTEM_PROMPT = """You write a short monthly summary for someone with ADHD who uses a planning app.

The app plans "flexible items" (e.g. Gym 60 min, 3x a week) into free time. You get the \
month's weeks (newest first; per item: planned, done with day/time, queued, upcoming, not done), \
how each item is set up now, and the year and month goals with whether they're done. If the \
month isn't over, "upcoming" sessions are still ahead and are not missed.

Write:
- headline: one warm sentence about the month.
- wins: up to 3 things that went well, each one sentence with the numbers it rests on \
("Gym: 9 of 12 sessions, more than any other item."). Count finished goals as wins.
- patterns: up to 3 observations about when or how things happen, only if the data shows \
them ("Most sessions got done in the morning; 2 of 8 evening ones did.").
- slipped: up to 3 things that didn't happen, said kindly and without guilt, as facts plus \
a reason to be gentle ("Spanish: 2 of 8 sessions. It was a busy month."). Empty is fine.
- next_month_tip: one small, concrete idea for next month, or "" if nothing stands out.

Plain words, short sentences. Never scold. Do not invent numbers, items or reasons that \
are not in the data. With little data, say less."""


def build_user_message(req: MonthRequest) -> str:
    return "Facts (JSON):\n" + json.dumps(req.model_dump(), ensure_ascii=False, indent=1)


def clean(summary: MonthlySummary) -> MonthlySummary:
    """At most 3 per list, no empty lines."""

    def tidy(lines: list[str]) -> list[str]:
        return [line.strip() for line in lines if line.strip()][:3]

    return MonthlySummary(
        headline=summary.headline.strip(),
        wins=tidy(summary.wins),
        patterns=tidy(summary.patterns),
        slipped=tidy(summary.slipped),
        next_month_tip=summary.next_month_tip.strip(),
    )
