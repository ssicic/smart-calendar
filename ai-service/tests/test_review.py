"""Tests for the weekly review endpoint. A fake LLM stands in for Claude,
so these run offline and cost nothing."""

from fastapi.testclient import TestClient

from app.llm import LLMRefused
from app.main import app, get_llm
from app.review import Action, Suggestion, WeeklyReview

FACTS = {
    "weeks": [
        {
            "week_start": "2026-10-19",
            "planned_hours": 20.5,
            "done_hours": 9.0,
            "free_percent": 35,
            "items": [
                {
                    "item_id": "gym",
                    "planned": 3,
                    "done": [{"day": "Tue", "time": "07:30", "part_of_day": "morning"}],
                    "queued": 0,
                    "not_done": 2,
                }
            ],
            "todos_done": 2,
            "todos_total": 4,
        }
    ],
    "items": [
        {
            "item_id": "gym",
            "title": "Gym",
            "times_per_week": 3,
            "duration_min": 60,
            "importance": "high",
            "time_of_day": "evening",
        }
    ],
}


def action(**kw):
    base = dict(item_id=None, time_of_day=None, times_per_week=None, duration_min=None, importance=None)
    return Action(**{**base, **kw})


class FakeLLM:
    def __init__(self, review=None, error=None):
        self.review, self.error, self.calls = review, error, []

    def structured(self, system, user, schema):
        self.calls.append(user)
        if self.error:
            raise self.error
        return self.review


def client_with(llm):
    app.dependency_overrides[get_llm] = lambda: llm
    return TestClient(app)


def test_returns_valid_suggestions_and_sends_the_facts():
    llm = FakeLLM(
        WeeklyReview(
            summary="A steady week.",
            suggestions=[
                Suggestion(
                    title="Move Gym to mornings",
                    reason="You did 1 of 1 morning sessions and 0 of 2 evening ones.",
                    action=action(type="set_time_of_day", item_id="gym", time_of_day="morning"),
                )
            ],
        )
    )
    r = client_with(llm).post("/weekly-review", json=FACTS)
    assert r.status_code == 200
    assert r.json()["suggestions"][0]["action"]["time_of_day"] == "morning"
    assert '"item_id": "gym"' in llm.calls[0]


def test_drops_suggestions_the_app_could_not_apply():
    bad = [
        Suggestion(title="x", reason="r", action=action(type="set_time_of_day", item_id="nope", time_of_day="morning")),
        Suggestion(title="x", reason="r", action=action(type="set_times_per_week", item_id="gym", times_per_week=0)),
        Suggestion(title="x", reason="r", action=action(type="set_duration", item_id="gym", duration_min=60)),  # no change
        Suggestion(title="x", reason="r", action=action(type="set_time_of_day", item_id="gym", time_of_day=None)),
    ]
    good = Suggestion(title="Try 2x a week", reason="r", action=action(type="set_times_per_week", item_id="gym", times_per_week=2))
    r = client_with(FakeLLM(WeeklyReview(summary="ok", suggestions=[*bad, good]))).post("/weekly-review", json=FACTS)
    assert [s["title"] for s in r.json()["suggestions"]] == ["Try 2x a week"]


def test_keeps_at_most_three():
    tip = Suggestion(title="t", reason="r", action=action(type="none"))
    r = client_with(FakeLLM(WeeklyReview(summary="ok", suggestions=[tip] * 5))).post("/weekly-review", json=FACTS)
    assert len(r.json()["suggestions"]) == 3


def test_refusal_becomes_a_friendly_error():
    r = client_with(FakeLLM(error=LLMRefused("refusal"))).post("/weekly-review", json=FACTS)
    assert r.status_code == 502
    assert "couldn't answer" in r.json()["detail"]


def test_rejects_malformed_facts():
    r = client_with(FakeLLM()).post("/weekly-review", json={"weeks": [], "items": []})
    assert r.status_code == 422


def test_demo_mode_suggests_from_the_real_facts():
    from app.llm import DemoLLM

    r = client_with(DemoLLM()).post("/weekly-review", json=FACTS)
    assert r.json()["suggestions"][0]["action"] == {
        "type": "set_times_per_week",
        "item_id": "gym",
        "time_of_day": None,
        "times_per_week": 2,
        "duration_min": None,
        "importance": None,
    }
