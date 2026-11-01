"""Weekly coach check-in for a journey.

Looks at how the last few weeks actually went (what got done, on which days
and at what time, what got skipped) and proposes how this week starts: one
step up, the same step again, or one easier, and maybe another time of day.
The app shows it with a few kind sentences; the user accepts or keeps the
automatic plan. The model only proposes: the app stores the choice and
works out the step itself (src/engine/journey.ts).
"""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, Field

from .review import DoneSession

PartOfDay = Literal["any", "morning", "afternoon", "evening"]
Decision = Literal["up", "stay", "easier"]


class StepIn(BaseModel):
    times_per_week: int
    minutes: int


class JourneyWeekFacts(BaseModel):
    week_start: str
    step: int  # 1-based step that week
    target: int  # sessions the step asked for
    done: list[DoneSession]
    skipped: list[DoneSession]  # sessions the user marked "skip" (when they were planned)


class CheckinRequest(BaseModel):
    goal: str = Field(max_length=200)
    title: str = Field(max_length=60)
    time_of_day: PartOfDay  # what the sessions are set to now
    steps: list[StepIn] = Field(min_length=1, max_length=8)
    last_week_step: int  # 1-based
    automatic: Decision  # what the app does without a check-in: "up" if last week hit its target, else "stay"
    weeks: list[JourneyWeekFacts] = Field(min_length=1, max_length=6)  # newest first; weeks[0] = last week


class Checkin(BaseModel):
    decision: Decision
    time_of_day: Literal["keep", "any", "morning", "afternoon", "evening"]
    message: str  # 2-3 short sentences to the user


SYSTEM_PROMPT = """You are a kind, practical coach in a planning app for someone who tends to overcommit. \
They're on a "journey": weekly steps (sessions per week × minutes) that build up to a goal. \
It's the start of a new week. Decide how this week starts, based on what actually happened.

You get the steps, the step they were on last week, what the app would do automatically \
(up after a week that hit its target, otherwise the same step again), and the last weeks \
newest first: target, done sessions (day, time, part of day) and skipped ones.

Decide:
- decision: "up" (next step), "stay" (same step again) or "easier" (one step back).
  - Usually agree with the automatic choice. Differ only with a clear reason in the data:
    - "stay" despite a hit if it was scraped together (e.g. all sessions crammed into the \
last day or two), so the step isn't solid yet.
    - "easier" after 2+ weeks in a row clearly below target.
    - "up" despite a miss only if they did nearly all of it two weeks running.
  - Never "up" from the last step; never "easier" from step 1.
- time_of_day: if done sessions cluster in one part of the day and skipped ones in another \
(or the current setting), move to where they actually happen. Otherwise "keep".
- message: 2-3 short sentences to the user, warm and specific. Name one real fact from the \
data ("Both sessions were on weekday evenings"), then what you suggest for this week. It's a \
proposal the user accepts or not, so suggest ("How about evenings this week?"), never say \
you already changed something. No guilt, no \
streak talk, no exclamation-mark overload, no medical advice. Don't invent facts."""


def build_user_message(req: CheckinRequest) -> str:
    return "Facts (JSON):\n" + json.dumps(req.model_dump(), ensure_ascii=False)


def clean(c: Checkin, req: CheckinRequest) -> Checkin:
    """Keep the decision possible from where the journey is."""
    decision = c.decision
    if decision == "up" and req.last_week_step >= len(req.steps):
        decision = "stay"
    if decision == "easier" and req.last_week_step <= 1:
        decision = "stay"
    time = c.time_of_day if c.time_of_day != req.time_of_day else "keep"
    return Checkin(decision=decision, time_of_day=time, message=c.message.strip()[:400])
