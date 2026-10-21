"""The one place that talks to Claude. Everything else is plain Python."""

from __future__ import annotations

import os
from typing import Protocol, TypeVar

import anthropic
from pydantic import BaseModel

# Haiku: fast and very cheap (about $0.001 per weekly review). AI_MODEL in .env overrides it.
MODEL = os.environ.get("AI_MODEL", "claude-haiku-5-5")

T = TypeVar("T", bound=BaseModel)


class LLMRefused(Exception):
    """Claude declined the request (a safety check)."""


class LLM(Protocol):
    def structured(self, system: str, user: str, schema: type[T]) -> T: ...


class ClaudeLLM:
    def __init__(self) -> None:
        # Reads ANTHROPIC_API_KEY from the environment (.env via uvicorn --env-file).
        self.client = anthropic.Anthropic()

    def structured(self, system: str, user: str, schema: type[T]) -> T:
        response = self.client.messages.parse(
            model=MODEL,
            max_tokens=8000,  # room for the model's thinking plus the JSON answer
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema,  # structured output: the reply must match `schema`
            output_config={"effort": "medium"},
        )
        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise LLMRefused(str(response.stop_reason))
        return response.parsed_output


class DemoLLM:
    """AI_FAKE=1: no API call, no cost. Weekly review: suggests one fewer session a
    week for the first item with sessions not done, so Accept can be tried.
    Monthly summary: counts the done sessions."""

    def structured(self, system: str, user: str, schema: type[T]) -> T:
        import json

        facts = json.loads(user.split("\n", 1)[1])
        if schema.__name__ == "MonthlySummary":
            done = sum(len(i["done"]) for w in facts["weeks"] for i in w["items"])
            return schema.model_validate(
                {
                    "headline": f"(Demo mode, no AI call.) {facts['month']}: {done} sessions done.",
                    "wins": [f"(Demo) {done} flexible sessions done this month."],
                    "patterns": [],
                    "slipped": [],
                    "next_month_tip": "",
                }
            )
        items = {i["item_id"]: i for i in facts["items"]}
        suggestions = []
        for week_item in facts["weeks"][0]["items"]:
            item = items.get(week_item["item_id"])
            if item and week_item["not_done"] > 0 and item["times_per_week"] > 1:
                suggestions.append(
                    {
                        "title": f"Try {item['title']} {item['times_per_week'] - 1}x a week",
                        "reason": f"(Demo) {week_item['not_done']} of {week_item['planned']} sessions weren't done this week.",
                        "action": {
                            "type": "set_times_per_week",
                            "item_id": item["item_id"],
                            "time_of_day": None,
                            "times_per_week": item["times_per_week"] - 1,
                            "duration_min": None,
                            "importance": None,
                        },
                    }
                )
                break
        return schema.model_validate({"summary": "(Demo mode, no AI call.) Here's how a suggestion looks.", "suggestions": suggestions})
