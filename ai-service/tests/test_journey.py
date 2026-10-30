"""Tests for the journey endpoint, with a fake model."""

from app.journey import JourneyPlan, JourneyStepOut
from app.llm import DemoLLM

from .test_review import FakeLLM, client_with

REQ = {"goal": "Get back to the gym", "free_hours_per_week": 30}


def plan(**changes):
    base = {
        "title": "Gym",
        "time_of_day": "evening",
        "steps": [JourneyStepOut(times_per_week=1, minutes=30, note="Just show up")],
        "why": "Start small.",
    }
    return JourneyPlan(**{**base, **changes})


def test_returns_the_plan_and_sends_the_goal():
    llm = FakeLLM(plan())
    r = client_with(llm).post("/journey-plan", json=REQ)
    assert r.status_code == 200
    assert r.json()["steps"] == [{"times_per_week": 1, "minutes": 30, "note": "Just show up"}]
    assert "Get back to the gym" in llm.calls[0] and "30" in llm.calls[0]


def test_keeps_numbers_in_range():
    steps = [JourneyStepOut(times_per_week=t, minutes=m, note=" x ") for t, m in [(0, 3), (12, 500), (2, 47)]] * 3
    body = client_with(FakeLLM(plan(steps=steps, title="  "))).post("/journey-plan", json=REQ).json()
    assert len(body["steps"]) == 6
    assert [(s["times_per_week"], s["minutes"]) for s in body["steps"][:3]] == [(1, 5), (7, 180), (2, 45)]
    assert body["title"] == "Journey" and body["steps"][0]["note"] == "x"


def test_never_returns_no_steps():
    body = client_with(FakeLLM(plan(steps=[]))).post("/journey-plan", json=REQ).json()
    assert len(body["steps"]) == 1


def test_needs_a_goal():
    assert client_with(FakeLLM(plan())).post("/journey-plan", json={**REQ, "goal": ""}).status_code == 422


def test_demo_mode():
    body = client_with(DemoLLM()).post("/journey-plan", json=REQ).json()
    assert len(body["steps"]) == 4 and "Demo" in body["why"]
