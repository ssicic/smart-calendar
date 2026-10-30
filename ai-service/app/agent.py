""""Plan my week": a small LangGraph agent with calendar tools.

The graph is the classic tool loop:

    START → agent ──(tool calls?)──→ tools ─┐
              ↑  └──(no: final answer)→ END │
              └─────────────────────────────┘

The agent node asks Claude what to do next; the tools node runs the tools it
picked (calendar_tools.WeekPlan) and feeds the results back. The model never
writes to the calendar: it can only *propose* moves and skips, each checked by
the tools, and the app shows them for the user to accept or reject.
"""

from __future__ import annotations

import os
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.errors import GraphRecursionError
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from pydantic import BaseModel, Field

from .calendar_tools import DAYS, Proposal, WeekPlan, WeekSnapshot, clock, free_gaps
from .llm import MODEL

MAX_STEPS = 30  # graph steps (each model call and each tool round is one)


class PlanRequest(BaseModel):
    week: WeekSnapshot
    wish: str = Field(default="", max_length=300)  # "Keep Friday evening free"


class PlanResult(BaseModel):
    summary: str
    proposals: list[Proposal]
    tool_calls: int
    input_tokens: int = 0
    output_tokens: int = 0


SYSTEM_PROMPT = """You help someone with ADHD adjust their week in a planning app.

The week has fixed events (work, appointments: never move), routines, and flexible sessions \
the app placed automatically (e.g. Gym 60 min). You can propose moving or skipping flexible \
sessions marked movable. You can't add or delete anything.

How to work:
1. Call get_week first.
2. If the person wrote a wish, make the fewest changes that fully satisfy it. "Spread out" or \
"too packed" means leave at most one flexible session in that part of the day. Without a wish, \
look for real problems only: sessions outside the item's preferred time of day, or several \
sessions of the same item on one day (get_week notes these). A week that looks fine needs no changes.
   Sessions marked past can't change; if the wish is only about the past, say so and change nothing.
3. Use find_free_slots before proposing a move, and prefer the item's preferred time of day.
4. If a proposal comes back "Not proposed", read why and try another slot or stop.
5. At most 5 changes. Skip only when there's truly no room.

Finish with a short, warm summary (1-3 sentences) of what you proposed and why, or why the \
week is fine as it is. Never scold. Plain words, no lists."""


def make_tools(plan: WeekPlan) -> list:
    """The tools, bound to one week. Their docstrings are what the model reads."""

    @tool
    def get_week() -> str:
        """See the week: awake hours per day and every block with its id."""
        return plan.get_week()

    @tool
    def find_free_slots(day: str, min_minutes: int = 30, part_of_day: str = "any") -> str:
        """Free gaps on one day (Mon..Sun) of at least min_minutes. part_of_day: any, morning, afternoon or evening."""
        return plan.find_free_slots(day, min_minutes, part_of_day)

    @tool
    def propose_move(session_id: str, day: str, start_time: str, reason: str) -> str:
        """Propose moving a movable session to day (Mon..Sun) at start_time ("HH:MM"). Same length. reason: one short sentence for the user."""
        return plan.propose_move(session_id, day, start_time, reason)

    @tool
    def propose_skip(session_id: str, reason: str) -> str:
        """Propose skipping a movable session this week (it moves to next week). reason: one short sentence for the user."""
        return plan.propose_skip(session_id, reason)

    return [get_week, find_free_slots, propose_move, propose_skip]


def build_graph(model: Any, tools: list):
    """`model` is a LangChain chat model (anything with bind_tools)."""
    llm = model.bind_tools(tools)

    def agent(state: MessagesState) -> dict:
        return {"messages": [llm.invoke([SystemMessage(SYSTEM_PROMPT), *state["messages"]])]}

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent)
    graph.add_node("tools", ToolNode(tools))
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", tools_condition)  # tool calls → "tools", else END
    graph.add_edge("tools", "agent")
    return graph.compile()


def claude_model():
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(model=MODEL, max_tokens=4000, timeout=50, max_retries=1)


def plan_week(req: PlanRequest, model: Any = None, callbacks: list | None = None) -> PlanResult:
    plan = WeekPlan(req.week)
    model = model or (DemoModel(plan) if os.environ.get("AI_FAKE") == "1" else claude_model())
    graph = build_graph(model, make_tools(plan))
    wish = req.wish.strip()
    ask = f"My wish for this week: {wish}" if wish else "Look over my week and fix anything that's clearly off."
    config = {"recursion_limit": MAX_STEPS, "callbacks": callbacks or [], "run_name": "plan-my-week"}
    try:
        messages = graph.invoke({"messages": [HumanMessage(ask)]}, config=config)["messages"]
    except GraphRecursionError:
        return PlanResult(
            summary="I ran out of steps before finishing. Here's what I found so far.",
            proposals=plan.proposals,
            tool_calls=-1,
        )
    final = messages[-1]
    summary = final.text if isinstance(final, AIMessage) else ""
    ai = [m for m in messages if isinstance(m, AIMessage)]
    usage = [m.usage_metadata or {} for m in ai]
    return PlanResult(
        summary=summary.strip() or "Done.",
        proposals=plan.proposals,
        tool_calls=sum(len(m.tool_calls) for m in ai),
        input_tokens=sum(u.get("input_tokens", 0) for u in usage),
        output_tokens=sum(u.get("output_tokens", 0) for u in usage),
    )


class DemoModel:
    """AI_FAKE=1 (and tests): no API call. Reads the week, then moves the first
    movable session to the earliest free morning slot on another day."""

    def __init__(self, plan: WeekPlan):
        self.plan = plan

    def bind_tools(self, tools: list) -> "DemoModel":
        return self

    def invoke(self, messages: list) -> AIMessage:
        tool_results = [m for m in messages if isinstance(m, ToolMessage)]
        if not tool_results:
            return AIMessage("", tool_calls=[{"name": "get_week", "args": {}, "id": "c1"}])
        if len(tool_results) == 1:
            move = self._first_move()
            if move:
                return AIMessage("", tool_calls=[{"name": "propose_move", "args": move, "id": "c2"}])
        return AIMessage("(Demo mode, no AI call.) Here's how a proposal looks.")

    def _first_move(self) -> dict | None:
        for b in sorted(self.plan.blocks.values(), key=lambda b: b.start):
            if not b.movable:
                continue
            for d in range(7):
                if d == b.start // 1440:
                    continue
                lo, hi = self.plan._window(d)
                for s, e in free_gaps(self.plan._busy(ignore=b.id), max(lo, self.plan.snap.now), hi):
                    if e - s >= b.end - b.start:
                        args = {"session_id": b.id, "day": DAYS[d], "start_time": clock(s), "reason": "(Demo) A free morning."}
                        if not isinstance(self.plan.check_move(**{k: args[k] for k in ("session_id", "day", "start_time")}), str):
                            return args
        return None
