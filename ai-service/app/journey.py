"""Journeys: turns a goal ("get back to the gym") into a few weekly steps that
build up slowly. The app stores the steps and moves up a step after a week
that hit its target (see src/engine/journey.ts); the model only drafts them,
and the user can edit them before starting.
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field


class JourneyRequest(BaseModel):
    goal: str = Field(min_length=2, max_length=200)
    # Awake time this week with nothing planned, so the last step fits a real week.
    free_hours_per_week: float = Field(ge=0, le=168)


class JourneyStepOut(BaseModel):
    times_per_week: int
    minutes: int
    note: str  # a few words for the step, e.g. "Just show up"


class JourneyPlan(BaseModel):
    title: str  # what shows on the calendar, e.g. "Gym"
    time_of_day: Literal["any", "morning", "afternoon", "evening"]
    steps: list[JourneyStepOut]
    why: str  # one sentence on how the steps build up


SYSTEM_PROMPT = """You plan a "journey" for someone with ADHD who uses a planning app: a few \
weekly steps that build up to a goal, starting so small it's hard to fail.

Each step is one week (or more: a week that misses its target repeats the step). A step is \
how many sessions that week and how long each is. The app puts the sessions into free time.

Rules:
- 3 to 6 steps. The first step is tiny: once or twice a week, short (10-30 minutes).
- Grow one thing at a time: either more sessions or longer ones, never a big jump.
- The last step is a normal, sustainable amount for this goal, not a heroic one, and it must \
fit easily in the free time given (at most a third of it).
- times_per_week 1-7, minutes 5-180 in steps of 5.
- note: up to 6 words for that week, encouraging, concrete ("Just show up", "Add 15 minutes").
- title: 1-3 words for the calendar ("Gym", "Spanish", "Evening walk").
- time_of_day: only if the goal says or clearly implies one, else "any".
- why: one plain sentence on how the steps build up.

If the goal isn't something you do in sessions (e.g. "be happier"), pick the closest concrete \
habit that helps with it and say so in why. Plain words. No medical advice."""


def build_user_message(req: JourneyRequest) -> str:
    return "Facts (JSON):\n" + json.dumps(req.model_dump(), ensure_ascii=False)


def clean(plan: JourneyPlan) -> JourneyPlan:
    """Numbers in range, 1-6 steps, short text: the app checks again anyway."""
    steps = [
        JourneyStepOut(
            times_per_week=min(7, max(1, s.times_per_week)),
            minutes=min(180, max(5, round(s.minutes / 5) * 5)),
            note=s.note.strip()[:80],
        )
        for s in plan.steps[:6]
    ]
    if not steps:
        steps = [JourneyStepOut(times_per_week=1, minutes=20, note="Just start")]
    return JourneyPlan(title=plan.title.strip()[:40] or "Journey", time_of_day=plan.time_of_day, steps=steps, why=plan.why.strip())
