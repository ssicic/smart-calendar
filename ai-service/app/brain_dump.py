"""Brain dump: "I want to learn to sew, study for the new job, work out, read
more, learn art history" → a few concrete habits, each with small weekly
steps, sorted into now / next / later.

The model turns wishes into habits and judges what matters first. It does
not decide what fits: the app checks the hours against the user's real free
time and enforces "at most 2 new things at once" itself (src/ui/brainDump.ts).
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from .journey import JourneyStepOut, clean as clean_journey, JourneyPlan

Group = Literal["now", "next", "later"]


class CurrentItem(BaseModel):
    title: str
    hours_per_week: float


class BrainDumpRequest(BaseModel):
    wishes: str = Field(min_length=2, max_length=1000)
    free_hours_per_week: float = Field(ge=0, le=168)  # awake time left after `current`
    current: list[CurrentItem] = Field(default=[], max_length=40)  # what's already planned every week
    room_now: int = Field(ge=0, le=2)  # how many new journeys may start now (the app's rule)


class Habit(BaseModel):
    wishes: list[str]  # the user's own words this covers (one, or more when merged)
    title: str  # for the calendar, 1-3 words
    time_of_day: Literal["any", "morning", "afternoon", "evening"]
    steps: list[JourneyStepOut]
    group: Group
    why: str  # one sentence: why this group, or how it was merged


class BrainDumpPlan(BaseModel):
    habits: list[Habit]
    note: str  # one or two sentences about the whole picture


SYSTEM_PROMPT = """You help someone turn a brain dump of wishes into a realistic plan \
in a planning app. They tend to start everything at once and then drop it all.

For each wish, make one concrete habit done in sessions (e.g. "learn to sew" → "Sewing"). \
Merge wishes when one habit can serve both (e.g. "read more" + "learn art history" → reading \
art history books) and list every wish it covers. Skip nothing the user wrote, but a wish \
that's already in "current" can be left out with a mention in note.

Each habit gets 3-6 weekly steps (sessions per week × minutes): the first step tiny (1-2 short \
sessions), growing one thing at a time to a sustainable amount. times_per_week 1-7, minutes \
5-180 in 5s, a note of up to 6 words per step. time_of_day only if the wish says or clearly \
implies one, else "any".

Sort into groups:
- "now": at most room_now habits. Prefer what has a deadline or real consequences (e.g. a new \
job), then what makes the others easier (exercise, sleep), then what they seem most excited about.
- "next": what starts when a "now" habit feels steady, best first.
- "later": the rest, especially big or fiddly hobbies that need set-up time.
free_hours_per_week is the awake time left after everything in "current". Together, the last \
steps of all habits should stay well under half of it; if they can't, keep the later ones \
smaller and say so in note.

why: one plain sentence per habit. note: one or two warm sentences on the overall picture, \
honest if it's a lot; don't mention "current" when it's empty. Plain words, no guilt, no medical advice."""


def build_user_message(req: BrainDumpRequest) -> str:
    return "Facts (JSON):\n" + json.dumps(req.model_dump(), ensure_ascii=False)


def clean(plan: BrainDumpPlan, req: BrainDumpRequest) -> BrainDumpPlan:
    """Steps in range, at most 8 habits, and never more "now" than there's room for."""
    habits: list[Habit] = []
    now = 0
    for h in plan.habits[:8]:
        j = clean_journey(JourneyPlan(title=h.title, time_of_day=h.time_of_day, steps=h.steps, why=h.why))
        group = h.group
        if group == "now":
            if now >= req.room_now:
                group = "next"
            else:
                now += 1
        habits.append(
            Habit(
                wishes=[w.strip() for w in h.wishes if w.strip()][:5],
                title=j.title,
                time_of_day=j.time_of_day,
                steps=j.steps,
                group=group,
                why=j.why,
            )
        )
    return BrainDumpPlan(habits=habits, note=plan.note.strip())
