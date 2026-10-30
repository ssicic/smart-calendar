"""Tests for the weekly coach check-in endpoint, with a fake model."""

from app.coach import Checkin
from app.llm import DemoLLM

from .test_review import FakeLLM, client_with

EVENING = {"day": "Tue", "time": "18:30", "part_of_day": "evening"}
REQ = {
    "goal": "Get back to the gym",
    "title": "Gym",
    "time_of_day": "morning",
    "steps": [{"times_per_week": 1, "minutes": 20}, {"times_per_week": 2, "minutes": 30}],
    "last_week_step": 1,
    "automatic": "up",
    "weeks": [{"week_start": "2026-11-02", "step": 1, "target": 1, "done": [EVENING], "skipped": []}],
}


def test_returns_the_check_in_and_sends_the_facts():
    llm = FakeLLM(Checkin(decision="up", time_of_day="evening", message=" Both were evenings. "))
    r = client_with(llm).post("/journey-checkin", json=REQ)
    assert r.json() == {"decision": "up", "time_of_day": "evening", "message": "Both were evenings."}
    assert "18:30" in llm.calls[0]


def test_never_goes_past_the_ends():
    up = FakeLLM(Checkin(decision="up", time_of_day="keep", message="x"))
    assert client_with(up).post("/journey-checkin", json={**REQ, "last_week_step": 2}).json()["decision"] == "stay"
    easier = FakeLLM(Checkin(decision="easier", time_of_day="keep", message="x"))
    assert client_with(easier).post("/journey-checkin", json=REQ).json()["decision"] == "stay"


def test_same_time_of_day_counts_as_keep():
    llm = FakeLLM(Checkin(decision="stay", time_of_day="morning", message="x"))
    assert client_with(llm).post("/journey-checkin", json=REQ).json()["time_of_day"] == "keep"


def test_needs_a_week():
    assert client_with(FakeLLM()).post("/journey-checkin", json={**REQ, "weeks": []}).status_code == 422


def test_demo_mode_agrees_with_the_app():
    body = client_with(DemoLLM()).post("/journey-checkin", json=REQ).json()
    assert body["decision"] == "up" and "1 of 1" in body["message"]
