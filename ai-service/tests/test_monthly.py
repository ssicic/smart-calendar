"""Tests for the monthly summary endpoint, with a fake model."""

from app.llm import DemoLLM
from app.monthly import MonthlySummary

from .test_review import FACTS, FakeLLM, client_with

MONTH = {"month": "October 2026", "month_over": False, **FACTS, "goals": [{"title": "Run 5k", "horizon": "month", "done": True}]}


def test_returns_the_summary_and_sends_goals():
    llm = FakeLLM(MonthlySummary(headline="A good month.", wins=["Gym 9 of 12."], patterns=[], slipped=[], next_month_tip=""))
    r = client_with(llm).post("/monthly-summary", json=MONTH)
    assert r.status_code == 200
    assert r.json()["wins"] == ["Gym 9 of 12."]
    assert "Run 5k" in llm.calls[0]


def test_trims_lists_to_three_and_drops_blank_lines():
    llm = FakeLLM(MonthlySummary(headline=" Hi ", wins=["a", " ", "b", "c", "d"], patterns=[], slipped=[""], next_month_tip=" "))
    body = client_with(llm).post("/monthly-summary", json=MONTH).json()
    assert body == {"headline": "Hi", "wins": ["a", "b", "c"], "patterns": [], "slipped": [], "next_month_tip": ""}


def test_needs_at_least_one_week():
    r = client_with(FakeLLM()).post("/monthly-summary", json={**MONTH, "weeks": []})
    assert r.status_code == 422


def test_demo_mode_counts_done_sessions():
    body = client_with(DemoLLM()).post("/monthly-summary", json=MONTH).json()
    assert "1 sessions done" in body["headline"]
