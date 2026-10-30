"""Tests for the brain dump endpoint, with a fake model."""

from app.brain_dump import BrainDumpPlan, Habit
from app.journey import JourneyStepOut
from app.llm import DemoLLM

from .test_review import FakeLLM, client_with

REQ = {
    "wishes": "learn to sew, study for new job, workout, read some books, art history",
    "free_hours_per_week": 40,
    "current": [{"title": "Spanish", "hours_per_week": 1.5}],
    "room_now": 2,
}
STEP = [JourneyStepOut(times_per_week=1, minutes=20, note="Start")]


def habit(title, group, **kw):
    return Habit(wishes=[title.lower()], title=title, time_of_day="any", steps=STEP, group=group, why="x", **kw)


def test_returns_the_plan_and_sends_the_facts():
    llm = FakeLLM(BrainDumpPlan(habits=[habit("Study", "now"), habit("Sewing", "later")], note=" A lot, but doable. "))
    body = client_with(llm).post("/brain-dump", json=REQ).json()
    assert [(h["title"], h["group"]) for h in body["habits"]] == [("Study", "now"), ("Sewing", "later")]
    assert body["note"] == "A lot, but doable."
    assert "learn to sew" in llm.calls[0] and "Spanish" in llm.calls[0]


def test_never_more_now_than_there_is_room_for():
    llm = FakeLLM(BrainDumpPlan(habits=[habit("A", "now"), habit("B", "now"), habit("C", "now")], note=""))
    body = client_with(llm).post("/brain-dump", json={**REQ, "room_now": 1}).json()
    assert [h["group"] for h in body["habits"]] == ["now", "next", "next"]


def test_keeps_steps_in_range_and_at_most_eight():
    wild = Habit(wishes=["x"], title="X", time_of_day="any", steps=[JourneyStepOut(times_per_week=20, minutes=999, note="")], group="later", why="")
    body = client_with(FakeLLM(BrainDumpPlan(habits=[wild] * 10, note=""))).post("/brain-dump", json=REQ).json()
    assert len(body["habits"]) == 8
    assert body["habits"][0]["steps"][0] == {"times_per_week": 7, "minutes": 180, "note": ""}


def test_demo_mode():
    body = client_with(DemoLLM()).post("/brain-dump", json=REQ).json()
    assert len(body["habits"]) == 5 and [h["group"] for h in body["habits"]][:3] == ["now", "now", "next"]
