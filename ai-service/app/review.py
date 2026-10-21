"""Weekly review assistant: reads a few weeks of facts, returns 0-3 suggestions.

The model only *suggests*. Every suggestion carries a small, typed action
that the app applies itself (with its own checks) when the user taps Accept.
"""

from __future__ import annotations

import json
from typing import Literal, Optional

from pydantic import BaseModel, Field

# ---- What the app sends ----


class DoneSession(BaseModel):
    day: str  # "Mon".."Sun"
    time: str  # "07:30"
    part_of_day: Literal["morning", "afternoon", "evening"]


class ItemWeek(BaseModel):
    """One flexible item in one week."""

    item_id: str
    planned: int  # sessions it was meant to have that week
    done: list[DoneSession]
    queued: int  # sent to the queue ("not this week")
    upcoming: int = 0  # still ahead in the reviewed week, so not missed
    not_done: int  # planned - done - queued - upcoming


class WeekFacts(BaseModel):
    week_start: str  # Monday, "YYYY-MM-DD"
    planned_hours: float
    done_hours: float
    free_percent: int  # awake time with nothing planned
    items: list[ItemWeek]
    todos_done: int
    todos_total: int


class ItemNow(BaseModel):
    """A flexible item as it is set up today."""

    item_id: str
    title: str
    times_per_week: int
    duration_min: int
    importance: Literal["low", "medium", "high"]
    time_of_day: Literal["any", "morning", "afternoon", "evening"]
    group: Optional[str] = None


class ReviewRequest(BaseModel):
    """`weeks` is newest first; weeks[0] is the week being reviewed."""

    weeks: list[WeekFacts] = Field(min_length=1, max_length=8)
    items: list[ItemNow]


# ---- What the model returns (also the API response) ----


class Action(BaseModel):
    type: Literal["set_time_of_day", "set_times_per_week", "set_duration", "set_importance", "none"]
    item_id: Optional[str]
    time_of_day: Optional[Literal["any", "morning", "afternoon", "evening"]]
    times_per_week: Optional[int]
    duration_min: Optional[int]
    importance: Optional[Literal["low", "medium", "high"]]


class Suggestion(BaseModel):
    title: str  # short, fits on a button: "Move Gym to mornings"
    reason: str  # one sentence with the numbers it is based on
    action: Action


class WeeklyReview(BaseModel):
    summary: str  # 1-2 kind sentences about the week
    suggestions: list[Suggestion]


SYSTEM_PROMPT = """You help someone with ADHD review their week in a planning app.

The app plans "flexible items" (e.g. Gym 60 min, 3x a week) into free time. You get facts \
for the reviewed week and up to 7 earlier weeks (newest first), and how each item is set up now. \
If the reviewed week isn't over yet, "upcoming" sessions are still ahead: never count them as missed.

Write:
- summary: one or two warm, plain sentences about the reviewed week. Notice what went well. \
Never scold or use guilt; a quiet week is fine.
- suggestions: at most 3, only when the data shows a clear pattern. Zero is a good answer \
for a week that went fine or when there is too little data.

Each suggestion:
- title: a short button label in the imperative, under 40 characters ("Move Gym to mornings").
- reason: one sentence that cites the numbers it rests on ("You did 3 of 4 morning sessions \
but 0 of 5 evening ones over 3 weeks.").
- action: exactly one change to one item, using an item_id from the input:
  - set_time_of_day: when sessions get done at another part of day than the item's setting.
  - set_times_per_week: when the item is regularly not done; lower it by 1 or 2 at a time, \
never below 1. Raise it only if it is done every week and free time is above 20%.
  - set_duration: when shorter sessions would likely get done (e.g. 60 -> 30 min). 15-240 min.
  - set_importance: rarely; only with a clear reason.
  - none: a tip with no change (item_id null). Use sparingly.
  Set every field the action type does not use to null.

Prefer small, kind changes that make the plan easier to keep. Do not invent items, numbers \
or reasons that are not in the data."""


def build_user_message(req: ReviewRequest) -> str:
    return "Facts (JSON):\n" + json.dumps(req.model_dump(), ensure_ascii=False, indent=1)


def clean(review: WeeklyReview, req: ReviewRequest) -> WeeklyReview:
    """Drop suggestions the app couldn't apply: unknown items, out-of-range values, no-ops."""
    items = {i.item_id: i for i in req.items}
    kept: list[Suggestion] = []
    for s in review.suggestions:
        a = s.action
        item = items.get(a.item_id or "")
        ok = {
            "none": True,
            "set_time_of_day": item is not None and a.time_of_day is not None and a.time_of_day != item.time_of_day,
            "set_times_per_week": item is not None
            and a.times_per_week is not None
            and 1 <= a.times_per_week <= 14
            and a.times_per_week != item.times_per_week,
            "set_duration": item is not None
            and a.duration_min is not None
            and 15 <= a.duration_min <= 240
            and a.duration_min != item.duration_min,
            "set_importance": item is not None and a.importance is not None and a.importance != item.importance,
        }[a.type]
        if ok:
            kept.append(s)
    return WeeklyReview(summary=review.summary, suggestions=kept[:3])
