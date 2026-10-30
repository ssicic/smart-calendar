"""The agent loop with scripted models: no API calls."""

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from app import agent
from app.main import app, get_plan_model

from .test_calendar_tools import week


class Script:
    """A fake chat model that replies with the given messages in order."""

    def __init__(self, *replies: AIMessage):
        self.replies = list(replies)
        self.seen: list[list] = []

    def bind_tools(self, tools):
        return self

    def invoke(self, messages):
        self.seen.append(messages)
        return self.replies.pop(0)


def call(name, i, **args):
    return {"name": name, "args": args, "id": f"c{i}"}


def request(wish=""):
    return agent.PlanRequest(week=week(), wish=wish)


def test_runs_tools_feeds_results_back_and_keeps_only_checked_proposals():
    model = Script(
        AIMessage("", tool_calls=[call("get_week", 1)]),
        # A clash first: the tool says no, the model reads why and tries again.
        AIMessage("", tool_calls=[call("propose_move", 2, session_id="gym1", day="Mon", start_time="16:30", reason="x")]),
        AIMessage("", tool_calls=[call("propose_move", 3, session_id="gym1", day="Wed", start_time="07:00", reason="Mornings")]),
        AIMessage("I moved Gym to Wednesday morning."),
    )
    result = agent.plan_week(request("Keep Monday evening free"), model)
    assert result.summary == "I moved Gym to Wednesday morning."
    assert [(p.session_id, p.to_label) for p in result.proposals] == [("gym1", "Wed 07:00–08:00")]
    assert result.tool_calls == 3
    # The wish reaches the model, and so do the tool results.
    assert "Keep Monday evening free" in model.seen[0][-1].content
    assert "Overlaps Work" in model.seen[2][-1].content


def test_stops_when_out_of_steps():
    model = Script(*[AIMessage("", tool_calls=[call("get_week", i)]) for i in range(40)])
    result = agent.plan_week(request(), model)
    assert result.tool_calls == -1 and result.proposals == []


def test_demo_model_proposes_a_valid_move():
    plan = agent.WeekPlan(week())
    result = agent.plan_week(request(), agent.DemoModel(plan))
    assert len(result.proposals) == 1 and result.proposals[0].to_label == "Tue 07:00–08:00"


def test_endpoint(monkeypatch):
    monkeypatch.delenv("APP_TOKEN", raising=False)
    model = Script(AIMessage("", tool_calls=[call("get_week", 1)]), AIMessage("Your week looks fine."))
    app.dependency_overrides[get_plan_model] = lambda: model
    try:
        res = TestClient(app).post("/plan-week", json=request().model_dump())
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json() == {
        "summary": "Your week looks fine.",
        "proposals": [],
        "tool_calls": 1,
        "input_tokens": 0,
        "output_tokens": 0,
    }
